use std::{collections::HashMap, path::{Path, PathBuf}, process::Stdio, sync::Arc, time::{Duration, Instant}};

use async_trait::async_trait;
use serde::Serialize;
use serde_json::{json, Value};
use tokio::{fs, io::{AsyncReadExt, AsyncWriteExt}, net::UnixStream, process::Command, time::sleep};
use tracing::{info, warn};

use crate::{config::Config, error::AppError, models::{CommandResponse, ExposeResponse, ProcessResponse, SandboxRuntimeInfo, VmConfig}};

#[derive(Debug, Clone)]
pub struct LaunchVmRequest {
    pub sandbox_id: String,
    pub vm: VmConfig,
}

#[derive(Debug, Clone)]
pub struct VmRuntimeHandle {
    pub pid: u32,
    pub api_socket: String,
    pub runtime_dir: String,
    pub rootfs_path: String,
    pub host_ip: Option<String>,
    pub guest_ip: Option<String>,
    pub ssh_user: Option<String>,
    pub ssh_port: Option<u16>,
    pub ssh_private_key_path: Option<String>,
}

#[async_trait]
pub trait VmRuntime: Send + Sync {
    async fn launch(&self, config: &Config, request: LaunchVmRequest) -> Result<VmRuntimeHandle, AppError>;
    async fn terminate(&self, handle: &VmRuntimeHandle) -> Result<(), AppError>;
    async fn read_file(&self, _handle: &VmRuntimeHandle, _path: &str) -> Result<String, AppError> {
        Err(AppError::NotImplemented("guest file access is not implemented yet".to_string()))
    }
    async fn write_file(&self, _handle: &VmRuntimeHandle, _path: &str, _content: &str) -> Result<(), AppError> {
        Err(AppError::NotImplemented("guest file access is not implemented yet".to_string()))
    }
    async fn exec(&self, _handle: &VmRuntimeHandle, _mode: Option<&str>, _script: &str) -> Result<CommandResponse, AppError> {
        Err(AppError::NotImplemented("guest command execution is not implemented yet".to_string()))
    }
    async fn spawn(&self, _handle: &VmRuntimeHandle, _command: &[String], _cwd: Option<&str>, _env: Option<&std::collections::HashMap<String, String>>) -> Result<ProcessResponse, AppError> {
        Err(AppError::NotImplemented("guest process spawning is not implemented yet".to_string()))
    }
    async fn expose_port(&self, _handle: &VmRuntimeHandle, _port: u16) -> Result<ExposeResponse, AppError> {
        Err(AppError::NotImplemented("port exposure is not implemented yet".to_string()))
    }
}

pub type SharedVmRuntime = Arc<dyn VmRuntime>;

#[derive(Default)]
pub struct FirecrackerRuntime;

impl FirecrackerRuntime {
    pub fn shared() -> SharedVmRuntime {
        Arc::new(Self)
    }
}

