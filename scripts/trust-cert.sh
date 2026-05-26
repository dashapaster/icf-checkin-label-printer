#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CA_CERT_PATH="$PROJECT_DIR/certs/local-ca.pem"
SERVER_CERT_PATH="$PROJECT_DIR/certs/localhost-cert.pem"
LOGIN_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
CERT_NAME="ICF Check-in Local CA"

if [[ ! -f "$CA_CERT_PATH" || ! -f "$SERVER_CERT_PATH" ]]; then
  "$PROJECT_DIR/scripts/generate-cert.sh"
fi

while security delete-certificate -c "$CERT_NAME" "$LOGIN_KEYCHAIN" >/dev/null 2>&1; do
  :
done

security add-trusted-cert \
  -r trustRoot \
  -p ssl \
  -k "$LOGIN_KEYCHAIN" \
  "$CA_CERT_PATH"

echo "Trusted local CA:"
echo "  $CA_CERT_PATH"
echo
echo "Restart Chrome before testing:"
echo "  https://127.0.0.1:41951/DYMO/DLS/Printing/StatusConnected"
