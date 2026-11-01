#!/usr/bin/env bash
# Architecture audit: enforces the layer rules from CLAUDE.md (ui -> state -> transport).
set -e

# check <dir> <forbidden layer> <rule text>: fails on @/<layer> or ../<layer> imports
check() {
  local hits
  hits=$(grep -rnE "from ['\"](@|\.\.)/([.][.]/)*$2(/|['\"])" "src/$1" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "ERROR: $3"
    echo "$hits"
    exit 1
  fi
}

echo "=== Rule 1: UI talks to the mixer only through the store (no ui -> transport) ==="
check ui transport "src/ui imports src/transport directly."

echo "=== Rule 2: State knows nothing about UI (no state -> ui) ==="
check state ui "src/state imports src/ui."

echo "=== Rule 3: Transport is independent (no transport -> state/ui) ==="
check transport state "src/transport imports src/state."
check transport ui "src/transport imports src/ui."

echo "=== All Architecture Checks Passed! ==="
