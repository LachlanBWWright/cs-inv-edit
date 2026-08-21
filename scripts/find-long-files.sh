#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exemptions_file="$root_dir/scripts/line-count-exemptions.txt"
if [[ $# -gt 0 ]]; then
  if [[ "$1" != "--exemptions" || $# -ne 2 ]]; then
    printf 'usage: %s [--exemptions FILE]\n' "$0" >&2
    exit 2
  fi
  exemptions_file="$2"
fi

python3 - "$root_dir" "$exemptions_file" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1])
exemptions_path = Path(sys.argv[2])
exclude_dirs = {
    ".git",
    "node_modules",
    "dist",
    "dist-electron",
    "storybook-static",
    "coverage",
    "android",
    "vendor",
    "generated",
    "testdata",
    "public",
}
extensions = {".ts", ".tsx", ".js", ".jsx", ".go", ".py", ".sh", ".c", ".cpp", ".java", ".rs"}
test_suffixes = ("_test.go", ".test.ts", ".test.tsx", ".test.js", ".test.jsx", ".spec.ts", ".spec.tsx", ".spec.js", ".spec.jsx")

matches = []
for path in root.rglob("*"):
    if not path.is_file() or any(part in exclude_dirs for part in path.parts):
        continue
    if "wasm" in path.parts or path.suffix.lower() not in extensions or path.name.endswith(".gen.go"):
        continue
    try:
        with path.open("r", encoding="utf-8") as handle: lines = sum(1 for _ in handle)
    except (UnicodeDecodeError, OSError):
        continue
    limit = 700 if path.name.endswith(test_suffixes) else 400
    if lines > limit:
        matches.append((lines, path.relative_to(root).as_posix()))

try:
    exemptions = {
        line.strip() for line in exemptions_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
except OSError as error:
    print(f"unable to read exemptions file {exemptions_path}: {error}", file=sys.stderr)
    sys.exit(2)

violations = [match for match in matches if match[1] not in exemptions]
for lines, rel_path in sorted(violations, key=lambda match: (-match[0], match[1])):
    print(f"{lines:>4} {rel_path}")
if violations:
    sys.exit(1)
PY
