---
title: Installation
description: Install Khadim from npm, the installer script, releases, or source.
---

Install Khadim where you want to run the CLI agent. The npm package is the
recommended path for most users because it installs the `khadim` command and
downloads the matching native binary.

## Install with npm

Install Khadim globally:

```bash
npm install -g @unravelai/khadim
```

Confirm the command is available:

```bash
khadim --version
```

The npm package exposes both `khadim` and `khadim-cli`.

## Install with the script

Use the installer script when you want a direct native binary install:

```bash
curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

Install from prebuilt release artifacts:

```bash
KHADIM_CLI_INSTALL_METHOD=prebuilt \
  curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

Build from source through the installer:

```bash
KHADIM_CLI_INSTALL_METHOD=source \
  curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

## Download a release

Prebuilt binaries are published on the
[Khadim releases page](https://github.com/unravelaidk/khadim/releases) for
`cli-v*` tags.

Download the archive for your platform, unpack it, and put the binary on your
`PATH`.

## Build from source

Build from source when you are contributing or testing unreleased changes:

```bash
git clone https://github.com/unravelaidk/khadim.git
cd khadim
cargo build --release --manifest-path apps/khadim-cli/Cargo.toml
```

The release binary is created at:

```text
apps/khadim-cli/target/release/khadim-cli
```

## Requirements

Khadim itself needs a provider credential before the agent can call a model.
Development from source also needs Rust and Bun.

| Use case | Requirements |
| --- | --- |
| npm install | Node.js 18 or newer |
| native binary | A supported Linux or macOS platform |
| source build | Rust latest stable |
| workspace development | Rust latest stable and Bun |

## Next steps

Continue with [First steps](first-steps/) to run your first interactive and
headless tasks.
