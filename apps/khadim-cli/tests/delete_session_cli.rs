use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
#[cfg(unix)]
use std::os::fd::FromRawFd;
#[cfg(unix)]
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

fn run_cli(config_home: &std::path::Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_khadim-cli"))
        .env("KHADIM_CONFIG_HOME", config_home)
        .args(args)
        .output()
        .expect("run khadim-cli")
}

fn run_cli_with_stdin(config_home: &std::path::Path, args: &[&str], input: &[u8]) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_khadim-cli"))
        .env("KHADIM_CONFIG_HOME", config_home)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn khadim-cli");
    child
        .stdin
        .take()
        .expect("child stdin")
        .write_all(input)
        .expect("write request JSON");
    child.wait_with_output().expect("wait for khadim-cli")
}

fn spawn_failing_model_server() -> (String, Arc<AtomicBool>, thread::JoinHandle<usize>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind model server");
    listener
        .set_nonblocking(true)
        .expect("make model server nonblocking");
    let address = listener.local_addr().expect("model server address");
    let stop = Arc::new(AtomicBool::new(false));
    let server_stop = stop.clone();
    let handle = thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(15);
        let mut requests = 0;
        while !server_stop.load(Ordering::Relaxed) && Instant::now() < deadline {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let body = "upstream unavailable";
                    let response = format!(
                        "HTTP/1.1 503 Service Unavailable\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    stream
                        .write_all(response.as_bytes())
                        .expect("write model failure");
                    requests += 1;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(5));
                }
                Err(error) => panic!("accept model request: {error}"),
            }
        }
        requests
    });
    (format!("http://{address}/v1"), stop, handle)
}

fn spawn_success_model_server() -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind model server");
    let address = listener.local_addr().expect("model server address");
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept model request");
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .expect("set model read timeout");
        let mut request = Vec::new();
        let mut buffer = [0_u8; 4096];
        let (header_end, content_length) = loop {
            let read = stream.read(&mut buffer).expect("read model request");
            assert!(read > 0, "model request ended before headers");
            request.extend_from_slice(&buffer[..read]);
            if let Some(header_end) = request
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .map(|position| position + 4)
            {
                let headers = String::from_utf8_lossy(&request[..header_end]);
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().expect("content length"))
                    })
                    .expect("request content length");
                break (header_end, content_length);
            }
        };
        while request.len() < header_end + content_length {
            let read = stream.read(&mut buffer).expect("read model body");
            assert!(read > 0, "model request ended before body");
            request.extend_from_slice(&buffer[..read]);
        }

        let events = concat!(
            "data: {\"type\":\"response.completed\",\"response\":{\"usage\":{}}}\n\n",
            "data: [DONE]\n\n"
        );
        let response = format!(
            "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{events}",
            events.len()
        );
        stream
            .write_all(response.as_bytes())
            .expect("write model response");
        String::from_utf8(request[..header_end].to_vec()).expect("UTF-8 request headers")
    });
    (format!("http://{address}/v1"), handle)
}

#[cfg(unix)]
fn spawn_bash_tool_model_server(command: String) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind tool-call model server");
    let address = listener.local_addr().expect("model server address");
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept tool-call model request");
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .expect("set model read timeout");
        let mut request = Vec::new();
        let mut buffer = [0_u8; 4096];
        let (header_end, content_length) = loop {
            let read = stream.read(&mut buffer).expect("read model request");
            assert!(read > 0, "model request ended before headers");
            request.extend_from_slice(&buffer[..read]);
            if let Some(header_end) = request
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .map(|position| position + 4)
            {
                let headers = String::from_utf8_lossy(&request[..header_end]);
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().expect("content length"))
                    })
                    .expect("request content length");
                break (header_end, content_length);
            }
        };
        while request.len() < header_end + content_length {
            let read = stream.read(&mut buffer).expect("read model body");
            assert!(read > 0, "model request ended before body");
            request.extend_from_slice(&buffer[..read]);
        }

        let arguments = serde_json::json!({
            "command": command,
            "timeout_ms": 60_000,
        })
        .to_string();
        let tool_delta = serde_json::json!({
            "type": "response.function_call_arguments.delta",
            "item_id": "call-parent-watch-bash",
            "name": "bash",
            "delta": arguments,
        });
        let completed = serde_json::json!({
            "type": "response.completed",
            "response": { "usage": {} },
        });
        let events = format!("data: {tool_delta}\n\ndata: {completed}\n\ndata: [DONE]\n\n");
        let response = format!(
            "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{events}",
            events.len()
        );
        stream
            .write_all(response.as_bytes())
            .expect("write tool-call response");
    });
    (format!("http://{address}/v1"), handle)
}

