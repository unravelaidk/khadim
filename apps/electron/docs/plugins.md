# WebAssembly plugins

Khadim plugins are versioned WebAssembly packages that add capabilities without
receiving direct access to Electron, Node.js, or the renderer. This guide
explains the package format, runtime boundary, SDKs, lifecycle, and harness
contract implemented by the Electron app.

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development.

## Architecture

The main process discovers and validates each package before it creates a
short-lived worker for a plugin call. The worker gives the module bounded
linear memory and no filesystem, process, renderer, or network imports.

```text
Renderer                    Electron main process            Worker
   |                                |                           |
   | typed preload API              | validate manifest         |
   |------------------------------->| enforce permissions       |
   |                                |-------------------------->|
   |                                |     call core WASM ABI     |
   |                                |<--------------------------|
   |                                | perform allowed HTTP I/O   |
   | normalized agent events        | persist host-owned state  |
   |<-------------------------------|                           |
```

Workers have a 5-second call deadline, a 16 MB maximum WebAssembly memory, and
small JavaScript heap limits. The host terminates the worker after every call.
This design prevents a plugin from retaining Node.js objects or Electron
handles between calls.

## Package format

A package is a directory containing `khadim.plugin.json` and the WebAssembly
module named by its `main` field. Khadim copies only those two files when you
install a user plugin.

```text
calendar-harness/
├── khadim.plugin.json
└── dist/
    └── calendar-harness.wasm
```

The following manifest declares a harness with an HTTPS permission and one
secret config field:

```json
{
  "apiVersion": 1,
  "id": "example.calendar-harness",
  "name": "Calendar harness",
  "version": "1.0.0",
  "description": "Runs calendar planning through an external harness.",
  "main": "dist/calendar-harness.wasm",
  "capabilities": ["harness"],
  "permissions": {
    "network": {
      "allowedHosts": ["calendar.example.com"]
    }
  },
  "config": [
    {
      "key": "token",
      "label": "API token",
      "type": "secret",
      "required": true
    }
  ]
}
```

Plugin IDs, capability IDs, and config keys use letters, numbers, dots,
underscores, and hyphens. Versions use semantic versioning. `apiVersion` must
be `1` for the current host.

## Permissions and secrets

The v1 runtime supports host-owned network access for harness plugins. A
manifest must list every allowed host. Plain HTTP also requires
`allowHttp: true`; use it only for a loopback development server.

Khadim rejects redirects, cross-origin paths, URL credentials, oversized
responses, and forbidden transport headers. Every harness call receives the
active project path in its context, so protocol adapters can add the appropriate
project header. The host never exposes an unrestricted `fetch` function to
WebAssembly.

Config fields can use `string`, `secret`, `boolean`, or `number`. Khadim stores
secret fields with the operating system credential vault and returns only a
configured status to the renderer. The decrypted value exists only in the
main process and the short-lived plugin worker for the call that needs it.

### Trust model and current limits

User-installed packages are local and unsigned in v1. They are installed
disabled, and must be reviewed, configured, and explicitly enabled. The
WebAssembly boundary prevents ambient machine access, but it does not make a
plugin's logic trustworthy: a plugin receives its declared config values and
can include them in requests to an allowed host. Install plugins only from a
source you trust and grant the narrowest practical host allowlist.

The v1 runtime has no plugin JavaScript, HTML, native-code, shell, or direct
filesystem extension points. Signing, publisher identity, registry delivery,
and update verification remain future ecosystem work.

## Core ABI

Every plugin exports the following core WebAssembly functions. Strings and
objects cross the ABI as UTF-8 JSON. A returned `i64` packs the output pointer
in the high 32 bits and its length in the low 32 bits.

- `khadim_abi_version() -> i32`
- `khadim_alloc(length: i32) -> i32`
- `khadim_dealloc(pointer: i32, length: i32)`
- `khadim_plugin_info() -> i64`
- `khadim_capabilities() -> i64`
- `khadim_call(operation_ptr, operation_len, input_ptr, input_len) -> i64`

