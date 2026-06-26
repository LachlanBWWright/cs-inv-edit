#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
if ! command -v protoc >/dev/null 2>&1; then
  echo "protoc is required" >&2
  exit 1
fi
mkdir -p backend/internal/proto/generated
protoc --go_out=backend/internal/proto/generated --go_opt=paths=source_relative --proto_path=proto proto/cs2_item_subset.proto
