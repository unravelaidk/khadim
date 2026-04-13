use crate::db::context::{decode_json, encode_json, now, DbContext};
use crate::db::entities::{
    agent_runs, credentials, environments, managed_agents, memory_entries, memory_store_agents,
    memory_stores,
};
use crate::db::{CredentialRecord, EnvironmentProfile, ManagedAgent, MemoryEntry, MemoryStore};
use crate::error::AppError;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder,
};
use std::collections::HashMap;
use std::sync::Arc;

fn memory_store_to_domain(
    store: memory_stores::Model,
    links: &[memory_store_agents::Model],
    agents: &HashMap<String, String>,
    entry_count: i64,
) -> MemoryStore {
    let store_links: Vec<&memory_store_agents::Model> = links
        .iter()
        .filter(|link| link.store_id == store.id)
        .collect();
    let linked_agent_ids = store_links
        .iter()
        .map(|link| link.agent_id.clone())
        .collect::<Vec<_>>();
    let linked_agent_names = store_links
        .iter()
        .filter_map(|link| agents.get(&link.agent_id).cloned())
        .collect::<Vec<_>>();
    let primary_for_agent_ids = store_links
        .iter()
        .filter(|link| link.is_primary_write_target != 0)
        .map(|link| link.agent_id.clone())
        .collect::<Vec<_>>();

    MemoryStore {
        id: store.id,
        workspace_id: store.workspace_id,
        scope_type: store.scope_type,
        name: store.name,
        description: store.description,
        chat_read_access: store.chat_read_access,
        linked_agent_ids,
        linked_agent_names,
        primary_for_agent_ids,
        entry_count,
        created_at: store.created_at,
        updated_at: store.updated_at,
    }
}

fn memory_entry_to_domain(model: memory_entries::Model) -> MemoryEntry {
    MemoryEntry {
        id: model.id,
        store_id: model.store_id,
        key: model.key,
        content: model.content,
        kind: model.kind,
        source_session_id: model.source_session_id,
        source_conversation_id: model.source_conversation_id,
        source_message_id: model.source_message_id,
        confidence: model.confidence,
        recall_count: model.recall_count,
        last_recalled_at: model.last_recalled_at,
        is_pinned: model.is_pinned != 0,
        created_at: model.created_at,
        updated_at: model.updated_at,
    }
}

#[derive(Clone)]
pub(crate) struct AutomationRepository {
    ctx: Arc<DbContext>,
}

fn agent_to_domain(model: managed_agents::Model, runs: &[agent_runs::Model]) -> ManagedAgent {
    let model_id = model.id.clone();
    let related_runs: Vec<&agent_runs::Model> = runs.iter().filter(|r| r.agent_id.as_deref() == Some(model_id.as_str())).collect();
    let total_sessions = related_runs.len() as i64;
    let completed_sessions = related_runs.iter().filter(|r| r.status == "completed").count() as i64;
    let last_run_at = related_runs.iter().filter_map(|r| r.finished_at.clone()).max();
    ManagedAgent {
        id: model.id,
        name: model.name,
        description: model.description,
        instructions: model.instructions,
        tools: serde_json::from_str(&model.tools_json).unwrap_or_default(),
        trigger_type: model.trigger_type,
        trigger_config: model.trigger_config,
        approval_mode: model.approval_mode,
        runner_type: model.runner_type,
        harness: model.harness,
        status: model.status,
        model_id: model.model_id,
        environment_id: model.environment_id,
        max_turns: model.max_turns,
        max_tokens: model.max_tokens,
        variables: serde_json::from_str(&model.variables_json).unwrap_or_default(),
        version: model.version,
        total_sessions,
        success_rate: if total_sessions == 0 { 0.0 } else { completed_sessions as f64 / total_sessions as f64 },
        last_run_at,
        created_at: model.created_at,
        updated_at: model.updated_at,
    }
}

fn environment_to_domain(model: environments::Model) -> EnvironmentProfile {
    EnvironmentProfile {
        id: model.id,
        name: model.name,
        description: model.description,
        variables: serde_json::from_str(&model.variables_json).unwrap_or_default(),
        credential_ids: serde_json::from_str(&model.credential_ids_json).unwrap_or_default(),
        runner_type: model.runner_type,
        docker_image: model.docker_image,
        is_default: model.is_default != 0,
        created_at: model.created_at,
        updated_at: model.updated_at,
    }
}

