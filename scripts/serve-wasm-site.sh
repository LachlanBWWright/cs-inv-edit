#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

host="${WASM_SITE_HOST:-127.0.0.1}"
port="${WASM_SITE_PORT:-4174}"

usage() {
  echo "Usage: $0 [port]"
  echo
  echo "Builds the static web application with the Go WASM backend and serves it locally."
  echo "Set WASM_SITE_HOST to change the bind address."
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 2
fi

if [[ $# == 1 ]]; then
  port="$1"
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to serve the static site" >&2
  exit 1
fi

echo "[serve-wasm-site] Building the static WASM site..."
# Explicitly clear HTTP-backend overrides so a diagnostic build cannot leak
# its backend URL into the static artifact served by this script.
env -u VITE_BACKEND_URL VITE_BACKEND_MODE=wasm pnpm build:wasm-web

# The web package keeps generated WASM assets outside Vite's configured shared
# public directory. Stage them explicitly into the static artifact.
mkdir -p apps/web/dist/wasm
cp apps/web/public/wasm/wasm_exec.js apps/web/dist/wasm/wasm_exec.js
cp apps/web/public/wasm/cs2-backend.wasm apps/web/dist/wasm/cs2-backend.wasm

if [[ ! -f apps/web/dist/index.html ]]; then
  echo "[serve-wasm-site] Build did not produce apps/web/dist/index.html" >&2
  exit 1
fi

if [[ ! -f apps/web/dist/wasm/cs2-backend.wasm ]]; then
  echo "[serve-wasm-site] Build did not include the Go WASM backend" >&2
  exit 1
fi

echo "[serve-wasm-site] Serving http://${host}:${port}"
echo "[serve-wasm-site] Press Ctrl-C to stop."
exec python3 -m http.server "$port" --bind "$host" --directory apps/web/dist
