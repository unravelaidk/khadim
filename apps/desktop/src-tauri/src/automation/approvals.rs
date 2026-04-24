use crate::db::{ApprovalRequestRecord, ManagedAgent};
use crate::error::AppError;
use std::sync::Arc;

use crate::db::Database;

pub struct ApprovalService {
    db: Arc<Database>,
}

pub enum ApprovalDecision {
    Approved(ApprovalRequestRecord),
    NotRequired,
    Blocked(ApprovalRequestRecord),
}

impl ApprovalService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn evaluate_run_start(
        &self,
        agent: &ManagedAgent,
        run_id: &str,
        trigger: &str,
    ) -> Result<ApprovalDecision, AppError> {
        match agent.approval_mode.as_str() {
            "never" => Ok(ApprovalDecision::NotRequired),
            "auto" => Ok(ApprovalDecision::Approved(self.build_request(
                run_id,
                "run_start",
                &format!("Auto-approved run start for {}", agent.name),
                "medium",
                "approved",
                Some("Approved by auto policy".to_string()),
                Some(serde_json::json!({ "trigger": trigger, "policy": "auto" }).to_string()),
            )?)),
            "ask" => {
                if trigger == "manual" {
                    Ok(ApprovalDecision::Approved(self.build_request(
                        run_id,
                        "run_start",
                        &format!("Manual run approved for {}", agent.name),
                        "medium",
                        "approved",
                        Some("Approved implicitly by manual trigger".to_string()),
                        Some(
                            serde_json::json!({ "trigger": trigger, "policy": "ask" }).to_string(),
                        ),
                    )?))
                } else {
                    Ok(ApprovalDecision::Blocked(self.build_request(
                        run_id,
                        "run_start",
                        &format!("Approval required for {}", agent.name),
                        "high",
                        "pending",
                        Some("Non-manual runs require explicit approval".to_string()),
                        Some(
                            serde_json::json!({ "trigger": trigger, "policy": "ask" }).to_string(),
                        ),
                    )?))
                }
            }
            _ => Ok(ApprovalDecision::NotRequired),
        }
    }

    fn build_request(
        &self,
        run_id: &str,
        scope: &str,
        action_title: &str,
        risk_level: &str,
        status: &str,
        resolution_note: Option<String>,
        metadata_json: Option<String>,
    ) -> Result<ApprovalRequestRecord, AppError> {
        let now = chrono::Utc::now().to_rfc3339();
        let request = ApprovalRequestRecord {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run_id.to_string(),
            scope: scope.to_string(),
            action_title: action_title.to_string(),
            risk_level: risk_level.to_string(),
            status: status.to_string(),
            requested_at: now.clone(),
            resolved_at: (status != "pending").then_some(now),
            resolution_note,
            metadata_json: metadata_json.unwrap_or_else(|| "{}".to_string()),
        };
        self.db.create_approval_request(&request)?;
        Ok(request)
    }
}
