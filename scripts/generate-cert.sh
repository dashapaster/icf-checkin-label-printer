#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CERT_DIR="$PROJECT_DIR/certs"
CA_CONFIG_PATH="$CERT_DIR/local-ca-openssl.cnf"
SERVER_CONFIG_PATH="$CERT_DIR/localhost-openssl.cnf"
CA_KEY_PATH="$CERT_DIR/local-ca-key.pem"
CA_CERT_PATH="$CERT_DIR/local-ca.pem"
KEY_PATH="$CERT_DIR/localhost-key.pem"
CERT_PATH="$CERT_DIR/localhost-cert.pem"
CSR_PATH="$CERT_DIR/localhost.csr"
SERIAL_PATH="$CERT_DIR/local-ca.srl"

mkdir -p "$CERT_DIR"

cat > "$CA_CONFIG_PATH" <<'EOF'
[req]
default_bits = 2048
prompt = no
default_md = sha256
x509_extensions = v3_ca
distinguished_name = dn

[dn]
CN = ICF Check-in Local CA

[v3_ca]
basicConstraints = critical, CA:true
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
EOF

cat > "$SERVER_CONFIG_PATH" <<'EOF'
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
CN = 127.0.0.1

[v3_req]
basicConstraints = critical, CA:false
subjectAltName = @alt_names
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
IP.1 = 127.0.0.1
DNS.1 = localhost
EOF

rm -f "$KEY_PATH" "$CERT_PATH" "$CSR_PATH" "$SERIAL_PATH"

openssl req \
  -x509 \
  -nodes \
  -days 3650 \
  -newkey rsa:2048 \
  -keyout "$CA_KEY_PATH" \
  -out "$CA_CERT_PATH" \
  -config "$CA_CONFIG_PATH"

openssl req \
  -nodes \
  -newkey rsa:2048 \
  -keyout "$KEY_PATH" \
  -out "$CSR_PATH" \
  -config "$SERVER_CONFIG_PATH"

openssl x509 \
  -req \
  -days 3650 \
  -in "$CSR_PATH" \
  -CA "$CA_CERT_PATH" \
  -CAkey "$CA_KEY_PATH" \
  -CAcreateserial \
  -out "$CERT_PATH" \
  -extensions v3_req \
  -extfile "$SERVER_CONFIG_PATH"

cat "$CA_CERT_PATH" >> "$CERT_PATH"

chmod 600 "$CA_KEY_PATH" "$KEY_PATH"
rm -f "$CSR_PATH"

echo "Created:"
echo "  $CA_CERT_PATH"
echo "  $KEY_PATH"
echo "  $CERT_PATH"
echo
echo "Next, trust the local CA once:"
echo "  npm run trust-cert"
