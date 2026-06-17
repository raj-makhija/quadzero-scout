#!/usr/bin/env bash
# create-branch.sh -- branch from develop HEAD for a ticket, push, record Base SHA.
#
# Usage:
#   scripts/create-branch.sh <ticket> <slug>
#
# Infers <type> from the ticket's type:* label. Creates the branch
# <type>/ticket-<N>-<slug>, pushes it to origin, and writes the Base SHA
# (develop HEAD at branch time) to the ticket's "Base SHA" field.
#
# Idempotent for stale branches: if a branch with this name already
# exists (locally or on origin) and its tip is already contained in
# develop -- merged, identical, or an older develop state -- it's reset to
# develop HEAD and reused; no un-merged commits are lost. The script
# refuses only when an existing tip carries commits NOT yet in develop
# (real work in progress; needs human).
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

# Discover any existing tips (remote and/or local) for this branch name.
REMOTE_TIP=""
if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  REMOTE_TIP="$(git ls-remote origin "refs/heads/$BRANCH" | awk '{print $1}')"
fi
LOCAL_TIP=""
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  LOCAL_TIP="$(git rev-parse "refs/heads/$BRANCH")"
fi

# Refuse only if a tip carries commits NOT yet merged into develop -- that's
# real work. A tip already contained in develop (merged, identical, or an
# older develop state) is stale: fall through and reset it to develop HEAD.
# Keying on ancestry not SHA-equality is deliberate -- develop HEAD advances
# as other tickets merge, so a merged leftover branch rarely equals current
# HEAD, and an equality check would mis-flag it as work (#430).
if [[ -n "$REMOTE_TIP" ]] && pl_has_unmerged_commits "$REMOTE_TIP" "$BASE_SHA"; then
  echo "error: branch '$BRANCH' exists on origin at $REMOTE_TIP with commits not in develop ($BASE_SHA); refusing to clobber unmerged work" >&2
  exit 1
fi
if [[ -n "$LOCAL_TIP" ]] && pl_has_unmerged_commits "$LOCAL_TIP" "$BASE_SHA"; then
  echo "error: branch '$BRANCH' exists locally at $LOCAL_TIP with commits not in develop ($BASE_SHA); refusing to clobber unmerged work" >&2
  exit 1
fi

# Either nothing exists, or every tip is already merged into develop. The
# `-B` reset below points the branch at develop HEAD; a stale remote tip is
# an ancestor of HEAD, so the subsequent push fast-forwards (no force).
if [[ -n "$REMOTE_TIP" || -n "$LOCAL_TIP" ]]; then
  echo "reusing branch '$BRANCH' (prior tip already in develop; resetting to HEAD)" >&2
fi

# `-B` is the unified create-or-reset path: works for new, adopts orphan,
# resets local to BASE_SHA if both tips already match.
# Stdout is redirected to stderr because git emits 'M <file>' lines for
# working-tree modifications and 'branch set up to track' messages on
# stdout -- we need stdout clean so the caller can capture just the
# branch name.
git checkout -B "$BRANCH" "$BASE_SHA" >&2
# Push is idempotent: no-op when remote tip already equals local tip.
git push -u origin "$BRANCH" >&2

"$SCRIPT_DIR/set-field.sh" "$TICKET" "Base SHA" "$BASE_SHA"

echo "create-branch: $BRANCH at $BASE_SHA" >&2
echo "$BRANCH"
