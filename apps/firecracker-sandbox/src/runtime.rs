use std::{collections::HashMap, path::{Path, PathBuf}, process::Stdio, sync::Arc, time::{Duration, Instant}};

use async_trait::async_trait;
use serde::Serialize;
use serde_json::{json, Value};
use tokio::{fs, io::{AsyncReadExt, AsyncWriteExt}, net::{TcpStream, UnixStream}, process::Command, time::{sleep, timeout}};
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
    pub guest_agent_port: u16,
}

const GUEST_AGENT_SCRIPT_PATH: &str = "/root/khadim-guest-agent.mjs";
const GUEST_AGENT_LAUNCHER_PATH: &str = "/root/khadim-agent-launcher.sh";
const GUEST_AGENT_INITTAB_LINE: &str = "::respawn:/bin/sh /root/khadim-agent-launcher.sh";
const GUEST_AGENT_SYSTEMD_UNIT_PATH: &str = "/etc/systemd/system/khadim-guest-agent.service";
const GUEST_AGENT_SYSTEMD_WANTS_DIR: &str = "/etc/systemd/system/multi-user.target.wants";
const GUEST_AGENT_SYSTEMD_WANTS_LINK: &str = "/etc/systemd/system/multi-user.target.wants/khadim-guest-agent.service";

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

            configure_rootfs_for_guest_agent(&rootfs_path, &runtime_dir, config).await?;

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

            wait_for_guest_agent(config).await?;

            info!(sandbox_id = request.sandbox_id, pid, "started firecracker microVM");

            Ok(VmRuntimeHandle {
                pid,
                api_socket: api_socket.display().to_string(),
                runtime_dir: runtime_dir.display().to_string(),
                rootfs_path: rootfs_path.display().to_string(),
                host_ip: config.host_ip.clone(),
                guest_ip: config.guest_ip.clone(),
                guest_agent_port: config.guest_agent_port,
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
        let body = guest_agent_request(handle, "POST", "/read-file", Some(json!({ "path": path }))).await?;
        Ok(body
            .and_then(|value| value.get("content").and_then(|content| content.as_str()).map(ToString::to_string))
            .unwrap_or_default())
    }

    async fn write_file(&self, handle: &VmRuntimeHandle, path: &str, content: &str) -> Result<(), AppError> {
        let _ = guest_agent_request(
            handle,
            "POST",
            "/write-file",
            Some(json!({ "path": path, "content": content, "encoding": "utf-8" })),
        )
        .await?;
        Ok(())
    }

    async fn exec(&self, handle: &VmRuntimeHandle, _mode: Option<&str>, script: &str) -> Result<CommandResponse, AppError> {
        let body = guest_agent_request(
            handle,
            "POST",
            "/exec",
            Some(json!({ "command": script, "workdir": "/root" })),
        )
        .await?;
        parse_command_response(body)
    }

    async fn spawn(&self, handle: &VmRuntimeHandle, command: &[String], cwd: Option<&str>, env: Option<&HashMap<String, String>>) -> Result<ProcessResponse, AppError> {
        if command.is_empty() {
            return Err(AppError::BadRequest("command is required".to_string()));
        }

        let body = guest_agent_request(
            handle,
            "POST",
            "/spawn",
            Some(json!({ "command": command, "cwd": cwd, "env": env })),
        )
        .await?;
        let pid = body
            .and_then(|value| value.get("pid").and_then(|pid| pid.as_u64()))
            .ok_or_else(|| AppError::Runtime("guest agent spawn response is missing a pid".to_string()))?;
        Ok(ProcessResponse { pid: pid as u32 })
    }

    async fn expose_port(&self, handle: &VmRuntimeHandle, port: u16) -> Result<ExposeResponse, AppError> {
        let target_ip = handle
            .guest_ip
            .as_deref()
            .or(handle.host_ip.as_deref())
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

    if config.tap_device.is_none() || config.guest_ip.is_none() {
        return Err(AppError::BadRequest(
            "guest agent transport requires FIRECRACKER_TAP_DEVICE and FIRECRACKER_GUEST_IP to be configured."
                .to_string(),
        ));
    }

    if let Some(tap_device) = config.tap_device.as_deref() {
        let tap_path = PathBuf::from("/sys/class/net").join(tap_device);
        if !tap_path.exists() {
            return Err(AppError::BadRequest(format!(
                "Firecracker tap device {} does not exist. Create it first and assign the host-side IP before using the guest agent transport.",
                tap_device
            )));
        }
    }

    Ok(())
}

async fn configure_rootfs_for_guest_agent(rootfs_path: &Path, runtime_dir: &Path, config: &Config) -> Result<(), AppError> {
    let guest_agent_script = render_guest_agent_script(config.guest_agent_port);
    let launcher_script = render_guest_agent_launcher(config.guest_agent_port);

    debugfs_write_file(rootfs_path, runtime_dir, GUEST_AGENT_SCRIPT_PATH, &guest_agent_script, "0100644", false).await?;
    debugfs_write_file(rootfs_path, runtime_dir, GUEST_AGENT_LAUNCHER_PATH, &launcher_script, "0100755", false).await?;

    if debugfs_path_exists(rootfs_path, "/etc/inittab").await? {
        configure_inittab_for_guest_agent(rootfs_path, runtime_dir).await?;
        return Ok(());
    }

    if debugfs_path_exists(rootfs_path, "/etc/systemd/system").await? {
        configure_systemd_for_guest_agent(rootfs_path, runtime_dir).await?;
        return Ok(());
    }

    Err(AppError::Runtime(
        "guest rootfs does not provide /etc/inittab or /etc/systemd/system; unable to auto-start the guest agent"
            .to_string(),
    ))
}

async fn configure_inittab_for_guest_agent(rootfs_path: &Path, runtime_dir: &Path) -> Result<(), AppError> {

    let inittab_host_path = runtime_dir.join("inittab");
    debugfs_dump_file(rootfs_path, "/etc/inittab", &inittab_host_path).await?;

    let mut inittab = fs::read_to_string(&inittab_host_path).await.map_err(|error| {
        AppError::Runtime(format!("failed to read dumped guest /etc/inittab: {}", error))
    })?;
    if !inittab.contains(GUEST_AGENT_INITTAB_LINE) {
        if !inittab.ends_with('\n') {
            inittab.push('\n');
        }
        inittab.push_str(GUEST_AGENT_INITTAB_LINE);
        inittab.push('\n');
        fs::write(&inittab_host_path, inittab).await?;
        debugfs_write_file(rootfs_path, runtime_dir, "/etc/inittab", &fs::read_to_string(&inittab_host_path).await?, "0100644", true).await?;
    }

    let _ = fs::remove_file(&inittab_host_path).await;
    Ok(())
}

async fn configure_systemd_for_guest_agent(rootfs_path: &Path, runtime_dir: &Path) -> Result<(), AppError> {
    let service_unit = render_guest_agent_systemd_unit();
    let replace_existing_unit = debugfs_path_exists(rootfs_path, GUEST_AGENT_SYSTEMD_UNIT_PATH).await?;
    debugfs_write_file(
        rootfs_path,
        runtime_dir,
        GUEST_AGENT_SYSTEMD_UNIT_PATH,
        &service_unit,
        "0100644",
        replace_existing_unit,
    )
    .await?;

    if !debugfs_path_exists(rootfs_path, GUEST_AGENT_SYSTEMD_WANTS_DIR).await? {
        debugfs_mkdir(rootfs_path, GUEST_AGENT_SYSTEMD_WANTS_DIR).await?;
    }

    let replace_existing_link = debugfs_path_exists(rootfs_path, GUEST_AGENT_SYSTEMD_WANTS_LINK).await?;
    debugfs_symlink(
        rootfs_path,
        GUEST_AGENT_SYSTEMD_WANTS_LINK,
        "../khadim-guest-agent.service",
        replace_existing_link,
    )
    .await
}

fn render_guest_agent_launcher(port: u16) -> String {
    format!(
        r#"#!/bin/sh
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export KHADIM_GUEST_AGENT_PORT={port}
LOG_FILE=/tmp/khadim-guest-agent.log

while ! command -v bun >/dev/null 2>&1; do
  sleep 1
done

exec bun {script_path} >>"$LOG_FILE" 2>&1
"#,
        port = port,
        script_path = GUEST_AGENT_SCRIPT_PATH,
    )
}

fn render_guest_agent_systemd_unit() -> String {
    format!(
        r#"[Unit]
Description=Khadim guest agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/bin/sh {launcher_path}
Restart=always
RestartSec=1

[Install]
WantedBy=multi-user.target
"#,
        launcher_path = GUEST_AGENT_LAUNCHER_PATH,
    )
}

fn render_guest_agent_script(port: u16) -> String {
    format!(
        r#"import {{ mkdir, readFile }} from "node:fs/promises";
import path from "node:path";

const port = Number(process.env.KHADIM_GUEST_AGENT_PORT || "{port}");
const rootDir = "/root";

function json(body, status = 200) {{
  return new Response(JSON.stringify(body), {{
    status,
    headers: {{ "content-type": "application/json" }},
  }});
}}

function resolveGuestPath(value) {{
  if (typeof value !== "string" || value.length === 0) throw new Error("path is required");
  return path.posix.isAbsolute(value) ? value : path.posix.join(rootDir, value);
}}

function resolveGuestCwd(value) {{
  if (typeof value !== "string" || value.length === 0) return rootDir;
  return path.posix.isAbsolute(value) ? value : path.posix.join(rootDir, value);
}}

async function readJson(req) {{
  try {{
    return await req.json();
  }} catch {{
    return {{}};
  }}
}}

async function collectText(stream) {{
  if (!stream) return "";
  return await new Response(stream).text();
}}

async function execCommand(command, cwd, timeoutSeconds) {{
  const proc = Bun.spawn(["sh", "-lc", command], {{
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  }});

  const timeoutMs = Math.max(1, Number(timeoutSeconds || 30)) * 1000;
  const result = await Promise.race([
    proc.exited.then((code) => ({{ timedOut: false, code }})),
    Bun.sleep(timeoutMs).then(() => ({{ timedOut: true, code: -1 }})),
  ]);

  if (result.timedOut) {{
    proc.kill();
  }}

  const [stdout, stderr] = await Promise.all([
    collectText(proc.stdout),
    collectText(proc.stderr),
  ]);

  return {{
    exitCode: result.timedOut ? -1 : Number(result.code ?? 1),
    stdout,
    stderr: result.timedOut ? `Command timed out after ${{timeoutSeconds || 30}}s${{stderr ? `\n${{stderr}}` : ""}}` : stderr,
  }};
}}

async function spawnCommand(command, cwd, env) {{
  const proc = Bun.spawn(command, {{
    cwd,
    env: {{ ...process.env, ...(env || {{}}) }},
    stdout: "ignore",
    stderr: "ignore",
  }});
  return {{ pid: Number(proc.pid || 0) }};
}}

Bun.serve({{
  port,
  hostname: "0.0.0.0",
  async fetch(req) {{
    const url = new URL(req.url);
    try {{
      if (req.method === "GET" && url.pathname === "/health") {{
        return json({{ ok: true, service: "khadim-guest-agent" }});
      }}

      if (req.method === "POST" && url.pathname === "/read-file") {{
        const body = await readJson(req);
        const targetPath = resolveGuestPath(body.path);
        return json({{ content: await readFile(targetPath, "utf8") }});
      }}

      if (req.method === "POST" && url.pathname === "/write-file") {{
        const body = await readJson(req);
        const targetPath = resolveGuestPath(body.path);
        await mkdir(path.posix.dirname(targetPath), {{ recursive: true }});
        await Bun.write(targetPath, typeof body.content === "string" ? body.content : "");
        return json({{ ok: true, path: targetPath }});
      }}

      if (req.method === "POST" && url.pathname === "/exec") {{
        const body = await readJson(req);
        if (typeof body.command !== "string" || body.command.length === 0) {{
          return json({{ error: "command is required" }}, 400);
        }}
        return json(await execCommand(body.command, resolveGuestCwd(body.workdir), body.timeout));
      }}

      if (req.method === "POST" && url.pathname === "/spawn") {{
        const body = await readJson(req);
        if (!Array.isArray(body.command) || body.command.length === 0) {{
          return json({{ error: "command is required" }}, 400);
        }}
        return json(await spawnCommand(body.command.map((value) => String(value)), resolveGuestCwd(body.cwd), body.env));
      }}

      return json({{ error: "not found" }}, 404);
    }} catch (error) {{
      return json({{ error: error instanceof Error ? error.message : String(error) }}, 500);
    }}
  }},
}});
"#,
        port = port,
    )
}

async fn wait_for_guest_agent(config: &Config) -> Result<(), AppError> {
    let guest_ip = config
        .guest_ip
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("FIRECRACKER_GUEST_IP is required for the guest agent".to_string()))?;

    let started_at = Instant::now();
    while started_at.elapsed() < Duration::from_millis(config.guest_agent_wait_timeout_ms) {
        match request_json_over_tcp(
            guest_ip,
            config.guest_agent_port,
            "GET",
            "/health",
            None,
            Duration::from_secs(2),
        )
        .await
        {
            Ok(Some(value)) if value.get("ok").and_then(|ok| ok.as_bool()) == Some(true) => return Ok(()),
            Ok(_) | Err(_) => sleep(Duration::from_millis(500)).await,
        }
    }

    Err(AppError::Runtime(
        "timed out waiting for the guest agent. Ensure tap networking is configured and the guest can start Bun."
            .to_string(),
    ))
}

