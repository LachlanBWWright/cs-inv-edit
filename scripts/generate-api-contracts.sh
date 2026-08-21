#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OAPI_CODEGEN_VERSION="v2.8.0"

cd "$REPO_ROOT/backend"
go run "github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@${OAPI_CODEGEN_VERSION}" \
  --config ../api/oapi-codegen.yaml \
  ../api/openapi.yaml
go run "github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@${OAPI_CODEGEN_VERSION}" \
  --config ../api/data-service.oapi-codegen.yaml \
  ../api/data-service.openapi.yaml

cd "$REPO_ROOT"
pnpm exec openapi-ts
pnpm exec openapi-ts --file openapi-data-ts.config.ts
pnpm exec prettier --write \
  openapi-ts.config.ts \
  openapi-data-ts.config.ts \
  packages/contracts/src/generated \
  packages/contracts/src/generated-data