fn write_saved_openai_key(config_home: &std::path::Path) {
    let khadim_dir = config_home.join("khadim");
    fs::create_dir_all(&khadim_dir).expect("create CLI config dir");
    fs::write(
        khadim_dir.join("cli-settings.json"),
        br#"{"provider":"openai","model_id":"gpt-4o-mini","api_keys":{"openai":"saved-key"}}"#,
    )
    .expect("write saved CLI key");
}

fn credential_boundary_command(config_home: &std::path::Path, base_url: &str) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_khadim-cli"));
    command
        .env("KHADIM_CONFIG_HOME", config_home)
        .env_remove("KHADIM_RUN_API_KEY")
        .env_remove("OPENAI_API_KEY")
        .env_remove("KHADIM_API_KEY")
        .args([
            "--json",
            "--provider",
            "openai",
            "--model",
            "gpt-4o-mini",
            "--ignore-saved-api-key",
            "--base-url",
            base_url,
            "--tool-groups",
            "none",
            "--prompt",
            "verify credential boundary",
        ]);
    command
}

#[test]
fn json_delete_session_runs_before_settings_load_and_is_idempotent() {
    let temp = tempfile::tempdir().expect("temp config home");
    let khadim_dir = temp.path().join("khadim");
    let sessions_dir = khadim_dir.join("sessions");
    fs::create_dir_all(&sessions_dir).expect("create sessions dir");
    fs::write(khadim_dir.join("cli-settings.json"), b"{broken json")
        .expect("write deliberately corrupt settings");
    let session_path = sessions_dir.join("chat-123.json");
    fs::write(&session_path, b"private transcript").expect("seed session");

    let first = run_cli(temp.path(), &["--delete-session", "chat-123", "--json"]);
    assert!(
        first.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&first.stderr)
    );
    let first_body: Value = serde_json::from_slice(&first.stdout).expect("first JSON response");
    assert_eq!(first_body["ok"], true);
    assert_eq!(first_body["operation"], "delete_session");
    assert_eq!(first_body["session"], "chat-123");
    assert_eq!(first_body["deleted"], true);
    assert!(!session_path.exists());

    let second = run_cli(temp.path(), &["--delete-session", "chat-123", "--json"]);
    assert!(
        second.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&second.stderr)
    );
    let second_body: Value = serde_json::from_slice(&second.stdout).expect("second JSON response");
    assert_eq!(second_body["ok"], true);
    assert_eq!(second_body["deleted"], false);
}

#[test]
fn json_delete_session_rejects_an_invalid_key_with_a_structured_nonzero_error() {
    let temp = tempfile::tempdir().expect("temp config home");

    let output = run_cli(temp.path(), &["--delete-session", "../outside", "--json"]);

    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    let body: Value = serde_json::from_slice(&output.stderr).expect("structured JSON error");
    assert_eq!(body["ok"], false);
    assert_eq!(body["operation"], "delete_session");
    assert_eq!(body["error"]["kind"], "invalid_input");
    assert!(body["error"]["message"]
        .as_str()
        .is_some_and(|message| message.contains("session key")));
}

#[test]
fn request_stdin_accepts_one_json_prompt_envelope() {
    let temp = tempfile::tempdir().expect("temp config home");
    let output = run_cli_with_stdin(
        temp.path(),
        &["--request-stdin", "--providers", "json"],
        br#"{"prompt":"private prompt","systemPrompt":"private capability context"}"#,
    );

    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let providers: Value = serde_json::from_slice(&output.stdout).expect("provider JSON");
    assert!(providers.is_array());
}

