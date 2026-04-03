use crate::error::AppError;
use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Mutex;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

/// A line of output from a managed process.
#[derive(Debug, Clone, Serialize)]
pub struct ProcessOutput {
    pub process_id: String,
    pub stream: &'static str, // "stdout" | "stderr"
    pub line: String,
}

/// Metadata about a managed process.
#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfo {
    pub id: String,
    pub label: String,
    pub pid: Option<u32>,
    pub running: bool,
}

/// Internal entry for a tracked process.
struct ManagedProcess {
    label: String,
    child: Child,
    #[allow(dead_code)]
    kill_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

/// Manages child processes spawned by the desktop runtime.
/// Tracks them by a logical ID so we can inspect/kill them.
pub struct ProcessRunner {
    processes: Mutex<HashMap<String, ManagedProcess>>,
}

impl ProcessRunner {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }

    /// Spawn a new process.
    ///
    /// - `id`: logical identifier (e.g. "opencode-<workspace_id>")
    /// - `label`: human-readable label
    /// - `program`: the executable
    /// - `args`: command-line arguments
    /// - `envs`: extra environment variables
    /// - `cwd`: working directory
    /// - `output_tx`: channel to stream stdout/stderr lines
    ///
    /// Returns the OS-level PID.
    pub async fn spawn(
        &self,
        id: String,
        label: String,
        program: &str,
        args: &[&str],
        envs: &[(&str, &str)],
        cwd: Option<&str>,
        output_tx: Option<mpsc::UnboundedSender<ProcessOutput>>,
    ) -> Result<u32, AppError> {
        // Kill existing process with the same ID if any
        self.kill(&id).await.ok();

        let mut cmd = Command::new(program);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        for (k, v) in envs {
            cmd.env(k, v);
        }
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }

        // On Unix, spawn in a new process group so we can kill the whole tree
        #[cfg(unix)]
        {
            // Safety: setpgid is safe, no allocation or locking
            unsafe {
                cmd.pre_exec(|| {
                    libc::setpgid(0, 0);
                    Ok(())
                });
            }
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::process_spawn(format!("Failed to spawn {program}: {e}")))?;

        let pid = child
            .id()
            .ok_or_else(|| AppError::process_spawn("Process exited immediately"))?;

        let process_id = id.clone();

        // Stream stdout
        if let Some(stdout) = child.stdout.take() {
            let tx = output_tx.clone();
            let pid_str = process_id.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if let Some(ref tx) = tx {
                        let _ = tx.send(ProcessOutput {
                            process_id: pid_str.clone(),
                            stream: "stdout",
                            line,
                        });
                    }
                }
            });
        }

        // Stream stderr
        if let Some(stderr) = child.stderr.take() {
            let tx = output_tx;
            let pid_str = process_id.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if let Some(ref tx) = tx {
                        let _ = tx.send(ProcessOutput {
                            process_id: pid_str.clone(),
                            stream: "stderr",
                            line,
                        });
                    }
                }
            });
        }

        let managed = ManagedProcess {
            label,
            child,
            kill_tx: None,
        };

        self.processes.lock().unwrap().insert(id, managed);
        Ok(pid)
    }

    /// Kill a managed process by its logical ID.
    pub async fn kill(&self, id: &str) -> Result<(), AppError> {
        let mut child = {
            let mut procs = self.processes.lock().unwrap();
            match procs.remove(id) {
                Some(p) => p.child,
                None => return Err(AppError::not_found(format!("Process {id} not found"))),
            }
        };

        // Try graceful kill first, then force
        #[cfg(unix)]
        {
            if let Some(pid) = child.id() {
                // Send SIGTERM to the process group
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGTERM);
                }
            }
        }

        #[cfg(not(unix))]
        {
            let _ = child.kill().await;
        }

        // Wait a bit, then force kill if still running
        let timeout = tokio::time::sleep(std::time::Duration::from_secs(3));
        tokio::select! {
            _ = child.wait() => {}
            _ = timeout => {
                let _ = child.kill().await;
            }
        }

        Ok(())
    }

    /// Kill all managed processes. Called on app shutdown.
    pub async fn kill_all(&self) {
        let ids: Vec<String> = {
            self.processes.lock().unwrap().keys().cloned().collect()
        };
        for id in ids {
            let _ = self.kill(&id).await;
        }
    }

    /// Check if a process is still running.
    pub fn is_running(&self, id: &str) -> bool {
        let procs = self.processes.lock().unwrap();
        procs.contains_key(id)
    }

    /// List all managed processes with their status.
    pub fn list(&self) -> Vec<ProcessInfo> {
        let procs = self.processes.lock().unwrap();
        procs
            .iter()
            .map(|(id, mp)| ProcessInfo {
                id: id.clone(),
                label: mp.label.clone(),
                pid: mp.child.id(),
                running: true,
            })
            .collect()
    }
}
