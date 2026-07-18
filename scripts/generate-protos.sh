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
mkdir -p "$ROOT_DIR/backend/internal/proto/gametracking"
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

# Generate a descriptor set directly from the pinned GameTracking submodule.
# These upstream protos intentionally have no protobuf package and overlap with
# descriptors registered by envelop, so registering another generated Go copy
# would panic. The backend consumes this descriptor set through dynamicpb.
GAMETRACKING_PROTO_DIR="$ROOT_DIR/proto/vendor/gametracking-cs2/Protobufs"
protoc \
  --descriptor_set_out="$ROOT_DIR/backend/internal/proto/gametracking/gametracking_store.pb" \
  --include_imports \
  --proto_path="$GAMETRACKING_PROTO_DIR" \
  --proto_path="$(dirname "$(dirname "$(command -v protoc)")")/include" \
  "$GAMETRACKING_PROTO_DIR/base_gcmessages.proto" \
  "$GAMETRACKING_PROTO_DIR/cstrike15_gcmessages.proto" \
  "$GAMETRACKING_PROTO_DIR/econ_gcmessages.proto" \
  "$GAMETRACKING_PROTO_DIR/gcsdk_gcmessages.proto"
