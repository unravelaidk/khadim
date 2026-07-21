# OpenCode harness plugin

The bundled OpenCode plugin connects Khadim chats to OpenCode, keeps a durable
OpenCode session for each project chat, and maps OpenCode server events to
Khadim's normalized stream.

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development.

## Local server lifecycle

Leave **Server URL** blank (the default) and Khadim starts `opencode serve` on
an available loopback port when a chat first uses the harness. The child server
is reused by that chat, monitored for early exit, and stopped with the app. The
app waits up to 30 seconds for OpenCode's readiness line.

The **Binary path** defaults to `opencode`. Set it to the full executable path
when a desktop launch environment cannot find the CLI. OpenCode must already be
installed and authenticated with `opencode auth login`.

A blank server URL is managed by Khadim. Khadim treats a configured URL as an
externally managed server.

## External server

To use an existing server, enter its loopback URL in **Server URL**. For
example, start it on port `4096`:

```sh
opencode serve --hostname 127.0.0.1 --port 4096
```

To require HTTP Basic Auth, set the server password before starting it. The
default username is `opencode`.

```sh
OPENCODE_SERVER_PASSWORD="replace-with-a-secret" \
  opencode serve --hostname 127.0.0.1 --port 4096
```

See the official [OpenCode server documentation](https://opencode.ai/docs/server/)
for server flags, authentication, endpoints, and the OpenAPI specification.

## Configure Khadim

Open **Apps and capabilities**, find **OpenCode** under **Plugins**, and select
**Configure**. Leave the server URL blank for automatic local startup.

Set the username and password when the server uses Basic Auth. You can also set
an OpenCode agent and a provider/model override. By default, the plugin omits a
model so OpenCode uses its own configured default.

Open a chat, select **Tools**, then choose **OpenCode** under **Work mode**.
Khadim prepares or connects to the server, checks `/global/health`, creates or
resumes an OpenCode session, starts the `/event` stream, submits through
`prompt_async`, and cancels through the session abort endpoint when you stop a
run.

Khadim sends `x-opencode-directory` with the active project's canonical path so
the OpenCode server resolves project config and tools in the same directory.

## Build the plugin

Install the Rust WebAssembly target, then run the app-level build script.

```sh
rustup target add wasm32-unknown-unknown
bun run plugins:build
```

The script compiles the Rust source with host-imported bounded memory and stages
`dist/opencode.wasm` for development and Electron packaging.

## Server API mapping

The plugin uses the current OpenCode server contract.

| Purpose | OpenCode endpoint |
| --- | --- |
| Health check | `GET /global/health` |
| Create session | `POST /session` |
| Resume session | `GET /session/:id` |
| Submit prompt | `POST /session/:id/prompt_async` |
| Stream events | `GET /event` |
| Cancel run | `POST /session/:id/abort` |

Text deltas, tool states, token usage, session errors, and idle completion map
to the existing Khadim `text_delta`, `step_*`, `usage`, `error`, and `done`
events.