#[async_trait]
impl VmRuntime for FirecrackerRuntime {
    async fn launch(&self, config: &Config, request: LaunchVmRequest) -> Result<VmRuntimeHandle, AppError> {
        ensure_host_prerequisites(config, &request.vm)?;

        let ssh_enabled = config.tap_device.is_some() && config.guest_ip.is_some();
        if ssh_enabled {
            ensure_ssh_keypair(config).await?;
        }

        let runtime_dir = PathBuf::from(&config.runtime_dir).join(&request.sandbox_id);
        fs::create_dir_all(&runtime_dir).await?;

        let result: Result<VmRuntimeHandle, AppError> = async {
            let kernel_image = request
                .vm
                .kernel_image
                .clone()
                .ok_or_else(|| AppError::BadRequest("kernelImage is required for Firecracker sandboxes".to_string()))?;
            let base_rootfs = request
                .vm
                .rootfs_image
                .clone()
                .ok_or_else(|| AppError::BadRequest("rootfsImage is required for Firecracker sandboxes".to_string()))?;

            let api_socket = runtime_dir.join("firecracker.sock");
            let stdout_log = runtime_dir.join("firecracker.stdout.log");
            let stderr_log = runtime_dir.join("firecracker.stderr.log");
            let rootfs_path = runtime_dir.join("rootfs.ext4");

            fs::copy(&base_rootfs, &rootfs_path).await.map_err(|error| {
                AppError::Runtime(format!(
                    "failed to clone rootfs from {} to {}: {}",
                    base_rootfs,
                    rootfs_path.display(),
                    error
                ))
            })?;

            if ssh_enabled {
                configure_rootfs_for_ssh(&rootfs_path, config).await?;
            }

            let stdout = std::fs::File::create(&stdout_log)?;
            let stderr = std::fs::File::create(&stderr_log)?;

            let mut command = Command::new(&config.firecracker_binary);
            command
                .arg("--api-sock")
                .arg(&api_socket)
                .stdout(Stdio::from(stdout))
                .stderr(Stdio::from(stderr));

            if config.firecracker_id_flag {
                command.arg("--id").arg(&request.sandbox_id);
            }

            let mut child = command.spawn().map_err(|error| {
                AppError::Runtime(format!(
                    "failed to spawn firecracker binary {}: {}",
                    config.firecracker_binary, error
                ))
            })?;

            let pid = child
                .id()
                .ok_or_else(|| AppError::Runtime("firecracker process did not expose a pid".to_string()))?;

            wait_for_socket(&api_socket, Duration::from_millis(config.startup_timeout_ms), &mut child).await?;

            let client = FirecrackerApiClient::new(api_socket.clone());
            client
                .put_json(
                    "/machine-config",
                    &json!({
                        "vcpu_count": request.vm.vcpu_count,
                        "mem_size_mib": request.vm.memory_mib,
                        "smt": false,
                        "track_dirty_pages": false,
                    }),
                )
                .await?;
            client
                .put_json(
                    "/boot-source",
                    &json!({
                        "kernel_image_path": kernel_image,
                        "boot_args": config.boot_args,
                    }),
                )
                .await?;
            client
                .put_json(
                    "/drives/rootfs",
                    &json!({
                        "drive_id": "rootfs",
                        "path_on_host": rootfs_path,
                        "is_root_device": true,
                        "is_read_only": false,
                    }),
                )
                .await?;

            if let Some(tap_device) = config.tap_device.clone() {
                client
                    .put_json(
                        "/network-interfaces/eth0",
                        &json!({
                            "iface_id": "eth0",
                            "host_dev_name": tap_device,
                            "guest_mac": config.guest_mac,
                        }),
                    )
                    .await?;
            }

            client
                .put_json("/actions", &json!({ "action_type": "InstanceStart" }))
                .await?;

            if ssh_enabled {
                wait_for_guest_ssh(config).await?;
            }

            info!(sandbox_id = request.sandbox_id, pid, "started firecracker microVM");

            Ok(VmRuntimeHandle {
                pid,
                api_socket: api_socket.display().to_string(),
                runtime_dir: runtime_dir.display().to_string(),
                rootfs_path: rootfs_path.display().to_string(),
                host_ip: config.host_ip.clone(),
                guest_ip: config.guest_ip.clone(),
                ssh_user: ssh_enabled.then(|| config.ssh_user.clone()),
                ssh_port: ssh_enabled.then_some(config.ssh_port),
                ssh_private_key_path: ssh_enabled.then(|| config.ssh_private_key_path.clone()),
            })
        }
        .await;

        if result.is_err() {
            let _ = fs::remove_dir_all(&runtime_dir).await;
        }

        result
    }

    async fn terminate(&self, handle: &VmRuntimeHandle) -> Result<(), AppError> {
        terminate_pid(handle.pid).await;
        let runtime_dir = PathBuf::from(&handle.runtime_dir);
        if let Err(error) = fs::remove_dir_all(&runtime_dir).await {
            warn!(path = %runtime_dir.display(), %error, "failed to remove runtime dir");
        }
        Ok(())
    }

    async fn read_file(&self, handle: &VmRuntimeHandle, path: &str) -> Result<String, AppError> {
        let result = run_ssh_command(handle, &["cat".to_string(), path.to_string()]).await?;
        if result.exit_code != 0 {
            return Err(AppError::Runtime(format!("failed to read guest file {}: {}", path, result.stderr)));
        }
        Ok(result.stdout)
    }

