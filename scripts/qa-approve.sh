#!/usr/bin/env bash
# qa-approve.sh -- mark a ticket as QA-approved, queueing it for the next
# nightly cherry-pick to main.
#
# Usage:
#   scripts/qa-approve.sh <ticket>
#
# Under the cherry-pick release model:
# - This script does NOT touch main, develop, or any tag. It only sets
#   status:qa-approved on the ticket.
# - The nightly pipeline-nightly-release workflow does the actual work
#   of cherry-picking the ticket's merge commit from develop onto main.
# - If the cherry-pick succeeds, the ticket gets status:released.
# - If it conflicts, the ticket gets status:prod-release-blocked and
#   retries automatically on the next nightly batch.
#
# This is intentionally trivial: approval is a label fact, and the
# actual release decision is made (and re-made) at batch time so the
# ordering with other in-flight approvals is always correct.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <ticket>" >&2
  exit 2
fi

TICKET="$1"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }

pl_load_config

# Defensive sanity check: refuse to approve a ticket whose PR isn't merged
# yet. Without a merge commit on develop, the nightly batch would have
# nothing to cherry-pick and the ticket would stay stuck forever.
PR="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "PR Number" 2>/dev/null || true)"
if [[ -z "$PR" ]]; then
  PR="$(gh issue view "$TICKET" --json closedByPullRequestsReferences \
    -q '.closedByPullRequestsReferences[0].number // empty' 2>/dev/null || true)"
fi
if [[ -z "$PR" ]]; then
  echo "error: ticket #$TICKET has no associated PR; cannot approve" >&2
  exit 1
fi

MERGE_SHA="$(gh pr view "$PR" --json mergeCommit -q '.mergeCommit.oid // empty' 2>/dev/null || true)"
if [[ -z "$MERGE_SHA" ]]; then
  echo "error: PR #$PR has no merge commit yet; cannot approve" >&2
  exit 1
fi

echo "==> marking #$TICKET (PR #$PR, merge $MERGE_SHA) as qa-approved" >&2
"$SCRIPT_DIR/set-status.sh" "$TICKET" qa-approved

echo "qa-approve complete: #$TICKET queued for next nightly cherry-pick" >&2
