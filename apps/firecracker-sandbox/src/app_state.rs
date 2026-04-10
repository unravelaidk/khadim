use std::{collections::HashMap, sync::Arc};

use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{
    config::Config,
    error::AppError,
    models::{CommandResponse, CreateSandboxRequest, ExposeResponse, ProcessResponse, SandboxRecord, SandboxState, VmConfig, VmConfigRequest},
    runtime::{FirecrackerRuntime, LaunchVmRequest, SharedVmRuntime, VmRuntimeHandle},
};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    sandboxes: Arc<RwLock<HashMap<String, SandboxRecord>>>,
    runtime_handles: Arc<RwLock<HashMap<String, VmRuntimeHandle>>>,
    runtime: SharedVmRuntime,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        Self::with_runtime(config, FirecrackerRuntime::shared())
    }

    pub fn with_runtime(config: Config, runtime: SharedVmRuntime) -> Self {
        Self {
            config,
            sandboxes: Arc::new(RwLock::new(HashMap::new())),
            runtime_handles: Arc::new(RwLock::new(HashMap::new())),
            runtime,
        }
    }

    pub async fn create_sandbox(
        &self,
        request: CreateSandboxRequest,
    ) -> Result<SandboxRecord, AppError> {
        let substrate = request.substrate.unwrap_or_else(|| "firecracker".to_string());
        if substrate != "firecracker" {
            return Err(AppError::UnsupportedSubstrate(substrate));
        }

        let id = Uuid::new_v4().to_string();
        let vm = merge_vm_config(&self.config, request.vm);
        let handle = self
            .runtime
            .launch(
                &self.config,
                LaunchVmRequest {
                    sandbox_id: id.clone(),
                    vm: vm.clone(),
                },
            )
            .await?;
        let microvm_id = format!("fc-{}", &id[..8]);
        let record = SandboxRecord {
            id: id.clone(),
            sandbox_id: id.clone(),
            microvm_id,
            state: SandboxState::Running,
            substrate,
            lifetime: request.lifetime.unwrap_or_else(|| "15m".to_string()),
            vm,
            runtime: (&handle).into(),
            created_at: chrono::Utc::now(),
        };

        self.sandboxes.write().await.insert(id, record.clone());
        self.runtime_handles
            .write()
            .await
            .insert(record.id.clone(), handle);
        Ok(record)
    }

    pub async fn get_sandbox(&self, id: &str) -> Result<SandboxRecord, AppError> {
        self.sandboxes
            .read()
            .await
            .get(id)
            .cloned()
            .ok_or(AppError::NotFound)
    }

    pub async fn delete_sandbox(&self, id: &str) -> Result<(), AppError> {
        let handle = self.runtime_handles.write().await.remove(id);
        if let Some(handle) = handle {
            self.runtime.terminate(&handle).await?;
        }

        self.sandboxes
            .write()
            .await
            .remove(id)
            .map(|_| ())
            .ok_or(AppError::NotFound)
    }

    pub async fn read_file(&self, id: &str, path: &str) -> Result<String, AppError> {
        let handle = self.get_runtime_handle(id).await?;
        self.runtime.read_file(&handle, path).await
    }

    pub async fn write_file(&self, id: &str, path: &str, content: &str) -> Result<(), AppError> {
        let handle = self.get_runtime_handle(id).await?;
        self.runtime.write_file(&handle, path, content).await
    }

    pub async fn exec(&self, id: &str, mode: Option<&str>, script: &str) -> Result<CommandResponse, AppError> {
        let handle = self.get_runtime_handle(id).await?;
        self.runtime.exec(&handle, mode, script).await
    }

    pub async fn spawn(
        &self,
        id: &str,
        command: &[String],
        cwd: Option<&str>,
        env: Option<&std::collections::HashMap<String, String>>,
    ) -> Result<ProcessResponse, AppError> {
        let handle = self.get_runtime_handle(id).await?;
        self.runtime.spawn(&handle, command, cwd, env).await
    }

    pub async fn expose_port(&self, id: &str, port: u16) -> Result<ExposeResponse, AppError> {
        let handle = self.get_runtime_handle(id).await?;
        self.runtime.expose_port(&handle, port).await
    }

    async fn get_runtime_handle(&self, id: &str) -> Result<VmRuntimeHandle, AppError> {
        self.runtime_handles
            .read()
            .await
            .get(id)
            .cloned()
            .ok_or(AppError::NotFound)
    }
}

fn merge_vm_config(config: &Config, requested: Option<VmConfigRequest>) -> VmConfig {
    let requested = requested.unwrap_or(VmConfigRequest {
        vcpu_count: None,
        memory_mib: None,
        kernel_image: None,
        rootfs_image: None,
        snapshot_id: None,
        network_policy: None,
    });

    VmConfig {
        vcpu_count: requested.vcpu_count.unwrap_or(config.default_vcpu_count),
        memory_mib: requested.memory_mib.unwrap_or(config.default_memory_mib),
        kernel_image: requested.kernel_image.or_else(|| config.default_kernel_image.clone()),
        rootfs_image: requested.rootfs_image.or_else(|| config.default_rootfs_image.clone()),
        snapshot_id: requested.snapshot_id,
        network_policy: requested.network_policy,
    }
}
