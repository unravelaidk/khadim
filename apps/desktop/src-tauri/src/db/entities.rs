use sea_orm::entity::prelude::*;

pub mod workspaces {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "workspaces")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
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
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod conversations {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "conversations")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub workspace_id: String,
        pub backend: String,
        pub backend_session_id: Option<String>,
        pub backend_session_cwd: Option<String>,
        pub branch: Option<String>,
        pub worktree_path: Option<String>,
        pub title: Option<String>,
        pub is_active: i32,
        pub created_at: String,
        pub updated_at: String,
        pub input_tokens: i64,
        pub output_tokens: i64,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod messages {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "messages")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub conversation_id: String,
        pub role: String,
        pub content: String,
        pub metadata: Option<String>,
        pub created_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod settings {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "settings")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub key: String,
        pub value: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod managed_agents {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "managed_agents")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        pub description: String,
        pub instructions: String,
        pub tools_json: String,
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
        pub budget_policy_json: String,
        pub artifact_policy_json: String,
        pub variables_json: String,
        pub version: i64,
        pub created_at: String,
        pub updated_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod schedules {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "schedules")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub agent_id: String,
        pub kind: String,
        pub cron_expr: Option<String>,
        pub is_paused: i32,
        pub next_run_at: Option<String>,
        pub last_run_at: Option<String>,
        pub last_outcome: Option<String>,
        pub created_at: String,
        pub updated_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod environments {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "environments")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        pub description: String,
        pub variables_json: String,
        pub credential_ids_json: String,
        pub runner_type: String,
        pub docker_image: Option<String>,
        pub working_dir: Option<String>,
        pub is_default: i32,
        pub created_at: String,
        pub updated_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod credentials {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "credentials")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        pub credential_type: String,
        pub service: Option<String>,
        pub metadata_json: String,
        pub secret_value: Option<String>,
        pub last_used_at: Option<String>,
        pub created_at: String,
        pub updated_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod memory_stores {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "memory_stores")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub workspace_id: Option<String>,
        pub scope_type: String,
        pub name: String,
        pub description: String,
        pub chat_read_access: String,
        pub created_at: String,
        pub updated_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod memory_store_agents {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "memory_store_agents")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub store_id: String,
        #[sea_orm(primary_key, auto_increment = false)]
        pub agent_id: String,
        pub is_primary_write_target: i32,
        pub created_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod memory_entries {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "memory_entries")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
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
        pub is_pinned: i32,
        pub created_at: String,
        pub updated_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod agent_runs {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "agent_runs")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub agent_id: Option<String>,
        pub automation_id: Option<String>,
        pub environment_id: Option<String>,
        pub status: String,
        pub trigger_type: String,
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
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod agent_run_turns {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "agent_run_turns")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
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
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod run_events {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "run_events")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
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
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod artifacts {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "artifacts")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
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
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod budget_ledger {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "budget_ledger")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
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
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod queues {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "queues")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        pub kind: String,
        pub source_config_json: String,
        pub created_at: String,
        pub updated_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod queue_items {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "queue_items")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
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
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod agent_health_snapshots {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "agent_health_snapshots")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub agent_id: String,
        pub status: String,
        pub reason: Option<String>,
        pub metrics_json: String,
        pub created_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod approval_requests {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "approval_requests")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
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
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod integration_connections {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "integration_connections")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub integration_id: String,
        pub label: String,
        pub account_label: Option<String>,
        pub is_active: i32,
        pub secret_json: Option<String>,
        pub last_verified_at: Option<String>,
        pub created_at: String,
        pub updated_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod integration_logs {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "integration_logs")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub connection_id: String,
        pub action_id: String,
        pub success: i32,
        pub error_message: Option<String>,
        pub duration_ms: i64,
        pub created_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}