async fn guest_agent_request(
    handle: &VmRuntimeHandle,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Option<Value>, AppError> {
    let guest_ip = handle
        .guest_ip
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("guest networking is not configured. Set FIRECRACKER_TAP_DEVICE and FIRECRACKER_GUEST_IP.".to_string()))?;

    request_json_over_tcp(guest_ip, handle.guest_agent_port, method, path, body, Duration::from_secs(30)).await
}

async fn request_json_over_tcp(
    host: &str,
    port: u16,
    method: &str,
    path: &str,
    body: Option<Value>,
    request_timeout: Duration,
) -> Result<Option<Value>, AppError> {
    let mut stream = timeout(request_timeout, TcpStream::connect((host, port)))
        .await
        .map_err(|_| AppError::Runtime(format!("timed out connecting to guest agent at {}:{}", host, port)))?
        .map_err(|error| AppError::Runtime(format!("failed to connect to guest agent at {}:{}: {}", host, port, error)))?;

    let payload = match body {
        Some(value) => serde_json::to_vec(&value)?,
        None => Vec::new(),
    };
    let request = if payload.is_empty() {
        format!("{} {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n", method, path, host)
    } else {
        format!(
            "{} {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            method,
            path,
            host,
            payload.len()
        )
    };

    timeout(request_timeout, stream.write_all(request.as_bytes()))
        .await
        .map_err(|_| AppError::Runtime(format!("timed out sending request to guest agent {}:{}", host, port)))??;
    if !payload.is_empty() {
        timeout(request_timeout, stream.write_all(&payload))
            .await
            .map_err(|_| AppError::Runtime(format!("timed out sending request body to guest agent {}:{}", host, port)))??;
    }

    let mut response = Vec::new();
    let mut chunk = [0_u8; 4096];
    loop {
        let bytes_read = timeout(request_timeout, stream.read(&mut chunk))
            .await
            .map_err(|_| AppError::Runtime(format!("timed out waiting for guest agent response from {}:{}", host, port)))??;
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

fn parse_command_response(body: Option<Value>) -> Result<CommandResponse, AppError> {
    let Some(record) = body else {
        return Err(AppError::Runtime("guest agent command response was empty".to_string()));
    };

    Ok(CommandResponse {
        exit_code: record
            .get("exitCode")
            .or_else(|| record.get("exit_code"))
            .and_then(|value| value.as_i64())
            .unwrap_or(1) as i32,
        stdout: record
            .get("stdout")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        stderr: record
            .get("stderr")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
    })
}

async fn debugfs_dump_file(rootfs_path: &Path, guest_path: &str, host_path: &Path) -> Result<(), AppError> {
    let output = Command::new("debugfs")
        .arg("-R")
        .arg(format!("dump -p {} {}", guest_path, host_path.display()))
        .arg(rootfs_path)
        .output()
        .await?;
    if !output.status.success() {
        return Err(AppError::Runtime(format!(
            "failed to dump {} from rootfs {}: {}",
            guest_path,
            rootfs_path.display(),
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    Ok(())
}

async fn debugfs_path_exists(rootfs_path: &Path, guest_path: &str) -> Result<bool, AppError> {
    let output = Command::new("debugfs")
        .arg("-R")
        .arg(format!("stat {}", guest_path))
        .arg(rootfs_path)
        .output()
        .await?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("File not found") {
        return Ok(false);
    }

    if output.status.success() {
        return Ok(true);
    }

    Err(AppError::Runtime(format!(
        "failed to stat {} in rootfs {}: {}",
        guest_path,
        rootfs_path.display(),
        stderr
    )))
}

async fn debugfs_mkdir(rootfs_path: &Path, guest_path: &str) -> Result<(), AppError> {
    let output = Command::new("debugfs")
        .arg("-w")
        .arg("-R")
        .arg(format!("mkdir {}", guest_path))
        .arg(rootfs_path)
        .output()
        .await?;

    if !output.status.success() {
        return Err(AppError::Runtime(format!(
            "failed to create directory {} in rootfs {}: {}",
            guest_path,
            rootfs_path.display(),
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

async fn debugfs_symlink(rootfs_path: &Path, guest_path: &str, target: &str, replace_existing: bool) -> Result<(), AppError> {
    let mut command = Command::new("debugfs");
    command.arg("-w");
    if replace_existing {
        command.arg("-R").arg(format!("rm {}", guest_path));
    }
    command
        .arg("-R")
        .arg(format!("symlink {} {}", guest_path, target))
        .arg(rootfs_path);

    let output = command.output().await?;
    if !output.status.success() {
        return Err(AppError::Runtime(format!(
            "failed to create symlink {} -> {} in rootfs {}: {}",
            guest_path,
            target,
            rootfs_path.display(),
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

async fn debugfs_write_file(
    rootfs_path: &Path,
    runtime_dir: &Path,
    guest_path: &str,
    content: &str,
    mode: &str,
    replace_existing: bool,
) -> Result<(), AppError> {
    let temp_name = guest_path.trim_start_matches('/').replace('/', "_");
    let host_path = runtime_dir.join(format!("debugfs-{}", temp_name));
    fs::write(&host_path, content).await?;

    let mut write_command = Command::new("debugfs");
    write_command.arg("-w");
    if replace_existing {
        write_command.arg("-R").arg(format!("rm {}", guest_path));
    }
    write_command
        .arg("-R")
        .arg(format!("write {} {}", host_path.display(), guest_path))
        .arg(rootfs_path);

    let output = write_command.output().await?;

    if !output.status.success() {
        let _ = fs::remove_file(&host_path).await;
        return Err(AppError::Runtime(format!(
            "failed to write {} into rootfs {}: {}",
            guest_path,
            rootfs_path.display(),
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let metadata_output = Command::new("debugfs")
        .arg("-w")
        .arg("-R")
        .arg(format!("set_inode_field {} uid_lo 0", guest_path))
        .arg("-R")
        .arg(format!("set_inode_field {} gid 0", guest_path))
        .arg("-R")
        .arg(format!("set_inode_field {} mode {}", guest_path, mode))
        .arg(rootfs_path)
        .output()
        .await?;

    let _ = fs::remove_file(&host_path).await;

    if !metadata_output.status.success() {
        return Err(AppError::Runtime(format!(
            "failed to update inode metadata for {} in rootfs {}: {}",
            guest_path,
            rootfs_path.display(),
            String::from_utf8_lossy(&metadata_output.stderr)
        )));
    }

    Ok(())
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
            guest_agent_port: 4020,
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
