#!/usr/bin/env bash
# prod-release.sh — release a SHA (default: frontier) to main and deploy prod.
#
# Usage:
#   scripts/prod-release.sh [<sha>]
#
# Safety model:
#   - The `frontier` tag marks the latest QA-approved commit.
#   - This script refuses to release any SHA that's past the frontier.
#   - If no SHA is given, defaults to the frontier itself.
#
# Workflow:
#   1. Validate frontier tag exists (must qa-approve first).
#   2. Validate target SHA is at or before frontier.
#   3. Checkout main. Fast-forward merge the SHA.
#   4. Push main (Amplify auto-deploys frontend).
#   5. Run `npx serverless deploy --stage prod` from infra/.
#   6. Return to develop.
#
# Set PIPELINE_SKIP_DEPLOY=1 to skip the serverless deploy step.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }
command -v git >/dev/null || { echo "error: git not found" >&2; exit 127; }

pl_require_clean_tree

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "==> fetching origin (branches + tags)" >&2
git fetch origin --tags --quiet

# Frontier must exist
if ! git rev-parse frontier >/dev/null 2>&1; then
  echo "error: \`frontier\` tag not found. Run qa-approve.sh on at least one SHA first." >&2
  exit 1
fi
FRONTIER_SHA="$(git rev-parse frontier)"

# Default target to frontier
TARGET="${1:-$FRONTIER_SHA}"

if ! git cat-file -e "$TARGET^{commit}" 2>/dev/null; then
  echo "error: SHA '$TARGET' not found" >&2
  exit 1
fi
SHA="$(git rev-parse "$TARGET")"

# Safety: target must be an ancestor of frontier (or equal to it)
if [[ "$SHA" != "$FRONTIER_SHA" ]] && ! git merge-base --is-ancestor "$SHA" "$FRONTIER_SHA"; then
  echo "error: target $SHA is past frontier $FRONTIER_SHA — refusing" >&2
  echo "run qa-approve.sh $SHA first if it's been tested" >&2
  exit 1
fi

echo "==> target = $SHA (frontier = $FRONTIER_SHA)" >&2

echo "==> checking out main" >&2
if git show-ref --verify --quiet refs/remotes/origin/main; then
  git checkout -B main origin/main >&2
else
  git checkout main >&2
fi
git pull origin main --ff-only --quiet

echo "==> merging $SHA into main (fast-forward only)" >&2
if ! git merge --ff-only "$SHA" >&2; then
  echo "error: main can't fast-forward to $SHA" >&2
  echo "main has diverged from develop (maybe a hotfix not back-merged)" >&2
  git checkout develop >&2
  exit 1
fi

echo "==> pushing main (Amplify will auto-deploy frontend)" >&2
git push origin main >&2

if [[ "${PIPELINE_SKIP_DEPLOY:-}" == "1" ]]; then
  echo "==> PIPELINE_SKIP_DEPLOY=1 — skipping serverless deploy" >&2
else
  echo "==> deploying backend to prod (npx serverless deploy --stage prod)" >&2
  (cd infra/ && npx serverless deploy --stage prod)
fi

git checkout develop >&2
echo "prod-release complete: $SHA on main" >&2
