# khadim-cli

CLI coding agent for Khadim. An AI agent that runs in your terminal — reads your code, writes and runs scripts, understands failures, and retries.

## Quick Install

```bash
# npm (recommended)
npm install -g @unravelai/khadim

# Or use the install script
curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

The package exposes both `khadim` and `khadim-cli` commands.

### Other Install Methods

```bash
# Prebuilt binary from GitHub Releases
KHADIM_CLI_INSTALL_METHOD=prebuilt curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash

# Build from source
KHADIM_CLI_INSTALL_METHOD=source curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash

# Custom install directory (source/prebuilt only)
KHADIM_CLI_INSTALL_METHOD=source INSTALL_DIR=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

### Manual Build

```bash
git clone https://github.com/unravelaidk/khadim.git
cd khadim
cargo build --release --manifest-path apps/khadim-cli/Cargo.toml
# Binary: apps/khadim-cli/target/release/khadim-cli
```

### Prebuilt Binaries

Prebuilt binaries are available on the [releases page](https://github.com/unravelaidk/khadim/releases) for tags matching `cli-v*`.

---

## Usage

```bash
# Prompt mode
khadim --prompt "summarize this repo"

# Headless exec mode
khadim exec "summarize failures" < build.log

# Pipe stdin as context
echo "error: timeout on line 42" | khadim --prompt "fix this"

# Run in a specific directory
khadim --cwd /path/to/project
```

`--prompt -` reads the entire prompt from stdin.

The agent discovers `AGENTS.md` files in the workspace and injects scoped repository instructions into the system prompt. Nested `AGENTS.md` files override broader ones for files under their scope.

---

## Configuration

Environment variables:

| Variable | Description |
|----------|-------------|
| `KHADIM_PROVIDER` | Default provider (default: `openai`) |
| `KHADIM_MODEL` | Default model for the provider |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GROQ_API_KEY` | Groq API key |
| `XAI_API_KEY` | xAI Grok API key |
| ... | See [root README](../../README.md#supported-providers) for all providers |

---

## Development

```bash
cd apps/khadim-cli

# Run in dev mode
npm run dev -- --prompt "hello"

# Build release binary
npm run build:release

# Build distributable bin
npm run dist:bin
./dist/bin/khadim --help

# Stage npm tarballs (requires built artifacts)
python3 scripts/stage_npm_package.py --version 0.2.1 --package all --artifact-dir ./artifacts
```
