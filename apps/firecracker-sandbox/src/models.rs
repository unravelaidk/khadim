use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct SandboxRecord {
    pub id: String,
    pub sandbox_id: String,
    pub microvm_id: String,
    pub state: SandboxState,
    pub substrate: String,
    pub lifetime: String,
    pub vm: VmConfig,
    pub runtime: SandboxRuntimeInfo,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxRuntimeInfo {
    pub pid: u32,
    pub api_socket: String,
    pub runtime_dir: String,
    pub rootfs_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub enum SandboxState {
    Creating,
    Running,
    Stopping,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VmConfig {
    pub vcpu_count: u8,
    pub memory_mib: u32,
    pub kernel_image: Option<String>,
    pub rootfs_image: Option<String>,
    pub snapshot_id: Option<String>,
    pub network_policy: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSandboxRequest {
    pub lifetime: Option<String>,
    pub substrate: Option<String>,
    #[serde(default)]
    pub vm: Option<VmConfigRequest>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VmConfigRequest {
    pub vcpu_count: Option<u8>,
    pub memory_mib: Option<u32>,
    pub kernel_image: Option<String>,
    pub rootfs_image: Option<String>,
    pub snapshot_id: Option<String>,
    pub network_policy: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FileContentResponse {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct WriteFileRequest {
    pub content: String,
    pub encoding: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GuestWriteFileRequest {
    pub path: String,
    pub content: String,
    pub encoding: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GuestReadFileRequest {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct CommandRequest {
    pub mode: Option<String>,
    pub script: String,
}

#[derive(Debug, Deserialize)]
pub struct GuestExecRequest {
    pub command: String,
    pub timeout: Option<u64>,
    pub workdir: Option<String>,
    pub trace: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResponse {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Deserialize)]
pub struct ProcessRequest {
    pub command: Vec<String>,
    pub cwd: Option<String>,
    pub env: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Serialize)]
pub struct ProcessResponse {
    pub pid: u32,
}

#[derive(Debug, Deserialize)]
pub struct ExposeRequest {
    pub port: u16,
}

#[derive(Debug, Serialize)]
pub struct ExposeResponse {
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub service: &'static str,
}
