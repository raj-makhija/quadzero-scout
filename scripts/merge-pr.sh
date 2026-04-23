#!/usr/bin/env bash
# merge-pr.sh — merge a PR if clean; close and reroute to rework if stale.
#
# Usage:
#   scripts/merge-pr.sh <ticket> <pr>
#
# Reads the ticket's Base SHA, runs check-staleness.sh against it.
#   clean  → squash-merge the PR, delete the branch, set Pipeline Status
#            to merged-to-develop.
#   stale  → post a comment on the PR explaining the overlap, close the PR
#            (and its branch), clear Base SHA + PR Number, set Pipeline
#            Status to rework. Developer agent opens a fresh PR next pass.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <ticket> <pr>" >&2
  exit 2
fi

TICKET="$1"
PR="$2"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }

pl_load_config

BASE_SHA="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Base SHA")"
if [[ -z "$BASE_SHA" ]]; then
  echo "error: ticket #$TICKET has no Base SHA field set" >&2
  exit 1
fi

# Run staleness check; capture both stdout and exit code without set -e aborting.
set +e
OVERLAP="$("$SCRIPT_DIR/check-staleness.sh" "$PR" "$BASE_SHA")"
STALE_EXIT=$?
set -e

case "$STALE_EXIT" in
  0)
    echo "clean; squash-merging PR #$PR" >&2
    gh pr merge "$PR" --squash --delete-branch
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" merged-to-develop
    echo "merged"
    ;;
  1)
    echo "stale; closing PR and routing ticket to rework" >&2
    gh pr comment "$PR" --body "Closed by pipeline: branch is stale against develop.

Overlapping files:
\`\`\`
${OVERLAP}
\`\`\`

Ticket moved to \`rework\`. The developer agent will branch fresh from develop HEAD and open a new PR."
    gh pr close "$PR" --delete-branch
    # Clear stale state so the next pass starts clean.
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "PR Number" ""
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Base SHA" ""
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" rework
    echo "stale; routed to rework"
    ;;
  *)
    echo "error: check-staleness.sh exited with unexpected code $STALE_EXIT" >&2
    exit "$STALE_EXIT"
    ;;
esac