    async fn write_file(&self, handle: &VmRuntimeHandle, path: &str, content: &str) -> Result<(), AppError> {
        let parent = Path::new(path)
            .parent()
            .and_then(|value| value.to_str())
            .unwrap_or("/");
        let mkdir_result = run_ssh_shell(handle, &format!("mkdir -p {}", shell_escape(parent))).await?;
        if mkdir_result.exit_code != 0 {
            return Err(AppError::Runtime(format!("failed to create guest dir {}: {}", parent, mkdir_result.stderr)));
        }

        let temp_path = PathBuf::from(&handle.runtime_dir).join("upload.tmp");
        fs::write(&temp_path, content).await?;

        let destination = guest_target(handle, path)?;
        let output = Command::new("scp")
            .arg("-q")
            .arg("-i")
            .arg(handle.ssh_private_key_path.as_deref().unwrap_or_default())
            .arg("-P")
            .arg(handle.ssh_port.unwrap_or(22).to_string())
            .arg("-o")
            .arg("StrictHostKeyChecking=no")
            .arg("-o")
            .arg("UserKnownHostsFile=/dev/null")
            .arg(&temp_path)
            .arg(destination)
            .output()
            .await?;

        let _ = fs::remove_file(&temp_path).await;

        if !output.status.success() {
            return Err(AppError::Runtime(format!(
                "failed to copy guest file {}: {}",
                path,
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(())
    }

    async fn exec(&self, handle: &VmRuntimeHandle, _mode: Option<&str>, script: &str) -> Result<CommandResponse, AppError> {
        run_ssh_shell(handle, script).await
    }

    async fn spawn(&self, handle: &VmRuntimeHandle, command: &[String], cwd: Option<&str>, env: Option<&HashMap<String, String>>) -> Result<ProcessResponse, AppError> {
        if command.is_empty() {
            return Err(AppError::BadRequest("command is required".to_string()));
        }

        let env_prefix = env
            .map(|values| {
                values
                    .iter()
                    .map(|(key, value)| format!("{}={}", key, shell_escape(value)))
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .filter(|value| !value.is_empty())
            .map(|value| format!("export {} && ", value))
            .unwrap_or_default();
        let cwd_prefix = cwd
            .map(|value| format!("cd {} && ", shell_escape(value)))
            .unwrap_or_default();
        let command_str = command.iter().map(|value| shell_escape(value)).collect::<Vec<_>>().join(" ");
        let script = format!("{}{}nohup {} >/tmp/khadim-spawn.log 2>&1 & echo $!", env_prefix, cwd_prefix, command_str);

        let result = run_ssh_shell(handle, &script).await?;
        if result.exit_code != 0 {
            return Err(AppError::Runtime(format!("failed to spawn guest process: {}", result.stderr)));
        }

        let pid = result
            .stdout
            .trim()
            .parse::<u32>()
            .map_err(|error| AppError::Runtime(format!("failed to parse guest pid '{}': {}", result.stdout.trim(), error)))?;
        Ok(ProcessResponse { pid })
    }

    async fn expose_port(&self, handle: &VmRuntimeHandle, port: u16) -> Result<ExposeResponse, AppError> {
        let target_ip = handle
            .host_ip
            .as_deref()
            .or(handle.guest_ip.as_deref())
            .ok_or_else(|| AppError::BadRequest("guest networking is not configured. Set FIRECRACKER_TAP_DEVICE and FIRECRACKER_GUEST_IP.".to_string()))?;
        Ok(ExposeResponse {
            url: format!("http://{}:{}", target_ip, port),
        })
    }
}

fn ensure_host_prerequisites(config: &Config, vm: &VmConfig) -> Result<(), AppError> {
    if !Path::new(&config.firecracker_binary).exists() && !binary_exists(&config.firecracker_binary) {
        return Err(AppError::BadRequest(format!(
            "Firecracker binary not found. Set FIRECRACKER_BIN to a valid executable path. Current value: {}",
            config.firecracker_binary
        )));
    }

    let kernel_image = vm
        .kernel_image
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("kernelImage is required for Firecracker sandboxes. Set FIRECRACKER_KERNEL_IMAGE.".to_string()))?;
    if !Path::new(kernel_image).exists() {
        return Err(AppError::BadRequest(format!(
            "Firecracker kernel image not found at {}. Set FIRECRACKER_KERNEL_IMAGE to an existing vmlinux path.",
            kernel_image
        )));
    }

    let rootfs_image = vm
        .rootfs_image
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("rootfsImage is required for Firecracker sandboxes. Set FIRECRACKER_ROOTFS_IMAGE.".to_string()))?;
    if !Path::new(rootfs_image).exists() {
        return Err(AppError::BadRequest(format!(
            "Firecracker rootfs image not found at {}. Set FIRECRACKER_ROOTFS_IMAGE to an existing ext4 image.",
            rootfs_image
        )));
    }

    if config.tap_device.is_some() && config.guest_ip.is_none() {
        return Err(AppError::BadRequest(
            "FIRECRACKER_GUEST_IP is required when FIRECRACKER_TAP_DEVICE is set.".to_string(),
        ));
    }

    if let Some(tap_device) = config.tap_device.as_deref() {
        let tap_path = PathBuf::from("/sys/class/net").join(tap_device);
        if !tap_path.exists() {
            return Err(AppError::BadRequest(format!(
                "Firecracker tap device {} does not exist. Create it first and assign the host-side IP before enabling guest SSH.",
                tap_device
            )));
        }
    }

    Ok(())
}

async fn ensure_ssh_keypair(config: &Config) -> Result<(), AppError> {
    if Path::new(&config.ssh_private_key_path).exists() && Path::new(&config.ssh_public_key_path).exists() {
        return Ok(());
    }

    if let Some(parent) = Path::new(&config.ssh_private_key_path).parent() {
        fs::create_dir_all(parent).await?;
    }

    let output = Command::new("ssh-keygen")
        .arg("-t")
        .arg("ed25519")
        .arg("-N")
        .arg("")
        .arg("-f")
        .arg(&config.ssh_private_key_path)
        .arg("-C")
        .arg("khadim-firecracker")
        .output()
        .await?;

    if !output.status.success() {
        return Err(AppError::Runtime(format!(
            "failed to create Firecracker SSH keypair: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

async fn configure_rootfs_for_ssh(rootfs_path: &Path, config: &Config) -> Result<(), AppError> {
    let public_key = fs::read_to_string(&config.ssh_public_key_path).await?;
    let authorized_keys_temp = rootfs_path
        .parent()
        .unwrap_or_else(|| Path::new("/tmp"))
        .join("authorized_keys");
    fs::write(&authorized_keys_temp, public_key).await?;

    let mut commands = vec![
        "set_inode_field /root uid_lo 0".to_string(),
        "set_inode_field /root gid 0".to_string(),
        "set_inode_field /root mode 040700".to_string(),
        "set_inode_field /root/.ssh uid_lo 0".to_string(),
        "set_inode_field /root/.ssh gid 0".to_string(),
        "set_inode_field /root/.ssh mode 040700".to_string(),
        format!("write {} /root/.ssh/authorized_keys", authorized_keys_temp.display()),
        "set_inode_field /root/.ssh/authorized_keys uid_lo 0".to_string(),
        "set_inode_field /root/.ssh/authorized_keys gid 0".to_string(),
        "set_inode_field /root/.ssh/authorized_keys mode 0100600".to_string(),
    ];

    let mut command = Command::new("debugfs");
    command.arg("-w");
    for debugfs_cmd in commands.drain(..) {
        command.arg("-R").arg(debugfs_cmd);
    }
    command.arg(rootfs_path);

    let output = command.output().await?;
    let _ = fs::remove_file(&authorized_keys_temp).await;

    if !output.status.success() {
        return Err(AppError::Runtime(format!(
            "failed to patch rootfs for SSH access: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

async fn wait_for_guest_ssh(config: &Config) -> Result<(), AppError> {
    let guest_ip = config
        .guest_ip
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("FIRECRACKER_GUEST_IP is required for guest SSH".to_string()))?;

    let started_at = Instant::now();
    while started_at.elapsed() < Duration::from_millis(config.ssh_wait_timeout_ms) {
        let output = Command::new("ssh")
            .arg("-q")
            .arg("-i")
            .arg(&config.ssh_private_key_path)
            .arg("-p")
            .arg(config.ssh_port.to_string())
            .arg("-o")
            .arg("BatchMode=yes")
            .arg("-o")
            .arg("StrictHostKeyChecking=no")
            .arg("-o")
            .arg("UserKnownHostsFile=/dev/null")
            .arg("-o")
            .arg("ConnectTimeout=2")
            .arg(format!("{}@{}", config.ssh_user, guest_ip))
            .arg("true")
            .output()
            .await?;

        if output.status.success() {
            return Ok(());
        }

        sleep(Duration::from_millis(500)).await;
    }

    Err(AppError::Runtime(
        "timed out waiting for SSH in the guest. Ensure tap networking is configured and the guest is reachable."
            .to_string(),
    ))
}

fn guest_target(handle: &VmRuntimeHandle, path: &str) -> Result<String, AppError> {
    let guest_ip = handle
        .guest_ip
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("guest networking is not configured. Set FIRECRACKER_TAP_DEVICE and FIRECRACKER_GUEST_IP.".to_string()))?;
    let ssh_user = handle
        .ssh_user
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("guest SSH is not configured for this sandbox.".to_string()))?;
    Ok(format!("{}@{}:{}", ssh_user, guest_ip, path))
}

async fn run_ssh_shell(handle: &VmRuntimeHandle, script: &str) -> Result<CommandResponse, AppError> {
    run_ssh_command(handle, &["sh".to_string(), "-lc".to_string(), script.to_string()]).await
}

async fn run_ssh_command(handle: &VmRuntimeHandle, remote_command: &[String]) -> Result<CommandResponse, AppError> {
    let guest_ip = handle
        .guest_ip
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("guest networking is not configured. Set FIRECRACKER_TAP_DEVICE and FIRECRACKER_GUEST_IP.".to_string()))?;
    let ssh_key_path = handle
        .ssh_private_key_path
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("guest SSH is not configured for this sandbox.".to_string()))?;
    let ssh_user = handle
        .ssh_user
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("guest SSH is not configured for this sandbox.".to_string()))?;
    let ssh_port = handle
        .ssh_port
        .ok_or_else(|| AppError::BadRequest("guest SSH is not configured for this sandbox.".to_string()))?;

    let output = Command::new("ssh")
        .arg("-q")
        .arg("-i")
        .arg(ssh_key_path)
        .arg("-p")
        .arg(ssh_port.to_string())
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("StrictHostKeyChecking=no")
        .arg("-o")
        .arg("UserKnownHostsFile=/dev/null")
        .arg("-o")
        .arg("ConnectTimeout=5")
        .arg(format!("{}@{}", ssh_user, guest_ip))
        .args(remote_command)
        .output()
        .await?;

    Ok(CommandResponse {
        exit_code: output.status.code().unwrap_or(255),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn shell_escape(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn binary_exists(name: &str) -> bool {
    std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).any(|path| path.join(name).exists()))
        .unwrap_or(false)
}

struct FirecrackerApiClient {
    socket_path: PathBuf,
}

impl FirecrackerApiClient {
    fn new(socket_path: PathBuf) -> Self {
        Self { socket_path }
    }

    async fn put_json<T: Serialize>(&self, path: &str, body: &T) -> Result<(), AppError> {
        let _ = self.request_json("PUT", path, body).await?;
        Ok(())
    }

    async fn request_json<T: Serialize>(&self, method: &str, path: &str, body: &T) -> Result<Option<Value>, AppError> {
        let payload = serde_json::to_vec(body)?;
        let mut stream = UnixStream::connect(&self.socket_path).await.map_err(|error| {
            AppError::Runtime(format!("failed to connect to firecracker socket {}: {}", self.socket_path.display(), error))
        })?;

        let request = format!(
            "{} {} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            method,
            path,
            payload.len()
        );
        stream.write_all(request.as_bytes()).await?;
        stream.write_all(&payload).await?;

        let mut response = Vec::new();
        let mut chunk = [0_u8; 4096];
        loop {
            let bytes_read = stream.read(&mut chunk).await?;
            if bytes_read == 0 {
                break;
            }
            response.extend_from_slice(&chunk[..bytes_read]);

            if let Some(expected_len) = expected_http_response_len(&response)? {
                if response.len() >= expected_len {
                    break;
                }
            }
        }
        parse_http_response(&response)
    }
}

fn expected_http_response_len(response: &[u8]) -> Result<Option<usize>, AppError> {
    let response_text = String::from_utf8_lossy(response);
    let header_end = response_text
        .find("\r\n\r\n")
        .map(|index| index + 4)
        .or_else(|| response_text.find("\n\n").map(|index| index + 2));

    let Some(header_end) = header_end else {
        return Ok(None);
    };

    let normalized = response_text.replace("\r\n", "\n");
    let mut lines = normalized.lines();
    let status_line = lines
        .next()
        .ok_or_else(|| AppError::Runtime("firecracker returned a malformed response".to_string()))?;
    let status_code = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| AppError::Runtime(format!("could not parse firecracker status line: {}", status_line)))?;

    if status_code == 204 || status_code == 304 || (100..200).contains(&status_code) {
        return Ok(Some(header_end));
    }

    let content_length = normalized
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.eq_ignore_ascii_case("content-length") {
                value.trim().parse::<usize>().ok()
            } else {
                None
            }
        });

    Ok(content_length.map(|length| header_end + length))
}

fn parse_http_response(response: &[u8]) -> Result<Option<Value>, AppError> {
    let response_text = String::from_utf8_lossy(response);
    let normalized = response_text.replace("\r\n", "\n");
    let mut sections = normalized.splitn(2, "\n\n");
    let header_block = sections
        .next()
        .ok_or_else(|| AppError::Runtime("firecracker returned an empty response".to_string()))?;
    let body = sections.next().unwrap_or_default();

    let mut header_lines = header_block.lines();
    let status_line = header_lines
        .next()
        .ok_or_else(|| AppError::Runtime("firecracker returned a malformed response".to_string()))?;
    let status_code = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| AppError::Runtime(format!("could not parse firecracker status line: {}", status_line)))?;

    if !(200..300).contains(&status_code) {
        return Err(AppError::Runtime(format!(
            "firecracker API request failed with status {}: {}",
            status_code, body
        )));
    }

    if body.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some(serde_json::from_str(body)?))
}

async fn wait_for_socket(socket_path: &Path, timeout: Duration, child: &mut tokio::process::Child) -> Result<(), AppError> {
    let started_at = Instant::now();
    while started_at.elapsed() < timeout {
        if socket_path.exists() {
            return Ok(());
        }
        if let Some(status) = child.try_wait()? {
            return Err(AppError::Runtime(format!("firecracker exited before socket became ready: {}", status)));
        }
        sleep(Duration::from_millis(50)).await;
    }

    Err(AppError::Runtime(format!(
        "timed out waiting for firecracker socket {}",
        socket_path.display()
    )))
}

async fn terminate_pid(pid: u32) {
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }

    let proc_path = PathBuf::from(format!("/proc/{}", pid));
    let started_at = Instant::now();
    while proc_path.exists() && started_at.elapsed() < Duration::from_secs(2) {
        sleep(Duration::from_millis(100)).await;
    }

    if proc_path.exists() {
        unsafe {
            libc::kill(pid as i32, libc::SIGKILL);
        }
    }
}

#[cfg(test)]
pub struct StubRuntime;

#[cfg(test)]
impl StubRuntime {
    pub fn shared() -> SharedVmRuntime {
        Arc::new(Self)
    }
}

#[cfg(test)]
#[async_trait]
impl VmRuntime for StubRuntime {
    async fn launch(&self, _config: &Config, request: LaunchVmRequest) -> Result<VmRuntimeHandle, AppError> {
        Ok(VmRuntimeHandle {
            pid: 42,
            api_socket: format!("/tmp/{}.sock", request.sandbox_id),
            runtime_dir: format!("/tmp/{}", request.sandbox_id),
            rootfs_path: "/tmp/rootfs.ext4".to_string(),
            host_ip: Some("172.16.0.1".to_string()),
            guest_ip: Some("172.16.0.2".to_string()),
            ssh_user: Some("root".to_string()),
            ssh_port: Some(22),
            ssh_private_key_path: Some("/tmp/id_ed25519".to_string()),
        })
    }

    async fn terminate(&self, _handle: &VmRuntimeHandle) -> Result<(), AppError> {
        Ok(())
    }
}

impl From<&VmRuntimeHandle> for SandboxRuntimeInfo {
    fn from(value: &VmRuntimeHandle) -> Self {
        Self {
            pid: value.pid,
            api_socket: value.api_socket.clone(),
            runtime_dir: value.runtime_dir.clone(),
            rootfs_path: value.rootfs_path.clone(),
        }
    }
}
