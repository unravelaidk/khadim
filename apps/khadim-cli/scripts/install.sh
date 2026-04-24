#!/usr/bin/env bash
set -euo pipefail

# Khadim CLI Installer
# Supports Linux, macOS, and Windows (via WSL/Git Bash)

REPO_URL="https://github.com/unravelaidk/khadim"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="khadim-cli"
COMMAND_NAME="khadim"
NPM_PACKAGE="${KHADIM_CLI_NPM_PACKAGE:-@unravelai/khadim}"
CARGO_BIN="${CARGO_HOME:-$HOME/.cargo}/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() {
  printf "${BLUE}info:${NC} %s\n" "$1"
}

success() {
  printf "${GREEN}success:${NC} %s\n" "$1"
}

warn() {
  printf "${YELLOW}warn:${NC} %s\n" "$1"
}

error() {
  printf "${RED}error:${NC} %s\n" "$1" >&2
}

detect_os() {
  case "$(uname -s)" in
    Linux*)     echo "linux";;
    Darwin*)    echo "macos";;
    CYGWIN*|MINGW*|MSYS*) echo "windows";;
    *)          echo "unknown";;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)  echo "x86_64";;
    arm64|aarch64) echo "aarch64";;
    *)             echo "unknown";;
  esac
}

check_command() {
  command -v "$1" >/dev/null 2>&1
}

ensure_dir() {
  if [ ! -d "$1" ]; then
    mkdir -p "$1"
  fi
}

add_to_path() {
  local dir="$1"
  local shell_rc=""

  case "${SHELL:-}" in
    */bash) shell_rc="$HOME/.bashrc" ;;
    */zsh)  shell_rc="$HOME/.zshrc" ;;
    */fish) shell_rc="$HOME/.config/fish/config.fish" ;;
    *)      shell_rc="$HOME/.profile" ;;
  esac

  if [ -f "$shell_rc" ] && [ -w "$shell_rc" ]; then
    if ! grep -q "$dir" "$shell_rc" 2>/dev/null; then
      if printf '\n# Added by Khadim CLI installer\nexport PATH="%s:$PATH"\n' "$dir" >> "$shell_rc" 2>/dev/null; then
        info "Added $dir to PATH in $shell_rc"
        info "Run 'source $shell_rc' or restart your shell to use khadim-cli"
      else
        warn "Could not write to $shell_rc. Please add $dir to your PATH manually."
      fi
    fi
  fi
}

cleanup_tmpdir() {
  local dir="${1:-}"
  if [ -n "$dir" ] && [ -d "$dir" ]; then
    rm -rf "$dir"
  fi
}

find_local_repo() {
  local current_dir
  current_dir="$(pwd)"

  # Check if current directory is the khadim repo root
  if [ -f "$current_dir/apps/khadim-cli/Cargo.toml" ] && [ -d "$current_dir/.git" ]; then
    echo "$current_dir"
    return 0
  fi

  # Check if we're inside the khadim repo
  local check_dir="$current_dir"
  while [ "$check_dir" != "/" ]; do
    if [ -f "$check_dir/apps/khadim-cli/Cargo.toml" ] && [ -d "$check_dir/.git" ]; then
      echo "$check_dir"
      return 0
    fi
    check_dir="$(dirname "$check_dir")"
  done

  return 1
}

install_from_npm() {
  local version="${1:-latest}"
  local package_spec="$NPM_PACKAGE"
  local package_manager=""

  if [ "$version" = "latest" ]; then
    package_spec="${NPM_PACKAGE}@latest"
  else
    package_spec="${NPM_PACKAGE}@${version}"
  fi

  if check_command npm; then
    package_manager="npm"
  elif check_command bun; then
    package_manager="bun"
  else
    if [ "${KHADIM_CLI_INSTALL_METHOD:-}" = "npm" ]; then
      error "npm or bun is required for KHADIM_CLI_INSTALL_METHOD=npm."
      exit 1
    fi
    warn "npm or bun is required for the default install method. Falling back to source build."
    install_from_source
    return
  fi

  info "Installing $package_spec globally with $package_manager..."
  if [ "$package_manager" = "bun" ]; then
    if bun install -g "$package_spec"; then
      success "Installed $package_spec with bun"
      return
    fi
  else
    if npm install -g "$package_spec"; then
      success "Installed $package_spec with npm"
      return
    fi
  fi

  if [ "${KHADIM_CLI_INSTALL_METHOD:-}" = "npm" ]; then
    error "npm installation failed."
    info "If this package is not published yet, use: KHADIM_CLI_INSTALL_METHOD=source $0"
    exit 1
  fi

  warn "npm installation failed. Falling back to source build."
  install_from_source
}

