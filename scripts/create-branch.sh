#!/usr/bin/env bash
# create-branch.sh — branch from develop HEAD for a ticket, push, record Base SHA.
#
# Usage:
#   scripts/create-branch.sh <ticket> <slug>
#
# Infers <type> from the ticket's type:* label. Creates the branch
# <type>/ticket-<N>-<slug>, pushes it to origin, and writes the Base SHA
# (develop HEAD at branch time) to the ticket's "Base SHA" field.
#
# Prints the branch name to stdout; everything else goes to stderr so
# callers can safely do BRANCH=$(scripts/create-branch.sh ...).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <ticket> <slug>" >&2
  exit 2
fi

TICKET="$1"
SLUG="$2"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }
command -v jq >/dev/null || { echo "error: jq not found" >&2; exit 127; }

pl_load_config
pl_require_clean_tree

TYPE="$(pl_type_from_labels "$TICKET")"
BRANCH="$TYPE/ticket-$TICKET-$SLUG"

echo "fetching origin/develop..." >&2
git fetch origin develop --quiet

BASE_SHA="$(git rev-parse origin/develop)"
echo "base SHA: $BASE_SHA" >&2

# Refuse if branch already exists (local or remote) — caller must be explicit.
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "error: branch '$BRANCH' already exists locally" >&2
  exit 1
fi
if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  echo "error: branch '$BRANCH' already exists on origin" >&2
  exit 1
fi

# Redirect stdout to stderr for both git commands. On Git Bash for Windows,
# `git checkout -b` emits 'M <file>' lines for working-tree modifications
# and `git push -u` emits 'branch set up to track' — both on stdout. We
# need stdout clean so the caller can capture just the branch name.
git checkout -b "$BRANCH" "$BASE_SHA" >&2
git push -u origin "$BRANCH" >&2

"$SCRIPT_DIR/set-field.sh" "$TICKET" "Base SHA" "$BASE_SHA"

echo "created branch $BRANCH from $BASE_SHA" >&2
printf '%s\n' "$BRANCH"
