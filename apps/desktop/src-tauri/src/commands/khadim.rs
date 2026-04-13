use crate::error::AppError;
use crate::db::{MemoryEntry, MemoryStore};
use crate::khadim_ai::model_settings::{
    BulkModelEntry, DiscoveredProviderModel, ModelConfig, ModelConfigInput, ProviderOption,
    ProviderStatus,
};
use crate::khadim_ai::models::CatalogModelOption;
use crate::khadim_ai::oauth::{CodexLoginStatusResponse, CodexSessionInfo};
use crate::khadim_ai::types::ModelSelection;
use crate::opencode::{AgentStreamEvent, OpenCodeModelRef};
use crate::run_lifecycle::{
    emit_error_and_done, persist_assistant_message, persist_user_message, StreamAccumulator,
};
use crate::AppState;
use serde::Serialize;
use serde_json::json;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::sync::mpsc;

#[derive(Serialize, Clone)]
pub(crate) struct KhadimSessionCreated {
    id: String,
}

fn mask_api_key(key: &str) -> String {
    let len = key.len();
    if len <= 8 {
        "*".repeat(len)
    } else {
        format!("{}{}{}", &key[..4], "*".repeat(len - 8), &key[len - 4..])
    }
}

fn resolve_khadim_selection(
    state: &Arc<AppState>,
    model: Option<&OpenCodeModelRef>,
) -> Result<Option<ModelSelection>, AppError> {
    if let Some(model) = model {
        let override_config = crate::khadim_ai::model_settings::configured_model_override(
            &state.db,
            &model.provider_id,
            &model.model_id,
        )?;
        let provider_api_key =
            crate::khadim_ai::model_settings::saved_provider_api_key(&model.provider_id)?;
        return Ok(Some(ModelSelection {
            provider: model.provider_id.clone(),
            model_id: model.model_id.clone(),
            display_name: override_config.as_ref().map(|config| config.name.clone()),
            api_key: override_config
                .as_ref()
                .and_then(|config| config.api_key.clone())
                .or(provider_api_key),
            base_url: override_config.as_ref().and_then(|config| config.base_url.clone()),
        }));
    }

    let config = crate::khadim_ai::model_settings::active_config(&state.db)?.ok_or_else(|| {
        AppError::invalid_input(
            "No Khadim model is configured. Add one in Model Settings first.",
        )
    })?;

    Ok(Some(ModelSelection {
        provider: config.provider,
        model_id: config.model,
        display_name: Some(config.name),
        api_key: config.api_key,
        base_url: config.base_url,
    }))
}

fn split_terms(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|part| part.len() >= 3)
        .map(ToOwned::to_owned)
        .collect()
}

fn trim_sentence(value: &str) -> String {
    value
        .trim()
        .trim_matches(|ch: char| matches!(ch, '.' | ',' | ';' | ':' | '!' | '?'))
        .trim()
        .to_string()
}

fn extract_fragment_after(text: &str, marker: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let index = lower.find(marker)?;
    let start = index + marker.len();
    let rest = text.get(start..)?.trim();
    let fragment = rest
        .split(['.', '!', '?', '\n'])
        .next()
        .map(trim_sentence)
        .unwrap_or_default();
    (!fragment.is_empty()).then_some(fragment)
}

fn slugify_key(value: &str) -> String {
    let mut out = String::new();
    let mut last_was_sep = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_was_sep = false;
        } else if !last_was_sep {
            out.push('_');
            last_was_sep = true;
        }
        if out.len() >= 40 {
            break;
        }
    }
    out.trim_matches('_').to_string()
}

