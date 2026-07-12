#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$root_dir" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1])
exclude_dirs = {".git", "node_modules", "dist", "dist-electron", "coverage", "android", "backend", "proto"}
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
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue

    max_depth = 0
    for raw_line in text.splitlines():
        if not raw_line.strip():
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" \t"))
        depth = indent // 2
        if depth > max_depth:
            max_depth = depth

    if max_depth > 5:
        matches.append((max_depth, path.relative_to(root).as_posix()))

for depth, rel_path in sorted(matches, reverse=True):
    print(f"{depth:>2} {rel_path}")
PY
