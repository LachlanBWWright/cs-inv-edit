#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

target_os="${DESKTOP_GOOS:-$(go env GOOS)}"
target_arch="${DESKTOP_GOARCH:-$(go env GOARCH)}"
output="bin/cs2-backend"
if [[ "$target_os" == "windows" ]]; then
  output+=".exe"
fi

mkdir -p bin
rm -f bin/cs2-backend bin/cs2-backend.exe
echo "[build-desktop-backend] Building ${target_os}/${target_arch} -> ${output}"
GOOS="$target_os" GOARCH="$target_arch" go build -o "$output" ./backend/cmd/cs2-backend
