use crate::db::context::DbContext;
use crate::db::entities::settings;
use crate::error::AppError;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, EntityTrait};
use std::sync::Arc;

#[derive(Clone)]
pub(crate) struct SettingsRepository {
    ctx: Arc<DbContext>,
}

impl SettingsRepository {
    pub(crate) fn new(ctx: Arc<DbContext>) -> Self { Self { ctx } }

    pub(crate) fn get(&self, key: &str) -> Result<Option<String>, AppError> {
        let conn = self.ctx.conn();
        let key = key.to_string();
        self.ctx.run(async move {
            Ok(settings::Entity::find_by_id(key).one(&conn).await?.map(|model| model.value))
        })
    }

    pub(crate) fn set(&self, key: &str, value: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let key = key.to_string();
        let value = value.to_string();
        self.ctx.run(async move {
            let existing = settings::Entity::find_by_id(key.clone()).one(&conn).await?;
            if let Some(model) = existing {
                let mut active: settings::ActiveModel = model.into();
                active.value = Set(value);
                active.update(&conn).await?;
            } else {
                settings::Entity::insert(settings::ActiveModel {
                    key: Set(key),
                    value: Set(value),
                })
                .exec(&conn)
                .await?;
            }
            Ok(())
        })
    }
}
