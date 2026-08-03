#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

name="${1:?service name is required}"
package="${2:?Go package is required}"
output="${3:?output path is required}"
log_file="${4:?log path is required}"
shift 4
watch_paths=("$@")

child_pid=""
temporary="${output}.watch"

cleanup() {
  if [[ -n "$child_pid" ]]; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  rm -f "$temporary"
}
trap cleanup EXIT
trap 'exit 0' INT TERM

fingerprint() {
  if [[ "$name" == "cs2-backend" ]]; then
    find "${watch_paths[@]}" -type f \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) \
      -printf '%T@ %p\n' 2>/dev/null | sed '/backend\/internal\/dataservice\//d' | sort | sha256sum | cut -d' ' -f1
    return
  fi
  find "${watch_paths[@]}" -type f \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) \
    -printf '%T@ %p\n' 2>/dev/null | sort | sha256sum | cut -d' ' -f1
}

rebuild() {
  echo "[watch:$name] Building..."
  if ! go build -o "$temporary" "$package"; then
    echo "[watch:$name] Build failed; keeping the previous process running."
    return
  fi
  if [[ -n "$child_pid" ]]; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  mv "$temporary" "$output"
  "$output" > "$log_file" 2>&1 &
  child_pid=$!
  echo "[watch:$name] Started PID $child_pid"
}

mkdir -p "$(dirname "$output")"
rebuild
previous="$(fingerprint)"

while true; do
  sleep 0.5
  current="$(fingerprint)"
  if [[ "$current" != "$previous" ]]; then
    previous="$current"
    rebuild
  elif [[ -n "$child_pid" ]] && ! kill -0 "$child_pid" 2>/dev/null; then
    wait "$child_pid" 2>/dev/null || true
    child_pid=""
    echo "[watch:$name] Process exited; waiting for a source change."
  fi
done