#[test]
fn request_stdin_rejects_argv_prompt_conflicts_and_blank_prompts() {
    let temp = tempfile::tempdir().expect("temp config home");
    let conflict = run_cli_with_stdin(
        temp.path(),
        &["--request-stdin", "--prompt", "argv prompt", "--json"],
        br#"{"prompt":"stdin prompt"}"#,
    );
    assert!(!conflict.status.success());
    let conflict_error: Value =
        serde_json::from_slice(&conflict.stderr).expect("structured conflict error");
    assert!(conflict_error["error"]["message"]
        .as_str()
        .is_some_and(|message| message.contains("cannot be combined")));

    let blank = run_cli_with_stdin(
        temp.path(),
        &["--request-stdin", "--json"],
        br#"{"prompt":"   "}"#,
    );
    assert!(!blank.status.success());
    let blank_error: Value =
        serde_json::from_slice(&blank.stderr).expect("structured blank-prompt error");
    assert!(blank_error["error"]["message"]
        .as_str()
        .is_some_and(|message| message.contains("non-blank prompt")));
}

#[test]
fn legacy_prompt_dash_still_reads_plain_stdin() {
    let temp = tempfile::tempdir().expect("temp config home");
    let output = run_cli_with_stdin(
        temp.path(),
        &["--prompt", "-", "--providers", "json"],
        b"legacy plain-text prompt",
    );

    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let providers: Value = serde_json::from_slice(&output.stdout).expect("provider JSON");
    assert!(providers.is_array());
}

#[test]
fn credential_boundary_sends_the_ephemeral_key_instead_of_the_saved_key() {
    let temp = tempfile::tempdir().expect("temp config home");
    write_saved_openai_key(temp.path());
    let (base_url, request) = spawn_success_model_server();
    let output = credential_boundary_command(temp.path(), &base_url)
        .env("KHADIM_RUN_API_KEY", "ephemeral-key")
        .env("OPENAI_API_KEY", "provider-env-key")
        .output()
        .expect("run authenticated batch command");

    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let headers = request.join().expect("join model server");
    assert!(headers
        .lines()
        .any(|line| line.eq_ignore_ascii_case("authorization: Bearer ephemeral-key")));
    assert!(!headers.contains("saved-key"));
}

#[test]
fn credential_boundary_allows_the_provider_environment_key() {
    let temp = tempfile::tempdir().expect("temp config home");
    write_saved_openai_key(temp.path());
    let (base_url, request) = spawn_success_model_server();
    let output = credential_boundary_command(temp.path(), &base_url)
        .env("OPENAI_API_KEY", "provider-env-key")
        .output()
        .expect("run authenticated batch command");

    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let headers = request.join().expect("join model server");
    assert!(headers
        .lines()
        .any(|line| line.eq_ignore_ascii_case("authorization: Bearer provider-env-key")));
    assert!(!headers.contains("saved-key"));
}

#[test]
fn credential_boundary_does_not_fall_back_to_the_saved_key() {
    let temp = tempfile::tempdir().expect("temp config home");
    write_saved_openai_key(temp.path());
    let output = credential_boundary_command(temp.path(), "http://127.0.0.1:9/v1")
        .output()
        .expect("run unauthenticated batch command");

    assert!(!output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("UTF-8 JSONL");
    let events = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_str::<Value>(line).expect("agent event JSON"))
        .collect::<Vec<_>>();
    assert_eq!(
        events
            .iter()
            .filter(|event| event["event_type"] == "error")
            .count(),
        1,
        "events: {events:#?}"
    );
    assert_eq!(events[0]["metadata"]["kind"], "llm_initialization_failure");
    assert!(events[0]["content"]
        .as_str()
        .is_some_and(|content| content.contains("Missing API key")));
    let stderr = String::from_utf8(output.stderr).expect("UTF-8 process error");
    assert!(!stdout.contains("saved-key"));
    assert!(!stderr.contains("saved-key"));
}

