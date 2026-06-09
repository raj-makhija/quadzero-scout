#!/usr/bin/env bash
# docs-merge.sh -- fast-path merge for docs-only tickets.
#
# Squash-merges the ticket's PR straight to develop and marks it
# qa-approved, BYPASSING the QA single-tenant lock (status:in-qa), the
# qa-deploy serverless/Amplify deploy, and the human pipeline:qa-approve
# click. The change ships at the next nightly develop->main mirror like
# everything else on develop.
#
# Only called by the pr-reviewer agent after an APPROVE verdict on a
# ticket whose diff is confined to markdown / docs/** paths. This script
# re-verifies that the diff is docs-only as a final guard before merging,
# so a mislabeled or code-touching ticket can never take the fast path.
#
# Unlike qa-approve.sh, this does NOT require status:in-qa -- docs tickets
# never acquire the QA lock. It otherwise mirrors qa-approve.sh's merge.
#
# Usage:
#   scripts/docs-merge.sh <ticket>

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

PR="$(pl_pr_for_ticket "$TICKET")"
if [[ -z "$PR" ]]; then
  echo "error: ticket #$TICKET has no open PR; cannot docs-merge" >&2
  exit 1
fi
BRANCH="$(gh pr view "$PR" --json headRefName -q '.headRefName' 2>/dev/null || true)"

# Final safety guard: refuse unless the PR diff is docs-only. An empty diff
# (no files) is treated as NOT docs-only by pl_is_docs_only, so this also
# refuses on a diff we couldn't read.
DIFF_FILES="$(gh pr diff "$PR" --name-only 2>/dev/null || true)"
if ! printf '%s\n' "$DIFF_FILES" | pl_is_docs_only; then
  echo "error: PR #$PR is not docs-only; refusing fast-path merge" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git fetch origin --quiet

echo "==> docs fast-path: squash-merging PR #$PR straight to develop" >&2
CUR="$(git branch --show-current)"
if [[ "$CUR" != "develop" ]]; then
  git checkout develop >&2 2>/dev/null || git checkout -B develop origin/develop >&2
fi
git pull origin develop --ff-only --quiet >&2 || true
gh pr merge "$PR" --squash --delete-branch >&2
git pull origin develop --quiet >&2

# Strip any Co-Authored-By trailers that leaked into the squash commit
# (same policy as qa-approve.sh).
if git log -1 --format='%B' | pl_has_coauthors; then
  echo "==> stripping Co-Authored-By trailers from squash commit" >&2
  STRIPPED_MSG="$(git log -1 --format='%B' | pl_strip_coauthors)"
  git commit --amend -m "$STRIPPED_MSG" --quiet >&2
  git push origin develop --force-with-lease --quiet >&2
fi

[[ -n "$BRANCH" ]] && git branch -D "$BRANCH" 2>/dev/null >&2 || true

"$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" merged-to-develop
"$SCRIPT_DIR/set-status.sh" "$TICKET" qa-approved

echo "docs-merge complete: #$TICKET squash-merged to develop (QA bypassed; never held the QA lock)" >&2
