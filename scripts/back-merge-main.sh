#!/usr/bin/env bash
# back-merge-main.sh -- merge main into develop after a hotfix, and force a
# re-QA of any ticket currently in QA.
#
# Usage:
#   scripts/back-merge-main.sh
#
# A hotfix lands on main out-of-band (branch from main -> PR to main). main
# must be back-merged into develop immediately so develop doesn't diverge.
# That back-merge MOVES develop -- which invalidates any ticket currently in
# QA: it was tested against the pre-hotfix develop, and its qa-approve squash
# would no longer be clean. This script:
#   1. Merges origin/main into develop and pushes.
#   2. If a ticket holds status:in-qa, resets qa -> develop (redeploys) and
#      sends that ticket back to awaiting-qa (status:ready-for-qa) with a
#      comment, so the human re-runs pipeline:qa-deploy (which re-merges the
#      now-hotfixed develop into the branch and re-tests).
#
# Run this immediately after squash-merging a hotfix PR to main.
#
# Set PIPELINE_SKIP_DEPLOY=1 to skip the serverless redeploy of qa.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

command -v gh  >/dev/null || { echo "error: gh not found"  >&2; exit 127; }
command -v git >/dev/null || { echo "error: git not found" >&2; exit 127; }

pl_load_config
pl_require_clean_tree

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git fetch origin --quiet

# --- 1. Back-merge main into develop --------------------------------------
echo "==> merging origin/main into develop" >&2
git checkout -B develop origin/develop >&2
git merge origin/main --no-edit >&2
git push origin develop >&2

# --- 2. Re-QA guard --------------------------------------------------------
# Single-tenancy guarantees at most one ticket holds status:in-qa.
IN_QA="$(gh issue list --state open --label "status:in-qa" \
  --json number -q '.[].number' 2>/dev/null | head -n1 || true)"
if [[ -z "$IN_QA" ]]; then
  echo "back-merge complete: no ticket in QA; nothing to re-qa" >&2
  exit 0
fi

echo "==> #$IN_QA is in QA; forcing re-QA after the hotfix" >&2
git checkout -B qa origin/develop >&2
git push origin qa --force-with-lease >&2
if [[ "${PIPELINE_SKIP_DEPLOY:-}" == "1" ]]; then
  echo "==> PIPELINE_SKIP_DEPLOY=1 — skipping serverless redeploy of qa" >&2
else
  pl_deploy_stage qa
fi
git checkout develop >&2

"$SCRIPT_DIR/set-field.sh" "$IN_QA" "Pipeline Status" awaiting-qa
"$SCRIPT_DIR/set-status.sh" "$IN_QA" ready-for-qa
gh issue comment "$IN_QA" --body "[hotfix] develop moved (main was back-merged after a hotfix), so QA was reset to develop and this ticket was sent back to \`status:ready-for-qa\`. Re-run \`pipeline:qa-deploy\` to re-merge the hotfixed develop into the branch, re-test, and redeploy to QA." >&2

echo "back-merge complete: #$IN_QA sent back to awaiting-qa for re-QA" >&2
