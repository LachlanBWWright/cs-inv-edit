#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exemptions_file="$root_dir/scripts/deep-indentation-exemptions.txt"
if [[ $# -gt 0 ]]; then
  if [[ "$1" != "--exemptions" || $# -ne 2 ]]; then
    printf 'usage: %s [--exemptions FILE]\n' "$0" >&2
    exit 2
  fi
  exemptions_file="$2"
fi

python3 - "$root_dir" "$exemptions_file" <<'PY'
import sys
import re
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


def is_markup_line(raw_line: str) -> bool:
    stripped = raw_line.lstrip()
    if not stripped.strip():
        return True
    if stripped.startswith(("<", ">", "</", "/>") ):
        return True
    if stripped.startswith(("class=", "value=", "placeholder=", "style=", "href=", "src=", "alt=", "role=", "aria-", "id=", "data-")):
        return True
    if re.match(r"^[A-Za-z_:][A-Za-z0-9_:.-]*=", stripped):
        return True
    if any(token in stripped for token in ("class=", "value=", "placeholder=", "style=", "href=", "src=", "alt=", "role=", "aria-", "id=", "data-", "onClick", "onInput", "onChange", "onBlur", "onFocus")):
        return True
    return False

matches = []
for path in root.rglob("*"):
    if not path.is_file() or any(part in exclude_dirs for part in path.parts):
        continue
    if "wasm" in path.parts or path.suffix.lower() not in extensions or path.name.endswith(test_suffixes) or path.name.endswith(".gen.go"):
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue

    max_depth = 0
    for raw_line in text.splitlines():
        if not raw_line.strip() or is_markup_line(raw_line):
            continue
        leading_whitespace = raw_line[: len(raw_line) - len(raw_line.lstrip(" \t"))]
        indent = len(leading_whitespace.expandtabs(2))
        depth = indent // 2
        if depth > max_depth:
            max_depth = depth
    if max_depth >= 8:
        matches.append((max_depth, path.relative_to(root).as_posix()))

try:
    exemptions = {
        line.strip() for line in exemptions_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
except OSError as error:
    print(f"unable to read exemptions file {exemptions_path}: {error}", file=sys.stderr)
    sys.exit(2)

violations = [match for match in matches if match[1] not in exemptions]
for depth, rel_path in sorted(violations, key=lambda match: (-match[0], match[1])):
    print(f"{depth:>2} {rel_path}")
if violations:
    sys.exit(1)
PY