fn extract_memory_candidates(user_text: &str) -> Vec<(String, String, String, f64)> {
    let mut candidates = Vec::new();

    if let Some(value) = extract_fragment_after(user_text, "remember ") {
        let key = format!("remembered_{}", slugify_key(&value));
        candidates.push((key, value, "fact".to_string(), 0.98));
    }

    if let Some(value) = extract_fragment_after(user_text, "my name is ") {
        candidates.push(("user_name".to_string(), value, "preference".to_string(), 0.96));
    }

    if let Some(value) = extract_fragment_after(user_text, "call me ") {
        candidates.push(("preferred_name".to_string(), value, "preference".to_string(), 0.96));
    }

    if let Some(value) = extract_fragment_after(user_text, "i prefer ") {
        let key = format!("preference_{}", slugify_key(&value));
        candidates.push((key, value, "preference".to_string(), 0.9));
    }

    if let Some(value) = extract_fragment_after(user_text, "always use ") {
        let key = format!("workflow_{}", slugify_key(&value));
        candidates.push((key, value, "workflow".to_string(), 0.9));
    }

    if let Some(value) = extract_fragment_after(user_text, "we use ") {
        let key = format!("project_{}", slugify_key(&value));
        candidates.push((key, value, "project".to_string(), 0.85));
    }

    if let Some(value) = extract_fragment_after(user_text, "our project uses ") {
        let key = format!("project_{}", slugify_key(&value));
        candidates.push((key, value, "project".to_string(), 0.88));
    }

    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|(key, content, _, _)| seen.insert(format!("{key}:{content}")))
        .collect()
}

fn maybe_workspace_scope(workspace_id: &str) -> Option<&str> {
    (workspace_id != "__chat__").then_some(workspace_id)
}

fn resolve_memory_stores(
    state: &Arc<AppState>,
    workspace_id: &str,
    conversation_id: Option<&str>,
) -> Result<(MemoryStore, Vec<MemoryStore>), AppError> {
    let workspace_scope = maybe_workspace_scope(workspace_id);
    let chat_store = state.db.get_or_create_chat_memory_store(workspace_scope)?;
    let mut stores = vec![chat_store.clone()];
    let mut seen = HashSet::from([chat_store.id.clone()]);

    if state
        .db
        .get_setting("memory:chat_auto_access_shared")?
        .as_deref()
        == Some("true")
    {
        for store in state.db.list_memory_stores(workspace_scope)? {
            if store.scope_type == "shared"
                && store.chat_read_access == "read"
                && match workspace_scope {
                    Some(workspace_id) => store.workspace_id.as_deref() == Some(workspace_id),
                    None => store.workspace_id.is_none(),
                }
                && seen.insert(store.id.clone())
            {
                stores.push(store);
            }
        }
    }

    if let Some(agent_id) = conversation_id {
        for store in state.db.list_agent_memory_stores(agent_id)? {
            if seen.insert(store.id.clone()) {
                stores.push(store);
            }
        }
    }

    Ok((chat_store, stores))
}

fn score_memory_entry(entry: &MemoryEntry, store: &MemoryStore, query_terms: &[String], preferred_agent_id: Option<&str>, chat_store_id: &str) -> i64 {
    let mut score = 0_i64;
    let key = entry.key.to_lowercase();
    let content = entry.content.to_lowercase();

    if entry.is_pinned {
        score += 50;
    }
    if store.id == chat_store_id {
        score += 25;
    }
    if let Some(agent_id) = preferred_agent_id {
        if store.primary_for_agent_ids.iter().any(|id| id == agent_id) {
            score += 35;
        } else if store.linked_agent_ids.iter().any(|id| id == agent_id) {
            score += 20;
        }
    }

    for term in query_terms {
        if key == *term {
            score += 40;
        } else if key.contains(term) {
            score += 18;
        }
        if content.contains(term) {
            score += 10;
        }
    }

    score += (entry.confidence * 10.0).round() as i64;
    score += entry.recall_count.min(10);
    score
}

