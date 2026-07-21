#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
manifest="$script_dir/../Cargo.toml"
cargo_bin="${CARGO:-cargo}"
tree_output="$(
  "$cargo_bin" tree \
    --locked \
    --no-default-features \
    --manifest-path "$manifest"
)"

for package in xcap enigo rustautogui; do
  if grep -Fq " $package v" <<<"$tree_output"; then
    echo "headless CLI Cargo graph unexpectedly includes $package" >&2
    exit 1
  fi
done

echo "headless CLI Cargo graph excludes xcap, enigo, and rustautogui"
