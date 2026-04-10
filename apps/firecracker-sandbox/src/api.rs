use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::{
    app_state::AppState,
    error::AppError,
    models::{
        CommandRequest, CommandResponse, CreateSandboxRequest, ExposeRequest, ExposeResponse,
        FileContentResponse, HealthResponse, ProcessRequest, ProcessResponse, WriteFileRequest,
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/v1/sandboxes", post(create_sandbox))
        .route("/v1/sandboxes/:id", get(get_sandbox).delete(delete_sandbox))
        .route("/v1/sandboxes/:id/files", get(read_file).put(write_file))
        .route("/v1/sandboxes/:id/commands", post(run_command))
        .route("/v1/sandboxes/:id/processes", post(start_process))
        .route("/v1/sandboxes/:id/network/expose", post(expose_port))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "khadim-firecracker-sandbox",
    })
}

async fn create_sandbox(
    State(state): State<AppState>,
    Json(request): Json<CreateSandboxRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let sandbox = state.create_sandbox(request).await?;
    Ok(Json(json!({
        "id": sandbox.id,
        "sandboxId": sandbox.sandbox_id,
        "microvmId": sandbox.microvm_id,
        "containerId": sandbox.microvm_id,
        "state": sandbox.state,
        "substrate": sandbox.substrate,
        "lifetime": sandbox.lifetime,
        "vm": sandbox.vm,
        "createdAt": sandbox.created_at,
    })))
}

async fn get_sandbox(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let sandbox = state.get_sandbox(&id).await?;
    Ok(Json(json!({
        "id": sandbox.id,
        "sandboxId": sandbox.sandbox_id,
        "microvmId": sandbox.microvm_id,
        "containerId": sandbox.microvm_id,
        "state": sandbox.state,
        "substrate": sandbox.substrate,
        "lifetime": sandbox.lifetime,
        "vm": sandbox.vm,
        "createdAt": sandbox.created_at,
    })))
}

async fn delete_sandbox(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    state.delete_sandbox(&id).await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct FileQuery {
    path: String,
}

async fn read_file(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<FileQuery>,
) -> Result<Json<FileContentResponse>, AppError> {
    Ok(Json(FileContentResponse {
        content: state.read_file(&id, &query.path).await?,
    }))
}

async fn write_file(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<FileQuery>,
    Json(request): Json<WriteFileRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    state.write_file(&id, &query.path, &request.content).await?;
    let _encoding = request.encoding.unwrap_or_else(|| "utf8".to_string());
    Ok(Json(json!({
        "ok": true,
        "path": query.path,
        "bytes": request.content.len(),
    })))
}

async fn run_command(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<CommandRequest>,
) -> Result<Json<CommandResponse>, AppError> {
    Ok(Json(
        state
            .exec(&id, request.mode.as_deref(), &request.script)
            .await?,
    ))
}

async fn start_process(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<ProcessRequest>,
) -> Result<Json<ProcessResponse>, AppError> {
    if request.command.is_empty() {
        return Err(AppError::BadRequest("command is required".to_string()));
    }

    Ok(Json(
        state
            .spawn(&id, &request.command, request.cwd.as_deref(), request.env.as_ref())
            .await?,
    ))
}

async fn expose_port(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<ExposeRequest>,
) -> Result<Json<ExposeResponse>, AppError> {
    Ok(Json(state.expose_port(&id, request.port).await?))
}

#[cfg(test)]
mod tests {
    use crate::{
        app_state::AppState,
        config::Config,
        models::{CreateSandboxRequest, VmConfigRequest},
        runtime::StubRuntime,
    };

    #[tokio::test]
    async fn creates_and_fetches_sandbox() {
        let state = AppState::with_runtime(Config::from_env(), StubRuntime::shared());
        let sandbox = state
            .create_sandbox(CreateSandboxRequest {
                lifetime: Some("15m".to_string()),
                substrate: Some("firecracker".to_string()),
                vm: Some(VmConfigRequest {
                    vcpu_count: Some(2),
                    memory_mib: Some(1024),
                    kernel_image: None,
                    rootfs_image: None,
                    snapshot_id: None,
                    network_policy: Some("default-deny".to_string()),
                }),
            })
            .await
            .unwrap();

        let fetched = state.get_sandbox(&sandbox.id).await.unwrap();
        assert_eq!(fetched.id, sandbox.id);
        assert_eq!(fetched.vm.memory_mib, 1024);
        assert_eq!(fetched.runtime.pid, 42);
    }
}
