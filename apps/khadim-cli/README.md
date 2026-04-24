# khadim-cli

CLI coding agent for Khadim.

## Installation

### Quick Install (Unix/Linux/macOS)

Run the install script:

```bash
curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

Or with `wget`:

```bash
wget -qO- https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

The installer will:
1. Install `@unravelai/khadim` globally with npm or bun by default
2. Expose both `khadim` and `khadim-cli` commands
3. Fall back to a Rust source build only if npm/bun is unavailable
4. Update your shell configuration to add `~/.local/bin` to `PATH` when using source/prebuilt installs

### Install Method

The default method is npm:

```bash
KHADIM_CLI_INSTALL_METHOD=npm curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

Use the source builder when developing locally or before the npm package is published:

```bash
KHADIM_CLI_INSTALL_METHOD=source curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

### Custom Install Directory

`INSTALL_DIR` applies to source/prebuilt installs. npm installs use your npm global prefix.

```bash
KHADIM_CLI_INSTALL_METHOD=source INSTALL_DIR=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

### Build from Source Manually

```bash
git clone https://github.com/unravelaidk/khadim.git
cd khadim
cargo build --release --manifest-path apps/khadim-cli/Cargo.toml
```

The binary will be available at `apps/khadim-cli/target/release/khadim-cli`.

### npm

Khadim CLI can also be distributed as a Codex-style npm package: a small JavaScript launcher plus platform-specific native binary packages.

```bash
npm install -g @unravelai/khadim
khadim --help
```

The npm package exposes both `khadim` and `khadim-cli` commands.

### Prebuilt Binaries

Prebuilt binaries are available on the [releases page](https://github.com/unravelaidk/khadim/releases) for tags matching `cli-v*`.

To attempt installing a prebuilt binary instead of using npm:

```bash
KHADIM_CLI_INSTALL_METHOD=prebuilt curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

### Local dist binaries

Build a directly runnable local distribution binary with:

```bash
cd apps/khadim-cli
npm run dist:bin
./dist/bin/khadim --help
```

This creates both `dist/bin/khadim` and `dist/bin/khadim-cli`.

### Staging npm tarballs

After release binaries have been downloaded into an artifact directory, stage npm tarballs with:

```bash
python3 apps/khadim-cli/scripts/stage_npm_package.py \
  --version 0.1.0 \
  --package all \
  --artifact-dir ./artifacts
```

This produces one main `@unravelai/khadim` launcher tarball and one native tarball per supported platform in `apps/khadim-cli/dist/npm`.

For local development, `npm run dist` creates both the runnable `dist/bin` binaries and the main npm tarball.

## Usage

```bash
cargo run --manifest-path apps/khadim-cli/Cargo.toml -- --prompt "summarize this repo"
cargo run --manifest-path apps/khadim-cli/Cargo.toml -- exec "summarize this repo"
printf 'build log...' | cargo run --manifest-path apps/khadim-cli/Cargo.toml -- exec "summarize failures"
cargo run --manifest-path apps/khadim-cli/Cargo.toml -- --cwd /path/to/project
```

Headless `exec` mode follows Codex-style stdin behavior: when both a prompt and piped stdin are provided, stdin is appended as a `<stdin>` block. `--prompt -` reads the entire prompt from stdin.

The agent also discovers `AGENTS.md` files in the workspace and injects their scoped repository instructions into the system prompt. Nested `AGENTS.md` files override broader ones for files under their scope.

Environment defaults:

- `KHADIM_PROVIDER`
- `KHADIM_MODEL`
- provider-specific API keys like `OPENAI_API_KEY`
