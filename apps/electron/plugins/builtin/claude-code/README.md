# Claude Code harness plugin

The bundled Claude Code plugin connects a Khadim chat to the local Claude Code
runtime. It preserves one Claude session per project chat, streams Agent SDK
events into Khadim's normalized event model, and stops the query when you
cancel a run or close the app.

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development.

## Requirements

Install Claude Code and authenticate it before you select this harness.

```sh
claude auth login
claude --version
```

The **Binary path** setting defaults to `claude`. Set an absolute path when a
desktop launch environment can't find the CLI.

## Configure Khadim

Open **Apps and capabilities**, find **Claude Code** under **Plugins**, and
select **Configure**. The following settings control each Claude process:

- **Claude config directory** sets an optional `CLAUDE_CONFIG_DIR` for a
  separate account and Claude configuration without relocating the operating
  system home or macOS keychain lookup.
- **Permission mode** sets `default`, `acceptEdits`, `dontAsk`, `plan`, `auto`,
  or `bypassPermissions`.
- **Available tools** restricts which tools Claude can use. **Pre-approved
  tools** only skips prompts for the named tools; it is not an allowlist.
- **Disallowed tools** denies matching tools.
- **Trust project settings** opts into project and local Claude settings,
  including hooks and MCP servers. These are excluded by default.
- **Reasoning effort** sets `low`, `medium`, `high`, `xhigh`, or `max`.

Open a chat, select **Tools**, and choose **Claude Code** under **Work mode**.
Then select the Claude model from the model control in the chat composer.
Khadim probes `claude --version` and replaces the direct-API model list with
the Claude Code models supported by that installed CLI. It remembers the
selection for this harness, runs Claude in the active project's canonical
directory, passes the saved model ID for that run, and appends the selected
agent's system prompt to Claude Code's default coding prompt.

## Permission modes

The plugin defaults to `acceptEdits` so its non-interactive runs can perform
normal coding changes while retaining Claude's other permission checks.

<!-- prettier-ignore -->
> [!WARNING]
> `bypassPermissions` gives Claude Code unrestricted tool approval. Use it
> only for a project and environment you trust. Khadim bridges
> `AskUserQuestion`, but it does not yet bridge Claude's general tool approval
> callback into the desktop approval dialog.

Use `acceptEdits` when you want Claude to apply file edits without bypassing all
other permission checks. Use `plan` for analysis without implementation.

Claude runs as a native process with access to the selected project and the
network. Khadim passes only runtime variables and Anthropic credentials, keeps
prompts out of process arguments, and excludes project/local Claude settings by
default. Enabling **Trust project settings** allows project hooks and MCP
servers to run with your user permissions.

## Runtime lifecycle

The WebAssembly plugin remains process-free. A host-owned loopback bridge holds
the native process privilege and exposes only the HTTP and server-sent event
contract that all Khadim harness plugins use.

```text
Claude Code WASM plugin
        |
        | authenticated loopback HTTP + SSE
        v
Electron bridge manager
        |
        | Agent SDK query, project cwd, bounded async prompt stream
        v
Claude Code executable
```

The bridge generates an SDK session UUID for the first turn. Later turns in the
same chat resume that UUID. After an app restart, the plugin restores the saved
UUID and Claude Code resumes its native on-disk transcript.

Cancellation terminates the owned process tree and waits for process closure.
Deleting a chat or project stops its bridge, relocation updates the safe working
directory, and application shutdown stops every Claude process, event stream,
and loopback server. A missing persisted Claude transcript is retried once as a
new session using the same Khadim session ID.

## Event mapping

The plugin maps Claude's native stream into the same events used by other
Khadim engines.

| Claude event | Khadim event |
| --- | --- |
| Partial text delta | `text_delta` |
| Tool block start | `step_start` |
| Complete tool input | `step_update` |
| Tool result | `step_complete` |
| Result usage | `usage` |
| `AskUserQuestion` | `question` |
| Successful result | `done` |
| Failed result or process exit | `error` |

Thinking deltas and unsupported telemetry don't enter the visible assistant
message. `AskUserQuestion` pauses inside the SDK permission callback until the
user answers in Khadim's composer. Events for a different Claude session ID
are ignored.

## Build and test the plugin

Build all bundled harness plugins through the app-level script.

```sh
rustup target add wasm32-unknown-unknown
bun run plugins:build
bun run test -- tests/integration/main/claude-code-plugin.test.ts
```

Electron packaging copies `khadim.plugin.json` and
`claude-code.wasm` through the bundled-plugin resource rule. The compiled WASM
is kept at the plugin root so clean checkouts can run integration tests without
requiring a Rust toolchain; `plugins:build` refreshes it.

## Implementation references

The integration follows the current T3 Code Claude provider's session,
streaming, model, project-directory, and interruption boundaries. Khadim uses
its existing WASM plugin contract and a CLI bridge instead of importing T3
Code's provider framework.

- [T3 Code Claude adapter](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/ClaudeAdapter.ts)
- [T3 Code Claude provider](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/ClaudeProvider.ts)
- [Claude Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)

The Parallel Web research captures live in
[`research/t3code-claude-code-integration.json`](../../../research/t3code-claude-code-integration.json)
and
[`research/t3code-repository-source.json`](../../../research/t3code-repository-source.json).
The harness-specific model-discovery comparison is captured in
[`research/t3code-harness-model-discovery.json`](../../../research/t3code-harness-model-discovery.json).