The module must import and re-export host-provided memory. Rust plugins use
`khadim:host/memory`; the host also accepts AssemblyScript's conventional
`env/memory` name. A module cannot declare other imports. See the language-neutral
[`khadim-plugin-v1.wit`](../plugin-sdk/wit/khadim-plugin-v1.wit) contract for
the component-level data model.

## SDKs

Khadim includes SDKs for two WebAssembly toolchains. Both target the same ABI,
so a package built in either language has the same manifest and runtime
behavior.

- The [Rust SDK](../plugin-sdk/rust/README.md) provides typed metadata,
  capability records, JSON dispatch, allocation exports, and the
  `export_plugin!` macro.
- The
  [AssemblyScript SDK](../plugin-sdk/assemblyscript/README.md) provides bounded
  memory allocation, UTF-8 helpers, and result-envelope helpers.

## Harness operations

A harness capability handles a small set of operation names through
`khadim_call`. The plugin returns request plans, and the host performs each
request after permission checks.

| Operation | Result |
| --- | --- |
| `harness.endpoint` | Base URL and optional request headers. |
| `harness.health` | Health-check request. |
| `harness.session.get` | Request that verifies a saved remote session. |
| `harness.session.create` | Request that creates a remote session. |
| `harness.session.parse` | Remote session ID parsed from the create response. |
| `harness.events` | Server-sent event stream request. |
| `harness.prompt` | Asynchronous prompt request. |
| `harness.event` | Normalized Khadim events mapped from one server event. |
| `harness.abort` | Request that cancels the remote session. |

The host persists the remote session mapping by plugin, project path, and chat
session key. A later prompt in the same Khadim chat resumes the same remote
session. If the remote server returns `404`, Khadim creates a new session and
replaces the mapping.

The bundled OpenCode harness additionally has a host-owned local server
lifecycle. With an empty Server URL, Khadim resolves the configured OpenCode
binary, starts `opencode serve` on a free loopback port, waits for readiness,
reuses that process for the chat, and terminates it during app shutdown. A
non-empty Server URL remains externally managed. This process privilege is not
available to user-installed WebAssembly plugins.

## Install and manage plugins

Open **Apps and capabilities**, then use the **Plugins** section to manage the
local plugin set.

1. Select **Install plugin** and choose the package directory.
2. Review the plugin's declared capabilities and network permissions.
3. Configure required fields. Entering a secret replaces the saved value;
   leaving the secret field empty keeps the existing value.
4. Enable the plugin.
5. Open a chat's **Tools** menu and select the plugin harness under **Work
   mode**.

Bundled plugins can be disabled but not removed. New user-installed plugins are
disabled until you enable them and live in the Electron user-data `plugins`
directory. Enablement, config, and durable plugin-owned key-value state live in
`plugins.json`.

## Migration from the Tauri prototype

The retired Tauri desktop host established the first `plugin.toml`, WIT, tool,
permission, config, store, and plugin-manager concepts. The Electron host keeps
those domain ideas but changes the trust boundary.

- The old host instantiated Wasmtime modules inside the application process.
  The Electron host uses a terminated worker for every call.
- The old host exposed synchronous filesystem and HTTP imports. The v1 host
  accepts declarative request plans and performs I/O itself.
- The old host could inject plugin JavaScript into the renderer. The v1 host
  exposes no renderer extension point.
- The old ABI focused on agent tools. The v1 capability model can grow across
  harness, tool, and connector SDK surfaces without coupling the core ABI to
  one feature.

The restored [legacy Tauri reference](../plugins/legacy/tauri-v0.1) preserves
the historical WIT interface, Rust host, manifests, plugin implementations, and
custom-tab source from commit `64312d4`. Generated binaries are excluded. Use
the archive as design history, not as the Electron runtime contract.

## Next steps

Build the bundled [OpenCode plugin](../plugins/builtin/opencode/README.md), or
start a new plugin with one of the SDKs. Add new host capabilities only after
defining their manifest permission, worker boundary, normalized result type,
and cancellation behavior.
