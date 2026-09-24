#!/bin/bash
set -e

echo "Setting up Deep-OCR N8N Node Development Environment..."

# Enable corepack for pnpm management.
# Install the shims into the user's bin dir: the sandbox runs with
# no-new-privileges, so sudo is not available.
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
export PATH="$BIN_DIR:$PATH"
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
