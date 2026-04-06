#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
    echo "▸ Installing dependencies …"
    npm install
fi

echo "▸ Building TypeScript plugin (AssemblyScript → WASM) …"
npx asc assembly/index.ts --target release

WASM_SRC="build/release.wasm"
if [ ! -f "$WASM_SRC" ]; then
    echo "✗ Build failed — WASM binary not found"
    exit 1
fi

cp "$WASM_SRC" plugin.wasm
echo "▸ plugin.wasm written ($(du -h plugin.wasm | cut -f1))"

# Optional: install into the Khadim plugins directory
if [ "${1:-}" = "--install" ]; then
    PLUGINS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/khadim/plugins/ts-hello-world"
    mkdir -p "$PLUGINS_DIR"
    cp plugin.wasm "$PLUGINS_DIR/plugin.wasm"
    cp plugin.toml "$PLUGINS_DIR/plugin.toml"
    echo "▸ Installed to $PLUGINS_DIR"
fi

echo "✓ Done"
