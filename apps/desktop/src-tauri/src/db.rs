use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

mod context;
mod entities;
mod repositories;

use context::DbContext;
use repositories::{
    automation::AutomationRepository, chat::ChatRepository, run::RunRepository,
    settings::SettingsRepository, workspace::WorkspaceRepository,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub repo_path: String,
    pub worktree_path: Option<String>,
    pub branch: Option<String>,
    pub backend: String,
    pub execution_target: String,
    pub sandbox_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub workspace_id: String,
    pub backend: String,
    pub backend_session_id: Option<String>,
    pub backend_session_cwd: Option<String>,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
    pub title: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub metadata: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedAgent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub tools: Vec<String>,
    pub trigger_type: String,
    pub trigger_config: Option<String>,
    pub approval_mode: String,
    pub runner_type: String,
    pub harness: String,
    pub status: String,
    pub model_id: Option<String>,
    pub environment_id: Option<String>,
    pub max_turns: i64,
    pub max_tokens: i64,
    pub variables: HashMap<String, String>,
    pub version: i64,
    pub total_sessions: i64,
    pub success_rate: f64,
    pub last_run_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    pub variables: HashMap<String, String>,
    pub credential_ids: Vec<String>,
    pub runner_type: String,
    pub docker_image: Option<String>,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialRecord {
    pub id: String,
    pub name: String,
    pub credential_type: String,
    pub service: Option<String>,
    pub metadata: HashMap<String, String>,
    pub has_secret: bool,
    pub last_used_at: Option<String>,
    pub used_by_agents: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStore {
    pub id: String,
    pub workspace_id: Option<String>,
    pub scope_type: String,
    pub name: String,
    pub description: String,
    pub chat_read_access: String,
    pub linked_agent_ids: Vec<String>,
    pub linked_agent_names: Vec<String>,
    pub primary_for_agent_ids: Vec<String>,
    pub entry_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub store_id: String,
    pub key: String,
    pub content: String,
    pub kind: String,
    pub source_session_id: Option<String>,
    pub source_conversation_id: Option<String>,
    pub source_message_id: Option<String>,
    pub confidence: f64,
    pub recall_count: i64,
    pub last_recalled_at: Option<String>,
    pub is_pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRun {
    pub id: String,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub automation_id: Option<String>,
    pub environment_id: Option<String>,
    pub status: String,
    pub trigger: String,
    pub harness: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub result_summary: Option<String>,
    pub error_message: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRunTurn {
    pub id: String,
    pub run_id: String,
    pub turn_number: i64,
    pub role: String,
    pub tool_name: Option<String>,
    pub content: Option<String>,
    pub token_input: Option<i64>,
    pub token_output: Option<i64>,
    pub duration_ms: Option<i64>,
    pub created_at: String,
}

#[derive(Clone)]
pub struct Database {
    workspace_repo: WorkspaceRepository,
    chat_repo: ChatRepository,
    automation_repo: AutomationRepository,
    run_repo: RunRepository,
    settings_repo: SettingsRepository,
}

impl Database {
    pub fn open() -> Result<Self, AppError> {
        let ctx = Arc::new(DbContext::open()?);
        Ok(Self::from_context(ctx))
    }

    #[allow(dead_code)]
    pub fn open_memory() -> Result<Self, AppError> {
        let ctx = Arc::new(DbContext::open_memory()?);
        Ok(Self::from_context(ctx))
    }

    fn from_context(ctx: Arc<DbContext>) -> Self {
        Self {
            workspace_repo: WorkspaceRepository::new(ctx.clone()),
            chat_repo: ChatRepository::new(ctx.clone()),
            automation_repo: AutomationRepository::new(ctx.clone()),
            run_repo: RunRepository::new(ctx.clone()),
            settings_repo: SettingsRepository::new(ctx),
        }
    }

    pub fn create_workspace(&self, ws: &Workspace) -> Result<(), AppError> { self.workspace_repo.create(ws) }
    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, AppError> { self.workspace_repo.list() }
    pub fn get_workspace(&self, id: &str) -> Result<Workspace, AppError> { self.workspace_repo.get(id) }
    pub fn update_workspace_backend(&self, id: &str, backend: &str) -> Result<(), AppError> { self.workspace_repo.update_backend(id, backend) }
    pub fn update_workspace_branch(&self, id: &str, branch: Option<&str>) -> Result<(), AppError> { self.workspace_repo.update_branch(id, branch) }
    pub fn delete_workspace(&self, id: &str) -> Result<(), AppError> { self.workspace_repo.delete(id) }

    pub fn create_conversation(&self, conv: &Conversation) -> Result<(), AppError> { self.chat_repo.create_conversation(conv) }
    pub fn update_conversation_tokens(&self, id: &str, input_tokens: i64, output_tokens: i64) -> Result<(), AppError> { self.chat_repo.update_conversation_tokens(id, input_tokens, output_tokens) }
    pub fn delete_conversation(&self, id: &str) -> Result<(), AppError> { self.chat_repo.delete_conversation(id) }
    pub fn list_conversations(&self, workspace_id: &str) -> Result<Vec<Conversation>, AppError> { self.chat_repo.list_conversations(workspace_id) }
    pub fn get_conversation(&self, id: &str) -> Result<Conversation, AppError> { self.chat_repo.get_conversation(id) }
    pub fn deactivate_workspace_conversations(&self, workspace_id: &str) -> Result<(), AppError> { self.chat_repo.deactivate_workspace_conversations(workspace_id) }
    pub fn set_conversation_backend_session(&self, id: &str, backend_session_id: &str, backend_session_cwd: Option<&str>, branch: Option<&str>, worktree_path: Option<&str>) -> Result<(), AppError> { self.chat_repo.set_backend_session(id, backend_session_id, backend_session_cwd, branch, worktree_path) }
    pub fn insert_message(&self, msg: &ChatMessage) -> Result<(), AppError> { self.chat_repo.insert_message(msg) }
    pub fn list_messages(&self, conversation_id: &str) -> Result<Vec<ChatMessage>, AppError> { self.chat_repo.list_messages(conversation_id) }

    pub fn list_managed_agents(&self) -> Result<Vec<ManagedAgent>, AppError> { self.automation_repo.list_managed_agents() }
    pub fn create_managed_agent(&self, agent: &ManagedAgent) -> Result<(), AppError> { self.automation_repo.create_managed_agent(agent) }
    pub fn update_managed_agent(&self, agent: &ManagedAgent) -> Result<(), AppError> { self.automation_repo.update_managed_agent(agent) }
    pub fn delete_managed_agent(&self, id: &str) -> Result<(), AppError> { self.automation_repo.delete_managed_agent(id) }
    pub fn list_environments(&self) -> Result<Vec<EnvironmentProfile>, AppError> { self.automation_repo.list_environments() }
    pub fn create_environment(&self, environment: &EnvironmentProfile) -> Result<(), AppError> { self.automation_repo.create_environment(environment) }
    pub fn update_environment(&self, environment: &EnvironmentProfile) -> Result<(), AppError> { self.automation_repo.update_environment(environment) }
    pub fn delete_environment(&self, id: &str) -> Result<(), AppError> { self.automation_repo.delete_environment(id) }
    pub fn list_credentials(&self) -> Result<Vec<CredentialRecord>, AppError> { self.automation_repo.list_credentials() }
    pub fn get_credential_secret(&self, id: &str) -> Result<Option<String>, AppError> { self.automation_repo.get_credential_secret(id) }
    pub fn create_credential(&self, credential: &CredentialRecord, secret: Option<&str>) -> Result<(), AppError> { self.automation_repo.create_credential(credential, secret) }
    pub fn update_credential(&self, credential: &CredentialRecord, secret: Option<&str>) -> Result<(), AppError> { self.automation_repo.update_credential(credential, secret) }
    pub fn delete_credential(&self, id: &str) -> Result<(), AppError> { self.automation_repo.delete_credential(id) }
    pub fn list_memory_stores(&self, workspace_id: Option<&str>) -> Result<Vec<MemoryStore>, AppError> { self.automation_repo.list_memory_stores(workspace_id) }
    pub fn list_agent_memory_stores(&self, agent_id: &str) -> Result<Vec<MemoryStore>, AppError> { self.automation_repo.list_agent_memory_stores(agent_id) }
    pub fn get_or_create_chat_memory_store(&self, workspace_id: Option<&str>) -> Result<MemoryStore, AppError> { self.automation_repo.get_or_create_chat_memory_store(workspace_id) }
    pub fn create_memory_store(&self, store: &MemoryStore) -> Result<(), AppError> { self.automation_repo.create_memory_store(store) }
    pub fn update_memory_store(&self, store: &MemoryStore) -> Result<(), AppError> { self.automation_repo.update_memory_store(store) }
    pub fn delete_memory_store(&self, id: &str) -> Result<(), AppError> { self.automation_repo.delete_memory_store(id) }
    pub fn link_memory_store_to_agent(&self, store_id: &str, agent_id: &str, is_primary_write_target: bool) -> Result<(), AppError> { self.automation_repo.link_memory_store_to_agent(store_id, agent_id, is_primary_write_target) }
    pub fn unlink_memory_store_from_agent(&self, store_id: &str, agent_id: &str) -> Result<(), AppError> { self.automation_repo.unlink_memory_store_from_agent(store_id, agent_id) }
    pub fn set_agent_primary_memory_store(&self, store_id: &str, agent_id: &str) -> Result<(), AppError> { self.automation_repo.set_agent_primary_memory_store(store_id, agent_id) }
    pub fn list_memory_entries(&self, store_id: &str) -> Result<Vec<MemoryEntry>, AppError> { self.automation_repo.list_memory_entries(store_id) }
    pub fn create_memory_entry(&self, entry: &MemoryEntry) -> Result<(), AppError> { self.automation_repo.create_memory_entry(entry) }
    pub fn update_memory_entry(&self, entry: &MemoryEntry) -> Result<(), AppError> { self.automation_repo.update_memory_entry(entry) }
    pub fn delete_memory_entry(&self, id: &str) -> Result<(), AppError> { self.automation_repo.delete_memory_entry(id) }

    pub fn list_agent_runs(&self) -> Result<Vec<AgentRun>, AppError> { self.run_repo.list_agent_runs() }
    pub fn list_agent_run_turns(&self, run_id: &str) -> Result<Vec<AgentRunTurn>, AppError> { self.run_repo.list_agent_run_turns(run_id) }
    pub fn create_agent_run(&self, run: &AgentRun) -> Result<(), AppError> { self.run_repo.create_agent_run(run) }
    pub fn update_agent_run_status(&self, id: &str, status: &str, finished_at: Option<&str>, duration_ms: Option<i64>, result_summary: Option<&str>, error_message: Option<&str>, input_tokens: Option<i64>, output_tokens: Option<i64>) -> Result<(), AppError> { self.run_repo.update_agent_run_status(id, status, finished_at, duration_ms, result_summary, error_message, input_tokens, output_tokens) }
    pub fn create_agent_run_turn(&self, turn: &AgentRunTurn) -> Result<(), AppError> { self.run_repo.create_agent_run_turn(turn) }
    pub fn get_agent_run(&self, id: &str) -> Result<AgentRun, AppError> { self.run_repo.get_agent_run(id) }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, AppError> { self.settings_repo.get(key) }
    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppError> { self.settings_repo.set(key, value) }
}
