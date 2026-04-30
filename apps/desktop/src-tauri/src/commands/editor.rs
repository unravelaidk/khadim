use crate::error::AppError;
use crate::AppState;
use serde::Serialize;
use std::process::Command;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DetectedEditor {
    id: String,
    name: String,
    binary: String,
    available: bool,
}

const KNOWN_EDITORS: &[(&str, &str, &[&str])] = &[
    ("code", "Visual Studio Code", &["code"]),
    ("code-insiders", "VS Code Insiders", &["code-insiders"]),
    ("cursor", "Cursor", &["cursor"]),
    ("zed", "Zed", &["zed"]),
    ("windsurf", "Windsurf", &["windsurf"]),
    ("sublime", "Sublime Text", &["subl"]),
    ("neovim", "Neovim", &["nvim"]),
    ("vim", "Vim", &["vim"]),
    ("emacs", "Emacs", &["emacs"]),
    ("helix", "Helix", &["hx"]),
    ("fleet", "JetBrains Fleet", &["fleet"]),
    ("idea", "IntelliJ IDEA", &["idea"]),
    ("webstorm", "WebStorm", &["webstorm"]),
    ("rustrover", "RustRover", &["rustrover"]),
    ("pycharm", "PyCharm", &["pycharm"]),
    ("goland", "GoLand", &["goland"]),
    ("clion", "CLion", &["clion"]),
    ("lapce", "Lapce", &["lapce"]),
    ("kate", "Kate", &["kate"]),
    (
        "gedit",
        "GNOME Text Editor",
        &["gedit", "gnome-text-editor"],
    ),
    ("nano", "Nano", &["nano"]),
    ("xdg", "System Default", &["xdg-open"]),
];

#[tauri::command]
pub(crate) fn detect_editors() -> Vec<DetectedEditor> {
    KNOWN_EDITORS
        .iter()
        .filter_map(|(id, name, binaries)| {
            for bin in *binaries {
                if which::which(bin).is_ok() {
                    return Some(DetectedEditor {
                        id: id.to_string(),
                        name: name.to_string(),
                        binary: bin.to_string(),
                        available: true,
                    });
                }
            }
            None
        })
        .collect()
}

#[tauri::command]
pub(crate) async fn open_in_editor(
    state: State<'_, Arc<AppState>>,
    file_path: String,
    editor_id: Option<String>,
) -> Result<(), AppError> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(AppError::not_found(format!(
            "File does not exist: {file_path}"
        )));
    }

    let effective_id = editor_id.or_else(|| {
        state
            .db
            .get_setting("khadim:preferred_editor")
            .ok()
            .flatten()
    });

    if let Some(ref id) = effective_id {
        if let Some((_, _, binaries)) = KNOWN_EDITORS.iter().find(|(eid, _, _)| eid == id) {
            for bin in *binaries {
                if which::which(bin).is_ok() {
                    if Command::new(bin).arg(&file_path).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }
        }
    }

    for var in ["VISUAL", "EDITOR"] {
        if let Ok(editor) = std::env::var(var) {
            let editor = editor.trim().to_string();
            if !editor.is_empty() && Command::new(&editor).arg(&file_path).spawn().is_ok() {
                return Ok(());
            }
        }
    }

    for (_, _, binaries) in KNOWN_EDITORS.iter().take(6) {
        for bin in *binaries {
            if Command::new(bin).arg(&file_path).spawn().is_ok() {
                return Ok(());
            }
        }
    }

    #[cfg(target_os = "linux")]
    let opener = "xdg-open";
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(target_os = "windows")]
    let opener = "start";

    Command::new(opener)
        .arg(&file_path)
        .spawn()
        .map_err(|e| AppError::io(format!("Failed to open {file_path} in any editor: {e}")))?;

    Ok(())
}

#[tauri::command]
pub(crate) async fn open_project_in_editor(
    state: State<'_, Arc<AppState>>,
    project_path: String,
) -> Result<(), AppError> {
    let path = std::path::Path::new(&project_path);
    if !path.is_dir() {
        return Err(AppError::not_found(format!(
            "Directory does not exist: {project_path}"
        )));
    }

    let editor_id = state
        .db
        .get_setting("khadim:preferred_editor")
        .ok()
        .flatten();

    if let Some(ref id) = editor_id {
        if let Some((_, _, binaries)) = KNOWN_EDITORS.iter().find(|(eid, _, _)| eid == id) {
            for bin in *binaries {
                if which::which(bin).is_ok() {
                    if Command::new(bin).arg(&project_path).spawn().is_ok() {
                        return Ok(());
                    }
                }
            }
        }
    }

    for bin in [
        "code", "cursor", "zed", "windsurf", "subl", "idea", "webstorm", "fleet", "lapce",
    ] {
        if Command::new(bin).arg(&project_path).spawn().is_ok() {
            return Ok(());
        }
    }

    #[cfg(target_os = "linux")]
    let opener = "xdg-open";
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(target_os = "windows")]
    let opener = "start";

    Command::new(opener)
        .arg(&project_path)
        .spawn()
        .map_err(|e| AppError::io(format!("Failed to open project: {e}")))?;

    Ok(())
}
