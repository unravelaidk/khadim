//! Docker runner — executes a managed agent inside an isolated container.
//!
//! Uses `bollard` to talk to the local Docker daemon. The agent's instructions
//! are written into the container as a prompt file and executed via a shell
//! entrypoint that pipes them into the khadim CLI (or a lightweight script
//! runner) inside the container.

use super::{ResolvedEnvironment, complete_run, emit_run_event, fail_run, record_turn};
use crate::db::{AgentRun, Database, ManagedAgent};
use bollard::container::{
    Config, CreateContainerOptions, LogOutput, LogsOptions, RemoveContainerOptions,
    StartContainerOptions, WaitContainerOptions,
};
use bollard::Docker;
use futures_util::StreamExt;
use serde_json::json;
use std::sync::Arc;
use tauri::AppHandle;

// Keep the default sandbox image small, but still glibc-based so a future
// native Khadim runtime can run inside the container without an Alpine/musl fork.
const DEFAULT_IMAGE: &str = "debian:bookworm-slim";

/// Check whether the Docker daemon is reachable.
pub async fn is_docker_available() -> bool {
    match Docker::connect_with_local_defaults() {
        Ok(docker) => docker.ping().await.is_ok(),
        Err(_) => false,
    }
}

/// Execute a managed agent run inside a Docker container.
///
/// The container gets:
/// - Environment variables from the resolved environment
/// - A `/run/prompt.txt` with the agent instructions (variables substituted)
/// - An entrypoint that executes the prompt as a bash script
///
/// All stdout/stderr is captured and streamed back via Tauri events, then
/// persisted as run turns.
pub async fn execute_docker_run(
    app: AppHandle,
    db: Arc<Database>,
    agent: ManagedAgent,
    run: AgentRun,
    env: ResolvedEnvironment,
) {
    let run_id = run.id.clone();
    let started_at = run.started_at.clone().unwrap_or_default();

    // Mark running
    let _ = db.update_agent_run_status(
        &run_id, "running", None, None, None, None, None, None,
    );

    emit_run_event(&app, &run_id, "step_start", None, Some(json!({
        "id": "docker-init",
        "title": "Connecting to Docker",
        "tool": "docker",
    })));

    // Connect to Docker
    let docker = match Docker::connect_with_local_defaults() {
        Ok(d) => d,
        Err(e) => {
            let msg = format!("Failed to connect to Docker: {e}");
            let _ = fail_run(&db, &run_id, &msg, &started_at);
            emit_run_event(&app, &run_id, "error", Some(msg), None);
            emit_run_event(&app, &run_id, "done", None, None);
            return;
        }
    };

    // Verify Docker is reachable
    if let Err(e) = docker.ping().await {
        let msg = format!("Docker daemon not reachable: {e}. Is Docker running?");
        let _ = fail_run(&db, &run_id, &msg, &started_at);
        emit_run_event(&app, &run_id, "error", Some(msg), None);
        emit_run_event(&app, &run_id, "done", None, None);
        return;
    }

    emit_run_event(&app, &run_id, "step_complete", Some("Docker connected".to_string()), Some(json!({
        "id": "docker-init",
        "title": "Connecting to Docker",
        "status": "complete",
    })));

    // Build prompt with variable substitution
    let mut prompt = agent.instructions.clone();
    for (key, value) in &env.variables {
        prompt = prompt.replace(&format!("{{{{{key}}}}}"), value);
    }

    // Record the initial user turn
    let _ = record_turn(&db, &run_id, 1, "user", None, Some(&prompt), None, None, None);

    // Determine image
    let image = env.docker_image
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_IMAGE);

    // Try to pull the image
    emit_run_event(&app, &run_id, "step_start", None, Some(json!({
        "id": "docker-pull",
        "title": format!("Pulling image {image}"),
        "tool": "docker",
    })));

    {
        use bollard::image::CreateImageOptions;
        let opts = CreateImageOptions {
            from_image: image,
            ..Default::default()
        };
        let mut stream = docker.create_image(Some(opts), None, None);
        while let Some(result) = stream.next().await {
            match result {
                Ok(info) => {
                    if let Some(status) = info.status {
                        log::debug!("Docker pull: {status}");
                    }
                }
                Err(e) => {
                    log::warn!("Docker pull warning: {e}");
                    // Don't fail — image might already exist locally
                }
            }
        }
    }

    emit_run_event(&app, &run_id, "step_complete", Some(format!("Image {image} ready")), Some(json!({
        "id": "docker-pull",
        "title": format!("Pulling image {image}"),
        "status": "complete",
    })));

    // Build environment variables for the container
    let mut container_env: Vec<String> = env.variables
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect();
    container_env.extend(
        env.secrets
            .iter()
            .map(|(k, v)| format!("{k}={v}")),
    );
    // Pass the prompt as an env var so the entrypoint can access it
    container_env.push(format!("KHADIM_PROMPT={}", prompt.replace('\n', "\\n")));

    // The entrypoint runs the prompt as a bash script.
    // For RPA agents this executes the instructions directly.
    // The agent's instructions should be written as executable steps.
    let entrypoint_script = r#"
