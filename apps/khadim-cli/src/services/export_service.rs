use crate::domain::transcript::TranscriptEntry;
use khadim_ai_core::error::AppError;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn export_to_markdown(
    entries: &[TranscriptEntry],
    session_name: Option<&str>,
    out_path: Option<&str>,
) -> Result<String, AppError> {
    let mut md = String::new();
    md.push_str("# Khadim Conversation\n\n");
    if let Some(name) = session_name {
        md.push_str(&format!("**Session:** {name}\n\n"));
    }
    md.push_str(&format!(
        "**Exported:** {}\n\n",
        format_timestamp(now_unix())
    ));
    md.push_str("---\n\n");

    for entry in entries {
        match entry {
            TranscriptEntry::System { text } => {
                md.push_str(&format!("> ℹ **System:** {}\n\n", escape_md(text)));
            }
            TranscriptEntry::User { text } => {
                md.push_str(&format!("## User\n\n{}\n\n", escape_md(text)));
            }
            TranscriptEntry::AssistantText { text } => {
                md.push_str(&format!("## Assistant\n\n{text}\n\n"));
            }
            TranscriptEntry::Thinking { text } => {
                md.push_str(&format!("> 💭 **Thinking:** {}\n\n", escape_md(text)));
            }
            TranscriptEntry::ToolComplete {
                tool,
                content,
                is_error,
                running,
                ..
            } => {
                if *running {
                    // Don't export in-flight entries — wait for the completed
                    // result.
                    continue;
                }
                let icon = if *is_error { "✗" } else { "✓" };
                let lang = tool_to_lang(tool);
                md.push_str(&format!(
                    "<details>\n<summary>{icon} {tool}</summary>\n\n```{lang}\n{content}\n```\n\n</details>\n\n"
                ));
            }
            TranscriptEntry::Error { text } => {
                md.push_str(&format!("> ⚠ **Error:** {}\n\n", escape_md(text)));
            }
            TranscriptEntry::Separator => {}
            TranscriptEntry::ToolStart { .. } => {}
        }
    }

    let path = if let Some(p) = out_path {
        PathBuf::from(p)
    } else {
        let name = session_name.unwrap_or("conversation");
        let timestamp = now_unix();
        PathBuf::from(format!("{}-{}.md", sanitize_filename(name), timestamp))
    };

    fs::write(&path, &md).map_err(|e| AppError::io(format!("Failed to write export file: {e}")))?;

    Ok(path.to_string_lossy().to_string())
}

pub fn copy_last_assistant_response(entries: &[TranscriptEntry]) -> Result<String, AppError> {
    let mut found = None;
    for entry in entries.iter().rev() {
        if let TranscriptEntry::AssistantText { text } = entry {
            if !text.trim().is_empty() {
                found = Some(text.clone());
                break;
            }
        }
    }
    let text = found.ok_or_else(|| AppError::invalid_input("No assistant response found"))?;

    copy_to_clipboard(&text)
}

