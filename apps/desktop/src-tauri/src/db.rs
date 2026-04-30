use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

mod context;
mod entities;
mod repositories;

use context::DbContext;
use repositories::{
    automation::AutomationRepository,
    chat::{ChatRepository, SessionSearchResult},
    integration::IntegrationRepository,
    run::RunRepository,
    settings::SettingsRepository,
    workspace::WorkspaceRepository,
};

use crate::integrations::{IntegrationConnection, IntegrationLog};

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
    pub budget_policy: BudgetPolicy,
    pub artifact_policy: ArtifactPolicy,
    pub variables: HashMap<String, String>,
    pub version: i64,
    pub total_sessions: i64,
    pub success_rate: f64,
    pub last_run_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BudgetPolicy {
    pub max_tokens_per_run: Option<i64>,
    pub max_cost_usd_per_day: Option<f64>,
    pub max_runs_per_day: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactPolicy {
    pub retention_days: i64,
    pub max_artifacts_per_run: i64,
}

impl Default for ArtifactPolicy {
    fn default() -> Self {
        Self {
            retention_days: 14,
            max_artifacts_per_run: 50,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSchedule {
    pub id: String,
    pub agent_id: String,
    pub kind: String,
    pub cron_expr: Option<String>,
    pub is_paused: bool,
    pub next_run_at: Option<String>,
    pub last_run_at: Option<String>,
    pub last_outcome: Option<String>,
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
    pub working_dir: Option<String>,
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
    pub ended_reason: Option<String>,
    pub result_summary: Option<String>,
    pub error_message: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub work_dir: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunEvent {
    pub id: String,
    pub run_id: String,
    pub sequence_number: i64,
    pub event_type: String,
    pub source: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub status: Option<String>,
    pub tool_name: Option<String>,
    pub metadata_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactRecord {
    pub id: String,
    pub run_id: String,
    pub agent_id: Option<String>,
    pub kind: String,
    pub label: String,
    pub path: Option<String>,
    pub mime_type: Option<String>,
    pub size_bytes: Option<i64>,
    pub sha256: Option<String>,
    pub storage_type: String,
    pub metadata_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetLedgerEntry {
    pub id: String,
    pub agent_id: Option<String>,
    pub run_id: Option<String>,
    pub scope: String,
    pub metric: String,
    pub delta: f64,
    pub window_key: String,
    pub metadata_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueDefinition {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub source_config_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItem {
    pub id: String,
    pub queue_id: String,
    pub status: String,
    pub payload_json: String,
    pub priority: i64,
    pub visible_at: String,
    pub claimed_by_run_id: Option<String>,
    pub claimed_at: Option<String>,
    pub attempt_count: i64,
    pub max_attempts: i64,
    pub last_error: Option<String>,
    pub dead_lettered_at: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHealthSnapshot {
    pub id: String,
    pub agent_id: String,
    pub status: String,
    pub reason: Option<String>,
    pub metrics_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequestRecord {
    pub id: String,
    pub run_id: String,
    pub scope: String,
    pub action_title: String,
    pub risk_level: String,
    pub status: String,
    pub requested_at: String,
    pub resolved_at: Option<String>,
    pub resolution_note: Option<String>,
    pub metadata_json: String,
}

#[derive(Clone)]
pub struct Database {
    workspace_repo: WorkspaceRepository,
    chat_repo: ChatRepository,
    automation_repo: AutomationRepository,
    run_repo: RunRepository,
    settings_repo: SettingsRepository,
    integration_repo: IntegrationRepository,
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
            settings_repo: SettingsRepository::new(ctx.clone()),
            integration_repo: IntegrationRepository::new(ctx),
        }
    }

    pub fn create_workspace(&self, ws: &Workspace) -> Result<(), AppError> {
        self.workspace_repo.create(ws)
    }
    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, AppError> {
        self.workspace_repo.list()
    }
    pub fn get_workspace(&self, id: &str) -> Result<Workspace, AppError> {
        self.workspace_repo.get(id)
    }
    pub fn update_workspace_backend(&self, id: &str, backend: &str) -> Result<(), AppError> {
        self.workspace_repo.update_backend(id, backend)
    }
    pub fn update_workspace_branch(&self, id: &str, branch: Option<&str>) -> Result<(), AppError> {
        self.workspace_repo.update_branch(id, branch)
    }
    pub fn delete_workspace(&self, id: &str) -> Result<(), AppError> {
        self.workspace_repo.delete(id)
    }

    pub fn create_conversation(&self, conv: &Conversation) -> Result<(), AppError> {
        self.chat_repo.create_conversation(conv)
    }
    pub fn update_conversation_tokens(
        &self,
        id: &str,
        input_tokens: i64,
        output_tokens: i64,
    ) -> Result<(), AppError> {
        self.chat_repo
            .update_conversation_tokens(id, input_tokens, output_tokens)
    }
    pub fn delete_conversation(&self, id: &str) -> Result<(), AppError> {
        self.chat_repo.delete_conversation(id)
    }
    pub fn list_conversations(&self, workspace_id: &str) -> Result<Vec<Conversation>, AppError> {
        self.chat_repo.list_conversations(workspace_id)
    }
    pub fn get_conversation(&self, id: &str) -> Result<Conversation, AppError> {
        self.chat_repo.get_conversation(id)
    }
    pub fn deactivate_workspace_conversations(&self, workspace_id: &str) -> Result<(), AppError> {
        self.chat_repo
            .deactivate_workspace_conversations(workspace_id)
    }
    pub fn set_conversation_backend_session(
        &self,
        id: &str,
        backend_session_id: &str,
        backend_session_cwd: Option<&str>,
        branch: Option<&str>,
        worktree_path: Option<&str>,
    ) -> Result<(), AppError> {
        self.chat_repo.set_backend_session(
            id,
            backend_session_id,
            backend_session_cwd,
            branch,
            worktree_path,
        )
    }
    pub fn insert_message(&self, msg: &ChatMessage) -> Result<(), AppError> {
        self.chat_repo.insert_message(msg)
    }
    pub fn list_messages(&self, conversation_id: &str) -> Result<Vec<ChatMessage>, AppError> {
        self.chat_repo.list_messages(conversation_id)
    }
    pub fn search_messages(
        &self,
        query: &str,
        workspace_id: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SessionSearchResult>, AppError> {
        self.chat_repo.search_messages(query, workspace_id, limit)
    }

    pub fn list_managed_agents(&self) -> Result<Vec<ManagedAgent>, AppError> {
        self.automation_repo.list_managed_agents()
    }
    pub fn create_managed_agent(&self, agent: &ManagedAgent) -> Result<(), AppError> {
        self.automation_repo.create_managed_agent(agent)
    }
    pub fn update_managed_agent(&self, agent: &ManagedAgent) -> Result<(), AppError> {
        self.automation_repo.update_managed_agent(agent)
    }
    pub fn delete_managed_agent(&self, id: &str) -> Result<(), AppError> {
        self.automation_repo.delete_managed_agent(id)
    }
    pub fn list_agent_schedules(&self) -> Result<Vec<AgentSchedule>, AppError> {
        self.automation_repo.list_agent_schedules()
    }
    pub fn upsert_agent_schedule(&self, schedule: &AgentSchedule) -> Result<(), AppError> {
        self.automation_repo.upsert_agent_schedule(schedule)
    }
    pub fn delete_agent_schedule_by_agent_id(&self, agent_id: &str) -> Result<(), AppError> {
        self.automation_repo
            .delete_agent_schedule_by_agent_id(agent_id)
    }
    pub fn update_agent_schedule_runtime(
        &self,
        schedule_id: &str,
        next_run_at: Option<&str>,
        last_run_at: Option<&str>,
        last_outcome: Option<&str>,
        updated_at: &str,
    ) -> Result<(), AppError> {
        self.automation_repo.update_agent_schedule_runtime(
            schedule_id,
            next_run_at,
            last_run_at,
            last_outcome,
            updated_at,
        )
    }
    pub fn list_environments(&self) -> Result<Vec<EnvironmentProfile>, AppError> {
        self.automation_repo.list_environments()
    }
    pub fn create_environment(&self, environment: &EnvironmentProfile) -> Result<(), AppError> {
        self.automation_repo.create_environment(environment)
    }
    pub fn update_environment(&self, environment: &EnvironmentProfile) -> Result<(), AppError> {
        self.automation_repo.update_environment(environment)
    }
    pub fn delete_environment(&self, id: &str) -> Result<(), AppError> {
        self.automation_repo.delete_environment(id)
    }
    pub fn list_credentials(&self) -> Result<Vec<CredentialRecord>, AppError> {
        self.automation_repo.list_credentials()
    }
    pub fn get_credential_secret(&self, id: &str) -> Result<Option<String>, AppError> {
        self.automation_repo.get_credential_secret(id)
    }
    pub fn create_credential(
        &self,
        credential: &CredentialRecord,
        secret: Option<&str>,
    ) -> Result<(), AppError> {
        self.automation_repo.create_credential(credential, secret)
    }
    pub fn update_credential(
        &self,
        credential: &CredentialRecord,
        secret: Option<&str>,
    ) -> Result<(), AppError> {
        self.automation_repo.update_credential(credential, secret)
    }
    pub fn delete_credential(&self, id: &str) -> Result<(), AppError> {
        self.automation_repo.delete_credential(id)
    }
    pub fn list_memory_stores(
        &self,
        workspace_id: Option<&str>,
    ) -> Result<Vec<MemoryStore>, AppError> {
        self.automation_repo.list_memory_stores(workspace_id)
    }
    pub fn list_agent_memory_stores(&self, agent_id: &str) -> Result<Vec<MemoryStore>, AppError> {
        self.automation_repo.list_agent_memory_stores(agent_id)
    }
    pub fn ensure_agent_memory_store(
        &self,
        agent_id: &str,
        agent_name: &str,
    ) -> Result<MemoryStore, AppError> {
        self.automation_repo
            .ensure_agent_memory_store(agent_id, agent_name)
    }
    pub fn get_or_create_chat_memory_store(
        &self,
        workspace_id: Option<&str>,
    ) -> Result<MemoryStore, AppError> {
        self.automation_repo
            .get_or_create_chat_memory_store(workspace_id)
    }
    pub fn create_memory_store(&self, store: &MemoryStore) -> Result<(), AppError> {
        self.automation_repo.create_memory_store(store)
    }
    pub fn update_memory_store(&self, store: &MemoryStore) -> Result<(), AppError> {
        self.automation_repo.update_memory_store(store)
    }
    pub fn delete_memory_store(&self, id: &str) -> Result<(), AppError> {
        self.automation_repo.delete_memory_store(id)
    }
    pub fn link_memory_store_to_agent(
        &self,
        store_id: &str,
        agent_id: &str,
        is_primary_write_target: bool,
    ) -> Result<(), AppError> {
        self.automation_repo
            .link_memory_store_to_agent(store_id, agent_id, is_primary_write_target)
    }
    pub fn unlink_memory_store_from_agent(
        &self,
        store_id: &str,
        agent_id: &str,
    ) -> Result<(), AppError> {
        self.automation_repo
            .unlink_memory_store_from_agent(store_id, agent_id)
    }
    pub fn set_agent_primary_memory_store(
        &self,
        store_id: &str,
        agent_id: &str,
    ) -> Result<(), AppError> {
        self.automation_repo
            .set_agent_primary_memory_store(store_id, agent_id)
    }
    pub fn list_memory_entries(&self, store_id: &str) -> Result<Vec<MemoryEntry>, AppError> {
        self.automation_repo.list_memory_entries(store_id)
    }
    pub fn create_memory_entry(&self, entry: &MemoryEntry) -> Result<(), AppError> {
        self.automation_repo.create_memory_entry(entry)
    }
    pub fn update_memory_entry(&self, entry: &MemoryEntry) -> Result<(), AppError> {
        self.automation_repo.update_memory_entry(entry)
    }
    pub fn delete_memory_entry(&self, id: &str) -> Result<(), AppError> {
        self.automation_repo.delete_memory_entry(id)
    }

    pub fn list_agent_runs(&self) -> Result<Vec<AgentRun>, AppError> {
        self.run_repo.list_agent_runs()
    }
    pub fn list_agent_run_turns(&self, run_id: &str) -> Result<Vec<AgentRunTurn>, AppError> {
        self.run_repo.list_agent_run_turns(run_id)
    }
    pub fn create_agent_run(&self, run: &AgentRun) -> Result<(), AppError> {
        self.run_repo.create_agent_run(run)
    }
    pub fn update_agent_run_status(
        &self,
        id: &str,
        status: &str,
        finished_at: Option<&str>,
        duration_ms: Option<i64>,
        ended_reason: Option<&str>,
        result_summary: Option<&str>,
        error_message: Option<&str>,
        input_tokens: Option<i64>,
        output_tokens: Option<i64>,
    ) -> Result<(), AppError> {
        self.run_repo.update_agent_run_status(
            id,
            status,
            finished_at,
            duration_ms,
            ended_reason,
            result_summary,
            error_message,
            input_tokens,
            output_tokens,
        )
    }
    pub fn update_agent_run_work_dir(&self, id: &str, work_dir: &str) -> Result<(), AppError> {
        self.run_repo.update_agent_run_work_dir(id, work_dir)
    }
    pub fn create_agent_run_turn(&self, turn: &AgentRunTurn) -> Result<(), AppError> {
        self.run_repo.create_agent_run_turn(turn)
    }
    pub fn get_agent_run(&self, id: &str) -> Result<AgentRun, AppError> {
        self.run_repo.get_agent_run(id)
    }
    pub fn list_run_events(&self, run_id: &str) -> Result<Vec<RunEvent>, AppError> {
        self.run_repo.list_run_events(run_id)
    }
    pub fn create_run_event(&self, event: &RunEvent) -> Result<(), AppError> {
        self.run_repo.create_run_event(event)
    }
    pub fn list_artifacts(&self, run_id: &str) -> Result<Vec<ArtifactRecord>, AppError> {
        self.run_repo.list_artifacts(run_id)
    }
    pub fn list_agent_artifacts(&self, agent_id: &str) -> Result<Vec<ArtifactRecord>, AppError> {
        self.run_repo.list_agent_artifacts(agent_id)
    }
    pub fn create_artifact(&self, artifact: &ArtifactRecord) -> Result<(), AppError> {
        self.run_repo.create_artifact(artifact)
    }
    pub fn delete_artifact(&self, artifact_id: &str) -> Result<(), AppError> {
        self.run_repo.delete_artifact(artifact_id)
    }
    pub fn list_budget_ledger(
        &self,
        agent_id: Option<&str>,
        window_key: Option<&str>,
    ) -> Result<Vec<BudgetLedgerEntry>, AppError> {
        self.run_repo.list_budget_ledger(agent_id, window_key)
    }
    pub fn create_budget_ledger_entry(&self, entry: &BudgetLedgerEntry) -> Result<(), AppError> {
        self.run_repo.create_budget_ledger_entry(entry)
    }
    pub fn list_queues(&self) -> Result<Vec<QueueDefinition>, AppError> {
        self.automation_repo.list_queues()
    }
    pub fn create_queue(&self, queue: &QueueDefinition) -> Result<(), AppError> {
        self.automation_repo.create_queue(queue)
    }
    pub fn get_queue(&self, id: &str) -> Result<QueueDefinition, AppError> {
        self.automation_repo.get_queue(id)
    }
    pub fn list_queue_items(&self, queue_id: &str) -> Result<Vec<QueueItem>, AppError> {
        self.automation_repo.list_queue_items(queue_id)
    }
    pub fn get_queue_item(&self, item_id: &str) -> Result<QueueItem, AppError> {
        self.automation_repo.get_queue_item(item_id)
    }
    pub fn find_next_ready_queue_item(
        &self,
        queue_id: &str,
        visible_before: &str,
    ) -> Result<Option<QueueItem>, AppError> {
        self.automation_repo
            .find_next_ready_queue_item(queue_id, visible_before)
    }
    pub fn create_queue_item(&self, item: &QueueItem) -> Result<(), AppError> {
        self.automation_repo.create_queue_item(item)
    }
    pub fn update_queue_item(&self, item: &QueueItem) -> Result<(), AppError> {
        self.automation_repo.update_queue_item(item)
    }
    pub fn list_agent_health_snapshots(
        &self,
        agent_id: &str,
    ) -> Result<Vec<AgentHealthSnapshot>, AppError> {
        self.automation_repo.list_agent_health_snapshots(agent_id)
    }
    pub fn create_agent_health_snapshot(
        &self,
        snapshot: &AgentHealthSnapshot,
    ) -> Result<(), AppError> {
        self.automation_repo.create_agent_health_snapshot(snapshot)
    }
    pub fn list_approval_requests(
        &self,
        run_id: &str,
    ) -> Result<Vec<ApprovalRequestRecord>, AppError> {
        self.automation_repo.list_approval_requests(run_id)
    }
    pub fn create_approval_request(&self, request: &ApprovalRequestRecord) -> Result<(), AppError> {
        self.automation_repo.create_approval_request(request)
    }
    pub fn update_approval_request_status(
        &self,
        id: &str,
        status: &str,
        resolution_note: Option<&str>,
        resolved_at: &str,
    ) -> Result<ApprovalRequestRecord, AppError> {
        self.automation_repo.update_approval_request_status(
            id,
            status,
            resolution_note,
            resolved_at,
        )
    }
    pub fn set_agent_schedule_paused(
        &self,
        agent_id: &str,
        is_paused: bool,
    ) -> Result<Option<AgentSchedule>, AppError> {
        self.automation_repo
            .set_agent_schedule_paused(agent_id, is_paused)
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, AppError> {
        self.settings_repo.get(key)
    }
    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        self.settings_repo.set(key, value)
    }

    // ── Integrations ─────────────────────────────────────────────────
    pub fn list_integration_connections(&self) -> Result<Vec<IntegrationConnection>, AppError> {
        self.integration_repo.list_connections()
    }
    pub fn create_integration_connection(
        &self,
        conn: &IntegrationConnection,
        secret_json: Option<&str>,
    ) -> Result<(), AppError> {
        self.integration_repo.create_connection(conn, secret_json)
    }
    pub fn delete_integration_connection(&self, id: &str) -> Result<(), AppError> {
        self.integration_repo.delete_connection(id)
    }
    pub fn get_integration_connection_secret(&self, id: &str) -> Result<Option<String>, AppError> {
        self.integration_repo.get_connection_secret(id)
    }
    pub fn update_integration_connection_verified(
        &self,
        id: &str,
        timestamp: &str,
    ) -> Result<(), AppError> {
        self.integration_repo.update_verified(id, timestamp)
    }
    pub fn update_integration_connection_account_label(
        &self,
        id: &str,
        label: &str,
    ) -> Result<(), AppError> {
        self.integration_repo.update_account_label(id, label)
    }
    pub fn create_integration_log(&self, log: &IntegrationLog) -> Result<(), AppError> {
        self.integration_repo.create_log(log)
    }
    pub fn list_integration_logs(
        &self,
        connection_id: Option<&str>,
        limit: u32,
    ) -> Result<Vec<IntegrationLog>, AppError> {
        self.integration_repo.list_logs(connection_id, limit)
    }
}
