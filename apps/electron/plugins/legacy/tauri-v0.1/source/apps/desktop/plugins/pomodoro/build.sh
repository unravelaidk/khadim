#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "▶ Building WASM (agent tools)..."
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/khadim_plugin_pomodoro.wasm plugin.wasm
echo "  plugin.wasm: $(wc -c < plugin.wasm | tr -d ' ') bytes"

echo "▶ Building UI (React + Vite)..."
bun run vite build
echo "  ui.js: $(wc -c < ui.js | tr -d ' ') bytes"

echo "✓ Pomodoro plugin built."
