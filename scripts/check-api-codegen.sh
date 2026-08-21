#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_CHECK_DIR="$(mktemp -d)"
trap 'rm -rf "$API_CHECK_DIR"' EXIT

mkdir -p "$API_CHECK_DIR/backend" "$API_CHECK_DIR/contracts" "$API_CHECK_DIR/data-contracts"
cp "$REPO_ROOT/backend/internal/api/openapi.gen.go" "$API_CHECK_DIR/backend/openapi.gen.go"
cp "$REPO_ROOT/backend/internal/dataapi/openapi.gen.go" "$API_CHECK_DIR/backend/data-openapi.gen.go"
cp -R "$REPO_ROOT/packages/contracts/src/generated/." "$API_CHECK_DIR/contracts"
cp -R "$REPO_ROOT/packages/contracts/src/generated-data/." "$API_CHECK_DIR/data-contracts"

"$REPO_ROOT/scripts/generate-api-contracts.sh"

diff -u \
  "$API_CHECK_DIR/backend/openapi.gen.go" \
  "$REPO_ROOT/backend/internal/api/openapi.gen.go"
diff -u \
  "$API_CHECK_DIR/backend/data-openapi.gen.go" \
  "$REPO_ROOT/backend/internal/dataapi/openapi.gen.go"
diff -ru \
  "$API_CHECK_DIR/contracts" \
  "$REPO_ROOT/packages/contracts/src/generated"
diff -ru \
  "$API_CHECK_DIR/data-contracts" \
  "$REPO_ROOT/packages/contracts/src/generated-data"
