#!/bin/sh
set -e

# dotk installer
# Usage: curl -fsSL https://raw.githubusercontent.com/TeamOliveCode/dotk/main/install.sh | sh

INSTALL_DIR="${DOTK_INSTALL_DIR:-$HOME/.dotk}"
BIN_DIR="$INSTALL_DIR/bin"
REPO="TeamOliveCode/dotk"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
DIM='\033[2m'
RESET='\033[0m'

info() { printf "${BLUE}ℹ${RESET} %s\n" "$1"; }
success() { printf "${GREEN}✓${RESET} %s\n" "$1"; }
error() { printf "${RED}✗${RESET} %s\n" "$1" >&2; exit 1; }

# Check prerequisites
command -v node >/dev/null 2>&1 || error "Node.js is required. Install it from https://nodejs.org"

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
[ "$NODE_MAJOR" -ge 18 ] || error "Node.js 18+ is required (found v$(node -v))"

info "Installing dotk..."

# Try downloading from GitHub Releases
mkdir -p "$BIN_DIR"
RELEASE_URL="https://github.com/$REPO/releases/latest/download/dotk"

CLIENT_DIR="$INSTALL_DIR/client"
RELEASE_CLIENT_URL="https://github.com/$REPO/releases/latest/download/client.tar.gz"

if curl -fsSL "$RELEASE_URL" -o "$BIN_DIR/dotk" 2>/dev/null; then
  chmod +x "$BIN_DIR/dotk"
  # Download web client assets
  if curl -fsSL "$RELEASE_CLIENT_URL" 2>/dev/null | tar xz -C "$INSTALL_DIR" 2>/dev/null; then
    success "Downloaded binary and web client from release."
  else
    success "Downloaded binary from release (web client not available)."
  fi
else
  # Fallback: clone and build from source
  info "Release not found, building from source..."
  command -v git >/dev/null 2>&1 || error "Git is required for building from source."

  TEMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TEMP_DIR"' EXIT

  git clone --depth 1 "https://github.com/$REPO.git" "$TEMP_DIR"

  cd "$TEMP_DIR"

  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile
    pnpm bundle
  else
    npm install -g pnpm
    pnpm install --frozen-lockfile
    pnpm bundle
  fi

  cp dist/dotk "$BIN_DIR/dotk"
  chmod +x "$BIN_DIR/dotk"
  # Copy web client assets next to bin dir
  if [ -d "dist/client" ]; then
    rm -rf "$CLIENT_DIR"
    cp -r dist/client "$CLIENT_DIR"
  fi
  success "Built from source."
fi

# Add to PATH
SHELL_NAME=$(basename "$SHELL")
PROFILE=""
case "$SHELL_NAME" in
  zsh)  PROFILE="$HOME/.zshrc" ;;
  bash)
    if [ -f "$HOME/.bash_profile" ]; then
      PROFILE="$HOME/.bash_profile"
    else
      PROFILE="$HOME/.bashrc"
    fi
    ;;
  fish) PROFILE="$HOME/.config/fish/config.fish" ;;
esac

if [ -n "$PROFILE" ]; then
  PATH_LINE="export PATH=\"$BIN_DIR:\$PATH\""
  if [ "$SHELL_NAME" = "fish" ]; then
    PATH_LINE="set -gx PATH $BIN_DIR \$PATH"
  fi

  if ! grep -q "$BIN_DIR" "$PROFILE" 2>/dev/null; then
    printf "\n# dotk\n%s\n" "$PATH_LINE" >> "$PROFILE"
    info "Added $BIN_DIR to PATH in $PROFILE"
  fi
fi

echo ""
success "Installation complete!"
echo ""
printf "${DIM}  Restart your shell or run:${RESET}\n"
printf "    export PATH=\"%s:\$PATH\"\n" "$BIN_DIR"
echo ""
printf "${DIM}  Then get started:${RESET}\n"
printf "    dotk init\n"
echo ""
