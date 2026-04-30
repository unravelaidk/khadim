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
    pub worktree_path: Option<String>,
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

fn sanitize_worktree_segment(input: &str) -> String {
    let mut value = input
        .trim()
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '_' | '-' => ch,
            _ => '-',
        })
        .collect::<String>();

    while value.contains("--") {
        value = value.replace("--", "-");
    }

    value.trim_matches('-').to_string()
}

fn default_worktree_path(repo_path: &str, branch: &str) -> String {
    let repo = std::path::Path::new(repo_path);
    let repo_name = repo
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("repo");
    let repo_parent = repo.parent().unwrap_or(repo);
    let sanitized_branch = sanitize_worktree_segment(branch);
    let branch_segment = if sanitized_branch.is_empty() {
        "worktree"
    } else {
        &sanitized_branch
    };

    repo_parent
        .join(".khadim-worktrees")
        .join(repo_name)
        .join(branch_segment)
        .to_string_lossy()
        .to_string()
}

/// Create a new worktree.
/// If `new_branch` is true, creates a new branch. Otherwise checks out an existing branch.
/// If an existing non-main worktree already tracks the requested branch, it is reused.
pub fn create_worktree(
    repo_path: &str,
    worktree_path: Option<&str>,
    branch: &str,
    new_branch: bool,
    base_branch: Option<&str>,
) -> Result<WorktreeInfo, AppError> {
    // Check that the repo has at least one commit – worktrees cannot be created
    // from a branch that has no commits yet.
    if run_git(repo_path, &["rev-parse", "HEAD"]).is_err() {
        return Err(AppError::git(
            "This repository has no commits yet. Make an initial commit before creating an agent worktree.".to_string(),
        ));
    }

    if !new_branch {
        if let Some(existing) = list_worktrees(repo_path)?
            .into_iter()
            .find(|wt| wt.branch.as_deref() == Some(branch) && !wt.is_main)
        {
            return Ok(existing);
        }
    }

    let resolved_worktree_path = worktree_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .unwrap_or_else(|| default_worktree_path(repo_path, branch));

    if let Some(parent) = std::path::Path::new(&resolved_worktree_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            AppError::io(format!("Failed to create worktree parent directory: {e}"))
        })?;
    }

    if new_branch {
        if let Some(base_branch) = base_branch.filter(|value| !value.trim().is_empty()) {
            run_git(
                repo_path,
                &[
                    "worktree",
                    "add",
                    "-b",
                    branch,
                    &resolved_worktree_path,
                    base_branch,
                ],
            )?;
        } else {
            run_git(
                repo_path,
                &["worktree", "add", "-b", branch, &resolved_worktree_path],
            )?;
        }
    } else {
        run_git(
            repo_path,
            &[
                "worktree",
                "add",
                "--force",
                &resolved_worktree_path,
                branch,
            ],
        )?;
    }

    Ok(WorktreeInfo {
        path: resolved_worktree_path.clone(),
        branch: Some(branch.to_string()),
        head: run_git(&resolved_worktree_path, &["rev-parse", "HEAD"]).unwrap_or_default(),
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

    let worktree_map = list_worktrees(repo_path)?
        .into_iter()
        .filter_map(|worktree| worktree.branch.map(|branch| (branch, worktree.path)))
        .collect::<std::collections::HashMap<_, _>>();

    let mut branches = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(3, ' ').collect();
        if parts.len() >= 2 {
            let name = parts[0].to_string();
            let commit = parts[1].to_string();
            let is_current = parts.get(2).map(|s| s.contains('*')).unwrap_or(false);
            let is_remote = name.starts_with("origin/");

            branches.push(BranchInfo {
                worktree_path: (!is_remote)
                    .then(|| worktree_map.get(&name).cloned())
                    .flatten(),
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

/// A single file entry from `git diff` with change counts.
#[derive(Debug, Clone, Serialize)]
pub struct DiffFileEntry {
    /// Relative path within the repo.
    pub path: String,
    /// Single-letter status: M, A, D, R, C, U, or ? for untracked.
    pub status: String,
    /// Lines added (None for binary files).
    pub insertions: Option<u32>,
    /// Lines removed (None for binary files).
    pub deletions: Option<u32>,
}

/// List files changed in the working tree (unstaged + staged + untracked).
///
/// Combines `git diff --numstat`, `git diff --cached --numstat`, and
/// `git ls-files --others --exclude-standard` to produce one merged list.
pub fn diff_files(repo_path: &str) -> Result<Vec<DiffFileEntry>, AppError> {
    use std::collections::HashMap;

    let mut entries: HashMap<String, DiffFileEntry> = HashMap::new();

    // Helper: parse --numstat output into the map.  Lines look like:
    //   10\t5\tpath/to/file
    //   -\t-\tbinary-file
    fn parse_numstat(raw: &str, entries: &mut HashMap<String, DiffFileEntry>) {
        for line in raw.lines() {
            let parts: Vec<&str> = line.splitn(3, '\t').collect();
            if parts.len() < 3 {
                continue;
            }
            let ins = parts[0].parse::<u32>().ok();
            let del = parts[1].parse::<u32>().ok();
            let path = parts[2].to_string();
            let entry = entries
                .entry(path.clone())
                .or_insert_with(|| DiffFileEntry {
                    path,
                    status: "M".to_string(),
                    insertions: Some(0),
                    deletions: Some(0),
                });
            // Accumulate counts
            match (entry.insertions, ins) {
                (Some(a), Some(b)) => entry.insertions = Some(a + b),
                _ => entry.insertions = None, // binary
            }
            match (entry.deletions, del) {
                (Some(a), Some(b)) => entry.deletions = Some(a + b),
                _ => entry.deletions = None,
            }
        }
    }

    fn parse_name_status(raw: &str, entries: &mut HashMap<String, DiffFileEntry>) {
        for line in raw.lines() {
            let parts: Vec<&str> = line.splitn(2, '\t').collect();
            if parts.len() < 2 {
                continue;
            }
            let status_char = parts[0].chars().next().unwrap_or('M').to_string();
            let path = parts[1].to_string();
            if let Some(entry) = entries.get_mut(&path) {
                if entry.status == "M" || status_char == "A" || status_char == "D" {
                    entry.status = status_char;
                }
            }
        }
    }

    // ── 1. Branch diff: merge-base of default branch → HEAD ──────────
    // Try to find a default branch to diff against.
    let default_branch = find_default_branch(repo_path);

    if let Some(ref base) = default_branch {
        // merge-base between default branch and HEAD
        if let Ok(merge_base) = run_git(repo_path, &["merge-base", base, "HEAD"]) {
            let mb = merge_base.trim();
            if !mb.is_empty() {
                // Committed changes from merge-base to HEAD
                let numstat_args = ["diff", "--numstat", mb, "HEAD"];
                if let Ok(raw) = run_git(repo_path, &numstat_args) {
                    parse_numstat(&raw, &mut entries);
                }
                let name_status_args = ["diff", "--name-status", mb, "HEAD"];
                if let Ok(raw) = run_git(repo_path, &name_status_args) {
                    parse_name_status(&raw, &mut entries);
                }
            }
        }
    }

    // ── 2. Uncommitted changes on top ────────────────────────────────
    // Unstaged changes
    if let Ok(raw) = run_git(repo_path, &["diff", "--numstat"]) {
        parse_numstat(&raw, &mut entries);
    }

    // Staged changes
    if let Ok(raw) = run_git(repo_path, &["diff", "--cached", "--numstat"]) {
        parse_numstat(&raw, &mut entries);
    }

    // Overlay status letters from --name-status (unstaged then staged)
    for args in [
        &["diff", "--name-status"][..],
        &["diff", "--cached", "--name-status"][..],
    ] {
        if let Ok(raw) = run_git(repo_path, args) {
            parse_name_status(&raw, &mut entries);
        }
    }

    // Untracked files
    if let Ok(raw) = run_git(repo_path, &["ls-files", "--others", "--exclude-standard"]) {
        for line in raw.lines() {
            let path = line.trim().to_string();
            if path.is_empty() {
                continue;
            }
            entries.entry(path.clone()).or_insert(DiffFileEntry {
                path,
                status: "?".to_string(),
                insertions: None,
                deletions: None,
            });
        }
    }

    let mut result: Vec<DiffFileEntry> = entries.into_values().collect();
    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

/// Attempt to find the default branch name for diffing.
/// Tries: the upstream default via `origin/HEAD`, then `main`, then `master`.
fn find_default_branch(repo_path: &str) -> Option<String> {
    // 1. Check origin/HEAD symbolic ref
    if let Ok(raw) = run_git(repo_path, &["symbolic-ref", "refs/remotes/origin/HEAD"]) {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            // e.g. "refs/remotes/origin/main" → "origin/main"
            let short = trimmed.strip_prefix("refs/remotes/").unwrap_or(trimmed);
            return Some(short.to_string());
        }
    }

    // 2. Check if common branch names exist locally
    for name in ["main", "master"] {
        if run_git(repo_path, &["rev-parse", "--verify", name]).is_ok() {
            return Some(name.to_string());
        }
    }

    // 3. Check remote variants
    for name in ["origin/main", "origin/master"] {
        if run_git(repo_path, &["rev-parse", "--verify", name]).is_ok() {
            return Some(name.to_string());
        }
    }

    None
}

// ── Remote & push helpers ────────────────────────────────────────────

/// Add a remote to a git repo. Errors if the remote name already exists.
pub fn add_remote(repo_path: &str, name: &str, url: &str) -> Result<(), AppError> {
    run_git(repo_path, &["remote", "add", name, url])?;
    Ok(())
}

/// Set the URL of an existing remote.
pub fn set_remote_url(repo_path: &str, name: &str, url: &str) -> Result<(), AppError> {
    run_git(repo_path, &["remote", "set-url", name, url])?;
    Ok(())
}

/// Check if a remote with the given name exists.
pub fn has_remote(repo_path: &str, name: &str) -> bool {
    run_git(repo_path, &["remote", "get-url", name]).is_ok()
}

/// Push a branch to a remote. Sets upstream tracking (-u).
/// Returns the git output on success.
pub fn push(repo_path: &str, remote: &str, branch: &str) -> Result<String, AppError> {
    // Use -u to set upstream tracking
    run_git(repo_path, &["push", "-u", remote, branch])
}

/// Push all branches and tags to a remote.
pub fn push_all(repo_path: &str, remote: &str) -> Result<String, AppError> {
    run_git(repo_path, &["push", "-u", "--all", remote])?;
    run_git(repo_path, &["push", "--tags", remote])
}
