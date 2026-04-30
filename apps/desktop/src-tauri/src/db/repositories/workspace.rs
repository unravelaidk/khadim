use crate::db::context::{now, DbContext};
use crate::db::entities::workspaces;
use crate::db::Workspace;
use crate::error::AppError;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};
use std::sync::Arc;

#[derive(Clone)]
pub(crate) struct WorkspaceRepository {
    ctx: Arc<DbContext>,
}

fn to_domain(model: workspaces::Model) -> Workspace {
    Workspace {
        id: model.id,
        name: model.name,
        repo_path: model.repo_path,
        worktree_path: model.worktree_path,
        branch: model.branch,
        backend: model.backend,
        execution_target: model.execution_target,
        sandbox_id: model.sandbox_id,
        created_at: model.created_at,
        updated_at: model.updated_at,
    }
}

impl WorkspaceRepository {
    pub(crate) fn new(ctx: Arc<DbContext>) -> Self {
        Self { ctx }
    }

    pub(crate) fn create(&self, ws: &Workspace) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            workspaces::Entity::insert(workspaces::ActiveModel {
                id: Set(ws.id.clone()),
                name: Set(ws.name.clone()),
                repo_path: Set(ws.repo_path.clone()),
                worktree_path: Set(ws.worktree_path.clone()),
                branch: Set(ws.branch.clone()),
                backend: Set(ws.backend.clone()),
                execution_target: Set(ws.execution_target.clone()),
                sandbox_id: Set(ws.sandbox_id.clone()),
                created_at: Set(ws.created_at.clone()),
                updated_at: Set(ws.updated_at.clone()),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }

    pub(crate) fn list(&self) -> Result<Vec<Workspace>, AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            let models = workspaces::Entity::find()
                .order_by_desc(workspaces::Column::UpdatedAt)
                .all(&conn)
                .await?;
            Ok(models.into_iter().map(to_domain).collect())
        })
    }

    pub(crate) fn get(&self, id: &str) -> Result<Workspace, AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            let model = workspaces::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Workspace {id} not found")))?;
            Ok(to_domain(model))
        })
    }

    pub(crate) fn update_backend(&self, id: &str, backend: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        let backend = backend.to_string();
        self.ctx.run(async move {
            let model = workspaces::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Workspace {id} not found")))?;
            let mut active: workspaces::ActiveModel = model.into();
            active.backend = Set(backend);
            active.updated_at = Set(now());
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub(crate) fn update_branch(&self, id: &str, branch: Option<&str>) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        let branch = branch.map(ToOwned::to_owned);
        self.ctx.run(async move {
            let model = workspaces::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Workspace {id} not found")))?;
            let mut active: workspaces::ActiveModel = model.into();
            active.branch = Set(branch);
            active.updated_at = Set(now());
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub(crate) fn delete(&self, id: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            let conversation_ids = crate::db::entities::conversations::Entity::find()
                .filter(crate::db::entities::conversations::Column::WorkspaceId.eq(id.clone()))
                .all(&conn)
                .await?
                .into_iter()
                .map(|c| c.id)
                .collect::<Vec<_>>();

            for conversation_id in conversation_ids {
                crate::db::entities::messages::Entity::delete_many()
                    .filter(
                        crate::db::entities::messages::Column::ConversationId.eq(conversation_id),
                    )
                    .exec(&conn)
                    .await?;
            }

            crate::db::entities::conversations::Entity::delete_many()
                .filter(crate::db::entities::conversations::Column::WorkspaceId.eq(id.clone()))
                .exec(&conn)
                .await?;

            let result = workspaces::Entity::delete_many()
                .filter(workspaces::Column::Id.eq(id.clone()))
                .exec(&conn)
                .await?;
            if result.rows_affected == 0 {
                return Err(AppError::not_found(format!("Workspace {id} not found")));
            }
            Ok(())
        })
    }
}
