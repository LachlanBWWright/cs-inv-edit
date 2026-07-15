#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if ! command -v protoc >/dev/null 2>&1; then
  echo "protoc is required to generate protobuf bindings" >&2
  exit 1
fi
export PATH="$(go env GOPATH)/bin:$PATH"
if ! command -v protoc-gen-go >/dev/null 2>&1; then
  echo "protoc-gen-go is required to generate Go protobuf bindings" >&2
  exit 1
fi
mkdir -p "$ROOT_DIR/backend/internal/proto/generated"
mkdir -p "$ROOT_DIR/backend/internal/proto/generated/multigamepb"
protoc \
  --go_out="$ROOT_DIR/backend/internal/proto/generated" \
  --go_opt=paths=source_relative \
  --proto_path="$ROOT_DIR/proto" \
  "$ROOT_DIR/proto/cs2_item_subset.proto"
protoc \
  --go_out="$ROOT_DIR/backend/internal/proto/generated/multigamepb" \
  --go_opt=paths=source_relative \
  --proto_path="$ROOT_DIR/proto" \
  "$ROOT_DIR/proto/multigame_econ_subset.proto"
