#!/usr/bin/env bash
# qa-deploy.sh — deploy a specific SHA from develop to QA.
#
# Usage:
#   scripts/qa-deploy.sh <sha>
#
# Workflow:
#   1. Fetch. Validate SHA is reachable from origin/develop.
#   2. Check out qa (creating from origin/qa if local is missing).
#   3. Fast-forward merge the SHA into qa.
#   4. Push qa to origin (Amplify auto-deploys frontend).
#   5. Run `npx serverless deploy --stage qa` from infra/.
#   6. Return to develop, kick pipeline-manager workflow.
#
# Set PIPELINE_SKIP_DEPLOY=1 to skip the serverless deploy.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <sha>" >&2
  exit 2
fi

TARGET="$1"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }
command -v git >/dev/null || { echo "error: git not found" >&2; exit 127; }

pl_require_clean_tree

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "==> fetching origin" >&2
git fetch origin --quiet

if ! git cat-file -e "$TARGET^{commit}" 2>/dev/null; then
  echo "error: SHA '$TARGET' not found after fetch" >&2
  exit 1
fi

SHA="$(git rev-parse "$TARGET")"

if ! git merge-base --is-ancestor "$SHA" origin/develop; then
  echo "error: SHA '$SHA' is not reachable from origin/develop" >&2
  exit 1
fi

echo "==> checking out qa" >&2
if git show-ref --verify --quiet refs/remotes/origin/qa; then
  git checkout -B qa origin/qa >&2
else
  echo "==> qa branch doesn't exist on origin; creating from $SHA" >&2
  git checkout -B qa "$SHA" >&2
fi

echo "==> merging $SHA into qa (fast-forward only)" >&2
if ! git merge --ff-only "$SHA" >&2; then
  echo "error: qa can't fast-forward to $SHA" >&2
  git checkout develop >&2
  exit 1
fi

echo "==> pushing qa (Amplify will auto-deploy frontend)" >&2
git push origin qa >&2

if [[ "${PIPELINE_SKIP_DEPLOY:-}" == "1" ]]; then
  echo "==> PIPELINE_SKIP_DEPLOY=1 — skipping serverless deploy" >&2
else
  echo "==> deploying backend to qa (npx serverless deploy --stage qa)" >&2
  (cd infra/ && npx serverless deploy --stage qa)
fi

git checkout develop >&2
echo "qa-deploy complete: $SHA on qa" >&2

# Kick the Actions pipeline-manager so any pipeline-related state changes
# get picked up immediately. Non-fatal: cron will catch up within ~5 min.
if gh workflow run pipeline-manager.yml >/dev/null 2>&1; then
  echo "kicked pipeline-manager workflow" >&2
else
  echo "(workflow kick failed; cron will catch up)" >&2
fi
