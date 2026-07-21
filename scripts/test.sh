#!/usr/bin/env bash
set -euo pipefail

pnpm test:frontend
pnpm test:backend