fn build_memory_context(
    state: &Arc<AppState>,
    workspace_id: &str,
    conversation_id: Option<&str>,
    content: &str,
) -> Result<Option<String>, AppError> {
    let (chat_store, stores) = resolve_memory_stores(state, workspace_id, conversation_id)?;
    let query_terms = split_terms(content);
    if query_terms.is_empty() {
        return Ok(None);
    }

    let mut matches = Vec::<(MemoryStore, MemoryEntry, i64)>::new();
    for store in &stores {
        for entry in state.db.list_memory_entries(&store.id)? {
            let score = score_memory_entry(&entry, store, &query_terms, conversation_id, &chat_store.id);
            if score > 0 {
                matches.push((store.clone(), entry, score));
            }
        }
    }

    matches.sort_by(|a, b| b.2.cmp(&a.2));
    matches.truncate(6);

    if matches.is_empty() {
        return Ok(None);
    }

    let now = chrono::Utc::now().to_rfc3339();
    for (_, entry, _) in &matches {
        let mut updated = entry.clone();
        updated.recall_count += 1;
        updated.last_recalled_at = Some(now.clone());
        updated.updated_at = now.clone();
        let _ = state.db.update_memory_entry(&updated);
    }

    let lines = matches
        .into_iter()
        .map(|(store, entry, _)| {
            format!(
                "- [{}:{}] {}",
                store.scope_type,
                entry.key,
                entry.content.replace('\n', " ")
            )
        })
        .collect::<Vec<_>>();

    Ok(Some(format!(
        "Relevant saved memory:\nUse this only when it helps answer the user's request and prefer the latest user instruction if there is any conflict.\n{}",
        lines.join("\n")
    )))
}

fn augment_prompt_with_memory(
    state: &Arc<AppState>,
    workspace_id: &str,
    conversation_id: Option<&str>,
    content: &str,
) -> Result<String, AppError> {
    if let Some(memory_context) = build_memory_context(state, workspace_id, conversation_id, content)? {
        Ok(format!("{}\n\nUser request:\n{}", memory_context, content))
    } else {
        Ok(content.to_string())
    }
}

fn persist_memory_candidates(
    state: &Arc<AppState>,
    workspace_id: &str,
    conversation_id: Option<&str>,
    user_text: &str,
) -> Result<(), AppError> {
    let candidates = extract_memory_candidates(user_text);
    if candidates.is_empty() {
        return Ok(());
    }

    let store = state.db.get_or_create_chat_memory_store(maybe_workspace_scope(workspace_id))?;
    let existing = state.db.list_memory_entries(&store.id)?;

    for (key, content, kind, confidence) in candidates {
        if let Some(entry) = existing.iter().find(|entry| entry.key == key) {
            let mut updated = entry.clone();
            updated.content = content.clone();
            updated.kind = kind.clone();
            updated.confidence = updated.confidence.max(confidence);
            updated.source_conversation_id = conversation_id.map(ToOwned::to_owned);
            updated.updated_at = chrono::Utc::now().to_rfc3339();
            state.db.update_memory_entry(&updated)?;
        } else {
            let now = chrono::Utc::now().to_rfc3339();
            state.db.create_memory_entry(&MemoryEntry {
                id: uuid::Uuid::new_v4().to_string(),
                store_id: store.id.clone(),
                key,
                content,
                kind,
                source_session_id: None,
                source_conversation_id: conversation_id.map(ToOwned::to_owned),
                source_message_id: None,
                confidence,
                recall_count: 0,
                last_recalled_at: None,
                is_pinned: false,
                created_at: now.clone(),
                updated_at: now,
            })?;
        }
    }

    Ok(())
}

fn strip_internal_reminder_blocks(value: &str) -> String {
    let mut output = value.to_string();
    while let Some(start) = output.find("<system-reminder>") {
        if let Some(end_rel) = output[start..].find("</system-reminder>") {
            let end = start + end_rel + "</system-reminder>".len();
            output.replace_range(start..end, "");
        } else {
            output.truncate(start);
            break;
        }
    }
    output.trim().to_string()
}

