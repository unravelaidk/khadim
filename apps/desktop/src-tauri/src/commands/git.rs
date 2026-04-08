use crate::error::AppError;
use crate::git;

#[tauri::command]
pub(crate) fn git_repo_info(path: String) -> Result<git::RepoInfo, AppError> {
    git::repo_info(&path)
}

#[tauri::command]
pub(crate) fn git_list_branches(repo_path: String) -> Result<Vec<git::BranchInfo>, AppError> {
    git::list_branches(&repo_path)
}

#[tauri::command]
pub(crate) fn git_list_worktrees(repo_path: String) -> Result<Vec<git::WorktreeInfo>, AppError> {
    git::list_worktrees(&repo_path)
}

#[tauri::command]
pub(crate) fn git_status(repo_path: String) -> Result<String, AppError> {
    git::status_summary(&repo_path)
}

#[tauri::command]
pub(crate) fn git_diff_stat(repo_path: String) -> Result<String, AppError> {
    git::diff_stat(&repo_path)
}

#[tauri::command]
pub(crate) fn git_diff_files(repo_path: String) -> Result<Vec<git::DiffFileEntry>, AppError> {
    git::diff_files(&repo_path)
}

#[tauri::command]
pub(crate) fn git_create_worktree(
    repo_path: String,
    worktree_path: Option<String>,
    branch: String,
    new_branch: bool,
    base_branch: Option<String>,
) -> Result<git::WorktreeInfo, AppError> {
    git::create_worktree(
        &repo_path,
        worktree_path.as_deref(),
        &branch,
        new_branch,
        base_branch.as_deref(),
    )
}

#[tauri::command]
pub(crate) fn git_remove_worktree(
    repo_path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), AppError> {
    git::remove_worktree(&repo_path, &worktree_path, force)
}
