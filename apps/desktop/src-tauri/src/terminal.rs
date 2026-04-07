//! Native PTY-backed terminal sessions for the desktop workspace dock.
//!
//! Each terminal is owned by a workspace (and optionally scoped to a
//! conversation/agent so it follows the active worktree). Terminals are
//! identified by an opaque session id allocated on `create`.
//!
//! Output is streamed to the frontend as `terminal-output` Tauri events.
//! When a terminal exits (process death, manual close), a single
//! `terminal-exit` event is emitted.
//!
//! This module is intentionally self-contained: it does not depend on the
//! database. The caller (`lib.rs`) is responsible for resolving the
//! effective `cwd` via `workspace_context::resolve` before calling
//! `TerminalManager::create`.

use crate::error::AppError;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

const DEFAULT_COLS: u16 = 100;
const DEFAULT_ROWS: u16 = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSession {
    pub id: String,
    pub workspace_id: String,
    pub conversation_id: Option<String>,
    pub cwd: String,
    pub title: String,
    pub cols: u16,
    pub rows: u16,
    pub running: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalOutput {
    pub session_id: String,
    /// UTF-8 lossy decode of the raw PTY output. The frontend writes this
    /// straight into xterm.js (or equivalent) which interprets ANSI escapes.
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalExit {
    pub session_id: String,
    pub code: Option<i32>,
    pub message: Option<String>,
}

struct TerminalHandle {
    info: Mutex<TerminalSession>,
    /// Master PTY half. Held behind a mutex because `resize` and the drop on
    /// close both need exclusive access. The reader thread owns its own
    /// independent reader half cloned at spawn time.
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
}

type SessionMap = Arc<Mutex<HashMap<String, Arc<TerminalHandle>>>>;

pub struct TerminalManager {
    sessions: SessionMap,
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl TerminalManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Spawn a new PTY-backed shell rooted at `cwd`.
    pub fn create(
        &self,
        app: &AppHandle,
        workspace_id: String,
        conversation_id: Option<String>,
        cwd: String,
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> Result<TerminalSession, AppError> {
        let cols = cols.unwrap_or(DEFAULT_COLS);
        let rows = rows.unwrap_or(DEFAULT_ROWS);

        if !std::path::Path::new(&cwd).is_dir() {
            return Err(AppError::invalid_input(format!(
                "Terminal cwd does not exist: {cwd}"
            )));
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::process_spawn(format!("openpty failed: {e}")))?;

        let shell = default_shell();
        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&cwd);
        // Sensible defaults so colours and key handling work in xterm.js.
        cmd.env("TERM", "xterm-256color");
        cmd.env("TERM_PROGRAM", "khadim");
        cmd.env("COLORTERM", "truecolor");
        // Suppress fish's DA1 query warning inside xterm.js.
        cmd.env("fish_handle_reflow", "0");
        if let Ok(home) = std::env::var("HOME") {
            cmd.env("HOME", home);
        }
        if let Ok(path) = std::env::var("PATH") {
            cmd.env("PATH", path);
        }
        if let Ok(lang) = std::env::var("LANG") {
            cmd.env("LANG", lang);
        }
        if let Ok(xdg) = std::env::var("XDG_DATA_DIRS") {
            cmd.env("XDG_DATA_DIRS", xdg);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::process_spawn(format!("spawn shell failed: {e}")))?;
        // The slave is owned by the spawned process from this point on;
        // dropping our reference avoids leaking the fd.
        drop(pair.slave);

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::process_spawn(format!("take writer failed: {e}")))?;
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::process_spawn(format!("clone reader failed: {e}")))?;

        let id = uuid::Uuid::new_v4().to_string();
        let title = format!("{} — {}", short_basename(&cwd), shell_label(&shell));

        let info = TerminalSession {
            id: id.clone(),
            workspace_id,
            conversation_id,
            cwd,
            title,
            cols,
            rows,
            running: true,
        };

        let handle = Arc::new(TerminalHandle {
            info: Mutex::new(info.clone()),
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
        });

        self.sessions
            .lock()
            .unwrap()
            .insert(id.clone(), handle.clone());

        // Reader thread — pumps PTY output to the frontend until EOF.
        let app_for_reader = app.clone();
        let id_for_reader = id.clone();
        let sessions_for_reader = Arc::clone(&self.sessions);
        thread::spawn(move || {
            pump_output(app_for_reader, id_for_reader, reader, sessions_for_reader);
        });

        Ok(info)
    }

    /// Forward user input to the PTY.
    pub fn write(&self, session_id: &str, data: &str) -> Result<(), AppError> {
        let handle = self.get(session_id)?;
        let mut writer = handle.writer.lock().unwrap();
        writer
            .write_all(data.as_bytes())
            .map_err(|e| AppError::io(format!("terminal write failed: {e}")))?;
        writer
            .flush()
            .map_err(|e| AppError::io(format!("terminal flush failed: {e}")))
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let handle = self.get(session_id)?;
        handle
            .master
            .lock()
            .unwrap()
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::io(format!("terminal resize failed: {e}")))?;
        let mut info = handle.info.lock().unwrap();
        info.cols = cols;
        info.rows = rows;
        Ok(())
    }

    pub fn close(&self, session_id: &str) -> Result<(), AppError> {
        let handle = self.sessions.lock().unwrap().remove(session_id);
        let Some(handle) = handle else {
            return Err(AppError::not_found(format!(
                "Terminal session {session_id} not found"
            )));
        };
        let _ = handle.child.lock().unwrap().kill();
        Ok(())
    }

    pub fn list(&self) -> Vec<TerminalSession> {
        self.sessions
            .lock()
            .unwrap()
            .values()
            .map(|h| h.info.lock().unwrap().clone())
            .collect()
    }

    pub fn list_for_workspace(&self, workspace_id: &str) -> Vec<TerminalSession> {
        self.sessions
            .lock()
            .unwrap()
            .values()
            .filter_map(|h| {
                let info = h.info.lock().unwrap();
                if info.workspace_id == workspace_id {
                    Some(info.clone())
                } else {
                    None
                }
            })
            .collect()
    }

    fn get(&self, session_id: &str) -> Result<Arc<TerminalHandle>, AppError> {
        self.sessions
            .lock()
            .unwrap()
            .get(session_id)
            .cloned()
            .ok_or_else(|| AppError::not_found(format!("Terminal session {session_id} not found")))
    }
}

