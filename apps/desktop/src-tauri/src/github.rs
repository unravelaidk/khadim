use crate::error::AppError;
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

// ── Constants ────────────────────────────────────────────────────────

const GITHUB_API: &str = "https://api.github.com";
const APP_USER_AGENT: &str = "Khadim-Desktop/0.1";

// ── Types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub id: u64,
    pub avatar_url: String,
    pub name: Option<String>,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubLabel {
    pub id: u64,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubMilestone {
    pub id: u64,
    pub number: u32,
    pub title: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubIssue {
    pub number: u32,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
    pub user: GitHubUser,
    pub labels: Vec<GitHubLabel>,
    pub assignees: Vec<GitHubUser>,
    pub milestone: Option<GitHubMilestone>,
    pub comments: u32,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    /// Present if this is actually a PR (issues endpoint returns PRs too).
    pub pull_request: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubComment {
    pub id: u64,
    pub body: String,
    pub user: GitHubUser,
    pub html_url: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubPRBranch {
    pub label: String,
    #[serde(rename = "ref")]
    pub ref_name: String,
    pub sha: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubPR {
    pub number: u32,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
    pub user: GitHubUser,
    pub labels: Vec<GitHubLabel>,
    pub assignees: Vec<GitHubUser>,
    pub milestone: Option<GitHubMilestone>,
    pub head: GitHubPRBranch,
    pub base: GitHubPRBranch,
    pub merged: Option<bool>,
    pub mergeable: Option<bool>,
    pub draft: Option<bool>,
    pub comments: u32,
    pub commits: Option<u32>,
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
    pub changed_files: Option<u32>,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub merged_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubCheckRun {
    pub id: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub html_url: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubCheckSuite {
    pub total_count: u32,
    pub check_runs: Vec<GitHubCheckRun>,
}

/// Auth status returned to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct GitHubAuthStatus {
    pub authenticated: bool,
    pub user: Option<GitHubUser>,
}

/// Owner/repo pair extracted from a remote URL.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoSlug {
    pub owner: String,
    pub repo: String,
}

/// Info about the `gh` CLI.
#[derive(Debug, Clone, Serialize)]
pub struct GhCliInfo {
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

/// Response from creating a repo via GitHub API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub private: bool,
    pub html_url: String,
    pub clone_url: String,
    pub ssh_url: String,
    pub default_branch: String,
}

// ── GitHubClient ─────────────────────────────────────────────────────

pub struct GitHubClient {
    http: reqwest::Client,
    /// Cached token (fetched from `gh auth token` on demand).
    token: Mutex<Option<String>>,
}

impl GitHubClient {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent(APP_USER_AGENT)
            .build()
            .expect("Failed to build reqwest client");
        Self {
            http,
            token: Mutex::new(None),
        }
    }

    // ── Token management (via gh CLI) ────────────────────────────────

    /// Fetch a fresh token from `gh auth token` and cache it.
    pub fn refresh_token(&self) -> Result<Option<String>, AppError> {
        use std::process::Command;
        let output = Command::new("gh")
            .args(["auth", "token"])
            .output()
            .map_err(|e| AppError::github(format!("Failed to run `gh auth token`: {e}")))?;

        if !output.status.success() {
            // gh is not authenticated — clear cache
            *self.token.lock().unwrap() = None;
            return Ok(None);
        }

        let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if token.is_empty() {
            *self.token.lock().unwrap() = None;
            return Ok(None);
        }

        *self.token.lock().unwrap() = Some(token.clone());
        Ok(Some(token))
    }

    /// Get the cached token, or refresh from `gh auth token`.
    fn get_token(&self) -> Option<String> {
        let cached = self.token.lock().unwrap().clone();
        if cached.is_some() {
            return cached;
        }
        // Try refreshing
        self.refresh_token().ok().flatten()
    }

    /// Clear the in-memory token cache (used after logout).
    pub fn clear_token(&self) {
        *self.token.lock().unwrap() = None;
    }

    fn require_token(&self) -> Result<String, AppError> {
        self.get_token().ok_or_else(|| {
            AppError::github(
                "Not authenticated. Run `gh auth login` or use the login button to sign in.",
            )
        })
    }

    // ── HTTP helpers ─────────────────────────────────────────────────

    async fn api_get<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T, AppError> {
        let token = self.require_token()?;
        let url = format!("{GITHUB_API}{path}");
        let resp = self
            .http
            .get(&url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(ACCEPT, "application/vnd.github+json")
            .header(USER_AGENT, APP_USER_AGENT)
            .send()
            .await
            .map_err(|e| AppError::github(format!("Request failed: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::github(format!("GitHub API {status}: {body}")));
        }
        resp.json::<T>()
            .await
            .map_err(|e| AppError::github(format!("Failed to parse response: {e}")))
    }

    async fn api_get_text(&self, path: &str, accept: &str) -> Result<String, AppError> {
        let token = self.require_token()?;
        let url = format!("{GITHUB_API}{path}");
        let resp = self
            .http
            .get(&url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(ACCEPT, accept)
            .header(USER_AGENT, APP_USER_AGENT)
            .send()
            .await
            .map_err(|e| AppError::github(format!("Request failed: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::github(format!("GitHub API {status}: {body}")));
        }
        resp.text()
            .await
            .map_err(|e| AppError::github(format!("Failed to read response: {e}")))
    }

    async fn api_post<B: Serialize, T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, AppError> {
        let token = self.require_token()?;
        let url = format!("{GITHUB_API}{path}");
        let resp = self
            .http
            .post(&url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(ACCEPT, "application/vnd.github+json")
            .header(USER_AGENT, APP_USER_AGENT)
            .json(body)
            .send()
            .await
            .map_err(|e| AppError::github(format!("Request failed: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::github(format!("GitHub API {status}: {body}")));
        }
        resp.json::<T>()
            .await
            .map_err(|e| AppError::github(format!("Failed to parse response: {e}")))
    }

    async fn api_patch<B: Serialize, T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, AppError> {
        let token = self.require_token()?;
        let url = format!("{GITHUB_API}{path}");
        let resp = self
            .http
            .patch(&url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(ACCEPT, "application/vnd.github+json")
            .header(USER_AGENT, APP_USER_AGENT)
            .json(body)
            .send()
            .await
            .map_err(|e| AppError::github(format!("Request failed: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::github(format!("GitHub API {status}: {body}")));
        }
        resp.json::<T>()
            .await
            .map_err(|e| AppError::github(format!("Failed to parse response: {e}")))
    }

    async fn api_put_empty(&self, path: &str) -> Result<(), AppError> {
        let token = self.require_token()?;
        let url = format!("{GITHUB_API}{path}");
        let resp = self
            .http
            .put(&url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(ACCEPT, "application/vnd.github+json")
            .header(USER_AGENT, APP_USER_AGENT)
            .send()
            .await
            .map_err(|e| AppError::github(format!("Request failed: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::github(format!("GitHub API {status}: {body}")));
        }
        Ok(())
    }

    async fn api_put<B: Serialize, T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, AppError> {
        let token = self.require_token()?;
        let url = format!("{GITHUB_API}{path}");
        let resp = self
            .http
            .put(&url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(ACCEPT, "application/vnd.github+json")
            .header(USER_AGENT, APP_USER_AGENT)
            .json(body)
            .send()
            .await
            .map_err(|e| AppError::github(format!("Request failed: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::github(format!("GitHub API {status}: {body}")));
        }
        resp.json::<T>()
            .await
            .map_err(|e| AppError::github(format!("Failed to parse response: {e}")))
    }

    async fn api_delete(&self, path: &str) -> Result<(), AppError> {
        let token = self.require_token()?;
        let url = format!("{GITHUB_API}{path}");
        let resp = self
            .http
            .delete(&url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(ACCEPT, "application/vnd.github+json")
            .header(USER_AGENT, APP_USER_AGENT)
            .send()
            .await
            .map_err(|e| AppError::github(format!("Request failed: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::github(format!("GitHub API {status}: {body}")));
        }
        Ok(())
    }

    // ── User ─────────────────────────────────────────────────────────

    pub async fn get_authenticated_user(&self) -> Result<GitHubUser, AppError> {
        self.api_get("/user").await
    }

    // ── Repo slug extraction ─────────────────────────────────────────

    /// Extract owner/repo from a git remote URL.
    /// Supports:
    ///   - `https://github.com/owner/repo.git`
    ///   - `https://github.com/owner/repo`
    ///   - `git@github.com:owner/repo.git`
    ///   - `ssh://git@github.com/owner/repo.git`
    pub fn parse_repo_slug(remote_url: &str) -> Option<RepoSlug> {
        let url = remote_url.trim();

        // SSH style: git@github.com:owner/repo.git
        if let Some(rest) = url.strip_prefix("git@github.com:") {
            let rest = rest.strip_suffix(".git").unwrap_or(rest);
            let parts: Vec<&str> = rest.splitn(2, '/').collect();
            if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
                return Some(RepoSlug {
                    owner: parts[0].to_string(),
                    repo: parts[1].to_string(),
                });
            }
        }

        // HTTPS / SSH URL style
        // e.g. https://github.com/owner/repo.git
        //      ssh://git@github.com/owner/repo.git
        let path = if let Some(rest) = url.strip_prefix("https://github.com/") {
            Some(rest)
        } else if let Some(rest) = url.strip_prefix("http://github.com/") {
            Some(rest)
        } else {
            url.strip_prefix("ssh://git@github.com/")
        };

        if let Some(path) = path {
            let path = path.strip_suffix(".git").unwrap_or(path);
            let parts: Vec<&str> = path.splitn(3, '/').collect();
            if parts.len() >= 2 && !parts[0].is_empty() && !parts[1].is_empty() {
                return Some(RepoSlug {
                    owner: parts[0].to_string(),
                    repo: parts[1].to_string(),
                });
            }
        }

        None
    }

    // ── Issues ───────────────────────────────────────────────────────

    pub async fn list_issues(
        &self,
        owner: &str,
        repo: &str,
        state: &str,
        page: u32,
        per_page: u32,
    ) -> Result<Vec<GitHubIssue>, AppError> {
        let path = format!(
            "/repos/{owner}/{repo}/issues?state={state}&page={page}&per_page={per_page}&sort=updated&direction=desc"
        );
        self.api_get(&path).await
    }

    pub async fn get_issue(
        &self,
        owner: &str,
        repo: &str,
        number: u32,
    ) -> Result<GitHubIssue, AppError> {
        let path = format!("/repos/{owner}/{repo}/issues/{number}");
        self.api_get(&path).await
    }

    pub async fn create_issue(
        &self,
        owner: &str,
        repo: &str,
        title: &str,
        body: Option<&str>,
        labels: &[String],
        assignees: &[String],
    ) -> Result<GitHubIssue, AppError> {
        let path = format!("/repos/{owner}/{repo}/issues");
        let payload = serde_json::json!({
            "title": title,
            "body": body.unwrap_or(""),
            "labels": labels,
            "assignees": assignees,
        });
        self.api_post(&path, &payload).await
    }

    pub async fn edit_issue(
        &self,
        owner: &str,
        repo: &str,
        number: u32,
        title: Option<&str>,
        body: Option<&str>,
        state: Option<&str>,
        labels: Option<&[String]>,
        assignees: Option<&[String]>,
    ) -> Result<GitHubIssue, AppError> {
        let path = format!("/repos/{owner}/{repo}/issues/{number}");
        let mut payload = serde_json::Map::new();
        if let Some(t) = title {
            payload.insert("title".into(), serde_json::Value::String(t.to_string()));
        }
        if let Some(b) = body {
            payload.insert("body".into(), serde_json::Value::String(b.to_string()));
        }
        if let Some(s) = state {
            payload.insert("state".into(), serde_json::Value::String(s.to_string()));
        }
        if let Some(l) = labels {
            payload.insert("labels".into(), serde_json::to_value(l).unwrap());
        }
        if let Some(a) = assignees {
            payload.insert("assignees".into(), serde_json::to_value(a).unwrap());
        }
        self.api_patch(&path, &payload).await
    }

    pub async fn list_issue_comments(
        &self,
        owner: &str,
        repo: &str,
        number: u32,
        page: u32,
        per_page: u32,
    ) -> Result<Vec<GitHubComment>, AppError> {
        let path = format!(
            "/repos/{owner}/{repo}/issues/{number}/comments?page={page}&per_page={per_page}"
        );
        self.api_get(&path).await
    }

    pub async fn create_issue_comment(
        &self,
        owner: &str,
        repo: &str,
        number: u32,
        body: &str,
    ) -> Result<GitHubComment, AppError> {
        let path = format!("/repos/{owner}/{repo}/issues/{number}/comments");
        let payload = serde_json::json!({ "body": body });
        self.api_post(&path, &payload).await
    }

    pub async fn list_labels(&self, owner: &str, repo: &str) -> Result<Vec<GitHubLabel>, AppError> {
        let path = format!("/repos/{owner}/{repo}/labels?per_page=100");
        self.api_get(&path).await
    }

    // ── Pull Requests ────────────────────────────────────────────────

    pub async fn list_prs(
        &self,
        owner: &str,
        repo: &str,
        state: &str,
        page: u32,
        per_page: u32,
    ) -> Result<Vec<GitHubPR>, AppError> {
        let path = format!(
            "/repos/{owner}/{repo}/pulls?state={state}&page={page}&per_page={per_page}&sort=updated&direction=desc"
        );
        self.api_get(&path).await
    }

    pub async fn get_pr(&self, owner: &str, repo: &str, number: u32) -> Result<GitHubPR, AppError> {
        let path = format!("/repos/{owner}/{repo}/pulls/{number}");
        self.api_get(&path).await
    }

    pub async fn create_pr(
        &self,
        owner: &str,
        repo: &str,
        title: &str,
        body: Option<&str>,
        head: &str,
        base: &str,
        draft: bool,
    ) -> Result<GitHubPR, AppError> {
        let path = format!("/repos/{owner}/{repo}/pulls");
        let payload = serde_json::json!({
            "title": title,
            "body": body.unwrap_or(""),
            "head": head,
            "base": base,
            "draft": draft,
        });
        self.api_post(&path, &payload).await
    }

    pub async fn edit_pr(
        &self,
        owner: &str,
        repo: &str,
        number: u32,
        title: Option<&str>,
        body: Option<&str>,
        state: Option<&str>,
        base: Option<&str>,
    ) -> Result<GitHubPR, AppError> {
        let path = format!("/repos/{owner}/{repo}/pulls/{number}");
        let mut payload = serde_json::Map::new();
        if let Some(t) = title {
            payload.insert("title".into(), serde_json::Value::String(t.to_string()));
        }
        if let Some(b) = body {
            payload.insert("body".into(), serde_json::Value::String(b.to_string()));
        }
        if let Some(s) = state {
            payload.insert("state".into(), serde_json::Value::String(s.to_string()));
        }
        if let Some(b) = base {
            payload.insert("base".into(), serde_json::Value::String(b.to_string()));
        }
        self.api_patch(&path, &payload).await
    }

    pub async fn list_pr_comments(
        &self,
        owner: &str,
        repo: &str,
        number: u32,
        page: u32,
        per_page: u32,
    ) -> Result<Vec<GitHubComment>, AppError> {
        // Use the issues endpoint for conversation-level comments on a PR.
        let path = format!(
            "/repos/{owner}/{repo}/issues/{number}/comments?page={page}&per_page={per_page}"
        );
        self.api_get(&path).await
    }

    pub async fn create_pr_comment(
        &self,
        owner: &str,
        repo: &str,
        number: u32,
        body: &str,
    ) -> Result<GitHubComment, AppError> {
        let path = format!("/repos/{owner}/{repo}/issues/{number}/comments");
        let payload = serde_json::json!({ "body": body });
        self.api_post(&path, &payload).await
    }

    pub async fn merge_pr(
        &self,
        owner: &str,
        repo: &str,
        number: u32,
        merge_method: &str,
        commit_title: Option<&str>,
        commit_message: Option<&str>,
    ) -> Result<serde_json::Value, AppError> {
        let path = format!("/repos/{owner}/{repo}/pulls/{number}/merge");
        let mut payload = serde_json::Map::new();
        payload.insert(
            "merge_method".into(),
            serde_json::Value::String(merge_method.to_string()),
        );
        if let Some(t) = commit_title {
            payload.insert(
                "commit_title".into(),
                serde_json::Value::String(t.to_string()),
            );
        }
        if let Some(m) = commit_message {
            payload.insert(
                "commit_message".into(),
                serde_json::Value::String(m.to_string()),
            );
        }
        self.api_put(&path, &payload).await
    }

    pub async fn pr_diff(&self, owner: &str, repo: &str, number: u32) -> Result<String, AppError> {
        let path = format!("/repos/{owner}/{repo}/pulls/{number}");
        self.api_get_text(&path, "application/vnd.github.diff")
            .await
    }

    pub async fn pr_checks(
        &self,
        owner: &str,
        repo: &str,
        pr_ref: &str,
    ) -> Result<GitHubCheckSuite, AppError> {
        let path = format!("/repos/{owner}/{repo}/commits/{pr_ref}/check-runs");
        self.api_get(&path).await
    }

    pub async fn create_pr_review(
        &self,
        owner: &str,
        repo: &str,
        number: u32,
        event: &str,
        body: Option<&str>,
    ) -> Result<serde_json::Value, AppError> {
        let path = format!("/repos/{owner}/{repo}/pulls/{number}/reviews");
        let mut payload = serde_json::Map::new();
        payload.insert("event".into(), serde_json::Value::String(event.to_string()));
        if let Some(b) = body {
            payload.insert("body".into(), serde_json::Value::String(b.to_string()));
        }
        self.api_post(&path, &payload).await
    }
}

// ── gh CLI detection ─────────────────────────────────────────────────

pub fn detect_gh_cli() -> GhCliInfo {
    use std::process::Command;

    let which_result = Command::new("which").arg("gh").output();
    let path = which_result.ok().and_then(|o| {
        if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        }
    });

    if path.is_none() {
        return GhCliInfo {
            installed: false,
            path: None,
            version: None,
        };
    }

    let version = Command::new("gh")
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let out = String::from_utf8_lossy(&o.stdout).to_string();
                // First line is like "gh version 2.40.0 (2024-01-31)"
                out.lines()
                    .next()
                    .and_then(|l| l.strip_prefix("gh version "))
                    .map(|v| v.split_whitespace().next().unwrap_or(v).to_string())
            } else {
                None
            }
        });

    GhCliInfo {
        installed: true,
        path,
        version,
    }
}

/// Run `gh auth setup-git` to configure git credential helper.
pub fn gh_auth_setup_git() -> Result<(), AppError> {
    use std::process::Command;
    let output = Command::new("gh")
        .args(["auth", "setup-git"])
        .output()
        .map_err(|e| AppError::github(format!("Failed to run gh auth setup-git: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::github(format!(
            "gh auth setup-git failed: {}",
            stderr.trim()
        )));
    }
    Ok(())
}

// ── Tauri commands ───────────────────────────────────────────────────

use std::sync::Arc;
use tauri::State;

use crate::AppState;

// ─── Auth ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn github_auth_status(
    state: State<'_, Arc<AppState>>,
) -> Result<GitHubAuthStatus, AppError> {
    // Refresh token from gh CLI
    let token = state.github.refresh_token()?;

    if token.is_none() {
        return Ok(GitHubAuthStatus {
            authenticated: false,
            user: None,
        });
    }

    match state.github.get_authenticated_user().await {
        Ok(user) => Ok(GitHubAuthStatus {
            authenticated: true,
            user: Some(user),
        }),
        Err(_) => {
            // Token is invalid — clear cache
            state.github.clear_token();
            Ok(GitHubAuthStatus {
                authenticated: false,
                user: None,
            })
        }
    }
}

/// Launch `gh auth login --web` in a subprocess.
/// This opens the browser for the user to authenticate with GitHub.
/// The frontend should poll `github_auth_status` after calling this.
#[tauri::command]
pub async fn github_auth_login() -> Result<(), AppError> {
    use std::process::Command;

    let output = Command::new("gh")
        .args(["auth", "login", "--web", "-p", "https"])
        .output()
        .map_err(|e| {
            AppError::github(format!(
                "Failed to run `gh auth login`. Is the GitHub CLI installed? Error: {e}"
            ))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::github(format!(
            "gh auth login failed: {}",
            stderr.trim()
        )));
    }

    Ok(())
}

#[tauri::command]
pub async fn github_auth_logout(state: State<'_, Arc<AppState>>) -> Result<(), AppError> {
    use std::process::Command;

    // Clear our cached token
    state.github.clear_token();

    // Also run `gh auth logout` to revoke the CLI's token
    let _ = Command::new("gh")
        .args(["auth", "logout", "--hostname", "github.com"])
        .output();

    Ok(())
}

// ─── Repo slug ───────────────────────────────────────────────────────

#[tauri::command]
pub fn github_repo_slug(remote_url: String) -> Result<Option<RepoSlug>, AppError> {
    Ok(GitHubClient::parse_repo_slug(&remote_url))
}

// ─── Issues ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn github_issue_list(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    issue_state: Option<String>,
    page: Option<u32>,
    per_page: Option<u32>,
) -> Result<Vec<GitHubIssue>, AppError> {
    let s = issue_state.as_deref().unwrap_or("open");
    let p = page.unwrap_or(1);
    let pp = per_page.unwrap_or(30);
    state.github.list_issues(&owner, &repo, s, p, pp).await
}

#[tauri::command]
pub async fn github_issue_get(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
) -> Result<GitHubIssue, AppError> {
    state.github.get_issue(&owner, &repo, number).await
}

#[tauri::command]
pub async fn github_issue_create(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    title: String,
    body: Option<String>,
    labels: Option<Vec<String>>,
    assignees: Option<Vec<String>>,
) -> Result<GitHubIssue, AppError> {
    state
        .github
        .create_issue(
            &owner,
            &repo,
            &title,
            body.as_deref(),
            &labels.unwrap_or_default(),
            &assignees.unwrap_or_default(),
        )
        .await
}

#[tauri::command]
pub async fn github_issue_edit(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
    title: Option<String>,
    body: Option<String>,
    issue_state: Option<String>,
    labels: Option<Vec<String>>,
    assignees: Option<Vec<String>>,
) -> Result<GitHubIssue, AppError> {
    state
        .github
        .edit_issue(
            &owner,
            &repo,
            number,
            title.as_deref(),
            body.as_deref(),
            issue_state.as_deref(),
            labels.as_deref(),
            assignees.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn github_issue_close(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
) -> Result<GitHubIssue, AppError> {
    state
        .github
        .edit_issue(
            &owner,
            &repo,
            number,
            None,
            None,
            Some("closed"),
            None,
            None,
        )
        .await
}

#[tauri::command]
pub async fn github_issue_reopen(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
) -> Result<GitHubIssue, AppError> {
    state
        .github
        .edit_issue(&owner, &repo, number, None, None, Some("open"), None, None)
        .await
}

#[tauri::command]
pub async fn github_issue_comment(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
    body: String,
) -> Result<GitHubComment, AppError> {
    state
        .github
        .create_issue_comment(&owner, &repo, number, &body)
        .await
}

#[tauri::command]
pub async fn github_issue_comments(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
    page: Option<u32>,
    per_page: Option<u32>,
) -> Result<Vec<GitHubComment>, AppError> {
    state
        .github
        .list_issue_comments(
            &owner,
            &repo,
            number,
            page.unwrap_or(1),
            per_page.unwrap_or(30),
        )
        .await
}

#[tauri::command]
pub async fn github_label_list(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
) -> Result<Vec<GitHubLabel>, AppError> {
    state.github.list_labels(&owner, &repo).await
}

// ─── Pull Requests ───────────────────────────────────────────────────

#[tauri::command]
pub async fn github_pr_list(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    pr_state: Option<String>,
    page: Option<u32>,
    per_page: Option<u32>,
) -> Result<Vec<GitHubPR>, AppError> {
    let s = pr_state.as_deref().unwrap_or("open");
    let p = page.unwrap_or(1);
    let pp = per_page.unwrap_or(30);
    state.github.list_prs(&owner, &repo, s, p, pp).await
}

#[tauri::command]
pub async fn github_pr_get(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
) -> Result<GitHubPR, AppError> {
    state.github.get_pr(&owner, &repo, number).await
}

#[tauri::command]
pub async fn github_pr_create(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    title: String,
    body: Option<String>,
    head: String,
    base: String,
    draft: Option<bool>,
) -> Result<GitHubPR, AppError> {
    state
        .github
        .create_pr(
            &owner,
            &repo,
            &title,
            body.as_deref(),
            &head,
            &base,
            draft.unwrap_or(false),
        )
        .await
}

#[tauri::command]
pub async fn github_pr_edit(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
    title: Option<String>,
    body: Option<String>,
    pr_state: Option<String>,
    base: Option<String>,
) -> Result<GitHubPR, AppError> {
    state
        .github
        .edit_pr(
            &owner,
            &repo,
            number,
            title.as_deref(),
            body.as_deref(),
            pr_state.as_deref(),
            base.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn github_pr_close(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
) -> Result<GitHubPR, AppError> {
    state
        .github
        .edit_pr(&owner, &repo, number, None, None, Some("closed"), None)
        .await
}

#[tauri::command]
pub async fn github_pr_comment(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
    body: String,
) -> Result<GitHubComment, AppError> {
    state
        .github
        .create_pr_comment(&owner, &repo, number, &body)
        .await
}

#[tauri::command]
pub async fn github_pr_comments(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
    page: Option<u32>,
    per_page: Option<u32>,
) -> Result<Vec<GitHubComment>, AppError> {
    state
        .github
        .list_pr_comments(
            &owner,
            &repo,
            number,
            page.unwrap_or(1),
            per_page.unwrap_or(30),
        )
        .await
}

#[tauri::command]
pub async fn github_pr_merge(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
    merge_method: Option<String>,
    commit_title: Option<String>,
    commit_message: Option<String>,
) -> Result<serde_json::Value, AppError> {
    state
        .github
        .merge_pr(
            &owner,
            &repo,
            number,
            merge_method.as_deref().unwrap_or("merge"),
            commit_title.as_deref(),
            commit_message.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn github_pr_diff(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
) -> Result<String, AppError> {
    state.github.pr_diff(&owner, &repo, number).await
}

#[tauri::command]
pub async fn github_pr_checks(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    pr_ref: String,
) -> Result<GitHubCheckSuite, AppError> {
    state.github.pr_checks(&owner, &repo, &pr_ref).await
}

#[tauri::command]
pub async fn github_pr_review(
    state: State<'_, Arc<AppState>>,
    owner: String,
    repo: String,
    number: u32,
    event: String,
    body: Option<String>,
) -> Result<serde_json::Value, AppError> {
    state
        .github
        .create_pr_review(&owner, &repo, number, &event, body.as_deref())
        .await
}

// ─── gh CLI ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn github_gh_cli_info() -> GhCliInfo {
    detect_gh_cli()
}

#[tauri::command]
pub fn github_gh_setup_git() -> Result<(), AppError> {
    gh_auth_setup_git()
}

// ─── Repo creation + push (via gh CLI) ──────────────────────────────

/// Create a repo on GitHub using `gh repo create` and push the local repo.
/// Requires `gh` CLI to be installed and authenticated (`gh auth login`).
/// Returns a GitHubRepo with the new remote URL.
#[tauri::command]
pub async fn github_create_and_push(
    _state: State<'_, Arc<AppState>>,
    repo_path: String,
    name: String,
    description: Option<String>,
    private: bool,
) -> Result<GitHubRepo, AppError> {
    use std::process::Command;

    // 1. Check that gh CLI is available
    let cli = detect_gh_cli();
    if !cli.installed {
        return Err(AppError::github(
            "GitHub CLI (gh) is not installed. Install it from https://cli.github.com and run `gh auth login` to authenticate."
                .to_string(),
        ));
    }

    // 2. Ensure gh credential helper is configured so git can push
    let _ = Command::new("gh").args(["auth", "setup-git"]).output();

    // 3. Build the `gh repo create` command (create only, no --push)
    let mut cmd = Command::new("gh");
    cmd.args(["repo", "create", &name]);
    if private {
        cmd.arg("--private");
    } else {
        cmd.arg("--public");
    }
    cmd.args(["--source", &repo_path]);
    if let Some(ref desc) = description {
        if !desc.is_empty() {
            cmd.args(["-d", desc]);
        }
    }

    // 4. Run creation
    let output = cmd
        .output()
        .map_err(|e| AppError::github(format!("Failed to run gh repo create: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::github(format!(
            "gh repo create failed: {}",
            stderr.trim()
        )));
    }

    // 5. Parse the repo URL from stdout (gh prints e.g. "https://github.com/owner/repo\n")
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let repo_url = stdout
        .lines()
        .find(|l| l.contains("github.com"))
        .unwrap_or(&stdout)
        .trim()
        .to_string();

    let slug = GitHubClient::parse_repo_slug(&repo_url).ok_or_else(|| {
        AppError::github(format!(
            "Could not parse repository from gh output: {stdout}"
        ))
    })?;

    // 6. Push using git (credentials now configured by gh auth setup-git)
    let branch = {
        let info = crate::git::repo_info(&repo_path)?;
        info.current_branch.unwrap_or_else(|| "main".to_string())
    };

    let push_output = Command::new("git")
        .args(["push", "-u", "origin", &branch])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| AppError::github(format!("Failed to run git push: {e}")))?;

    if !push_output.status.success() {
        let stderr = String::from_utf8_lossy(&push_output.stderr);
        return Err(AppError::github(format!(
            "Repository created at {repo_url} but push failed: {}. Run `gh auth setup-git` and try pushing manually.",
            stderr.trim()
        )));
    }

    // 7. Construct the GitHubRepo response
    let html_url = format!("https://github.com/{}/{}", slug.owner, slug.repo);
    let clone_url = format!("https://github.com/{}/{}.git", slug.owner, slug.repo);
    let ssh_url = format!("git@github.com:{}/{}.git", slug.owner, slug.repo);

    Ok(GitHubRepo {
        id: 0, // Not available from CLI output; frontend doesn't use this
        name: slug.repo.clone(),
        full_name: format!("{}/{}", slug.owner, slug.repo),
        private,
        html_url,
        clone_url,
        ssh_url,
        default_branch: "main".to_string(),
    })
}
