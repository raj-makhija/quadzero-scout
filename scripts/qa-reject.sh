#!/usr/bin/env bash
# qa-reject.sh -- reject a QA'd SHA and route its ticket back to rework.
#
# Usage:
#   scripts/qa-reject.sh <sha> <reason> [ticket]
#
# Finds the ticket associated with the SHA (from its commit message) unless
# one is passed explicitly as the third arg. Reopens the issue, posts the
# rejection reason, clears Base SHA + PR Number, sets Pipeline Status to
# rework. Does NOT touch the frontier tag.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <sha> <reason> [ticket]" >&2
  exit 2
fi

TARGET="$1"
REASON="$2"
TICKET="${3:-}"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }

pl_load_config

if ! git cat-file -e "$TARGET^{commit}" 2>/dev/null; then
  echo "==> fetching origin" >&2
  git fetch origin --quiet
fi
if ! git cat-file -e "$TARGET^{commit}" 2>/dev/null; then
  echo "error: SHA '$TARGET' not found after fetch" >&2
  exit 1
fi

SHA="$(git rev-parse "$TARGET")"

if [[ -z "$TICKET" ]]; then
  MSG="$(git log -1 --format=%B "$SHA")"
  TICKET="$(echo "$MSG" | grep -oE '#[0-9]+' | head -1 | tr -d '#' || true)"
  if [[ -z "$TICKET" ]]; then
    echo "error: cannot infer ticket from commit $SHA -- pass ticket as third arg" >&2
    exit 1
  fi
  echo "==> inferred ticket #$TICKET from commit message" >&2
fi

echo "==> reopening ticket #$TICKET" >&2
gh issue reopen "$TICKET" >&2 2>/dev/null || echo "(issue may already be open)" >&2

gh issue comment "$TICKET" --body "[qa-reject] Rejected at QA on SHA \`$SHA\`.

**Reason:** $REASON

Ticket moved to \`rework\`. Base SHA and PR Number cleared so the pipeline re-branches fresh from develop HEAD on the next pass." >&2

"$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" rework
"$SCRIPT_DIR/set-field.sh" "$TICKET" "PR Number" ""
"$SCRIPT_DIR/set-field.sh" "$TICKET" "Base SHA" ""
"$SCRIPT_DIR/set-status.sh" "$TICKET" in-progress

echo "qa-reject complete: #$TICKET now rework" >&2

# Kick the Actions pipeline-manager so the rework starts immediately
# instead of waiting up to ~5 min for the safety-net cron.
if gh workflow run pipeline-manager.yml >/dev/null 2>&1; then
  echo "kicked pipeline-manager workflow" >&2
else
  echo "(workflow kick failed; cron will catch up)" >&2
fi
