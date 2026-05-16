#!/usr/bin/env bash
# merge-pr.sh -- merge a PR if clean; close and reroute to rework if stale.
#
# Usage:
#   scripts/merge-pr.sh <ticket> <pr>
#
# Reads the ticket's Base SHA, runs check-staleness.sh against it.
#   clean  -> checkout develop (so --delete-branch can clean local/remote),
#             squash-merge the PR, pull develop, set Pipeline Status to
#             merged-to-develop, set status:ready-for-qa label.
#   stale  -> post a comment on the PR explaining the overlap, close the PR
#             with its branch, remove local branch too, clear Base SHA +
#             PR Number, set Pipeline Status to rework, status:in-progress.

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

HEAD_BRANCH="$(gh pr view "$PR" --json headRefName -q .headRefName)"

set +e
OVERLAP="$("$SCRIPT_DIR/check-staleness.sh" "$PR" "$BASE_SHA")"
STALE_EXIT=$?
set -e

case "$STALE_EXIT" in
  0)
    # CI gate: GitHub Free doesn't enforce required status checks, so we
    # check here before merging. Skip with PIPELINE_SKIP_CI_CHECK=1.
    if [[ "${PIPELINE_SKIP_CI_CHECK:-}" != "1" ]]; then
      set +e
      CI_OUTPUT="$(gh pr checks "$PR" 2>&1)"
      CI_RC=$?
      set -e
      if [[ "$CI_RC" -ne 0 ]]; then
        FAIL_LINES="$(echo "$CI_OUTPUT" | grep -i 'fail' || true)"
        if [[ -n "$FAIL_LINES" ]]; then
          echo "CI checks failed on PR #$PR; not merging" >&2
          echo "$CI_OUTPUT" >&2
          exit 1
        fi
        echo "    (CI checks pending; proceeding — tester gate already ran tests)" >&2
      fi
    fi
    echo "clean; squash-merging PR #$PR" >&2
    CUR="$(git branch --show-current)"
    if [[ "$CUR" != "develop" ]]; then
      git checkout develop >&2
    fi
    gh pr merge "$PR" --squash --delete-branch >&2
    git pull origin develop --quiet >&2
    git branch -D "$HEAD_BRANCH" 2>/dev/null >&2 || true
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" merged-to-develop
    "$SCRIPT_DIR/set-status.sh" "$TICKET" ready-for-qa
    echo "merged"
    ;;
  1)
    echo "stale; closing PR and routing ticket to rework" >&2
    gh pr comment "$PR" --body "Closed by pipeline: branch is stale against develop.

Overlapping files:
\`\`\`
${OVERLAP}
\`\`\`

Ticket moved to \`rework\`. The developer agent will branch fresh from develop HEAD and open a new PR." >&2
    gh pr close "$PR" --delete-branch >&2
    CUR="$(git branch --show-current)"
    if [[ "$CUR" == "$HEAD_BRANCH" ]]; then
      git checkout develop >&2
    fi
    git branch -D "$HEAD_BRANCH" 2>/dev/null >&2 || true
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "PR Number" ""
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Base SHA" ""
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" rework
    "$SCRIPT_DIR/set-status.sh" "$TICKET" in-progress
    echo "stale; routed to rework"
    ;;
  *)
    echo "error: check-staleness.sh exited with unexpected code $STALE_EXIT" >&2
    exit "$STALE_EXIT"
    ;;
esac
