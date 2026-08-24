#!/usr/bin/env bash
set -euo pipefail

pnpm test:frontend
pnpm --filter @cs-inv-edit/desktop test
pnpm test:backend
