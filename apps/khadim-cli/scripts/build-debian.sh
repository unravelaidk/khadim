#!/usr/bin/env bash
set -euo pipefail

CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$CLI_DIR/../.." && pwd)"
OUTPUT_DIR="$CLI_DIR/target-debian"
IMAGE="debian:bookworm"

mkdir -p "$OUTPUT_DIR"

docker run --rm \
  -v "$ROOT_DIR:/src" \
  -w /src \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y curl ca-certificates build-essential pkg-config libssl-dev libdbus-1-dev
    curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal
    export PATH="$HOME/.cargo/bin:$PATH"
    cargo build --release --manifest-path /src/apps/khadim-cli/Cargo.toml
    install -Dm755 /src/apps/khadim-cli/target/release/khadim-cli /src/apps/khadim-cli/target-debian/khadim-cli
  '

printf 'Debian-compatible binary written to %s\n' "$OUTPUT_DIR/khadim-cli"
