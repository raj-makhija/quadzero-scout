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
  echo "==> verifying AWS credentials" >&2
  echo "    AWS_ACCESS_KEY_ID:     ${AWS_ACCESS_KEY_ID:+set (${#AWS_ACCESS_KEY_ID} chars)}${AWS_ACCESS_KEY_ID:-EMPTY}" >&2
  echo "    AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:+set (${#AWS_SECRET_ACCESS_KEY} chars)}${AWS_SECRET_ACCESS_KEY:-EMPTY}" >&2
  echo "    AWS_REGION:            ${AWS_REGION:-unset}" >&2
  echo "    AWS_DEFAULT_REGION:    ${AWS_DEFAULT_REGION:-unset}" >&2
  if AWS_OUT="$(aws sts get-caller-identity --output text 2>&1)"; then
    echo "    aws sts get-caller-identity OK: $AWS_OUT" >&2
  else
    echo "error: aws sts get-caller-identity failed:" >&2
    echo "       $AWS_OUT" >&2
    echo "" >&2
    echo "       Common causes:" >&2
    echo "       - AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY not set in repo secrets" >&2
    echo "         (Settings -> Secrets and variables -> Actions -> Secrets tab)" >&2
    echo "       - Access key was deactivated or deleted in IAM" >&2
    echo "       - Secret value was pasted with leading/trailing whitespace" >&2
    echo "       - Wrong AWS account (key belongs to a different account)" >&2
    exit 1
  fi
  echo "==> installing infra/ dependencies (serverless v3 + plugins)" >&2
  (cd infra/ && npm ci --silent)
  # Locally on Windows, infra/src is a directory junction to backend/src
  # (gitignored). On the Linux runner we have to recreate the link as a
  # symlink so serverless-esbuild can find handler sources at src/...
  if [[ ! -e infra/src ]]; then
    echo "==> creating infra/src symlink -> ../backend/src (Linux equivalent of the Windows junction)" >&2
    ln -s ../backend/src infra/src
  fi
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