fn pump_output(
    app: AppHandle,
    session_id: String,
    mut reader: Box<dyn Read + Send>,
    sessions: SessionMap,
) {
    let mut buf = [0u8; 4096];
    let mut query_tail = Vec::<u8>::new();
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break, // EOF
            Ok(n) => {
                let bytes = &buf[..n];

                if let Some(handle) = sessions.lock().unwrap().get(&session_id).cloned() {
                    maybe_respond_to_terminal_queries(&handle, &mut query_tail, bytes);
                }

                let chunk = String::from_utf8_lossy(bytes).to_string();
                let _ = app.emit(
                    "terminal-output",
                    &TerminalOutput {
                        session_id: session_id.clone(),
                        data: chunk,
                    },
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "terminal-exit",
                    &TerminalExit {
                        session_id: session_id.clone(),
                        code: None,
                        message: Some(format!("read error: {e}")),
                    },
                );
                break;
            }
        }
    }

    // Wait for the child to actually exit so we can report a code.
    let handle = sessions.lock().unwrap().get(&session_id).cloned();
    let exit_code = handle
        .as_ref()
        .and_then(|h| h.child.lock().unwrap().wait().ok())
        .map(|status| status.exit_code() as i32);

    if let Some(handle) = handle {
        let mut info = handle.info.lock().unwrap();
        info.running = false;
    }
    sessions.lock().unwrap().remove(&session_id);

    let _ = app.emit(
        "terminal-exit",
        &TerminalExit {
            session_id,
            code: exit_code,
            message: None,
        },
    );
}

/// Emulate a small subset of terminal control-query replies that some shells
/// expect from a full terminal emulator.
///
/// fish queries Primary Device Attributes (`CSI c` / `CSI 0 c`) during startup.
/// xterm.js does not currently feed that reply back through our PTY bridge, so
/// we answer it here directly. Returning a VT100-with-AVO style reply is enough
/// for fish to stop timing out and printing compatibility warnings.
fn maybe_respond_to_terminal_queries(
    handle: &Arc<TerminalHandle>,
    tail: &mut Vec<u8>,
    chunk: &[u8],
) {
    const DA1_QUERY: &[u8] = b"\x1b[c";
    const DA1_QUERY_ZERO: &[u8] = b"\x1b[0c";
    const DA1_RESPONSE: &[u8] = b"\x1b[?1;2c";

    let mut combined = Vec::with_capacity(tail.len() + chunk.len());
    combined.extend_from_slice(tail);
    combined.extend_from_slice(chunk);

    let saw_da1 = combined
        .windows(DA1_QUERY.len())
        .any(|w| w == DA1_QUERY)
        || combined
            .windows(DA1_QUERY_ZERO.len())
            .any(|w| w == DA1_QUERY_ZERO);

    if saw_da1 {
        if let Ok(mut writer) = handle.writer.lock() {
            let _ = writer.write_all(DA1_RESPONSE);
            let _ = writer.flush();
        }
    }

    // Keep a tiny tail so queries split across reads are still detected.
    tail.clear();
    let keep = combined.len().min(8);
    tail.extend_from_slice(&combined[combined.len() - keep..]);
}

fn default_shell() -> String {
    if cfg!(windows) {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

fn shell_label(shell: &str) -> &str {
    std::path::Path::new(shell)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(shell)
}

fn short_basename(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
        .to_string()
}