#[tauri::command]
pub(crate) async fn khadim_create_session(
    state: State<'_, Arc<AppState>>,
    workspace_id: Option<String>,
    cwd_override: Option<String>,
) -> Result<KhadimSessionCreated, AppError> {
    let (resolved_workspace_id, cwd) = if let Some(workspace_id) = workspace_id {
        let workspace = state.db.get_workspace(&workspace_id)?;
        let base_cwd = if let Some(ref override_path) = cwd_override {
            let p = std::path::PathBuf::from(override_path);
            if p.is_dir() {
                p
            } else {
                std::path::PathBuf::from(workspace.worktree_path.unwrap_or(workspace.repo_path))
            }
        } else {
            std::path::PathBuf::from(workspace.worktree_path.unwrap_or(workspace.repo_path))
        };
        (workspace_id, base_cwd)
    } else {
        let configured_dir = state
            .db
            .get_setting("khadim:chat_directory")
            .ok()
            .flatten()
            .filter(|v| !v.is_empty());

        let dir = if let Some(path) = configured_dir {
            let p = std::path::PathBuf::from(&path);
            if p.is_dir() {
                p
            } else {
                let session_id = uuid::Uuid::new_v4().to_string();
                let tmp = std::env::temp_dir().join(format!("khadim-chat-{session_id}"));
                std::fs::create_dir_all(&tmp)?;
                tmp
            }
        } else {
            let session_id = uuid::Uuid::new_v4().to_string();
            let tmp = std::env::temp_dir().join(format!("khadim-chat-{session_id}"));
            std::fs::create_dir_all(&tmp)?;
            tmp
        };

        ("__chat__".to_string(), dir)
    };

    let id = state.khadim.create_session(resolved_workspace_id, cwd);
    Ok(KhadimSessionCreated { id })
}