echo "$KHADIM_PROMPT" | sed 's/\\n/\n/g' > /tmp/agent_prompt.txt
echo "=== Agent Run Started ==="
echo "--- Instructions ---"
cat /tmp/agent_prompt.txt
echo ""
echo "--- Executing ---"
# Execute the prompt as a script if it looks like shell commands,
# otherwise just display it (the agent would need a runtime to execute
# natural language instructions autonomously in Docker).
if head -1 /tmp/agent_prompt.txt | grep -qE '^(#!/|[A-Za-z_]+=|cd |mkdir |cp |mv |curl |wget |pip |npm |apt |echo |cat |python|node |ruby )'; then
    bash /tmp/agent_prompt.txt 2>&1
else
    echo "Instructions received. A full agent runtime inside Docker is not yet available."
    echo "For now, Docker runs execute shell-script-style instructions directly."
    cat /tmp/agent_prompt.txt
fi
echo ""
echo "=== Agent Run Completed ==="
"#;

    // Create container
    let container_name = format!("khadim-run-{}", &run_id[..8]);
    let config = Config {
        image: Some(image.to_string()),
        env: Some(container_env),
        cmd: Some(vec![
            "bash".to_string(),
            "-c".to_string(),
            entrypoint_script.to_string(),
        ]),
        // Restrict resources
        host_config: Some(bollard::models::HostConfig {
            memory: Some(512 * 1024 * 1024), // 512MB
            cpu_period: Some(100_000),
            cpu_quota: Some(50_000), // 50% of one core
            network_mode: Some("bridge".to_string()),
            ..Default::default()
        }),
        ..Default::default()
    };

    emit_run_event(&app, &run_id, "step_start", None, Some(json!({
        "id": "docker-run",
        "title": "Running container",
        "tool": "docker",
    })));

    let container_id = match docker
        .create_container(
            Some(CreateContainerOptions { name: &container_name, platform: None }),
            config,
        )
        .await
    {
        Ok(response) => response.id,
        Err(e) => {
            let msg = format!("Failed to create container: {e}");
            let _ = fail_run(&db, &run_id, &msg, &started_at);
            emit_run_event(&app, &run_id, "error", Some(msg), None);
            emit_run_event(&app, &run_id, "done", None, None);
            return;
        }
    };

    // Start container
    if let Err(e) = docker
        .start_container(&container_id, None::<StartContainerOptions<String>>)
        .await
    {
        let msg = format!("Failed to start container: {e}");
        let _ = fail_run(&db, &run_id, &msg, &started_at);
        cleanup_container(&docker, &container_id).await;
        emit_run_event(&app, &run_id, "error", Some(msg), None);
        emit_run_event(&app, &run_id, "done", None, None);
        return;
    }

    // Stream logs
    let log_opts = LogsOptions::<String> {
        follow: true,
        stdout: true,
        stderr: true,
        ..Default::default()
    };

    let mut output = String::new();
    let mut log_stream = docker.logs(&container_id, Some(log_opts));
    let mut turn_number: i64 = 2;

    while let Some(result) = log_stream.next().await {
        match result {
            Ok(log) => {
                let text = match &log {
                    LogOutput::StdOut { message } => String::from_utf8_lossy(message).to_string(),
                    LogOutput::StdErr { message } => String::from_utf8_lossy(message).to_string(),
                    _ => continue,
                };
                output.push_str(&text);
                emit_run_event(&app, &run_id, "text_delta", Some(text), None);
            }
            Err(e) => {
                log::warn!("Docker log stream error: {e}");
                break;
            }
        }
    }

    // Wait for container to exit
    let mut wait_stream = docker.wait_container(
        &container_id,
        Some(WaitContainerOptions {
            condition: "not-running",
        }),
    );

    let exit_code = if let Some(Ok(result)) = wait_stream.next().await {
        result.status_code
    } else {
        -1
    };

    emit_run_event(&app, &run_id, "step_complete",
        Some(format!("Container exited with code {exit_code}")),
        Some(json!({
            "id": "docker-run",
            "title": "Running container",
            "status": if exit_code == 0 { "complete" } else { "error" },
        })),
    );

    // Record the output as a tool turn
    let _ = record_turn(
        &db, &run_id, turn_number, "tool",
        Some("docker"),
        Some(&output),
        None, None, None,
    );
    turn_number += 1;

    // Finalize run status
    if exit_code == 0 {
        let summary = if output.len() > 200 {
            format!("{}...", &output[..200])
        } else {
            output.clone()
        };
        let _ = record_turn(
            &db, &run_id, turn_number, "agent", None,
            Some("Run completed successfully"),
            None, None, None,
        );
        let _ = complete_run(&db, &run_id, Some(&summary), None, None, &started_at);
        emit_run_event(&app, &run_id, "done", None, None);
    } else {
        let msg = format!("Container exited with code {exit_code}");
        let _ = fail_run(&db, &run_id, &msg, &started_at);
        emit_run_event(&app, &run_id, "error", Some(msg), None);
        emit_run_event(&app, &run_id, "done", None, None);
    }

    // Cleanup
    cleanup_container(&docker, &container_id).await;
}

async fn cleanup_container(docker: &Docker, container_id: &str) {
    let _ = docker
        .remove_container(
            container_id,
            Some(RemoveContainerOptions {
                force: true,
                ..Default::default()
            }),
        )
        .await;
}
