#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CERT_DIR="$PROJECT_DIR/certs"
CONFIG_PATH="$CERT_DIR/openssl.cnf"
KEY_PATH="$CERT_DIR/localhost-key.pem"
CERT_PATH="$CERT_DIR/localhost-cert.pem"

mkdir -p "$CERT_DIR"

cat > "$CONFIG_PATH" <<'EOF'
[req]
default_bits = 2048
prompt = no
default_md = sha256
x509_extensions = v3_req
distinguished_name = dn

[dn]
CN = 127.0.0.1

[v3_req]
subjectAltName = @alt_names
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
IP.1 = 127.0.0.1
DNS.1 = localhost
EOF

openssl req \
  -x509 \
  -nodes \
  -days 3650 \
  -newkey rsa:2048 \
  -keyout "$KEY_PATH" \
  -out "$CERT_PATH" \
  -config "$CONFIG_PATH"

echo "Created:"
echo "  $KEY_PATH"
echo "  $CERT_PATH"
echo
echo "Trust the certificate in Keychain Access before testing Elvanto:"
echo "1. Open $CERT_PATH"
echo "2. Add it to the login keychain"
echo "3. In Keychain Access, open the certificate"
echo "4. Set 'When using this certificate' to 'Always Trust'"
