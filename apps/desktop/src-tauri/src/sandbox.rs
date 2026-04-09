use crate::db::{Database, Workspace};
use crate::error::AppError;
use serde::Serialize;
use std::collections::HashSet;
use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const DENIED_EXECUTABLES: &[&str] = &[
    "bash", "sh", "zsh", "fish", "dash", "ksh", "sudo", "su", "env", "ssh", "scp",
    "sftp",
];

const ALLOWED_EXECUTABLES: &[&str] = &[
    "git", "node", "npm", "npx", "pnpm", "yarn", "bun", "bunx", "cargo", "rustc",
    "rustfmt", "cargo-clippy", "python", "python3", "pip", "pip3", "uv", "pytest", "go",
    "java", "javac", "gradle", "make", "cmake",
];

#[derive(Debug, Clone, Serialize)]
pub struct SandboxInfo {
    pub id: String,
    pub root: String,
    pub seeded: bool,
}

#[derive(Debug, Clone)]
pub struct SandboxCommandOutput {
    pub output: String,
    pub success: bool,
}

#[derive(Debug, Clone)]
pub struct SandboxContext {
    pub sandbox_id: String,
    pub sandbox_root: PathBuf,
    pub source_root: PathBuf,
}

fn data_dir() -> Result<PathBuf, AppError> {
    dirs::data_dir()
        .map(|dir| dir.join("khadim"))
        .ok_or_else(|| AppError::io("Cannot determine system data directory"))
}

pub fn sandboxes_dir() -> Result<PathBuf, AppError> {
    Ok(data_dir()?.join("sandboxes"))
}

pub fn is_dir_effectively_empty(path: &Path) -> Result<bool, AppError> {
    Ok(std::fs::read_dir(path)?.next().is_none())
}

fn normalize_relative_path(raw: &str) -> Result<PathBuf, AppError> {
    let candidate = Path::new(raw);
    if candidate.is_absolute() {
        return Err(AppError::invalid_input(format!(
            "Sandbox paths must be relative: {raw}"
        )));
    }

    let mut normalized = PathBuf::new();
    for component in candidate.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(AppError::invalid_input(format!(
                        "Sandbox path escapes the sandbox root: {raw}"
                    )));
                }
            }
            Component::Normal(part) => normalized.push(part),
            _ => {
                return Err(AppError::invalid_input(format!(
                    "Unsupported sandbox path: {raw}"
                )))
            }
        }
    }

    Ok(normalized)
}

pub fn copy_seed_tree(source: &Path, destination: &Path) -> Result<(), AppError> {
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name();
        if name == OsString::from(".git") {
            continue;
        }
        let source_path = entry.path();
        let destination_path = destination.join(&name);
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            std::fs::create_dir_all(&destination_path)?;
            copy_seed_tree(&source_path, &destination_path)?;
        } else if metadata.is_file() {
            if let Some(parent) = destination_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&source_path, &destination_path)?;
        }
    }
    Ok(())
}

pub fn ensure_sandbox_root(
    sandbox_id: &str,
    sandbox_root_path: Option<&str>,
    source_root: &Path,
) -> Result<SandboxInfo, AppError> {
    if !source_root.is_dir() {
        return Err(AppError::invalid_input(format!(
            "Sandbox source directory does not exist: {}",
            source_root.display()
        )));
    }

    let sandbox_root = sandbox_root_path
        .map(PathBuf::from)
        .unwrap_or_else(|| sandboxes_dir().unwrap_or_else(|_| std::env::temp_dir()).join(sandbox_id));

    std::fs::create_dir_all(&sandbox_root)?;

    let seeded = is_dir_effectively_empty(&sandbox_root)? && !is_dir_effectively_empty(source_root)?;
    if seeded {
        copy_seed_tree(source_root, &sandbox_root)?;
    }

    Ok(SandboxInfo {
        id: sandbox_id.to_string(),
        root: sandbox_root.to_string_lossy().to_string(),
        seeded,
    })
}

pub fn ensure_workspace_sandbox(
    db: &Database,
    workspace: &Workspace,
    source_root: &Path,
) -> Result<SandboxInfo, AppError> {
    let sandbox_id = workspace
        .sandbox_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let info = ensure_sandbox_root(&sandbox_id, workspace.sandbox_root_path.as_deref(), source_root)?;

    db.update_workspace_sandbox(
        &workspace.id,
        &sandbox_id,
        &info.root,
    )?;

    Ok(info)
}

pub fn build_context(
    db: &Database,
    workspace: &Workspace,
    source_root: PathBuf,
) -> Result<SandboxContext, AppError> {
    let info = ensure_workspace_sandbox(db, workspace, &source_root)?;
    Ok(SandboxContext {
        sandbox_id: info.id,
        sandbox_root: PathBuf::from(info.root),
        source_root,
    })
}

pub fn export_path_to_workspace(
    sandbox_root: &Path,
    source_root: &Path,
    relative_source: &str,
    relative_destination: Option<&str>,
) -> Result<PathBuf, AppError> {
    let source_rel = normalize_relative_path(relative_source)?;
    let destination_rel = match relative_destination {
        Some(path) if !path.trim().is_empty() => normalize_relative_path(path)?,
        _ => source_rel.clone(),
    };

    let source_path = sandbox_root.join(&source_rel);
    if !source_path.exists() {
        return Err(AppError::not_found(format!(
            "Sandbox path does not exist: {}",
            source_rel.display()
        )));
    }

    let destination_path = source_root.join(destination_rel);
    if source_path.is_dir() {
        std::fs::create_dir_all(&destination_path)?;
        copy_seed_tree(&source_path, &destination_path)?;
    } else {
        if let Some(parent) = destination_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&source_path, &destination_path)?;
    }

    Ok(destination_path)
}

