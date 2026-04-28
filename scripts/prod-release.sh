#!/usr/bin/env bash
# prod-release.sh -- release a SHA (default: frontier) to main and deploy prod.
#
# Usage:
#   scripts/prod-release.sh [<sha>]
#
# Safety: refuses to release anything past the `frontier` tag (latest
# QA-approved SHA). Defaults to frontier itself if no SHA given.
#
# After successful deploy: creates a GitHub Release with auto-generated
# notes for the just-released commit range, comments on every affected
# ticket (those referenced in the released commit messages) with the
# release link, and sets status:released on each.
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

if ! git rev-parse frontier >/dev/null 2>&1; then
  echo "error: \`frontier\` tag not found. Run qa-approve.sh on at least one SHA first." >&2
  exit 1
fi
FRONTIER_SHA="$(git rev-parse frontier)"

TARGET="${1:-$FRONTIER_SHA}"

if ! git cat-file -e "$TARGET^{commit}" 2>/dev/null; then
  echo "error: SHA '$TARGET' not found" >&2
  exit 1
fi
SHA="$(git rev-parse "$TARGET")"

if [[ "$SHA" != "$FRONTIER_SHA" ]] && ! git merge-base --is-ancestor "$SHA" "$FRONTIER_SHA"; then
  echo "error: target $SHA is past frontier $FRONTIER_SHA -- refusing" >&2
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

# Capture main's tip BEFORE the merge so we can compute the affected-ticket
# list afterward (for release notes + per-ticket comments + status:released).
OLD_MAIN_SHA="$(git rev-parse HEAD)"
echo "==> main tip before merge: $OLD_MAIN_SHA" >&2

echo "==> merging $SHA into main (fast-forward only)" >&2
if ! git merge --ff-only "$SHA" >&2; then
  echo "error: main can't fast-forward to $SHA" >&2
  git checkout develop >&2
  exit 1
fi

echo "==> pushing main (Amplify will auto-deploy frontend)" >&2
git push origin main >&2

if [[ "${PIPELINE_SKIP_DEPLOY:-}" == "1" ]]; then
  echo "==> PIPELINE_SKIP_DEPLOY=1 -- skipping serverless deploy" >&2
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
  if [[ ! -e infra/src ]]; then
    echo "==> copying backend/src -> infra/src (real files; avoids symlink-packaging edge case)" >&2
    cp -r backend/src infra/src
  fi
  echo "==> installing backend/ dependencies (handler runtime deps)" >&2
  (cd backend/ && npm ci --silent)
  if [[ ! -e infra/src/node_modules ]]; then
    echo "==> linking infra/src/node_modules -> backend/node_modules (esbuild package resolution)" >&2
    ln -s ../../backend/node_modules infra/src/node_modules
  fi
  if [[ ! -d infra/layers/chromium/nodejs/node_modules/@sparticuz/chromium ]]; then
    CHROMIUM_VER="$(jq -r '.dependencies."@sparticuz/chromium" // .devDependencies."@sparticuz/chromium" // empty' backend/package.json)"
    if [[ -z "$CHROMIUM_VER" ]]; then
      echo "error: @sparticuz/chromium not declared in backend/package.json; cannot build layer" >&2
      exit 1
    fi
    echo "==> building chromium Lambda layer (@sparticuz/chromium $CHROMIUM_VER, ~80MB download)" >&2
    mkdir -p infra/layers/chromium/nodejs
    (cd infra/layers/chromium/nodejs && \
      npm init -y >/dev/null && \
      npm install --silent --no-audit --no-fund "@sparticuz/chromium@$CHROMIUM_VER")
  fi
  echo "==> deploying backend to prod (npx serverless deploy --stage prod)" >&2
  (cd infra/ && npx serverless deploy --stage prod)
fi

# --- Release notes + per-ticket bookkeeping ---------------------------------
NEW_MAIN_SHA="$(git rev-parse main)"
RELEASE_TAG="release-$(date -u +%Y-%m-%d-%H%M)"
RELEASE_TITLE="Production release $(date -u +'%Y-%m-%d %H:%M') UTC"

if [[ "$OLD_MAIN_SHA" != "$NEW_MAIN_SHA" ]]; then
  echo "==> creating GitHub Release $RELEASE_TAG (auto-generated notes)" >&2
  PREV_RELEASE="$(gh release list --limit 1 --json tagName -q '.[0].tagName // empty' 2>/dev/null || echo '')"
  if [[ -z "$PREV_RELEASE" ]]; then
    PREV_RELEASE="release-bootstrap"
  fi
  if gh release create "$RELEASE_TAG" \
       --target main \
       --title "$RELEASE_TITLE" \
       --generate-notes \
       --notes-start-tag "$PREV_RELEASE" \
       >/dev/null 2>&1; then
    RELEASE_URL="$(gh release view "$RELEASE_TAG" --json url -q .url 2>/dev/null || echo '')"
    echo "    release: $RELEASE_URL" >&2
  else
    gh release create "$RELEASE_TAG" \
      --target main \
      --title "$RELEASE_TITLE" \
      --notes "Released $NEW_MAIN_SHA. (Auto-generated notes unavailable; create release-bootstrap tag to fix.)" \
      >/dev/null 2>&1 || echo "(release create failed; continuing)" >&2
    RELEASE_URL="$(gh release view "$RELEASE_TAG" --json url -q .url 2>/dev/null || echo '')"
  fi

  TICKETS="$(git log "$OLD_MAIN_SHA..$NEW_MAIN_SHA" --pretty=%s | grep -oE '#[0-9]+' | sort -u | tr -d '#' || true)"
  if [[ -n "$TICKETS" ]]; then
    echo "==> updating affected tickets (status:released + comment): $(echo $TICKETS | tr '\n' ' ')" >&2
    for N in $TICKETS; do
      gh issue comment "$N" --body "[/prod-release] Released to prod $(date -u +'%Y-%m-%d %H:%M') UTC.

Release: $RELEASE_URL" >/dev/null 2>&1 || true
      "$SCRIPT_DIR/set-status.sh" "$N" released || true
    done
  else
    echo "==> no ticket references found in released commits; skipping per-ticket update" >&2
  fi
fi

git checkout develop >&2
echo "prod-release complete: $SHA on main" >&2

if gh workflow run pipeline-manager.yml >/dev/null 2>&1; then
  echo "kicked pipeline-manager workflow" >&2
else
  echo "(workflow kick failed; cron will catch up)" >&2
fi
