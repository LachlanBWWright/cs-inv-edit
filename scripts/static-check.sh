#!/usr/bin/env bash
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$(mktemp -d)"
trap 'rm -rf "$output_dir"' EXIT

failed=0

report_failure() {
  local name="$1"
  local output_file="$2"

  failed=1
  printf '%s failed:\n' "$name"
  if [[ -s "$output_file" ]]; then
    cat "$output_file"
  else
    printf 'check exited unsuccessfully without output\n'
  fi
}

if ! pnpm --dir "$repo_root" --recursive --if-present lint >"$output_dir/lint" 2>&1; then
  report_failure "lint" "$output_dir/lint"
fi

if ! pnpm --dir "$repo_root" --recursive --if-present typecheck >"$output_dir/typecheck" 2>&1; then
  report_failure "typecheck" "$output_dir/typecheck"
fi

if ! "$repo_root/scripts/find-long-files.sh" >"$output_dir/line-count" 2>&1; then
  report_failure "line count" "$output_dir/line-count"
fi

if ! "$repo_root/scripts/find-deep-indentation.sh" >"$output_dir/indentation" 2>&1; then
  report_failure "indentation" "$output_dir/indentation"
fi

if ((failed)); then
  exit 1
fi

printf 'pass\n'
