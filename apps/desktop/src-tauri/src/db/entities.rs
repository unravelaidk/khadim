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
        pub variables_json: String,
        pub version: i64,
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
        pub result_summary: Option<String>,
        pub error_message: Option<String>,
        pub input_tokens: Option<i64>,
        pub output_tokens: Option<i64>,
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
