#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_CA="/private/tmp/icf-checkin-local-ca.pem"

"$PROJECT_DIR/scripts/generate-cert.sh"
cp "$PROJECT_DIR/certs/local-ca.pem" "$TMP_CA"

echo "macOS will ask for an administrator password once."
echo "This trusts the local ICF check-in certificate for Chrome and Elvanto."
sudo security add-trusted-cert \
  -d \
  -r trustRoot \
  -p ssl \
  -k /Library/Keychains/System.keychain \
  "$TMP_CA"

echo
echo "Done. Fully quit Chrome and open it again before testing:"
echo "https://127.0.0.1:41951/DYMO/DLS/Printing/StatusConnected"
echo
read "?Press Enter to close this window."
