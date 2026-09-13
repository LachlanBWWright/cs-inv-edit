#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

target_os="${DESKTOP_GOOS:-$(go env GOOS)}"
target_arch="${DESKTOP_GOARCH:-$(go env GOARCH)}"
output="bin/cs2-backend"
data_service_output="bin/data-service"
if [[ "$target_os" == "windows" ]]; then
  output+=".exe"
  data_service_output+=".exe"
fi

mkdir -p bin
rm -f bin/cs2-backend bin/cs2-backend.exe bin/data-service bin/data-service.exe
echo "[build-desktop-backend] Building ${target_os}/${target_arch} -> ${output}"
GOOS="$target_os" GOARCH="$target_arch" go build -trimpath -ldflags="-s -w" -o "$output" ./backend/cmd/cs2-backend
echo "[build-desktop-backend] Building ${target_os}/${target_arch} -> ${data_service_output}"
GOOS="$target_os" GOARCH="$target_arch" go build -trimpath -ldflags="-s -w" -o "$data_service_output" ./backend/cmd/data-service