#[test]
fn json_batch_failure_emits_one_terminal_error_and_exits_nonzero() {
    let temp = tempfile::tempdir().expect("temp config home");
    let (base_url, stop, server) = spawn_failing_model_server();
    let output = Command::new(env!("CARGO_BIN_EXE_khadim-cli"))
        .env("KHADIM_CONFIG_HOME", temp.path())
        .env("KHADIM_RUN_API_KEY", "test-key")
        .args([
            "--json",
            "--provider",
            "openai",
            "--model",
            "gpt-4o-mini",
            "--base-url",
            &base_url,
            "--tool-groups",
            "none",
            "--prompt",
            "trigger a deterministic provider failure",
        ])
        .output()
        .expect("run failing batch command");
    stop.store(true, Ordering::Relaxed);
    let request_count = server.join().expect("join model server");

    assert!(request_count >= 1);
    assert!(!output.status.success());
    let events = String::from_utf8(output.stdout)
        .expect("UTF-8 JSONL")
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_str::<Value>(line).expect("agent event JSON"))
        .collect::<Vec<_>>();
    let terminal_errors = events
        .iter()
        .filter(|event| event["event_type"] == "error")
        .collect::<Vec<_>>();
    assert_eq!(terminal_errors.len(), 1, "events: {events:#?}");
    assert_eq!(
        events.last().and_then(|event| event["event_type"].as_str()),
        Some("error")
    );
    assert!(!events.iter().any(|event| event["event_type"] == "done"));

    let stderr: Value = serde_json::from_slice(&output.stderr).expect("structured process error");
    assert_eq!(stderr["ok"], false);
}