fn copy_to_clipboard(text: &str) -> Result<String, AppError> {
    // Try arboard first on all platforms – it handles clipboard without blocking.
    if try_arboard(text) == Ok(()) {
        return Ok(text.to_string());
    }

    let mut errors: Vec<String> = Vec::new();

    #[cfg(target_os = "linux")]
    {
        // Wayland (modern Linux desktops). wl-copy forks to background by default,
        // so we spawn without waiting to avoid hanging the TUI.
        if spawn_clipboard_daemon(&mut errors, "wl-copy", &[], text) {
            return Ok(text.to_string());
        }

        // X11. xclip stays alive to serve clipboard requests, so spawn without waiting.
        if spawn_clipboard_daemon(&mut errors, "xclip", &["-selection", "clipboard"], text) {
            return Ok(text.to_string());
        }

        // X11 alternative. xsel also stays alive, so spawn without waiting.
        if spawn_clipboard_daemon(&mut errors, "xsel", &["--clipboard", "--input"], text) {
            return Ok(text.to_string());
        }

        // Termux (Android) – exits immediately.
        if try_tool(&mut errors, "termux-clipboard-set", &[], text) {
            return Ok(text.to_string());
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        // macOS – exits immediately.
        if try_tool(&mut errors, "pbcopy", &[], text) {
            return Ok(text.to_string());
        }

        // Windows – exits immediately.
        if try_tool(&mut errors, "clip", &[], text) {
            return Ok(text.to_string());
        }
    }

    Err(AppError::io(format!(
        "Clipboard not available. Tried: {}.\n\
         Install one of: wl-clipboard (Wayland), xclip (X11).\n\
         Example: sudo apt install wl-clipboard",
        errors.join(", ")
    )))
}

/// Spawn a clipboard daemon that needs to stay alive (e.g. wl-copy, xclip).
/// Writes the text to its stdin and returns true if the child is still alive
/// after a short grace period (meaning it is serving the clipboard).
/// If the child exits immediately with an error we try the next tool.
/// A background thread waits on the child to prevent zombie processes.
fn spawn_clipboard_daemon(errors: &mut Vec<String>, cmd: &str, args: &[&str], text: &str) -> bool {
    match Command::new(cmd)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(mut child) => {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(text.as_bytes());
            }
            // Give the tool a moment to fail fast (e.g. no display available).
            std::thread::sleep(std::time::Duration::from_millis(150));
            match child.try_wait() {
                Ok(Some(status)) if !status.success() => {
                    let mut stderr = String::new();
                    if let Some(mut s) = child.stderr.take() {
                        let _ = std::io::Read::read_to_string(&mut s, &mut stderr);
                    }
                    let hint = if stderr.trim().is_empty() {
                        format!("exited with code {}", status.code().unwrap_or(-1))
                    } else {
                        stderr.trim().to_string()
                    };
                    errors.push(format!("{cmd}: {hint}"));
                    false
                }
                Ok(Some(_)) => {
                    // Exited successfully immediately – unlikely but acceptable.
                    true
                }
                _ => {
                    // Still running – assume it is serving the clipboard.
                    // Reap in a background thread to avoid zombies.
                    std::thread::spawn(move || {
                        let _ = child.wait();
                    });
                    true
                }
            }
        }
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                errors.push(format!("{cmd}: not installed"));
            } else {
                errors.push(format!("{cmd}: {e}"));
            }
            false
        }
    }
}

/// Try to copy text using an external command that exits immediately.
/// Returns true on success.
fn try_tool(errors: &mut Vec<String>, cmd: &str, args: &[&str], text: &str) -> bool {
    match Command::new(cmd)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(mut child) => {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(text.as_bytes());
            }
            match child.wait_with_output() {
                Ok(output) => {
                    if output.status.success() {
                        return true;
                    }
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let hint = if stderr.trim().is_empty() {
                        format!("exited with code {}", output.status.code().unwrap_or(-1))
                    } else {
                        stderr.trim().to_string()
                    };
                    errors.push(format!("{cmd}: {hint}"));
                }
                Err(e) => errors.push(format!("{cmd}: {e}")),
            }
        }
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                errors.push(format!("{cmd}: not installed"));
            } else {
                errors.push(format!("{cmd}: {e}"));
            }
        }
    }
    false
}

fn try_arboard(text: &str) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;
    Ok(())
}

fn tool_to_lang(tool: &str) -> &str {
    match tool {
        "bash" | "shell" => "bash",
        "read" | "write" | "edit" => "",
        _ => "",
    }
}

fn escape_md(text: &str) -> String {
    text.replace('*', "\\*")
        .replace('_', "\\_")
        .replace('`', "\\`")
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn format_timestamp(unix: u64) -> String {
    let secs = unix as i64;
    let days = secs / 86400;
    let rem = secs % 86400;
    let hh = rem / 3600;
    let mm = (rem % 3600) / 60;
    let ss = rem % 60;
    format!("{days}d {hh:02}:{mm:02}:{ss:02}")
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}