install_from_source() {
  info "Installing from source..."

  if ! check_command cargo; then
    error "Rust/Cargo is required but not installed."
    info "Install Rust: https://rustup.rs/"
    info "Or run: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
  fi

  local rust_version
  rust_version=$(rustc --version | awk '{print $2}')
  info "Found Rust $rust_version"

  local source_dir=""
  local using_local=0

  # Try to find a local copy of the repo first
  if source_dir="$(find_local_repo 2>/dev/null)"; then
    info "Using local repository at $source_dir"
    using_local=1
  fi

  local tmpdir=""
  if [ "$using_local" -eq 0 ]; then
    if ! check_command git; then
      error "git is required to install from source."
      exit 1
    fi

    tmpdir=$(mktemp -d)
    trap "cleanup_tmpdir '$tmpdir'" EXIT

    info "Cloning repository..."
    if ! git clone --depth 1 "$REPO_URL" "$tmpdir/khadim"; then
      error "Failed to clone repository from $REPO_URL"
      error "If this is a private repository, ensure you have access or clone it manually."
      exit 1
    fi

    source_dir="$tmpdir/khadim"
  fi

  info "Building khadim-cli (this may take a few minutes)..."
  if ! cargo build --release --manifest-path "$source_dir/apps/khadim-cli/Cargo.toml"; then
    error "Build failed."
    if [ "$using_local" -eq 0 ]; then
      error "Ensure you have the required system dependencies (e.g., libssl-dev on Debian/Ubuntu)."
    fi
    exit 1
  fi

  local built_binary
  built_binary="$source_dir/apps/khadim-cli/target/release/$BINARY_NAME"

  if [ ! -f "$built_binary" ]; then
    error "Build completed but binary not found at expected path: $built_binary"
    exit 1
  fi

  ensure_dir "$INSTALL_DIR"
  cp "$built_binary" "$INSTALL_DIR/$BINARY_NAME"
  chmod +x "$INSTALL_DIR/$BINARY_NAME"

  success "Built and installed $BINARY_NAME to $INSTALL_DIR"
}

install_prebuilt() {
  local version="${1:-latest}"
  local os="$2"
  local arch="$3"

  local asset_name="${BINARY_NAME}-${os}-${arch}"
  local download_url

  if [ "$version" = "latest" ]; then
    download_url="$REPO_URL/releases/latest/download/$asset_name"
  else
    download_url="$REPO_URL/releases/download/$version/$asset_name"
  fi

  info "Downloading prebuilt binary for ${os}-${arch}..."

  local tmpdir=""
  tmpdir=$(mktemp -d)
  trap "cleanup_tmpdir '$tmpdir'" EXIT

  local downloaded="$tmpdir/$BINARY_NAME"

  local download_success=0
  if check_command curl; then
    if curl -fsSL -o "$downloaded" "$download_url" 2>/dev/null; then
      download_success=1
    fi
  elif check_command wget; then
    if wget -q -O "$downloaded" "$download_url" 2>/dev/null; then
      download_success=1
    fi
  fi

  if [ "$download_success" -eq 0 ]; then
    warn "Could not download prebuilt binary. Falling back to building from source."
    # Clear trap so cleanup_tmpdir doesn't try to clean up after install_from_source sets its own
    trap - EXIT
    install_from_source
    return
  fi

  ensure_dir "$INSTALL_DIR"
  cp "$downloaded" "$INSTALL_DIR/$BINARY_NAME"
  chmod +x "$INSTALL_DIR/$BINARY_NAME"

  success "Downloaded and installed $BINARY_NAME to $INSTALL_DIR"
}

main() {
  local os
  local arch
  os=$(detect_os)
  arch=$(detect_arch)

  info "Detected OS: $os"
  info "Detected architecture: $arch"

  if [ "$os" = "unknown" ] || [ "$arch" = "unknown" ]; then
    warn "Unsupported platform: ${os}-${arch}"
    info "Will attempt to build from source instead."
    install_from_source
  else
    case "${KHADIM_CLI_INSTALL_METHOD:-npm}" in
      npm)
        install_from_npm "${KHADIM_CLI_VERSION:-latest}"
        ;;
      prebuilt)
        install_prebuilt "${KHADIM_CLI_VERSION:-latest}" "$os" "$arch"
        ;;
      source)
        install_from_source
        ;;
      *)
        error "Unknown KHADIM_CLI_INSTALL_METHOD: ${KHADIM_CLI_INSTALL_METHOD}"
        info "Use one of: npm, prebuilt, source"
        exit 1
        ;;
    esac
  fi

  if [ -f "$INSTALL_DIR/$BINARY_NAME" ] && ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
    add_to_path "$INSTALL_DIR"
  fi

  local installed_command=""
  if [ -x "$INSTALL_DIR/$BINARY_NAME" ]; then
    installed_command="$INSTALL_DIR/$BINARY_NAME"
  elif check_command "$COMMAND_NAME"; then
    installed_command="$COMMAND_NAME"
  elif check_command "$BINARY_NAME"; then
    installed_command="$BINARY_NAME"
  fi

  if [ -n "$installed_command" ]; then
    success "Installation complete!"
    info "Command: $installed_command"

    local version
    version=$($installed_command --version 2>/dev/null || echo "unknown")
    info "Installed version: $version"

    if [ "$installed_command" = "$INSTALL_DIR/$BINARY_NAME" ] && ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
      warn "$INSTALL_DIR is not in your PATH"
      info "Add it to your PATH or run: export PATH=\"$INSTALL_DIR:\$PATH\""
    fi
  else
    error "Installation finished, but neither '$COMMAND_NAME' nor '$BINARY_NAME' was found on PATH."
    if check_command npm; then
      local npm_global_bin
      npm_global_bin=$(npm bin -g 2>/dev/null || true)
      if [ -z "$npm_global_bin" ]; then
        npm_global_bin="$(npm prefix -g 2>/dev/null)/bin"
      fi
      info "npm global bin: $npm_global_bin"
    fi
    exit 1
  fi
}

main "$@"