impl AutomationRepository {
    pub(crate) fn new(ctx: Arc<DbContext>) -> Self { Self { ctx } }

    pub(crate) fn list_managed_agents(&self) -> Result<Vec<ManagedAgent>, AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            let agents = managed_agents::Entity::find()
                .order_by_desc(managed_agents::Column::UpdatedAt)
                .all(&conn)
                .await?;
            let runs = agent_runs::Entity::find().all(&conn).await?;
            Ok(agents.into_iter().map(|agent| agent_to_domain(agent, &runs)).collect())
        })
    }

    pub(crate) fn create_managed_agent(&self, agent: &ManagedAgent) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            managed_agents::Entity::insert(managed_agents::ActiveModel {
                id: Set(agent.id.clone()),
                name: Set(agent.name.clone()),
                description: Set(agent.description.clone()),
                instructions: Set(agent.instructions.clone()),
                tools_json: Set(encode_json(&agent.tools)?),
                trigger_type: Set(agent.trigger_type.clone()),
                trigger_config: Set(agent.trigger_config.clone()),
                approval_mode: Set(agent.approval_mode.clone()),
                runner_type: Set(agent.runner_type.clone()),
                harness: Set(agent.harness.clone()),
                status: Set(agent.status.clone()),
                model_id: Set(agent.model_id.clone()),
                environment_id: Set(agent.environment_id.clone()),
                max_turns: Set(agent.max_turns),
                max_tokens: Set(agent.max_tokens),
                variables_json: Set(encode_json(&agent.variables)?),
                version: Set(agent.version),
                created_at: Set(agent.created_at.clone()),
                updated_at: Set(agent.updated_at.clone()),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }

    pub(crate) fn update_managed_agent(&self, agent: &ManagedAgent) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = agent.id.clone();
        self.ctx.run(async move {
            let model = managed_agents::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Managed agent {id} not found")))?;
            let mut active: managed_agents::ActiveModel = model.into();
            active.name = Set(agent.name.clone());
            active.description = Set(agent.description.clone());
            active.instructions = Set(agent.instructions.clone());
            active.tools_json = Set(encode_json(&agent.tools)?);
            active.trigger_type = Set(agent.trigger_type.clone());
            active.trigger_config = Set(agent.trigger_config.clone());
            active.approval_mode = Set(agent.approval_mode.clone());
            active.runner_type = Set(agent.runner_type.clone());
            active.harness = Set(agent.harness.clone());
            active.status = Set(agent.status.clone());
            active.model_id = Set(agent.model_id.clone());
            active.environment_id = Set(agent.environment_id.clone());
            active.max_turns = Set(agent.max_turns);
            active.max_tokens = Set(agent.max_tokens);
            active.variables_json = Set(encode_json(&agent.variables)?);
            active.version = Set(agent.version);
            active.updated_at = Set(agent.updated_at.clone());
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub(crate) fn delete_managed_agent(&self, id: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            memory_store_agents::Entity::delete_many()
                .filter(memory_store_agents::Column::AgentId.eq(id.clone()))
                .exec(&conn)
                .await?;
            let result = managed_agents::Entity::delete_many()
                .filter(managed_agents::Column::Id.eq(id.clone()))
                .exec(&conn)
                .await?;
            if result.rows_affected == 0 {
                return Err(AppError::not_found(format!("Managed agent {id} not found")));
            }
            Ok(())
        })
    }

    pub(crate) fn list_environments(&self) -> Result<Vec<EnvironmentProfile>, AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            let models = environments::Entity::find()
                .order_by_desc(environments::Column::IsDefault)
                .order_by_desc(environments::Column::UpdatedAt)
                .all(&conn)
                .await?;
            Ok(models.into_iter().map(environment_to_domain).collect())
        })
    }

    pub(crate) fn create_environment(&self, environment: &EnvironmentProfile) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            if environment.is_default {
                let defaults = environments::Entity::find()
                    .filter(environments::Column::IsDefault.eq(1))
                    .all(&conn)
                    .await?;
                for model in defaults {
                    let mut active: environments::ActiveModel = model.into();
                    active.is_default = Set(0);
                    active.update(&conn).await?;
                }
            }
            environments::Entity::insert(environments::ActiveModel {
                id: Set(environment.id.clone()),
                name: Set(environment.name.clone()),
                description: Set(environment.description.clone()),
                variables_json: Set(encode_json(&environment.variables)?),
                credential_ids_json: Set(encode_json(&environment.credential_ids)?),
                runner_type: Set(environment.runner_type.clone()),
                docker_image: Set(environment.docker_image.clone()),
                is_default: Set(environment.is_default as i32),
                created_at: Set(environment.created_at.clone()),
                updated_at: Set(environment.updated_at.clone()),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }

    pub(crate) fn update_environment(&self, environment: &EnvironmentProfile) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = environment.id.clone();
        self.ctx.run(async move {
            if environment.is_default {
                let defaults = environments::Entity::find()
                    .filter(environments::Column::IsDefault.eq(1))
                    .filter(environments::Column::Id.ne(id.clone()))
                    .all(&conn)
                    .await?;
                for model in defaults {
                    let mut active: environments::ActiveModel = model.into();
                    active.is_default = Set(0);
                    active.update(&conn).await?;
                }
            }
            let model = environments::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Environment {id} not found")))?;
            let mut active: environments::ActiveModel = model.into();
            active.name = Set(environment.name.clone());
            active.description = Set(environment.description.clone());
            active.variables_json = Set(encode_json(&environment.variables)?);
            active.credential_ids_json = Set(encode_json(&environment.credential_ids)?);
            active.runner_type = Set(environment.runner_type.clone());
            active.docker_image = Set(environment.docker_image.clone());
            active.is_default = Set(environment.is_default as i32);
            active.updated_at = Set(environment.updated_at.clone());
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub(crate) fn delete_environment(&self, id: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            let agents = managed_agents::Entity::find()
                .filter(managed_agents::Column::EnvironmentId.eq(id.clone()))
                .all(&conn)
                .await?;
            for agent in agents {
                let mut active: managed_agents::ActiveModel = agent.into();
                active.environment_id = Set(None);
                active.update(&conn).await?;
            }
            let result = environments::Entity::delete_many()
                .filter(environments::Column::Id.eq(id.clone()))
                .exec(&conn)
                .await?;
            if result.rows_affected == 0 {
                return Err(AppError::not_found(format!("Environment {id} not found")));
            }
            Ok(())
        })
    }

    pub(crate) fn list_credentials(&self) -> Result<Vec<CredentialRecord>, AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            let credential_models = credentials::Entity::find()
                .order_by_desc(credentials::Column::UpdatedAt)
                .all(&conn)
                .await?;
            let agent_models = managed_agents::Entity::find().all(&conn).await?;
            let environment_models = environments::Entity::find().all(&conn).await?;
            let environment_creds: HashMap<String, Vec<String>> = environment_models
                .into_iter()
                .map(|e| (e.id, serde_json::from_str::<Vec<String>>(&e.credential_ids_json).unwrap_or_default()))
                .collect();
            Ok(credential_models
                .into_iter()
                .map(|model| {
                    let used_by_agents = agent_models
                        .iter()
                        .filter_map(|agent| {
                            let env_id = agent.environment_id.as_ref()?;
                            let creds = environment_creds.get(env_id)?;
                            if creds.iter().any(|cred_id| cred_id == &model.id) {
                                Some(agent.name.clone())
                            } else {
                                None
                            }
                        })
                        .collect();
                    Ok(CredentialRecord {
                        id: model.id,
                        name: model.name,
                        credential_type: model.credential_type,
                        service: model.service,
                        metadata: decode_json(Some(model.metadata_json))?,
                        has_secret: model.secret_value.is_some(),
                        last_used_at: model.last_used_at,
                        used_by_agents,
                        created_at: model.created_at,
                        updated_at: model.updated_at,
                    })
                })
                .collect::<Result<Vec<_>, AppError>>()?)
        })
    }

    pub(crate) fn get_credential_secret(&self, id: &str) -> Result<Option<String>, AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            let model = credentials::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Credential {id} not found")))?;
            Ok(model.secret_value.filter(|value| !value.is_empty()))
        })
    }

    pub(crate) fn create_credential(&self, credential: &CredentialRecord, secret: Option<&str>) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let secret = secret.map(ToOwned::to_owned);
        self.ctx.run(async move {
            credentials::Entity::insert(credentials::ActiveModel {
                id: Set(credential.id.clone()),
                name: Set(credential.name.clone()),
                credential_type: Set(credential.credential_type.clone()),
                service: Set(credential.service.clone()),
                metadata_json: Set(encode_json(&credential.metadata)?),
                secret_value: Set(secret),
                last_used_at: Set(credential.last_used_at.clone()),
                created_at: Set(credential.created_at.clone()),
                updated_at: Set(credential.updated_at.clone()),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }

    pub(crate) fn update_credential(&self, credential: &CredentialRecord, secret: Option<&str>) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = credential.id.clone();
        let secret = secret.map(ToOwned::to_owned);
        self.ctx.run(async move {
            let model = credentials::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Credential {id} not found")))?;
            let mut active: credentials::ActiveModel = model.clone().into();
            active.name = Set(credential.name.clone());
            active.credential_type = Set(credential.credential_type.clone());
            active.service = Set(credential.service.clone());
            active.metadata_json = Set(encode_json(&credential.metadata)?);
            active.secret_value = Set(match secret {
                Some(value) if !value.is_empty() => Some(value),
                _ => model.secret_value,
            });
            active.last_used_at = Set(credential.last_used_at.clone());
            active.updated_at = Set(credential.updated_at.clone());
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub(crate) fn delete_credential(&self, id: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            let env_models = environments::Entity::find().all(&conn).await?;
            for env in env_models {
                let mut creds = serde_json::from_str::<Vec<String>>(&env.credential_ids_json).unwrap_or_default();
                if creds.iter().any(|cred_id| cred_id == &id) {
                    creds.retain(|cred_id| cred_id != &id);
                    let mut active: environments::ActiveModel = env.into();
                    active.credential_ids_json = Set(encode_json(&creds)?);
                    active.updated_at = Set(now());
                    active.update(&conn).await?;
                }
            }
            let result = credentials::Entity::delete_many()
                .filter(credentials::Column::Id.eq(id.clone()))
                .exec(&conn)
                .await?;
            if result.rows_affected == 0 {
                return Err(AppError::not_found(format!("Credential {id} not found")));
            }
            Ok(())
        })
    }

    pub(crate) fn list_memory_stores(&self, workspace_id: Option<&str>) -> Result<Vec<MemoryStore>, AppError> {
        let conn = self.ctx.conn();
        let workspace_id = workspace_id.map(ToOwned::to_owned);
        self.ctx.run(async move {
            let mut stores_query = memory_stores::Entity::find().order_by_desc(memory_stores::Column::UpdatedAt);
            if let Some(workspace_id) = workspace_id.as_ref() {
                stores_query = stores_query.filter(memory_stores::Column::WorkspaceId.eq(workspace_id.clone()));
            }
            let stores = stores_query.all(&conn).await?;
            let agents = managed_agents::Entity::find().all(&conn).await?;
            let links = memory_store_agents::Entity::find().all(&conn).await?;
            let entries = memory_entries::Entity::find().all(&conn).await?;
            let agent_names: HashMap<String, String> = agents.into_iter().map(|a| (a.id, a.name)).collect();
            Ok(stores
                .into_iter()
                .map(|store| {
                    let entry_count = entries.iter().filter(|entry| entry.store_id == store.id).count() as i64;
                    memory_store_to_domain(store, &links, &agent_names, entry_count)
                })
                .collect())
        })
    }

    pub(crate) fn list_agent_memory_stores(&self, agent_id: &str) -> Result<Vec<MemoryStore>, AppError> {
        let conn = self.ctx.conn();
        let agent_id = agent_id.to_string();
        self.ctx.run(async move {
            let links = memory_store_agents::Entity::find()
                .filter(memory_store_agents::Column::AgentId.eq(agent_id.clone()))
                .all(&conn)
                .await?;
            let store_ids = links.iter().map(|link| link.store_id.clone()).collect::<Vec<_>>();
            let stores = memory_stores::Entity::find().all(&conn).await?;
            let filtered_stores = stores
                .into_iter()
                .filter(|store| store_ids.iter().any(|store_id| store_id == &store.id))
                .collect::<Vec<_>>();
            let agents = managed_agents::Entity::find().all(&conn).await?;
            let all_links = memory_store_agents::Entity::find().all(&conn).await?;
            let entries = memory_entries::Entity::find().all(&conn).await?;
            let agent_names: HashMap<String, String> = agents.into_iter().map(|a| (a.id, a.name)).collect();

            Ok(filtered_stores
                .into_iter()
                .map(|store| {
                    let entry_count = entries.iter().filter(|entry| entry.store_id == store.id).count() as i64;
                    memory_store_to_domain(store, &all_links, &agent_names, entry_count)
                })
                .collect())
        })
    }

    /// Ensure the agent has at least one linked memory store.
    /// If the agent already has a linked store, returns it.
    /// Otherwise creates a new private agent memory store and links it.
    pub(crate) fn ensure_agent_memory_store(
        &self,
        agent_id: &str,
        agent_name: &str,
    ) -> Result<MemoryStore, AppError> {
        let existing = self.list_agent_memory_stores(agent_id)?;
        if let Some(primary) = existing
            .iter()
            .find(|s| s.primary_for_agent_ids.iter().any(|id| id == agent_id))
        {
            return Ok(primary.clone());
        }
        if let Some(linked) = existing.into_iter().next() {
            return Ok(linked);
        }

        let timestamp = now();
        let store = MemoryStore {
            id: uuid::Uuid::new_v4().to_string(),
            workspace_id: None,
            scope_type: "agent".to_string(),
            name: format!("{} Memory", agent_name),
            description: format!("Private memory for agent '{}'.", agent_name),
            chat_read_access: "none".to_string(),
            linked_agent_ids: vec![agent_id.to_string()],
            linked_agent_names: vec![agent_name.to_string()],
            primary_for_agent_ids: vec![agent_id.to_string()],
            entry_count: 0,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        self.create_memory_store(&store)?;
        Ok(store)
    }

    pub(crate) fn get_or_create_chat_memory_store(&self, workspace_id: Option<&str>) -> Result<MemoryStore, AppError> {
        let conn = self.ctx.conn();
        let workspace_id = workspace_id.map(ToOwned::to_owned);
        self.ctx.run(async move {
            let mut query = memory_stores::Entity::find()
                .filter(memory_stores::Column::ScopeType.eq("chat"))
                .order_by_asc(memory_stores::Column::CreatedAt);

            query = match workspace_id.as_ref() {
                Some(workspace_id) => query.filter(memory_stores::Column::WorkspaceId.eq(workspace_id.clone())),
                None => query.filter(memory_stores::Column::WorkspaceId.is_null()),
            };

            let existing = query.all(&conn).await?;

            let store = if let Some(canonical) = existing.first().cloned() {
                for duplicate in existing.into_iter().skip(1) {
                    let duplicate_entries = memory_entries::Entity::find()
                        .filter(memory_entries::Column::StoreId.eq(duplicate.id.clone()))
                        .all(&conn)
                        .await?;
                    for entry in duplicate_entries {
                        let mut active: memory_entries::ActiveModel = entry.into();
                        active.store_id = Set(canonical.id.clone());
                        active.update(&conn).await?;
                    }

                    memory_store_agents::Entity::delete_many()
                        .filter(memory_store_agents::Column::StoreId.eq(duplicate.id.clone()))
                        .exec(&conn)
                        .await?;

                    memory_stores::Entity::delete_many()
                        .filter(memory_stores::Column::Id.eq(duplicate.id))
                        .exec(&conn)
                        .await?;
                }

                canonical
            } else {
                let timestamp = now();
                let id = uuid::Uuid::new_v4().to_string();
                memory_stores::Entity::insert(memory_stores::ActiveModel {
                    id: Set(id.clone()),
                    workspace_id: Set(workspace_id.clone()),
                    scope_type: Set("chat".to_string()),
                    name: Set(match workspace_id.as_ref() {
                        Some(_) => "Workspace Chat Memory".to_string(),
                        None => "Chat Memory".to_string(),
                    }),
                    description: Set("Memories saved from chat conversations.".to_string()),
                    chat_read_access: Set("read".to_string()),
                    created_at: Set(timestamp.clone()),
                    updated_at: Set(timestamp),
                })
                .exec(&conn)
                .await?;
                memory_stores::Entity::find_by_id(id)
                    .one(&conn)
                    .await?
                    .ok_or_else(|| AppError::not_found("Chat memory store was not created".to_string()))?
            };

            let agents = managed_agents::Entity::find().all(&conn).await?;
            let links = memory_store_agents::Entity::find().all(&conn).await?;
            let entry_count = memory_entries::Entity::find()
                .filter(memory_entries::Column::StoreId.eq(store.id.clone()))
                .count(&conn)
                .await? as i64;
            let agent_names: HashMap<String, String> = agents.into_iter().map(|a| (a.id, a.name)).collect();
            Ok(memory_store_to_domain(store, &links, &agent_names, entry_count))
        })
    }

    pub(crate) fn create_memory_store(&self, store: &MemoryStore) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let primary_agent_ids = store.primary_for_agent_ids.clone();
        let linked_agent_ids = store.linked_agent_ids.clone();
        self.ctx.run(async move {
            memory_stores::Entity::insert(memory_stores::ActiveModel {
                id: Set(store.id.clone()),
                workspace_id: Set(store.workspace_id.clone()),
                scope_type: Set(store.scope_type.clone()),
                name: Set(store.name.clone()),
                description: Set(store.description.clone()),
                chat_read_access: Set(store.chat_read_access.clone()),
                created_at: Set(store.created_at.clone()),
                updated_at: Set(store.updated_at.clone()),
            })
            .exec(&conn)
            .await?;
            for agent_id in linked_agent_ids {
                memory_store_agents::Entity::insert(memory_store_agents::ActiveModel {
                    store_id: Set(store.id.clone()),
                    agent_id: Set(agent_id.clone()),
                    is_primary_write_target: Set(if primary_agent_ids.iter().any(|id| id == &agent_id) { 1 } else { 0 }),
                    created_at: Set(store.created_at.clone()),
                })
                .exec(&conn)
                .await?;
            }
            Ok(())
        })
    }

    pub(crate) fn update_memory_store(&self, store: &MemoryStore) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = store.id.clone();
        self.ctx.run(async move {
            let model = memory_stores::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Memory store {id} not found")))?;
            let mut active: memory_stores::ActiveModel = model.into();
            active.workspace_id = Set(store.workspace_id.clone());
            active.scope_type = Set(store.scope_type.clone());
            active.name = Set(store.name.clone());
            active.description = Set(store.description.clone());
            active.chat_read_access = Set(store.chat_read_access.clone());
            active.updated_at = Set(store.updated_at.clone());
            active.update(&conn).await?;

            memory_store_agents::Entity::delete_many()
                .filter(memory_store_agents::Column::StoreId.eq(id.clone()))
                .exec(&conn)
                .await?;

            for agent_id in &store.linked_agent_ids {
                memory_store_agents::Entity::insert(memory_store_agents::ActiveModel {
                    store_id: Set(id.clone()),
                    agent_id: Set(agent_id.clone()),
                    is_primary_write_target: Set(if store.primary_for_agent_ids.iter().any(|value| value == agent_id) { 1 } else { 0 }),
                    created_at: Set(store.updated_at.clone()),
                })
                .exec(&conn)
                .await?;
            }
            Ok(())
        })
    }

    pub(crate) fn delete_memory_store(&self, id: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            memory_store_agents::Entity::delete_many()
                .filter(memory_store_agents::Column::StoreId.eq(id.clone()))
                .exec(&conn)
                .await?;
            memory_entries::Entity::delete_many()
                .filter(memory_entries::Column::StoreId.eq(id.clone()))
                .exec(&conn)
                .await?;
            let result = memory_stores::Entity::delete_many()
                .filter(memory_stores::Column::Id.eq(id.clone()))
                .exec(&conn)
                .await?;
            if result.rows_affected == 0 {
                return Err(AppError::not_found(format!("Memory store {id} not found")));
            }
            Ok(())
        })
    }

    pub(crate) fn link_memory_store_to_agent(&self, store_id: &str, agent_id: &str, is_primary_write_target: bool) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let store_id = store_id.to_string();
        let agent_id = agent_id.to_string();
        self.ctx.run(async move {
            if is_primary_write_target {
                let existing = memory_store_agents::Entity::find()
                    .filter(memory_store_agents::Column::AgentId.eq(agent_id.clone()))
                    .all(&conn)
                    .await?;
                for link in existing {
                    let mut active: memory_store_agents::ActiveModel = link.into();
                    active.is_primary_write_target = Set(0);
                    active.update(&conn).await?;
                }
            }

            memory_store_agents::Entity::delete_many()
                .filter(memory_store_agents::Column::StoreId.eq(store_id.clone()))
                .filter(memory_store_agents::Column::AgentId.eq(agent_id.clone()))
                .exec(&conn)
                .await?;

            memory_store_agents::Entity::insert(memory_store_agents::ActiveModel {
                store_id: Set(store_id),
                agent_id: Set(agent_id),
                is_primary_write_target: Set(if is_primary_write_target { 1 } else { 0 }),
                created_at: Set(now()),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }

    pub(crate) fn unlink_memory_store_from_agent(&self, store_id: &str, agent_id: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let store_id = store_id.to_string();
        let agent_id = agent_id.to_string();
        self.ctx.run(async move {
            memory_store_agents::Entity::delete_many()
                .filter(memory_store_agents::Column::StoreId.eq(store_id))
                .filter(memory_store_agents::Column::AgentId.eq(agent_id))
                .exec(&conn)
                .await?;
            Ok(())
        })
    }

    pub(crate) fn set_agent_primary_memory_store(&self, store_id: &str, agent_id: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let store_id = store_id.to_string();
        let agent_id = agent_id.to_string();
        self.ctx.run(async move {
            let links = memory_store_agents::Entity::find()
                .filter(memory_store_agents::Column::AgentId.eq(agent_id.clone()))
                .all(&conn)
                .await?;
            for link in links {
                let is_primary = link.store_id == store_id;
                let mut active: memory_store_agents::ActiveModel = link.into();
                active.is_primary_write_target = Set(if is_primary { 1 } else { 0 });
                active.update(&conn).await?;
            }
            Ok(())
        })
    }

    pub(crate) fn list_memory_entries(&self, store_id: &str) -> Result<Vec<MemoryEntry>, AppError> {
        let conn = self.ctx.conn();
        let store_id = store_id.to_string();
        self.ctx.run(async move {
            let models = memory_entries::Entity::find()
                .filter(memory_entries::Column::StoreId.eq(store_id))
                .order_by_desc(memory_entries::Column::UpdatedAt)
                .all(&conn)
                .await?;
            Ok(models
                .into_iter()
                .map(memory_entry_to_domain)
                .collect())
        })
    }

    pub(crate) fn create_memory_entry(&self, entry: &MemoryEntry) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let store_id = entry.store_id.clone();
        let updated_at = entry.updated_at.clone();
        self.ctx.run(async move {
            memory_entries::Entity::insert(memory_entries::ActiveModel {
                id: Set(entry.id.clone()),
                store_id: Set(entry.store_id.clone()),
                key: Set(entry.key.clone()),
                content: Set(entry.content.clone()),
                kind: Set(entry.kind.clone()),
                source_session_id: Set(entry.source_session_id.clone()),
                source_conversation_id: Set(entry.source_conversation_id.clone()),
                source_message_id: Set(entry.source_message_id.clone()),
                confidence: Set(entry.confidence),
                recall_count: Set(entry.recall_count),
                last_recalled_at: Set(entry.last_recalled_at.clone()),
                is_pinned: Set(entry.is_pinned as i32),
                created_at: Set(entry.created_at.clone()),
                updated_at: Set(entry.updated_at.clone()),
            })
            .exec(&conn)
            .await?;
            if let Some(store) = memory_stores::Entity::find_by_id(store_id).one(&conn).await? {
                let mut active: memory_stores::ActiveModel = store.into();
                active.updated_at = Set(updated_at);
                active.update(&conn).await?;
            }
            Ok(())
        })
    }

    pub(crate) fn update_memory_entry(&self, entry: &MemoryEntry) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = entry.id.clone();
        self.ctx.run(async move {
            let model = memory_entries::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Memory entry {id} not found")))?;
            let mut active: memory_entries::ActiveModel = model.into();
            active.key = Set(entry.key.clone());
            active.content = Set(entry.content.clone());
            active.kind = Set(entry.kind.clone());
            active.source_session_id = Set(entry.source_session_id.clone());
            active.source_conversation_id = Set(entry.source_conversation_id.clone());
            active.source_message_id = Set(entry.source_message_id.clone());
            active.confidence = Set(entry.confidence);
            active.recall_count = Set(entry.recall_count);
            active.last_recalled_at = Set(entry.last_recalled_at.clone());
            active.is_pinned = Set(entry.is_pinned as i32);
            active.updated_at = Set(entry.updated_at.clone());
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub(crate) fn delete_memory_entry(&self, id: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            let result = memory_entries::Entity::delete_many()
                .filter(memory_entries::Column::Id.eq(id.clone()))
                .exec(&conn)
                .await?;
            if result.rows_affected == 0 {
                return Err(AppError::not_found(format!("Memory entry {id} not found")));
            }
            Ok(())
        })
    }
}
