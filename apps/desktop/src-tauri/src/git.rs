use crate::error::AppError;
use serde::Serialize;
use std::process::Command;

/// Information about a git worktree.
#[derive(Debug, Clone, Serialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub head: String,
    pub is_bare: bool,
    pub is_main: bool,
}

/// Information about a git branch.
#[derive(Debug, Clone, Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub commit: String,
}

/// Basic git repository information.
#[derive(Debug, Clone, Serialize)]
pub struct RepoInfo {
    pub path: String,
    pub current_branch: Option<String>,
    pub is_dirty: bool,
    pub remote_url: Option<String>,
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, AppError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::git(format!("Failed to run git: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::git(format!(
            "git {}: {}",
            args.join(" "),
            stderr.trim()
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Check if a path is a git repository.
pub fn is_git_repo(path: &str) -> bool {
    run_git(path, &["rev-parse", "--git-dir"]).is_ok()
}

/// Get basic info about a git repo.
pub fn repo_info(path: &str) -> Result<RepoInfo, AppError> {
    if !is_git_repo(path) {
        return Err(AppError::git(format!("{path} is not a git repository")));
    }

    let current_branch = run_git(path, &["branch", "--show-current"]).ok();

    let is_dirty = run_git(path, &["status", "--porcelain"])
        .map(|s| !s.is_empty())
        .unwrap_or(false);

    let remote_url = run_git(path, &["remote", "get-url", "origin"]).ok();

    Ok(RepoInfo {
        path: path.to_string(),
        current_branch,
        is_dirty,
        remote_url,
    })
}

/// List worktrees for a repo.
pub fn list_worktrees(repo_path: &str) -> Result<Vec<WorktreeInfo>, AppError> {
    let output = run_git(repo_path, &["worktree", "list", "--porcelain"])?;
    let mut worktrees = Vec::new();
    let mut current: Option<WorktreeInfo> = None;

    for line in output.lines() {
        if line.starts_with("worktree ") {
            // Save the previous worktree if any
            if let Some(wt) = current.take() {
                worktrees.push(wt);
            }
            current = Some(WorktreeInfo {
                path: line.strip_prefix("worktree ").unwrap().to_string(),
                branch: None,
                head: String::new(),
                is_bare: false,
                is_main: false,
            });
        } else if line.starts_with("HEAD ") {
            if let Some(ref mut wt) = current {
                wt.head = line.strip_prefix("HEAD ").unwrap().to_string();
            }
        } else if line.starts_with("branch ") {
            if let Some(ref mut wt) = current {
                let branch_ref = line.strip_prefix("branch ").unwrap();
                // Strip refs/heads/ prefix
                wt.branch = Some(
                    branch_ref
                        .strip_prefix("refs/heads/")
                        .unwrap_or(branch_ref)
                        .to_string(),
                );
            }
        } else if line == "bare" {
            if let Some(ref mut wt) = current {
                wt.is_bare = true;
            }
        }
    }

    if let Some(wt) = current {
        worktrees.push(wt);
    }

    // Mark the first worktree as main
    if let Some(first) = worktrees.first_mut() {
        first.is_main = true;
    }

    Ok(worktrees)
}

/// Create a new worktree.
/// If `new_branch` is Some, creates a new branch. Otherwise checks out existing branch.
pub fn create_worktree(
    repo_path: &str,
    worktree_path: &str,
    branch: &str,
    new_branch: bool,
) -> Result<WorktreeInfo, AppError> {
    if new_branch {
        run_git(repo_path, &["worktree", "add", "-b", branch, worktree_path])?;
    } else {
        run_git(repo_path, &["worktree", "add", worktree_path, branch])?;
    }

    // Return info about the created worktree
    Ok(WorktreeInfo {
        path: worktree_path.to_string(),
        branch: Some(branch.to_string()),
        head: run_git(worktree_path, &["rev-parse", "HEAD"]).unwrap_or_default(),
        is_bare: false,
        is_main: false,
    })
}

/// Remove a worktree.
pub fn remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<(), AppError> {
    let mut args = vec!["worktree", "remove", worktree_path];
    if force {
        args.push("--force");
    }
    run_git(repo_path, &args)?;
    Ok(())
}

/// Prune stale worktree entries.
pub fn prune_worktrees(repo_path: &str) -> Result<(), AppError> {
    run_git(repo_path, &["worktree", "prune"])?;
    Ok(())
}

/// List local branches.
pub fn list_branches(repo_path: &str) -> Result<Vec<BranchInfo>, AppError> {
    let output = run_git(
        repo_path,
        &[
            "branch",
            "-a",
            "--format=%(refname:short) %(objectname:short) %(HEAD)",
        ],
    )?;

    let mut branches = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(3, ' ').collect();
        if parts.len() >= 2 {
            let name = parts[0].to_string();
            let commit = parts[1].to_string();
            let is_current = parts.get(2).map(|s| s.contains('*')).unwrap_or(false);
            let is_remote = name.starts_with("origin/");

            branches.push(BranchInfo {
                name,
                is_current,
                is_remote,
                commit,
            });
        }
    }

    Ok(branches)
}

/// Get short status for display (modified/added/deleted counts).
pub fn status_summary(repo_path: &str) -> Result<String, AppError> {
    run_git(repo_path, &["status", "--short"])
}

/// Get diff stat for display.
pub fn diff_stat(repo_path: &str) -> Result<String, AppError> {
    run_git(repo_path, &["diff", "--stat"])
}
