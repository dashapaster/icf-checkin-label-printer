#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"

cd "$PROJECT_DIR"
exec "$NODE_BIN" "$PROJECT_DIR/server.js"
