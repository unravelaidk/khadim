use crate::db::context::{now, DbContext};
use crate::db::entities::{conversations, messages};
use crate::db::{ChatMessage, Conversation};
use crate::error::AppError;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, QueryOrder,
};
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct SessionSearchResult {
    pub message_id: String,
    pub conversation_id: String,
    pub role: String,
    pub content_snippet: String,
    pub created_at: String,
}

#[derive(Clone)]
pub(crate) struct ChatRepository {
    ctx: Arc<DbContext>,
}

fn to_conversation(model: conversations::Model) -> Conversation {
    Conversation {
        id: model.id,
        workspace_id: model.workspace_id,
        backend: model.backend,
        backend_session_id: model.backend_session_id,
        backend_session_cwd: model.backend_session_cwd,
        branch: model.branch,
        worktree_path: model.worktree_path,
        title: model.title,
        is_active: model.is_active != 0,
        created_at: model.created_at,
        updated_at: model.updated_at,
        input_tokens: model.input_tokens,
        output_tokens: model.output_tokens,
    }
}

fn to_message(model: messages::Model) -> ChatMessage {
    ChatMessage {
        id: model.id,
        conversation_id: model.conversation_id,
        role: model.role,
        content: model.content,
        metadata: model.metadata,
        created_at: model.created_at,
    }
}

impl ChatRepository {
    pub(crate) fn new(ctx: Arc<DbContext>) -> Self { Self { ctx } }

