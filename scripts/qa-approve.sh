#!/usr/bin/env bash
# qa-approve.sh -- approve the ticket currently in QA: squash-merge its
# branch to develop (the back-merge) and mark it qa-approved.
#
# Usage:
#   scripts/qa-approve.sh <ticket>
#
# Branch-isolated model: the ticket's branch was deployed to QA
# (status:in-qa) and validated by a human. Approving it:
#   1. Squash-merges the PR to develop (`Closes #N`), deleting the branch.
#   2. Sets Pipeline Status=merged-to-develop + status:qa-approved.
#
# develop now carries only approved work; the next dev ticket forks from it,
# and tonight's develop->main mirror (pipeline-nightly-release) ships it.
# Setting qa-approved (no longer in-qa) RELEASES the single-tenant QA lock so
# the next ticket can pipeline:qa-deploy.
#
# Refuses unless the ticket is currently status:in-qa -- you can only approve
# what has actually been QA-validated. Single-tenancy guarantees develop has
# not moved since qa-deploy, so the squash-merge is clean.

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

# Guard: only the ticket currently in QA can be approved.
LABELS="$(gh issue view "$TICKET" --json labels -q '.labels[].name' 2>/dev/null || true)"
if ! echo "$LABELS" | grep -qx "status:in-qa"; then
  echo "error: #$TICKET is not status:in-qa; run pipeline:qa-deploy and validate it first" >&2
  exit 1
fi

PR="$(pl_pr_for_ticket "$TICKET")"
if [[ -z "$PR" ]]; then
  echo "error: ticket #$TICKET has no open PR; cannot approve" >&2
  exit 1
fi
BRANCH="$(gh pr view "$PR" --json headRefName -q '.headRefName' 2>/dev/null || true)"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git fetch origin --quiet

echo "==> squash-merging PR #$PR to develop" >&2
CUR="$(git branch --show-current)"
if [[ "$CUR" != "develop" ]]; then
  git checkout develop >&2 2>/dev/null || git checkout -B develop origin/develop >&2
fi
git pull origin develop --ff-only --quiet >&2 || true
gh pr merge "$PR" --squash --delete-branch >&2
git pull origin develop --quiet >&2
[[ -n "$BRANCH" ]] && git branch -D "$BRANCH" 2>/dev/null >&2 || true

"$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" merged-to-develop
"$SCRIPT_DIR/set-status.sh" "$TICKET" qa-approved

echo "qa-approve complete: #$TICKET squash-merged to develop; QA lock released" >&2
