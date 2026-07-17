#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_file="$root/vendor/counter-strike-image-tracker/static/images.json"
target_file="$root/backend/internal/econ/assets/counter-strike-images.json.gz"

if [[ ! -f "$source_file" ]]; then
  echo "Missing tracker index at $source_file; initialize the sparse submodule first." >&2
  exit 1
fi

gzip -n -9 -c "$source_file" > "$target_file"
echo "Updated $target_file from the pinned counter-strike-image-tracker submodule."