    pub(crate) fn create_conversation(&self, conv: &Conversation) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            conversations::Entity::insert(conversations::ActiveModel {
                id: Set(conv.id.clone()),
                workspace_id: Set(conv.workspace_id.clone()),
                backend: Set(conv.backend.clone()),
                backend_session_id: Set(conv.backend_session_id.clone()),
                backend_session_cwd: Set(conv.backend_session_cwd.clone()),
                branch: Set(conv.branch.clone()),
                worktree_path: Set(conv.worktree_path.clone()),
                title: Set(conv.title.clone()),
                is_active: Set(conv.is_active as i32),
                created_at: Set(conv.created_at.clone()),
                updated_at: Set(conv.updated_at.clone()),
                input_tokens: Set(conv.input_tokens),
                output_tokens: Set(conv.output_tokens),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }

    pub(crate) fn update_conversation_tokens(&self, id: &str, input_tokens: i64, output_tokens: i64) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            let model = conversations::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Conversation {id} not found")))?;
            let mut active: conversations::ActiveModel = model.into();
            active.input_tokens = Set(input_tokens);
            active.output_tokens = Set(output_tokens);
            active.updated_at = Set(now());
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub(crate) fn delete_conversation(&self, id: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            messages::Entity::delete_many()
                .filter(messages::Column::ConversationId.eq(id.clone()))
                .exec(&conn)
                .await?;
            let result = conversations::Entity::delete_many()
                .filter(conversations::Column::Id.eq(id.clone()))
                .exec(&conn)
                .await?;
            if result.rows_affected == 0 {
                return Err(AppError::not_found(format!("Conversation {id} not found")));
            }
            Ok(())
        })
    }

    pub(crate) fn list_conversations(&self, workspace_id: &str) -> Result<Vec<Conversation>, AppError> {
        let conn = self.ctx.conn();
        let workspace_id = workspace_id.to_string();
        self.ctx.run(async move {
            let models = conversations::Entity::find()
                .filter(conversations::Column::WorkspaceId.eq(workspace_id))
                .order_by_desc(conversations::Column::UpdatedAt)
                .all(&conn)
                .await?;
            Ok(models.into_iter().map(to_conversation).collect())
        })
    }

    pub(crate) fn get_conversation(&self, id: &str) -> Result<Conversation, AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            let model = conversations::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Conversation {id} not found")))?;
            Ok(to_conversation(model))
        })
    }

    pub(crate) fn deactivate_workspace_conversations(&self, workspace_id: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let workspace_id = workspace_id.to_string();
        self.ctx.run(async move {
            let models = conversations::Entity::find()
                .filter(conversations::Column::WorkspaceId.eq(workspace_id))
                .filter(conversations::Column::IsActive.eq(1))
                .all(&conn)
                .await?;
            for model in models {
                let mut active: conversations::ActiveModel = model.into();
                active.is_active = Set(0);
                active.updated_at = Set(now());
                active.update(&conn).await?;
            }
            Ok(())
        })
    }

    pub(crate) fn set_backend_session(&self, id: &str, backend_session_id: &str, backend_session_cwd: Option<&str>, branch: Option<&str>, worktree_path: Option<&str>) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        let backend_session_id = backend_session_id.to_string();
        let backend_session_cwd = backend_session_cwd.map(ToOwned::to_owned);
        let branch = branch.map(ToOwned::to_owned);
        let worktree_path = worktree_path.map(ToOwned::to_owned);
        self.ctx.run(async move {
            let model = conversations::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Conversation {id} not found")))?;
            let mut active: conversations::ActiveModel = model.into();
            active.backend_session_id = Set(Some(backend_session_id));
            active.backend_session_cwd = Set(backend_session_cwd);
            active.branch = Set(branch);
            active.worktree_path = Set(worktree_path);
            active.updated_at = Set(now());
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub(crate) fn insert_message(&self, msg: &ChatMessage) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            messages::Entity::insert(messages::ActiveModel {
                id: Set(msg.id.clone()),
                conversation_id: Set(msg.conversation_id.clone()),
                role: Set(msg.role.clone()),
                content: Set(msg.content.clone()),
                metadata: Set(msg.metadata.clone()),
                created_at: Set(msg.created_at.clone()),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }

    pub(crate) fn list_messages(&self, conversation_id: &str) -> Result<Vec<ChatMessage>, AppError> {
        let conn = self.ctx.conn();
        let conversation_id = conversation_id.to_string();
        self.ctx.run(async move {
            let models = messages::Entity::find()
                .filter(messages::Column::ConversationId.eq(conversation_id))
                .order_by_asc(messages::Column::CreatedAt)
                .all(&conn)
                .await?;
            Ok(models.into_iter().map(to_message).collect())
        })
    }

    /// Full-text search across all messages using FTS5.
    pub(crate) fn search_messages(
        &self,
        query: &str,
        workspace_id: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SessionSearchResult>, AppError> {
        let conn = self.ctx.conn();
        let query = query.to_string();
        let workspace_id = workspace_id.map(ToOwned::to_owned);
        self.ctx.run(async move {
            // Sanitize the query for FTS5 MATCH — strip special chars that would cause syntax errors
            let sanitized = query
                .replace('"', " ")
                .replace('+', " ")
                .replace('*', " ")
                .replace('{', " ")
                .replace('}', " ")
                .replace('(', " ")
                .replace(')', " ")
                .replace('^', " ");
            let sanitized = sanitized.split_whitespace().collect::<Vec<_>>().join(" ");

            if sanitized.is_empty() {
                return Ok(Vec::new());
            }

            let sql = if let Some(ref _ws) = workspace_id {
                "SELECT m.id, m.conversation_id, m.role, m.content, m.created_at \
                 FROM messages_fts fts \
                 JOIN messages m ON m.rowid = fts.rowid \
                 JOIN conversations c ON c.id = m.conversation_id \
                 WHERE fts.messages_fts MATCH ? AND c.workspace_id = ? \
                 ORDER BY rank \
                 LIMIT ?"
            } else {
                "SELECT m.id, m.conversation_id, m.role, m.content, m.created_at \
                 FROM messages_fts fts \
                 JOIN messages m ON m.rowid = fts.rowid \
                 WHERE fts.messages_fts MATCH ? \
                 ORDER BY rank \
                 LIMIT ?"
            };

            let limit_i64 = limit as i64;
            let values: Vec<sea_orm::Value> = if workspace_id.is_some() {
                vec![
                    sanitized.into(),
                    workspace_id.unwrap().into(),
                    limit_i64.into(),
                ]
            } else {
                vec![sanitized.into(), limit_i64.into()]
            };

            let rows = conn
                .query_all(sea_orm::Statement::from_sql_and_values(
                    sea_orm::DbBackend::Sqlite,
                    sql,
                    values,
                ))
                .await?;

            let mut results = Vec::new();
            for row in rows {
                let content: String = row.try_get::<String>("", "content").unwrap_or_default();
                let snippet = if content.len() > 300 {
                    format!("{}...", &content[..300])
                } else {
                    content
                };
                results.push(SessionSearchResult {
                    message_id: row.try_get::<String>("", "id").unwrap_or_default(),
                    conversation_id: row.try_get::<String>("", "conversation_id").unwrap_or_default(),
                    role: row.try_get::<String>("", "role").unwrap_or_default(),
                    content_snippet: snippet,
                    created_at: row.try_get::<String>("", "created_at").unwrap_or_default(),
                });
            }
            Ok(results)
        })
    }
}