fn allowed_executable_set() -> HashSet<&'static str> {
    ALLOWED_EXECUTABLES.iter().copied().collect()
}

fn denied_executable_set() -> HashSet<&'static str> {
    DENIED_EXECUTABLES.iter().copied().collect()
}

fn validate_executable(root: &Path, executable: &str) -> Result<PathBuf, AppError> {
    let denied = denied_executable_set();
    if denied.contains(executable) {
        return Err(AppError::invalid_input(format!(
            "Executable '{executable}' is not allowed in sandbox mode"
        )));
    }

    if executable.starts_with("./") {
        let relative = normalize_relative_path(executable.trim_start_matches("./"))?;
        let path = root.join(relative);
        if !path.is_file() {
            return Err(AppError::not_found(format!(
                "Sandbox executable not found: {}",
                path.display()
            )));
        }
        return Ok(path);
    }

    if executable.contains('/') {
        return Err(AppError::invalid_input(
            "Sandbox mode only allows workspace-local './script' executables or approved tools",
        ));
    }

    let allowed = allowed_executable_set();
    if !allowed.contains(executable) {
        return Err(AppError::invalid_input(format!(
            "Executable '{executable}' is not in the sandbox allowlist"
        )));
    }

    Ok(PathBuf::from(executable))
}

pub async fn execute_sandbox_command(
    context: &SandboxContext,
    command: &str,
    timeout_ms: u64,
) -> Result<SandboxCommandOutput, AppError> {
    let parts = shell_words::split(command).map_err(|err| {
        AppError::invalid_input(format!("Failed to parse sandbox command: {err}"))
    })?;
    let (executable, args) = parts
        .split_first()
        .ok_or_else(|| AppError::invalid_input("Sandbox command is empty"))?;
    let program = validate_executable(&context.sandbox_root, executable)?;

    let cache_root = context.sandbox_root.join(".khadim-sandbox");
    let home_dir = cache_root.join("home");
    let tmp_dir = cache_root.join("tmp");
    let cache_dir = cache_root.join("cache");
    let cargo_home = cache_root.join("cargo");
    let rustup_home = cache_root.join("rustup");

    for dir in [&home_dir, &tmp_dir, &cache_dir, &cargo_home, &rustup_home] {
        std::fs::create_dir_all(dir)?;
    }

    let mut child = Command::new(program)
        .args(args)
        .current_dir(&context.sandbox_root)
        .env_clear()
        .env("PATH", std::env::var_os("PATH").unwrap_or_default())
        .env("HOME", &home_dir)
        .env("TMPDIR", &tmp_dir)
        .env("XDG_CACHE_HOME", &cache_dir)
        .env("CARGO_HOME", &cargo_home)
        .env("RUSTUP_HOME", &rustup_home)
        .env("npm_config_cache", cache_dir.join("npm"))
        .env("PNPM_HOME", cache_dir.join("pnpm-home"))
        .env("PIP_CACHE_DIR", cache_dir.join("pip"))
        .env("UV_CACHE_DIR", cache_dir.join("uv"))
        .env("KHADIM_SANDBOX_ROOT", &context.sandbox_root)
        .env("KHADIM_SOURCE_ROOT", &context.source_root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|err| AppError::process_spawn(format!("Failed to spawn sandbox command: {err}")))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_task = tokio::spawn(async move {
        let mut lines = Vec::new();
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                lines.push(line);
            }
        }
        lines
    });

    let stderr_task = tokio::spawn(async move {
        let mut lines = Vec::new();
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                lines.push(line);
            }
        }
        lines
    });

    let status = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        child.wait(),
    )
    .await
    .map_err(|_| AppError::process_kill(format!("sandbox command timed out after {timeout_ms}ms")))?
    .map_err(|err| AppError::process_kill(format!("Failed to wait for sandbox command: {err}")))?;

    let stdout_lines = stdout_task.await.unwrap_or_default();
    let stderr_lines = stderr_task.await.unwrap_or_default();
    let mut output = stdout_lines.join("\n");
    if !stderr_lines.is_empty() {
        if !output.is_empty() {
            output.push('\n');
        }
        output.push_str(&stderr_lines.join("\n"));
    }
    if output.is_empty() {
        output = "(no output)".to_string();
    }
    if !status.success() {
        output.push_str(&format!("\n\nCommand exited with status {}", status));
    }

    Ok(SandboxCommandOutput {
        output,
        success: status.success(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_relative_paths() {
        assert_eq!(normalize_relative_path("src/main.rs").unwrap(), PathBuf::from("src/main.rs"));
        assert!(normalize_relative_path("../oops").is_err());
        assert!(normalize_relative_path("/tmp/oops").is_err());
    }

    #[test]
    fn rejects_shells() {
        let tmp = std::env::temp_dir();
        assert!(validate_executable(&tmp, "bash").is_err());
        assert!(validate_executable(&tmp, "python3").is_ok());
    }
}
