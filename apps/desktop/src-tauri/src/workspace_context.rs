//! Workspace context layer.
//!
//! Resolves the effective coding context for the active workspace /
//! conversation / agent. All native tools (terminal, file finder, diff)
//! should drive their cwd and metadata from this single source of truth
//! so they stay in lock-step with the agent the user is focused on.
//!
//! Resolution order for `cwd`:
//! 1. `conversation.backend_session_cwd` (already validated at session create time)
//! 2. `conversation.worktree_path`
//! 3. `workspace.worktree_path`
//! 4. `workspace.repo_path`
//!
//! `branch` falls back from conversation → workspace.

use crate::db::{Conversation, Database, Environment, RuntimeSession, Workspace};
use crate::error::AppError;
use serde::Serialize;
use std::path::Path;

/// Lightweight, frontend-facing snapshot of the active coding context.
///
/// This is intentionally flat so it can be passed straight into terminal,
/// file finder, and diff requests without re-deriving anything client-side.
#[derive(Debug, Clone, Serialize)]
pub struct DesktopWorkspaceContext {
    pub workspace_id: String,
    pub workspace_name: String,
    pub backend: String,
    /// Conversation ID (= agent ID in the desktop model) when one is focused.
    pub conversation_id: Option<String>,
    /// Stable repo path (the original git repo, never the worktree).
    pub repo_path: String,
    /// Active branch — usually the agent's branch, falling back to the workspace default.
    pub branch: Option<String>,
    /// Effective working directory for native tools. Always exists on disk
    /// when the resolver succeeds.
    pub cwd: String,
    /// Worktree path when the active context is running inside a non-main worktree.
    pub worktree_path: Option<String>,
    /// True when `cwd` is a non-main worktree (i.e. the agent is sandboxed off main).
    pub in_worktree: bool,
}

fn first_existing_dir<'a, I>(candidates: I) -> Option<String>
where
    I: IntoIterator<Item = Option<&'a str>>,
{
    for candidate in candidates.into_iter().flatten() {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        if Path::new(trimmed).is_dir() {
            return Some(trimmed.to_string());
        }
    }
    None
}

/// Resolve the desktop coding context for a workspace and (optionally) a conversation.
///
/// Falls back gracefully when the conversation is missing or its persisted
/// cwd/worktree no longer exists on disk (e.g. the worktree was pruned).
pub fn resolve(
    db: &Database,
    workspace_id: &str,
    conversation_id: Option<&str>,
) -> Result<DesktopWorkspaceContext, AppError> {
    let workspace = db.get_workspace(workspace_id)?;
    let conversation = match conversation_id {
        Some(id) => Some(db.get_conversation(id)?),
        None => None,
    };
    let environment = match conversation
        .as_ref()
        .and_then(|c| c.environment_id.as_deref())
    {
        Some(id) => db.get_environment(id).ok(),
        None => None,
    };
    let runtime_session = match conversation
        .as_ref()
        .and_then(|c| c.runtime_session_id.as_deref())
    {
        Some(id) => db.get_runtime_session(id).ok(),
        None => None,
    };

    Ok(build_context(
        &workspace,
        conversation.as_ref(),
        environment.as_ref(),
        runtime_session.as_ref(),
    ))
}

/// Pure builder used by `resolve` and unit tests — no DB access here so it
/// stays trivially testable.
pub fn build_context(
    workspace: &Workspace,
    conversation: Option<&Conversation>,
    environment: Option<&Environment>,
    runtime_session: Option<&RuntimeSession>,
) -> DesktopWorkspaceContext {
    let session_cwd = runtime_session.and_then(|s| s.backend_session_cwd.as_deref());
    let conv_cwd = conversation.and_then(|c| c.backend_session_cwd.as_deref());
    let conv_worktree = conversation.and_then(|c| c.worktree_path.as_deref());
    let env_cwd = environment.map(|e| e.effective_cwd.as_str());
    let env_worktree = environment.and_then(|e| e.worktree_path.as_deref());
    let ws_worktree = workspace.worktree_path.as_deref();

    let cwd = first_existing_dir([
        session_cwd,
        env_cwd,
        conv_cwd,
        conv_worktree,
        env_worktree,
        ws_worktree,
        Some(workspace.repo_path.as_str()),
    ])
    .unwrap_or_else(|| workspace.repo_path.clone());

    // Prefer a real worktree path that still exists on disk; otherwise drop it
    // so the frontend doesn't show a stale badge.
    let worktree_path = [conv_worktree, env_worktree, ws_worktree]
        .into_iter()
        .flatten()
        .find(|p| Path::new(p).is_dir())
        .map(|p| p.to_string());

    let in_worktree = worktree_path
        .as_deref()
        .map(|p| p == cwd && p != workspace.repo_path)
        .unwrap_or(false);

    let branch = conversation
        .and_then(|c| c.branch.clone())
        .or_else(|| workspace.branch.clone());

    DesktopWorkspaceContext {
        workspace_id: workspace.id.clone(),
        workspace_name: workspace.name.clone(),
        backend: workspace.backend.clone(),
        conversation_id: conversation.map(|c| c.id.clone()),
        repo_path: workspace.repo_path.clone(),
        branch,
        cwd,
        worktree_path,
        in_worktree,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace(repo: &str, worktree: Option<&str>, branch: Option<&str>) -> Workspace {
        Workspace {
            id: "ws".into(),
            name: "demo".into(),
            repo_path: repo.into(),
            worktree_path: worktree.map(str::to_string),
            branch: branch.map(str::to_string),
            backend: "khadim".into(),
            execution_target: "local".into(),
            sandbox_id: None,
            sandbox_root_path: None,
            created_at: "now".into(),
            updated_at: "now".into(),
        }
    }

    fn conversation(
        cwd: Option<&str>,
        worktree: Option<&str>,
        branch: Option<&str>,
    ) -> Conversation {
        Conversation {
            id: "conv".into(),
            workspace_id: "ws".into(),
            environment_id: None,
            runtime_session_id: None,
            backend: "khadim".into(),
            backend_session_id: None,
            backend_session_cwd: cwd.map(str::to_string),
            branch: branch.map(str::to_string),
            worktree_path: worktree.map(str::to_string),
            title: None,
            is_active: true,
            created_at: "now".into(),
            updated_at: "now".into(),
            input_tokens: 0,
            output_tokens: 0,
        }
    }

    #[test]
    fn falls_back_to_repo_path_when_nothing_exists() {
        let ws = workspace("/nope/repo", None, Some("main"));
        let ctx = build_context(&ws, None, None, None);
        assert_eq!(ctx.cwd, "/nope/repo");
        assert_eq!(ctx.branch.as_deref(), Some("main"));
        assert!(!ctx.in_worktree);
        assert!(ctx.worktree_path.is_none());
    }

    #[test]
    fn prefers_conversation_branch_over_workspace_branch() {
        let ws = workspace("/repo", None, Some("main"));
        let conv = conversation(None, None, Some("feature/x"));
        let ctx = build_context(&ws, Some(&conv), None, None);
        assert_eq!(ctx.branch.as_deref(), Some("feature/x"));
    }

    #[test]
    fn uses_existing_temp_dir_as_cwd() {
        let tmp = std::env::temp_dir();
        let tmp_str = tmp.to_string_lossy().to_string();
        let ws = workspace(&tmp_str, None, None);
        let ctx = build_context(&ws, None, None, None);
        assert_eq!(ctx.cwd, tmp_str);
    }
}
