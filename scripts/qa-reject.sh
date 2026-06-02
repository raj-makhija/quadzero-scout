#!/usr/bin/env bash
# qa-reject.sh -- reject the ticket currently in QA: reset the qa instance
# back to develop (last approved state) and route the ticket to rework.
#
# Usage:
#   scripts/qa-reject.sh <ticket> <reason>
#
# Branch-isolated model: rejecting the in-QA ticket
#   1. Resets qa -> origin/develop and redeploys, so QA shows the last
#      approved state again. This releases the single-tenant QA lock.
#   2. Reopens the issue, records the reason, closes the PR + deletes the
#      branch, clears PR Number + Base SHA, and sets Pipeline Status=rework
#      + status:in-progress. The manager then increments Attempt
#      (attempt-capped -> needs-human) and dispatches the developer in
#      rework mode, which re-implements fresh from develop HEAD using the
#      reason as guidance.
#
# Set PIPELINE_SKIP_DEPLOY=1 to skip the serverless redeploy of qa.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <ticket> <reason>" >&2
  exit 2
fi

TICKET="$1"
REASON="$2"

command -v gh  >/dev/null || { echo "error: gh not found"  >&2; exit 127; }
command -v git >/dev/null || { echo "error: git not found" >&2; exit 127; }

pl_load_config
pl_require_clean_tree

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git fetch origin --quiet

# --- 1. Reset qa to the last approved state (develop) + redeploy ----------
echo "==> resetting qa to origin/develop" >&2
git checkout -B qa origin/develop >&2
git push origin qa --force-with-lease >&2
if [[ "${PIPELINE_SKIP_DEPLOY:-}" == "1" ]]; then
  echo "==> PIPELINE_SKIP_DEPLOY=1 — skipping serverless redeploy of qa" >&2
else
  pl_deploy_stage qa
fi
git checkout develop >&2 2>/dev/null || git checkout -B develop origin/develop >&2

# --- 2. Route the ticket to rework ----------------------------------------
echo "==> reopening + reworking #$TICKET" >&2
gh issue reopen "$TICKET" >&2 2>/dev/null || echo "(issue may already be open)" >&2

PR="$(pl_pr_for_ticket "$TICKET")"
if [[ -n "$PR" ]]; then
  BRANCH="$(gh pr view "$PR" --json headRefName -q '.headRefName' 2>/dev/null || true)"
  gh pr close "$PR" --delete-branch >&2 2>/dev/null || true
  [[ -n "${BRANCH:-}" ]] && git branch -D "$BRANCH" 2>/dev/null >&2 || true
fi

gh issue comment "$TICKET" --body "[qa-reject] Rejected at QA.

**Reason:** $REASON

QA has been reset to develop (last approved state); the single-tenant QA lock is released. Ticket moved to \`rework\`: PR Number and Base SHA cleared so the developer agent re-implements fresh from develop HEAD on the next pass, using this reason as guidance." >&2

"$SCRIPT_DIR/set-field.sh" "$TICKET" "PR Number" ""
"$SCRIPT_DIR/set-field.sh" "$TICKET" "Base SHA" ""
"$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" rework
"$SCRIPT_DIR/set-status.sh" "$TICKET" in-progress

echo "qa-reject complete: QA reset to develop; #$TICKET now rework" >&2

# Kick the Actions pipeline-manager so the rework starts immediately
# instead of waiting up to ~5 min for the safety-net cron.
if gh workflow run pipeline-manager.yml >/dev/null 2>&1; then
  echo "kicked pipeline-manager workflow" >&2
else
  echo "(workflow kick failed; cron will catch up)" >&2
fi
