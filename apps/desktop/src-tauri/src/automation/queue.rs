use crate::db::{Database, QueueDefinition, QueueItem};
use crate::error::AppError;
use std::sync::Arc;

pub struct QueueService {
    db: Arc<Database>,
}

impl QueueService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn ensure_queue(
        &self,
        name: &str,
        kind: &str,
        source_config_json: &str,
    ) -> Result<QueueDefinition, AppError> {
        if let Some(existing) = self
            .db
            .list_queues()?
            .into_iter()
            .find(|queue| queue.name == name)
        {
            return Ok(existing);
        }

        let now = chrono::Utc::now().to_rfc3339();
        let queue = QueueDefinition {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            kind: kind.to_string(),
            source_config_json: source_config_json.to_string(),
            created_at: now.clone(),
            updated_at: now,
        };
        self.db.create_queue(&queue)?;
        Ok(queue)
    }

    pub fn enqueue(
        &self,
        queue_id: &str,
        payload_json: &str,
        priority: i64,
    ) -> Result<QueueItem, AppError> {
        let now = chrono::Utc::now().to_rfc3339();
        let item = QueueItem {
            id: uuid::Uuid::new_v4().to_string(),
            queue_id: queue_id.to_string(),
            status: "ready".to_string(),
            payload_json: payload_json.to_string(),
            priority,
            visible_at: now.clone(),
            claimed_by_run_id: None,
            claimed_at: None,
            attempt_count: 0,
            max_attempts: 3,
            last_error: None,
            dead_lettered_at: None,
            completed_at: None,
            created_at: now.clone(),
            updated_at: now,
        };
        self.db.create_queue_item(&item)?;
        Ok(item)
    }

    pub fn claim_next(&self, queue_id: &str, run_id: &str) -> Result<Option<QueueItem>, AppError> {
        let now = chrono::Utc::now().to_rfc3339();
        let next_item = self.db.find_next_ready_queue_item(queue_id, &now)?;

        if let Some(mut item) = next_item {
            item.status = "claimed".to_string();
            item.claimed_by_run_id = Some(run_id.to_string());
            item.claimed_at = Some(now.clone());
            item.attempt_count += 1;
            item.updated_at = now;
            self.db.update_queue_item(&item)?;
            Ok(Some(item))
        } else {
            Ok(None)
        }
    }

    pub fn complete(&self, item_id: &str) -> Result<(), AppError> {
        let mut item = self.db.get_queue_item(item_id)?;
        let now = chrono::Utc::now().to_rfc3339();
        item.status = "completed".to_string();
        item.claimed_by_run_id = None;
        item.claimed_at = None;
        item.completed_at = Some(now.clone());
        item.updated_at = now;
        self.db.update_queue_item(&item)
    }

    pub fn fail(&self, item_id: &str, error: &str) -> Result<QueueFailureOutcome, AppError> {
        let mut item = self.db.get_queue_item(item_id)?;
        let now = chrono::Utc::now().to_rfc3339();
        item.last_error = Some(error.to_string());
        item.claimed_by_run_id = None;
        item.claimed_at = None;

        if item.attempt_count >= item.max_attempts {
            item.status = "dead_letter".to_string();
            item.dead_lettered_at = Some(now.clone());
            item.updated_at = now;
            self.db.update_queue_item(&item)?;
            Ok(QueueFailureOutcome::DeadLettered(item))
        } else {
            let next_visible =
                chrono::Utc::now() + chrono::Duration::seconds(item.attempt_count * 30);
            item.status = "ready".to_string();
            item.visible_at = next_visible.to_rfc3339();
            item.updated_at = now;
            self.db.update_queue_item(&item)?;
            Ok(QueueFailureOutcome::Retried(item))
        }
    }
}

pub enum QueueFailureOutcome {
    Retried(QueueItem),
    DeadLettered(QueueItem),
}