#[cfg(unix)]
#[test]
fn parent_watch_eof_sigkills_the_dedicated_cli_process_group() {
    let temp = tempfile::tempdir().expect("temp config home");
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind hanging model server");
    let address = listener.local_addr().expect("model server address");
    let (connected_tx, connected_rx) = std::sync::mpsc::channel();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept model request");
        connected_tx.send(()).expect("signal model connection");
        let mut buffer = [0_u8; 4096];
        while stream.read(&mut buffer).unwrap_or(0) > 0 {}
    });

    let mut pipe_fds = [-1; 2];
    // SAFETY: `pipe_fds` points to storage for both descriptors.
    assert_eq!(unsafe { libc::pipe(pipe_fds.as_mut_ptr()) }, 0);
    let [watch_read_fd, watch_write_fd] = pipe_fds;

    let mut command = Command::new(env!("CARGO_BIN_EXE_khadim-cli"));
    command
        .env("KHADIM_CONFIG_HOME", temp.path())
        .env("KHADIM_RUN_API_KEY", "test-key")
        .args([
            "--json",
            "--provider",
            "openai",
            "--model",
            "gpt-4o-mini",
            "--base-url",
            &format!("http://{address}/v1"),
            "--tool-groups",
            "none",
            "--parent-watch-fd",
            "3",
            "--prompt",
            "wait for the managed launcher",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    // SAFETY: only async-signal-safe dup2/close calls run after fork. This
    // gives the child ownership of fd 3 and prevents its copy of the write end
    // from keeping the lifetime pipe open.
    unsafe {
        command.pre_exec(move || {
            if watch_read_fd != 3 {
                if libc::dup2(watch_read_fd, 3) == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                libc::close(watch_read_fd);
            }
            libc::close(watch_write_fd);
            Ok(())
        });
    }

    let mut child = command.spawn().expect("spawn managed CLI");
    // SAFETY: after spawn, the parent exclusively owns these original ends.
    unsafe {
        libc::close(watch_read_fd);
    }
    let watch_writer = unsafe { std::fs::File::from_raw_fd(watch_write_fd) };

    connected_rx
        .recv_timeout(Duration::from_secs(10))
        .expect("CLI reached the hanging model server");
    drop(watch_writer);

    let deadline = Instant::now() + Duration::from_secs(10);
    let status = loop {
        if let Some(status) = child.try_wait().expect("poll managed CLI") {
            break status;
        }
        assert!(Instant::now() < deadline, "managed CLI ignored parent EOF");
        thread::sleep(Duration::from_millis(10));
    };
    assert_eq!(status.signal(), Some(libc::SIGKILL));
    server.join().expect("join hanging model server");
}

#[cfg(unix)]
#[test]
fn parent_watch_eof_also_kills_a_separate_active_bash_tool_group() {
    let temp = tempfile::tempdir().expect("temp config home");
    let shell_signal = TcpListener::bind("127.0.0.1:0").expect("bind shell signal listener");
    let shell_signal_address = shell_signal.local_addr().expect("shell signal address");
    let (shell_pid_tx, shell_pid_rx) = std::sync::mpsc::channel();
    let shell_signal_server = thread::spawn(move || {
        let (mut stream, _) = shell_signal.accept().expect("accept shell signal");
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .expect("set shell signal timeout");
        let mut pid = String::new();
        stream.read_to_string(&mut pid).expect("read shell PID");
        shell_pid_tx
            .send(pid.trim().parse::<i32>().expect("numeric shell PID"))
            .expect("send shell PID");
    });
    let shell_command = format!(
        "exec 9<>/dev/tcp/{}/{}; printf '%s' \"$$\" >&9; exec 9>&-; sleep 60",
        shell_signal_address.ip(),
        shell_signal_address.port()
    );
    let (base_url, model_server) = spawn_bash_tool_model_server(shell_command);

    let mut pipe_fds = [-1; 2];
    // SAFETY: `pipe_fds` points to storage for both descriptors.
    assert_eq!(unsafe { libc::pipe(pipe_fds.as_mut_ptr()) }, 0);
    let [watch_read_fd, watch_write_fd] = pipe_fds;

    let mut command = Command::new(env!("CARGO_BIN_EXE_khadim-cli"));
    command
        .env("KHADIM_CONFIG_HOME", temp.path())
        .env("KHADIM_RUN_API_KEY", "test-key")
        .args([
            "--json",
            "--provider",
            "openai",
            "--model",
            "gpt-4o-mini",
            "--base-url",
            &base_url,
            "--parent-watch-fd",
            "3",
            "--prompt",
            "run the requested deterministic shell tool",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    // SAFETY: the child receives the read descriptor as fd 3 and closes its
    // inherited copy of the write end, so the parent controls EOF.
    unsafe {
        command.pre_exec(move || {
            if watch_read_fd != 3 {
                if libc::dup2(watch_read_fd, 3) == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                libc::close(watch_read_fd);
            }
            libc::close(watch_write_fd);
            Ok(())
        });
    }

    let mut child = command.spawn().expect("spawn managed CLI");
    // SAFETY: after spawn, the parent exclusively owns the original ends.
    unsafe {
        libc::close(watch_read_fd);
    }
    let watch_writer = unsafe { std::fs::File::from_raw_fd(watch_write_fd) };

    let shell_pid = shell_pid_rx
        .recv_timeout(Duration::from_secs(10))
        .expect("agent started the quiet Bash tool");
    assert!(shell_pid > 1);
    drop(watch_writer);

    let cli_deadline = Instant::now() + Duration::from_secs(10);
    let status = loop {
        if let Some(status) = child.try_wait().expect("poll managed CLI") {
            break status;
        }
        assert!(
            Instant::now() < cli_deadline,
            "managed CLI ignored parent EOF"
        );
        thread::sleep(Duration::from_millis(10));
    };
    assert_eq!(status.signal(), Some(libc::SIGKILL));

    let shell_deadline = Instant::now() + Duration::from_secs(5);
    loop {
        // SAFETY: signal 0 only checks whether this exact process remains.
        let alive = unsafe { libc::kill(shell_pid, 0) } == 0
            || std::io::Error::last_os_error().kind() == std::io::ErrorKind::PermissionDenied;
        if !alive {
            break;
        }
        assert!(
            Instant::now() < shell_deadline,
            "Bash tool process {shell_pid} survived managed parent shutdown"
        );
        thread::sleep(Duration::from_millis(10));
    }

    shell_signal_server
        .join()
        .expect("join shell signal server");
    model_server.join().expect("join tool-call model server");
}
