#!/usr/bin/env bash
cd "$(dirname "$0")/.."
set -euo pipefail

target="${1:-web}"

case "$target" in
  web)
    echo "[run.sh] Building backend..."
    pnpm build:services
    
    echo "[run.sh] Cleaning up any old backend processes..."
    pkill -f "cs2-backend" || true
    pkill -f "bin/data-service" || true
    sleep 1

    echo "[run.sh] Starting backend..."
    ./bin/cs2-backend > backend.log 2>&1 &
    BACKEND_PID=$!
    ./bin/data-service > data-service.log 2>&1 &
    DATA_SERVICE_PID=$!
    
    trap "kill -9 $BACKEND_PID $DATA_SERVICE_PID 2>/dev/null" EXIT

    echo "[run.sh] Waiting for backend to bind to port 7331..."
    for i in {1..30}; do
      if curl -s http://127.0.0.1:7331/health >/dev/null; then
        echo "[run.sh] Backend is up and healthy!"
        break
      fi
      if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "[run.sh] ERROR: Backend crashed immediately! Check backend.log:"
        cat backend.log
        exit 1
      fi
      sleep 0.5
    done

    echo "[run.sh] Waiting for shared data service to bind to port 7332..."
    for i in {1..30}; do
      if curl -s http://127.0.0.1:7332/healthz >/dev/null; then
        echo "[run.sh] Shared data service is up and healthy!"
        break
      fi
      if ! kill -0 $DATA_SERVICE_PID 2>/dev/null; then
        echo "[run.sh] ERROR: Shared data service crashed immediately! Check data-service.log:"
        cat data-service.log
        exit 1
      fi
      sleep 0.5
    done
    
    echo "[run.sh] Starting Vite dev server..."
    pnpm --filter @cs-inv-edit/web start-vite
    ;;
  desktop)
    pnpm dev:desktop
    ;;
  wasm-web)
    pnpm build:wasm-backend
    pnpm --filter @cs-inv-edit/web start-vite
    ;;
  *)
    echo "Usage: $0 [web|desktop|wasm-web]" >&2
    exit 1
    ;;
esac
