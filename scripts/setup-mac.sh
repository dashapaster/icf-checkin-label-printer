#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

"$PROJECT_DIR/scripts/generate-cert.sh"
"$PROJECT_DIR/scripts/trust-cert.sh"

echo
echo "Setup finished. Start the simulator with:"
echo "  npm start"
