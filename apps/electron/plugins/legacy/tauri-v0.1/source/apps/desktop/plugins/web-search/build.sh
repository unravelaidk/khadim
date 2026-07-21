#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "▸ Building web-search plugin (wasm32-unknown-unknown) …"

# Ensure the target is installed
rustup target add wasm32-unknown-unknown 2>/dev/null || true

cargo build --target wasm32-unknown-unknown --release

WASM_SRC="target/wasm32-unknown-unknown/release/khadim_plugin_web_search.wasm"

if [ ! -f "$WASM_SRC" ]; then
    echo "✗ Build failed — WASM binary not found at $WASM_SRC"
    exit 1
fi

cp "$WASM_SRC" plugin.wasm
echo "▸ plugin.wasm written ($(du -h plugin.wasm | cut -f1) )"

# ── Optional: install into the Khadim plugins directory ──────────────

PLUGINS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/khadim/plugins/web-search"

if [ "${1:-}" = "--install" ]; then
    mkdir -p "$PLUGINS_DIR"
    cp plugin.wasm "$PLUGINS_DIR/plugin.wasm"
    cp plugin.toml "$PLUGINS_DIR/plugin.toml"
    echo "▸ Installed to $PLUGINS_DIR"
fi

echo "✓ Done"
