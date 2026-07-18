#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$root_dir" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1])
exclude_dirs = {
    ".git",
    "node_modules",
    "dist",
    "dist-electron",
    "coverage",
    "android",
    "vendor",
    "generated",
}
extensions = {".ts", ".tsx", ".js", ".jsx", ".go", ".py", ".sh", ".c", ".cpp", ".java", ".rs"}

matches = []
for path in root.rglob("*"):
    if not path.is_file():
        continue
    if any(part in exclude_dirs for part in path.parts):
        continue
    if path.suffix.lower() not in extensions:
        continue
    try:
        with path.open("r", encoding="utf-8") as handle:
            lines = sum(1 for _ in handle)
    except (UnicodeDecodeError, OSError):
        continue
    if lines > 300:
        matches.append((lines, path.relative_to(root).as_posix()))

for lines, rel_path in sorted(matches, key=lambda match: (-match[0], match[1])):
    print(f"{lines:>4} {rel_path}")
PY
