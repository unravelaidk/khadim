#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=install.sh
source "$SCRIPT_DIR/install.sh"

assert_equal() {
  local expected="$1"
  local actual="$2"
  if [ "$actual" != "$expected" ]; then
    echo "expected '$expected', got '$actual'" >&2
    exit 1
  fi
}

assert_equal "khadim-cli" "$(binary_filename linux)"
assert_equal "khadim-cli" "$(binary_filename macos)"
assert_equal "khadim-cli.exe" "$(binary_filename windows)"
assert_equal "khadim-cli-linux-x86_64" "$(release_asset_name linux x86_64)"
assert_equal "khadim-cli-macos-aarch64" "$(release_asset_name macos aarch64)"
assert_equal "khadim-cli-windows-x86_64.exe" "$(release_asset_name windows x86_64)"
assert_equal "khadim-cli-windows-aarch64.exe" "$(release_asset_name windows aarch64)"

check_linux_binary_compatibility linux glibc:2.35
check_linux_binary_compatibility linux glibc:2.99
check_linux_binary_compatibility macos musl

for unsupported in glibc:2.34 musl unknown; do
  if output=$(check_linux_binary_compatibility linux "$unsupported" 2>&1); then
    echo "expected Linux libc '$unsupported' to be rejected" >&2
    exit 1
  fi
  case "$unsupported" in
    musl)
      [[ "$output" == *"musl-based distributions such as Alpine are not supported"* ]]
      ;;
    glibc:*)
      [[ "$output" == *"require glibc 2.35+; found glibc 2.34"* ]]
      ;;
    unknown)
      [[ "$output" == *"could not verify glibc 2.35+"* ]]
      ;;
  esac
  [[ "$output" == *"KHADIM_CLI_INSTALL_METHOD=source"* ]]
done
