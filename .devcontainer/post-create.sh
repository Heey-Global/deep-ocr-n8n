#!/bin/bash
set -e

echo "Setting up Deep-OCR N8N Node Development Environment..."

# Enable corepack for pnpm management.
# The sandbox runs with no-new-privileges, so sudo is not available, and
# the devcontainer cannot set PATH via remoteEnv. Prefer the npm global
# bin dir when it is writable and already on PATH; otherwise fall back to
# ~/.local/bin and add it to PATH in the user's shell startup files.
USER_HOME="${HOME:-$(getent passwd "$(id -un)" | cut -d: -f6)}"
NPM_BIN_DIR="$(npm prefix -g 2>/dev/null)/bin"
if [ -d "$NPM_BIN_DIR" ] && [ -w "$NPM_BIN_DIR" ] && [[ ":$PATH:" == *":$NPM_BIN_DIR:"* ]]; then
  BIN_DIR="$NPM_BIN_DIR"
else
  BIN_DIR="$USER_HOME/.local/bin"
  mkdir -p "$BIN_DIR"
  PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
  for rc in "$USER_HOME/.bashrc" "$USER_HOME/.profile"; do
    grep -qxF "$PATH_LINE" "$rc" 2>/dev/null || echo "$PATH_LINE" >> "$rc"
  done
  export PATH="$BIN_DIR:$PATH"
fi
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable --install-directory "$BIN_DIR" pnpm

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
pnpm install

# Build the project
echo "Building project..."
pnpm build

echo ""
echo "Development environment setup complete!"
echo ""
echo "Available commands:"
echo "  pnpm build          - Build the node"
echo "  pnpm test           - Run tests"
echo "  pnpm test:coverage  - Run tests with coverage"
echo "  pnpm lint           - Lint source files"
echo "  pnpm dev            - Watch mode"
echo ""
