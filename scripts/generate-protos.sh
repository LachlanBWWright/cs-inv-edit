#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if ! command -v protoc >/dev/null 2>&1; then
  echo "protoc is required to generate protobuf bindings" >&2
  exit 1
fi
export PATH="$(go env GOPATH)/bin:$PATH"
mkdir -p "$ROOT_DIR/backend/internal/proto/gametracking"
mkdir -p "$ROOT_DIR/backend/internal/proto/tf2tracking"
mkdir -p "$ROOT_DIR/backend/internal/proto/dota2tracking"

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
  "$GAMETRACKING_PROTO_DIR/gcsdk_gcmessages.proto" \
  "$GAMETRACKING_PROTO_DIR/gcsystemmsgs.proto"

# Consume TF2 definitions directly from the pinned GameTracking-TF2 submodule.
# A descriptor set avoids generated-Go registration collisions between Valve's
# package-less protobuf trees while keeping the vendored files authoritative.
TF2_PROTO_DIR="$ROOT_DIR/proto/vendor/gametracking-tf2/Protobufs"
protoc \
  --descriptor_set_out="$ROOT_DIR/backend/internal/proto/tf2tracking/gametracking_tf2.pb" \
  --include_imports \
  --proto_path="$TF2_PROTO_DIR" \
  --proto_path="$(dirname "$(dirname "$(command -v protoc)")")/include" \
  "$TF2_PROTO_DIR/base_gcmessages.proto" \
  "$TF2_PROTO_DIR/econ_gcmessages.proto" \
  "$TF2_PROTO_DIR/gcsdk_gcmessages.proto" \
  "$TF2_PROTO_DIR/gcsystemmsgs.proto" \
  "$TF2_PROTO_DIR/tf_gcmessages.proto"

# Dota 2 has another package-less protobuf tree with names that overlap both
# CS2 and TF2. Keep it in its own dynamic descriptor registry.
DOTA2_PROTO_DIR="$ROOT_DIR/proto/vendor/gametracking-dota2/Protobufs"
protoc \
  --descriptor_set_out="$ROOT_DIR/backend/internal/proto/dota2tracking/gametracking_dota2.pb" \
  --include_imports \
  --proto_path="$DOTA2_PROTO_DIR" \
  --proto_path="$(dirname "$(dirname "$(command -v protoc)")")/include" \
  "$DOTA2_PROTO_DIR/base_gcmessages.proto" \
  "$DOTA2_PROTO_DIR/econ_gcmessages.proto" \
  "$DOTA2_PROTO_DIR/gcsdk_gcmessages.proto" \
  "$DOTA2_PROTO_DIR/gcsystemmsgs.proto"
