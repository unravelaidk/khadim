#!/usr/bin/env bash
set -euo pipefail

# Khadim CLI Local Installer
# Installs the locally built khadim-cli to $HOME/.local/bin

INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="khadim-cli"
COMMAND_NAME="khadim"

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

# Check for cargo
if ! command -v cargo >/dev/null 2>&1; then
    error "Rust/Cargo is required but not installed."
    info "Install Rust: https://rustup.rs/"
    exit 1
fi

# Determine the project root (assuming this script is in apps/khadim-cli)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"  # we are already in the khadim-cli directory

info "Installing khadim-cli from $PROJECT_ROOT to $INSTALL_DIR"

# Ensure install directory exists
mkdir -p "$INSTALL_DIR"

# Build and install using cargo
info "Building and installing with cargo..."
if cargo install --path "$PROJECT_ROOT" --root "$INSTALL_DIR" --force; then
    success "Successfully installed $BINARY_NAME to $INSTALL_DIR"
else
    error "Failed to install $BINARY_NAME"
    exit 1
fi

# Add install directory to PATH if not present
case ":$PATH:" in
    *:"$INSTALL_DIR":*) ;;
    *)
        # Determine user's shell rc file
        SHELL_RC=""
        case "${SHELL:-}" in
            */bash) SHELL_RC="$HOME/.bashrc" ;;
            */zsh)  SHELL_RC="$HOME/.zshrc" ;;
            */fish) SHELL_RC="$HOME/.config/fish/config.fish" ;;
            *)      SHELL_RC="$HOME/.profile" ;;
        esac

        if [ -f "$SHELL_RC" ] && [ -w "$SHELL_RC" ]; then
            if ! grep -q "$INSTALL_DIR" "$SHELL_RC" 2>/dev/null; then
                {
                    echo ""
                    echo "# Added by khadim-cli local installer"
                    echo "export PATH=\"\$PATH:$INSTALL_DIR\""
                } >> "$SHELL_RC"
                info "Added $INSTALL_DIR to PATH in $SHELL_RC"
                info "Please run 'source $SHELL_RC' or restart your shell to use '$COMMAND_NAME'"
            else
                info "$INSTALL_DIR is already in PATH in $SHELL_RC"
            fi
        else
            warn "Could not automatically add $INSTALL_DIR to PATH."
            warn "Please add it manually: export PATH=\"\$PATH:$INSTALL_DIR\""
        fi
        ;;
esac

success "Installation complete. You can now run '$COMMAND_NAME' from your terminal."