#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROTO_DIR="$ROOT_DIR/proto/vendor/steam-protobufs/steam"
OUT_DIR="$ROOT_DIR/backend/internal/proto/steampb"

if ! command -v protoc >/dev/null 2>&1; then
  echo "protoc is required to generate Steam protobuf bindings" >&2
  exit 1
fi

export PATH="$(go env GOPATH)/bin:$PATH"
mkdir -p "$OUT_DIR"

protoc \
  --proto_path="$PROTO_DIR" \
  --proto_path="$ROOT_DIR/proto/vendor/steam-protobufs" \
  --go_out="$OUT_DIR" \
  --go_opt=paths=source_relative \
  --go_opt=Msteammessages_base.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Msteammessages_clientserver.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Mencrypted_app_ticket.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Msteammessages_clientserver_2.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Msteammessages_clientserver_login.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Msteammessages_auth.steamclient.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Msteammessages_unified_base.steamclient.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Msteammessages_cloud.steamclient.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Msteammessages_inventory.steamclient.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Msteammessages_clientserver_friends.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Msteammessages_player.steamclient.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Msteammessages_useraccount.steamclient.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Msteammessages_client_objects.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Menums.proto=cs-inv-edit/backend/internal/proto/steampb \
  --go_opt=Menums_clientserver.proto=cs-inv-edit/backend/internal/proto/steampb \
  steammessages_base.proto \
  steammessages_clientserver.proto \
  encrypted_app_ticket.proto \
  steammessages_clientserver_2.proto \
  steammessages_clientserver_login.proto \
  steammessages_auth.steamclient.proto \
  steammessages_unified_base.steamclient.proto \
  steammessages_cloud.steamclient.proto \
  steammessages_inventory.steamclient.proto \
  steammessages_clientserver_friends.proto \
  steammessages_player.steamclient.proto \
  steammessages_useraccount.steamclient.proto \
  steammessages_client_objects.proto \
  enums.proto \
  enums_clientserver.proto
