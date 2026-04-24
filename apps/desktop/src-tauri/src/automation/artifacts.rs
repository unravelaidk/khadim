use crate::db::{ArtifactPolicy, ArtifactRecord, Database, RunEvent};
use crate::error::AppError;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct ArtifactService {
    db: Arc<Database>,
}

impl ArtifactService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn capture_directory_outputs(
        &self,
        run_id: &str,
        agent_id: Option<&str>,
        source_dir: &Path,
        policy: &ArtifactPolicy,
    ) -> Result<Vec<ArtifactRecord>, AppError> {
        if !source_dir.exists() {
            return Ok(Vec::new());
        }

        let target_root = artifact_root_for_run(run_id)?;
        fs::create_dir_all(&target_root)
            .map_err(|e| AppError::io(format!("Failed to create artifact dir: {e}")))?;

        let mut files = Vec::new();
        collect_files(source_dir, source_dir, &mut files)?;

        let mut persisted = Vec::new();
        for (source, relative) in files {
            let target = target_root.join(&relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    AppError::io(format!("Failed to create artifact parent dir: {e}"))
                })?;
            }
            fs::copy(&source, &target).map_err(|e| {
                AppError::io(format!("Failed to copy artifact {}: {e}", source.display()))
            })?;

            let bytes = fs::read(&target).map_err(|e| {
                AppError::io(format!("Failed to read artifact {}: {e}", target.display()))
            })?;
            let artifact = ArtifactRecord {
                id: uuid::Uuid::new_v4().to_string(),
                run_id: run_id.to_string(),
                agent_id: agent_id.map(ToOwned::to_owned),
                kind: "file".to_string(),
                label: relative.to_string_lossy().to_string(),
                path: Some(target.to_string_lossy().to_string()),
                mime_type: Some(infer_mime_type(&target)),
                size_bytes: Some(bytes.len() as i64),
                sha256: Some(format!("{:x}", Sha256::digest(&bytes))),
                storage_type: "filesystem".to_string(),
                metadata_json: json!({
                    "source_path": source.to_string_lossy(),
                    "relative_path": relative.to_string_lossy(),
                })
                .to_string(),
                created_at: chrono::Utc::now().to_rfc3339(),
            };
            self.db.create_artifact(&artifact)?;
            self.record_artifact_event(&artifact)?;
            persisted.push(artifact);
        }

        self.prune_artifacts(run_id, agent_id, policy)?;
        Ok(persisted)
    }

    pub fn persist_text_artifact(
        &self,
        run_id: &str,
        agent_id: Option<&str>,
        kind: &str,
        label: &str,
        extension: &str,
        content: &str,
        policy: &ArtifactPolicy,
    ) -> Result<ArtifactRecord, AppError> {
        let target_root = artifact_root_for_run(run_id)?;
        fs::create_dir_all(&target_root)
            .map_err(|e| AppError::io(format!("Failed to create artifact dir: {e}")))?;
        let file_name = sanitize_file_name(label, extension);
        let path = target_root.join(file_name);
        let mut file = fs::File::create(&path)
            .map_err(|e| AppError::io(format!("Failed to create artifact file: {e}")))?;
        file.write_all(content.as_bytes())
            .map_err(|e| AppError::io(format!("Failed to write artifact file: {e}")))?;
        let sha = format!("{:x}", Sha256::digest(content.as_bytes()));

        let artifact = ArtifactRecord {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run_id.to_string(),
            agent_id: agent_id.map(ToOwned::to_owned),
            kind: kind.to_string(),
            label: label.to_string(),
            path: Some(path.to_string_lossy().to_string()),
            mime_type: Some(infer_mime_type(&path)),
            size_bytes: Some(content.len() as i64),
            sha256: Some(sha),
            storage_type: "filesystem".to_string(),
            metadata_json: json!({}).to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        self.db.create_artifact(&artifact)?;
        self.record_artifact_event(&artifact)?;
        self.prune_artifacts(run_id, agent_id, policy)?;
        Ok(artifact)
    }

    pub fn prune_artifacts(
        &self,
        run_id: &str,
        agent_id: Option<&str>,
        policy: &ArtifactPolicy,
    ) -> Result<(), AppError> {
        self.prune_by_age(agent_id, policy.retention_days)?;
        self.prune_run_overflow(run_id, policy.max_artifacts_per_run)?;
        Ok(())
    }

    fn record_artifact_event(&self, artifact: &ArtifactRecord) -> Result<(), AppError> {
        let sequence_number = self.db.list_run_events(&artifact.run_id)?.len() as i64 + 1;
        self.db.create_run_event(&RunEvent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: artifact.run_id.clone(),
            sequence_number,
            event_type: "artifact_created".to_string(),
            source: "artifacts".to_string(),
            title: Some("Artifact captured".to_string()),
            content: Some(artifact.label.clone()),
            status: Some("complete".to_string()),
            tool_name: None,
            metadata_json: json!({
                "artifact_id": artifact.id,
                "kind": artifact.kind,
                "path": artifact.path,
            })
            .to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    fn record_artifact_pruned_event(
        &self,
        run_id: &str,
        artifact: &ArtifactRecord,
        reason: &str,
    ) -> Result<(), AppError> {
        let sequence_number = self.db.list_run_events(run_id)?.len() as i64 + 1;
        self.db.create_run_event(&RunEvent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run_id.to_string(),
            sequence_number,
            event_type: "artifact_pruned".to_string(),
            source: "artifacts".to_string(),
            title: Some("Artifact pruned".to_string()),
            content: Some(artifact.label.clone()),
            status: Some("pruned".to_string()),
            tool_name: None,
            metadata_json: json!({
                "artifact_id": artifact.id,
                "reason": reason,
                "path": artifact.path,
            })
            .to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    fn prune_by_age(&self, agent_id: Option<&str>, retention_days: i64) -> Result<(), AppError> {
        let Some(agent_id) = agent_id else {
            return Ok(());
        };
        let cutoff = chrono::Utc::now() - chrono::Duration::days(retention_days.max(1));
        for artifact in self.db.list_agent_artifacts(agent_id)? {
            let created_at = chrono::DateTime::parse_from_rfc3339(&artifact.created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());
            if created_at < cutoff {
                self.remove_artifact(&artifact, "retention_days_exceeded")?;
            }
        }
        Ok(())
    }

    fn prune_run_overflow(&self, run_id: &str, max_artifacts_per_run: i64) -> Result<(), AppError> {
        let max_artifacts_per_run = max_artifacts_per_run.max(1) as usize;
        let artifacts = self.db.list_artifacts(run_id)?;
        if artifacts.len() <= max_artifacts_per_run {
            return Ok(());
        }
        let overflow = artifacts.len() - max_artifacts_per_run;
        for artifact in artifacts.into_iter().take(overflow) {
            self.remove_artifact(&artifact, "max_artifacts_per_run_exceeded")?;
        }
        Ok(())
    }

    fn remove_artifact(&self, artifact: &ArtifactRecord, reason: &str) -> Result<(), AppError> {
        if let Some(path) = &artifact.path {
            let artifact_path = PathBuf::from(path);
            if artifact_path.exists() {
                let _ = fs::remove_file(&artifact_path);
            }
        }
        self.db.delete_artifact(&artifact.id)?;
        self.record_artifact_pruned_event(&artifact.run_id, artifact, reason)
    }
}

fn artifact_root_for_run(run_id: &str) -> Result<PathBuf, AppError> {
    let base = dirs::data_dir()
        .map(|dir| dir.join("khadim").join("artifacts").join(run_id))
        .ok_or_else(|| AppError::io("Cannot determine system data directory"))?;
    Ok(base)
}

fn collect_files(
    base: &Path,
    dir: &Path,
    files: &mut Vec<(PathBuf, PathBuf)>,
) -> Result<(), AppError> {
    for entry in fs::read_dir(dir)
        .map_err(|e| AppError::io(format!("Failed to read dir {}: {e}", dir.display())))?
    {
        let entry = entry.map_err(|e| AppError::io(format!("Failed to read dir entry: {e}")))?;
        let path = entry.path();
        if path.is_dir() {
            collect_files(base, &path, files)?;
        } else if path.is_file() {
            let relative = path
                .strip_prefix(base)
                .map_err(|e| {
                    AppError::io(format!("Failed to compute relative artifact path: {e}"))
                })?
                .to_path_buf();
            files.push((path, relative));
        }
    }
    Ok(())
}

fn infer_mime_type(path: &Path) -> String {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "txt" | "log" | "md" => "text/plain".to_string(),
        "json" => "application/json".to_string(),
        "html" => "text/html".to_string(),
        "csv" => "text/csv".to_string(),
        "png" => "image/png".to_string(),
        "jpg" | "jpeg" => "image/jpeg".to_string(),
        "pdf" => "application/pdf".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

fn sanitize_file_name(label: &str, extension: &str) -> String {
    let stem: String = label
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect();
    format!(
        "{}{}.{}",
        stem.trim_matches('-'),
        if stem.is_empty() { "artifact" } else { "" },
        extension
    )
}
