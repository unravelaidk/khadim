use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

fn binary() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_khadim-cli"))
}

fn run(root: &Path, args: &[&str]) -> Output {
    Command::new(binary())
        .args(args)
        .current_dir(root)
        .env("KHADIM_CONFIG_HOME", root.join("config"))
        .env("KHADIM_DATA_HOME", root.join("data"))
        .env("RUST_LOG", "error")
        .stdin(Stdio::null())
        .output()
        .expect("run khadim CLI")
}

fn success_json(root: &Path, args: &[&str]) -> Value {
    let output = run(root, args);
    assert!(
        output.status.success(),
        "command failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).expect("valid JSON output")
}

#[test]
fn persistent_config_and_search_are_manageable_without_the_tui() {
    let temp = tempfile::tempdir().expect("temp directory");
    let root = temp.path();

    success_json(root, &["config", "set", "provider", "anthropic", "--json"]);
    success_json(
        root,
        &["search", "set-key", "exa", "integration-secret", "--json"],
    );
    success_json(root, &["search", "use", "exa", "--json"]);

    let config = success_json(root, &["config", "show", "--json"]);
    assert_eq!(config["provider"], "anthropic");
    assert_eq!(config["searchProvider"], "exa");
    assert_eq!(config["searchApiKeyProviders"], serde_json::json!(["exa"]));
    assert!(
        !String::from_utf8_lossy(&run(root, &["config", "show", "--json"]).stdout)
            .contains("integration-secret")
    );

    success_json(root, &["search", "clear-key", "exa", "--json"]);
    let status = success_json(root, &["search", "status", "--json"]);
    assert_eq!(status["provider"], "duckduckgo");
    assert_eq!(status["ready"], true);
}

#[test]
fn plugin_lifecycle_lists_and_executes_real_wasm_tools() {
    let temp = tempfile::tempdir().expect("temp directory");
    let root = temp.path();
    let example =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/plugins/obsidian-wiki");

    let installed = success_json(
        root,
        &[
            "plugin",
            "install",
            example.to_str().expect("UTF-8 example path"),
            "--json",
        ],
    );
    assert_eq!(installed["id"], "obsidian-wiki");
    assert_eq!(installed["enabled"], true);

    let tools = success_json(root, &["plugin", "tools", "--json"]);
    let tools = tools.as_array().expect("tool array");
    assert!(tools
        .iter()
        .any(|tool| { tool["name"] == "plugin_obsidian_wiki_wiki_health_check" }));

    let result = success_json(
        root,
        &[
            "plugin",
            "run",
            "plugin_obsidian_wiki_wiki_health_check",
            "{}",
            "--json",
        ],
    );
    assert_eq!(result["ok"], true);
    assert!(result["content"]
        .as_str()
        .is_some_and(|content| content.contains("Wiki root does not exist")));

    success_json(root, &["plugin", "disable", "obsidian-wiki", "--json"]);
    let disabled = run(
        root,
        &[
            "plugin",
            "run",
            "plugin_obsidian_wiki_wiki_health_check",
            "{}",
            "--json",
        ],
    );
    assert!(!disabled.status.success());
    let error: Value = serde_json::from_slice(&disabled.stderr).expect("structured CLI error");
    assert_eq!(error["error"]["kind"], "not_found");
}
