#!/usr/bin/env bash
# qa-deploy.sh — deploy ONE ticket's branch to the QA instance.
#
# Branch-isolated QA model: QA holds exactly one ticket at a time. The
# ticket's branch was built + reviewed in the dev phase and is NOT yet
# merged to develop. This script merges develop forward into that branch,
# regression-tests it, and points the qa branch at it.
#
# Usage:
#   scripts/qa-deploy.sh <ticket>
#
# Flow:
#   1. Single-tenant hard stop: refuse if another ticket holds status:in-qa.
#   2. Resolve the ticket's branch from its open PR.
#   3. git merge origin/develop into the branch (pick up approved work).
#   4. Regression gate: npm test in backend/ and frontend/.
#   5. Point qa at the branch, push (Amplify frontend) + serverless deploy --stage qa.
#   6. status:in-qa (acquire the lock).
#
# Not-green (merge conflict OR red suite): qa is left UNTOUCHED, the lock is
# NOT acquired, and the ticket is routed to rework (attempt-capped) — its PR
# is closed and branch deleted, exactly like the tester/reviewer rework
# path. The developer agent re-implements fresh from develop HEAD.
#
# Set PIPELINE_SKIP_DEPLOY=1 to skip the serverless deploy.
# Set PIPELINE_QA_RUN_NPM_TEST=false to skip the regression gate (plumbing).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <ticket>" >&2
  exit 2
fi

TICKET="$1"

command -v gh  >/dev/null || { echo "error: gh not found"  >&2; exit 127; }
command -v git >/dev/null || { echo "error: git not found" >&2; exit 127; }

pl_load_config
pl_require_clean_tree

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# --- 1. Single-tenant hard stop -------------------------------------------
# status:in-qa IS the lock. Refuse if a *different* ticket holds it.
OCCUPANT="$(gh issue list --state open --label "status:in-qa" \
  --json number -q '.[].number' 2>/dev/null | grep -vx "$TICKET" | head -n1 || true)"
if [[ -n "$OCCUPANT" ]]; then
  gh issue comment "$TICKET" --body "[/qa-deploy] REFUSED — QA is occupied by #$OCCUPANT. Only one ticket can be in QA at a time. Approve (\`pipeline:qa-approve\`) or reject (\`pipeline:qa-reject\`) #$OCCUPANT first, then re-add \`pipeline:qa-deploy\` here." >&2
  echo "qa-deploy: refused #$TICKET; QA occupied by #$OCCUPANT" >&2
  exit 1
fi

# --- 2. Resolve the ticket's branch from its open PR ----------------------
PR="$(pl_pr_for_ticket "$TICKET")"
if [[ -z "$PR" ]]; then
  gh issue comment "$TICKET" --body "[/qa-deploy] FAIL — no open PR found for #$TICKET. The dev phase must finish (status:ready-for-qa) with an open PR before qa-deploy." >&2
  echo "qa-deploy: no PR for #$TICKET" >&2
  exit 1
fi
BRANCH="$(gh pr view "$PR" --json headRefName -q '.headRefName' 2>/dev/null || true)"
if [[ -z "$BRANCH" ]]; then
  gh issue comment "$TICKET" --body "[/qa-deploy] FAIL — could not resolve a branch from PR #$PR." >&2
  echo "qa-deploy: no head branch for PR #$PR" >&2
  exit 1
fi

echo "==> fetching origin" >&2
git fetch origin --quiet

# Route a not-green outcome (conflict or red tests) to rework, mirroring the
# tester/reviewer rework cleanup. QA is left untouched; lock not acquired.
route_to_rework() {
  local body="$1"
  gh issue comment "$TICKET" --body "$body" >&2
  local cur
  cur="$(git branch --show-current 2>/dev/null || echo '')"
  if [[ "$cur" == "$BRANCH" ]]; then
    git checkout develop >&2 2>/dev/null || git checkout -B develop origin/develop >&2
  fi
  gh pr close "$PR" --delete-branch >&2 2>/dev/null || true
  git branch -D "$BRANCH" 2>/dev/null >&2 || true
  "$SCRIPT_DIR/set-field.sh" "$TICKET" "PR Number" ""
  "$SCRIPT_DIR/set-field.sh" "$TICKET" "Base SHA" ""
  "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" rework
  "$SCRIPT_DIR/set-status.sh" "$TICKET" in-progress
}

# --- 3. Merge develop into the branch (local) -----------------------------
echo "==> checking out $BRANCH" >&2
git checkout -B "$BRANCH" "origin/$BRANCH" >&2

echo "==> merging origin/develop into $BRANCH" >&2
if ! git merge origin/develop --no-edit >&2; then
  CONFLICTS="$(git diff --name-only --diff-filter=U 2>/dev/null | sort -u | tr '\n' ' ' | sed 's/ $//')"
  git merge --abort >/dev/null 2>&1 || true
  route_to_rework "[/qa-deploy] NOT DEPLOYED — merging \`develop\` into \`$BRANCH\` conflicts in:
\`\`\`
${CONFLICTS:-(unknown — see workflow logs)}
\`\`\`
QA is unchanged. Ticket routed to rework: the developer agent re-implements fresh from develop HEAD (which now carries the conflicting change). Re-add \`pipeline:qa-deploy\` once it returns to \`status:ready-for-qa\`."
  echo "qa-deploy: conflict merging develop into $BRANCH; routed to rework" >&2
  exit 1
fi

# --- 4. Regression gate (npm test backend + frontend) ---------------------
if [[ "${PIPELINE_QA_RUN_NPM_TEST:-true}" == "true" ]]; then
  run_project_tests() {
    local dir="$1"
    [[ -f "$dir/package.json" ]] || return 0
    grep -qE '"test"[[:space:]]*:' "$dir/package.json" || return 0
    echo "==> running npm test in $dir/" >&2
    local out
    out="$(mktemp -t qa-npm-test.XXXXXX)"
    if (cd "$dir" && npm ci --silent --no-audit --no-fund && npm test --silent) >"$out" 2>&1; then
      echo "    OK -- $dir/ tests pass" >&2
      rm -f "$out"
      return 0
    fi
    echo "    FAIL -- $dir/ tests failed" >&2
    cat "$out" >&2
    NPM_TEST_FAIL_TAIL="$(tail -n 60 "$out")"
    rm -f "$out"
    return 1
  }
  NPM_TEST_FAIL_TAIL=""
  for tdir in backend frontend; do
    if ! run_project_tests "$tdir"; then
      route_to_rework "[/qa-deploy] NOT DEPLOYED — regression \`npm test\` in \`$tdir/\` failed on \`$BRANCH\` after merging develop.

Last 60 lines:
\`\`\`
$NPM_TEST_FAIL_TAIL
\`\`\`
QA is unchanged. Ticket routed to rework."
      echo "qa-deploy: regression failed in $tdir; routed to rework" >&2
      exit 1
    fi
  done
fi

# --- 5. Persist the merge, point qa at the branch, deploy -----------------
echo "==> pushing $BRANCH (with develop merged in)" >&2
git push origin "$BRANCH" >&2

echo "==> pointing qa at $BRANCH (Amplify auto-deploys frontend)" >&2
git checkout -B qa "$BRANCH" >&2
git push origin qa --force-with-lease >&2

if [[ "${PIPELINE_SKIP_DEPLOY:-}" == "1" ]]; then
  echo "==> PIPELINE_SKIP_DEPLOY=1 — skipping serverless deploy" >&2
else
  pl_deploy_stage qa
fi

git checkout develop >&2

# --- 5b. qa-tester gate (post-deploy acceptance cases on the live env) -----
# Off by default: only runs the real browser agent when explicitly enabled,
# so existing behavior is unchanged until the QA account + secret exist.
# PASS / soft-error -> continue to acquire the lock. Definitive FAIL ->
# auto-reject (resets qa->develop + rework) unless report-only is configured.
if [[ "${PIPELINE_QA_TESTER_AGENT:-}" == "claude" ]]; then
  QA_TESTER_RC=0
  "$SCRIPT_DIR/qa-tester.sh" "$TICKET" "$BRANCH" || QA_TESTER_RC=$?
  if [[ "$QA_TESTER_RC" -eq 3 ]]; then
    if [[ "${PIPELINE_QA_TESTER_AUTOREJECT:-true}" == "true" ]]; then
      echo "==> qa-tester FAIL; auto-rejecting #$TICKET" >&2
      "$SCRIPT_DIR/qa-reject.sh" "$TICKET" "Automated qa-tester found failing acceptance item(s) against the deployed qa env. See the [qa-tester] comment on #$TICKET."
      echo "qa-deploy: #$TICKET auto-rejected by qa-tester" >&2
      exit 1
    fi
    gh issue comment "$TICKET" --body "[/qa-deploy] qa-tester reported FAIL but auto-reject is disabled (\`PIPELINE_QA_TESTER_AUTOREJECT\` != \`true\`). Proceeding to human QA -- review the [qa-tester] comment before approving." >&2
  fi
  # RC 0 (PASS) or RC 1 (soft could-not-run) fall through to acquire the lock.
fi

# --- 6. Acquire the lock ---------------------------------------------------
"$SCRIPT_DIR/set-status.sh" "$TICKET" in-qa
gh issue comment "$TICKET" --body "[/qa-deploy] OK — #$TICKET (\`$BRANCH\`, merged with develop) deployed to QA. \`status:in-qa\`. Validate, then \`pipeline:qa-approve\` (merge to develop) or \`pipeline:qa-reject\` (reset QA + rework)." >&2
echo "qa-deploy complete: #$TICKET ($BRANCH) on qa" >&2

# Kick pipeline-manager so any state changes get picked up promptly.
if gh workflow run pipeline-manager.yml >/dev/null 2>&1; then
  echo "kicked pipeline-manager workflow" >&2
else
  echo "(workflow kick failed; cron will catch up)" >&2
fi