#[tauri::command]
pub(crate) async fn khadim_list_models(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CatalogModelOption>, AppError> {
    crate::khadim_ai::model_settings::configured_model_options(&state.db)
}

#[tauri::command]
pub(crate) fn khadim_list_model_configs(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ModelConfig>, AppError> {
    crate::khadim_ai::model_settings::list_configs(&state.db)
}

#[tauri::command]
pub(crate) fn khadim_list_providers() -> Vec<ProviderOption> {
    crate::khadim_ai::model_settings::supported_providers()
}

#[tauri::command]
pub(crate) fn khadim_list_provider_statuses(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ProviderStatus>, AppError> {
    crate::khadim_ai::model_settings::provider_statuses(&state.db)
}

#[tauri::command]
pub(crate) fn khadim_save_provider_api_key(
    provider: String,
    api_key: String,
) -> Result<(), AppError> {
    crate::khadim_ai::model_settings::save_provider_api_key(&provider, &api_key)
}

#[tauri::command]
pub(crate) fn khadim_get_provider_api_key_masked(
    provider: String,
) -> Result<Option<String>, AppError> {
    let key = crate::khadim_ai::model_settings::saved_provider_api_key(&provider)?;
    Ok(key.map(|k| mask_api_key(&k)))
}

#[tauri::command]
pub(crate) fn khadim_get_provider_api_key(
    provider: String,
) -> Result<Option<String>, AppError> {
    crate::khadim_ai::model_settings::saved_provider_api_key(&provider)
}

#[tauri::command]
pub(crate) fn khadim_delete_provider_api_key(provider: String) -> Result<(), AppError> {
    crate::khadim_ai::model_settings::delete_provider_api_key(&provider)
}

#[tauri::command]
pub(crate) fn khadim_bulk_create_provider_models(
    state: State<'_, Arc<AppState>>,
    provider: String,
    models: Vec<BulkModelEntry>,
) -> Result<u32, AppError> {
    crate::khadim_ai::model_settings::bulk_create_provider_models(&state.db, &provider, &models)
}

#[tauri::command]
pub(crate) fn khadim_remove_provider_models(
    state: State<'_, Arc<AppState>>,
    provider: String,
) -> Result<u32, AppError> {
    crate::khadim_ai::model_settings::remove_provider_models(&state.db, &provider)
}

#[tauri::command]
pub(crate) async fn khadim_discover_models(
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<Vec<DiscoveredProviderModel>, AppError> {
    crate::khadim_ai::model_settings::discover_models(&provider, api_key, base_url).await
}

#[tauri::command]
pub(crate) fn khadim_create_model_config(
    state: State<'_, Arc<AppState>>,
    input: ModelConfigInput,
) -> Result<ModelConfig, AppError> {
    crate::khadim_ai::model_settings::create_config(&state.db, input)
}

#[tauri::command]
pub(crate) fn khadim_update_model_config(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: ModelConfigInput,
) -> Result<ModelConfig, AppError> {
    crate::khadim_ai::model_settings::update_config(&state.db, &id, input)
}

#[tauri::command]
pub(crate) fn khadim_delete_model_config(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    crate::khadim_ai::model_settings::delete_config(&state.db, &id)
}

#[tauri::command]
pub(crate) fn khadim_set_active_model_config(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    crate::khadim_ai::model_settings::set_active_config(&state.db, &id)
}

#[tauri::command]
pub(crate) fn khadim_set_default_model_config(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    crate::khadim_ai::model_settings::set_default_config(&state.db, &id)
}

#[tauri::command]
pub(crate) fn khadim_active_model(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<CatalogModelOption>, AppError> {
    crate::khadim_ai::model_settings::active_model_option(&state.db)
}

#[tauri::command]
pub(crate) async fn khadim_codex_auth_connected() -> Result<bool, AppError> {
    crate::khadim_ai::oauth::has_openai_codex_auth().await
}

#[tauri::command]
pub(crate) async fn khadim_codex_auth_start() -> Result<CodexSessionInfo, AppError> {
    crate::khadim_ai::oauth::start_openai_codex_login().await
}

#[tauri::command]
pub(crate) async fn khadim_codex_auth_status(
    session_id: String,
) -> Result<CodexLoginStatusResponse, AppError> {
    crate::khadim_ai::oauth::get_openai_codex_login_status(&session_id).await
}

#[tauri::command]
pub(crate) async fn khadim_codex_auth_complete(
    session_id: String,
    code: String,
) -> Result<(), AppError> {
    crate::khadim_ai::oauth::submit_openai_codex_manual_code(&session_id, &code).await
}

#[tauri::command]
pub(crate) async fn khadim_send_streaming(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: Option<String>,
    active_agent_id: Option<String>,
    content: String,
    model: Option<OpenCodeModelRef>,
) -> Result<(), AppError> {
    if let Some(conversation_id) = conversation_id.as_deref() {
        persist_user_message(state.inner(), conversation_id, &content)?;
    }

    let effective_prompt = content.clone();

    let session = state.khadim.get_session(&session_id)?;
    let state_arc = state.inner().clone();
    let app_handle = app.clone();
    let session_id_for_cleanup = session_id.clone();
    let session_id_for_error = session_id.clone();

    let plugins = state.plugins.clone();
    let skills = state.skills.clone();
    let khadim_mgr = state.khadim.clone();
    let db = state.db.as_ref().clone();
    let handle = tokio::spawn(async move {
        let (tx, mut rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
        let (held_tx, mut held_rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
        let stream = Arc::new(std::sync::Mutex::new(StreamAccumulator::new()));
        let stream_for_emit = stream.clone();
        let emit_handle = app_handle.clone();
        let emit_task = tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                if event.event_type == "done" || event.event_type == "error" {
                    let _ = held_tx.send(event);
                } else {
                    if event.event_type == "step_complete" {
                        if let Some(ref meta) = event.metadata {
                            let mut step = meta.clone();
                            step["status"] = json!("complete");
                            if let Some(ref c) = event.content {
                                if step.get("result").is_none() || step["result"].is_null() {
                                    step["result"] = json!(c);
                                }
                                if step.get("content").is_none() || step["content"].is_null() {
                                    step["content"] = json!(c);
                                }
                            }
                            stream_for_emit.lock().unwrap().push_step(step);
                        }
                    } else if event.event_type == "step_start" {
                        if let Some(ref meta) = event.metadata {
                            let mut step = meta.clone();
                            step["status"] = json!("running");
                            stream_for_emit.lock().unwrap().push_step(step);
                        }
                    } else if event.event_type == "text_delta" {
                        stream_for_emit
                            .lock()
                            .unwrap()
                            .push_text_delta(event.content.as_deref());
                    }
                    let _ = emit_handle.emit("agent-stream", &event);
                }
            }
        });

        let result = {
            let mut session = session.lock().await;
            session.active_conversation_id = conversation_id.clone();
            session.active_agent_id = active_agent_id.clone();
            match resolve_khadim_selection(&state_arc, model.as_ref()) {
                Ok(selection) => {
                    crate::khadim_agent::orchestrator::run_prompt_with_plugins(
                        &mut session,
                        &effective_prompt,
                        selection,
                        &tx,
                        Some(&plugins),
                        Some(&skills),
                        Some(&khadim_mgr),
                        Some(&app_handle),
                        Some(db),
                    )
                    .await
                }
                Err(error) => Err(error),
            }
        };

        drop(tx);
        let _ = emit_task.await;

        match result {
            Ok(text) => {
                let text = strip_internal_reminder_blocks(&text);
                let metadata = {
                    let mut stream = stream.lock().unwrap();
                    let mut raw = stream.take_thinking_steps();
                    let mut seen = std::collections::HashSet::new();
                    let mut deduped = Vec::new();
                    for step in raw.drain(..).rev() {
                        let id = step
                            .get("id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        if id.is_empty() || seen.insert(id) {
                            deduped.push(step);
                        }
                    }
                    deduped.reverse();
                    if deduped.is_empty() {
                        None
                    } else {
                        Some(json!({ "thinkingSteps": deduped }).to_string())
                    }
                };

                if let Some(conversation_id) = conversation_id.as_deref() {
                    let _ = persist_assistant_message(&state_arc, conversation_id, &text, metadata);
                }
                let _ = persist_memory_candidates(&state_arc, &workspace_id, conversation_id.as_deref(), &content);
                while let Ok(event) = held_rx.try_recv() {
                    let _ = app_handle.emit("agent-stream", &event);
                }
            }
            Err(error) => {
                emit_error_and_done(
                    &app_handle,
                    workspace_id,
                    session_id_for_error.clone(),
                    error.message.clone(),
                );
            }
        }

        state_arc.khadim.clear_run(&session_id_for_cleanup);
    });

    state.khadim.track_run(session_id, handle);
    Ok(())
}

#[tauri::command]
pub(crate) async fn khadim_send_message(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: Option<String>,
    active_agent_id: Option<String>,
    content: String,
    model: Option<OpenCodeModelRef>,
) -> Result<String, AppError> {
    if let Some(conversation_id) = conversation_id.as_deref() {
        persist_user_message(state.inner(), conversation_id, &content)?;
    }

    let effective_prompt = content.clone();

    let session = state.khadim.get_session(&session_id)?;
    let (tx, _rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
    let selection = resolve_khadim_selection(state.inner(), model.as_ref())?;
    let plugins = state.plugins.clone();
    let skills = state.skills.clone();
    let khadim_mgr = state.khadim.clone();
    let db = state.db.as_ref().clone();
    let text = strip_internal_reminder_blocks(&{
        let mut session = session.lock().await;
        session.active_conversation_id = conversation_id.clone();
        session.active_agent_id = active_agent_id.clone();
        crate::khadim_agent::orchestrator::run_prompt_with_plugins(
            &mut session,
            &effective_prompt,
            selection,
            &tx,
            Some(&plugins),
            Some(&skills),
            Some(&khadim_mgr),
            Some(&app),
            Some(db),
        )
        .await?
    });

    if let Some(conversation_id) = conversation_id.as_deref() {
        persist_assistant_message(state.inner(), conversation_id, &text, None)?;
    }
    persist_memory_candidates(state.inner(), &workspace_id, conversation_id.as_deref(), &content)?;

    let _ = workspace_id;
    Ok(text)
}

#[tauri::command]
pub(crate) async fn khadim_abort(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), AppError> {
    state.khadim.abort(&session_id).await
}

#[tauri::command]
pub(crate) fn khadim_answer_question(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    answer: String,
) -> Result<(), AppError> {
    state.khadim.answer_question(&session_id, answer)
}
