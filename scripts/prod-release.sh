#!/usr/bin/env bash
# prod-release.sh -- mirror develop -> main and ship to prod.
#
# Branch-isolated model: develop contains ONLY qa-approved work (each ticket
# is squash-merged to develop at pipeline:qa-approve). Shipping to prod is
# therefore a straight mirror of develop onto main -- no cherry-pick, no
# per-ticket selection. Runs nightly (pipeline-nightly-release) and is also
# the break-glass pipeline:prod-release action.
#
# Usage:
#   scripts/prod-release.sh
#
# Steps:
#   1. No-op if develop has no commits beyond main.
#   2. Merge origin/develop into main (merge, NOT reset, so an
#      un-back-merged hotfix on main is preserved).
#   3. serverless deploy --stage prod (before push, to avoid version skew).
#   4. Push main (Amplify auto-deploys the frontend).
#   5. Flip every status:qa-approved ticket -> status:released, comment the
#      release URL, and cut a dated GitHub Release.
#
# Set PIPELINE_SKIP_DEPLOY=1 to skip the serverless deploy (frontend still
# ships via Amplify on the main push).
#
# This is the only script that writes to main (other than hotfixes).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

command -v gh  >/dev/null || { echo "error: gh not found"  >&2; exit 127; }
command -v git >/dev/null || { echo "error: git not found" >&2; exit 127; }
command -v jq  >/dev/null || { echo "error: jq not found"  >&2; exit 127; }

pl_load_config
pl_require_clean_tree

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "==> fetching origin (branches + tags)" >&2
git fetch origin --tags --quiet

# --- 1. No-op if nothing to ship ------------------------------------------
if git show-ref --verify --quiet refs/remotes/origin/main; then
  AHEAD="$(git rev-list --count origin/main..origin/develop 2>/dev/null || echo 0)"
else
  AHEAD="$(git rev-list --count origin/develop 2>/dev/null || echo 0)"
fi
if [[ "$AHEAD" -eq 0 ]]; then
  echo "develop has no commits beyond main; nothing to ship tonight" >&2
  exit 0
fi
echo "==> develop is $AHEAD commit(s) ahead of main" >&2

OLD_MAIN_SHA="$(git rev-parse origin/main 2>/dev/null || echo '')"

# --- 2. Merge develop into main -------------------------------------------
echo "==> checking out main" >&2
if git show-ref --verify --quiet refs/remotes/origin/main; then
  git checkout -B main origin/main >&2
else
  echo "    main does not exist on origin; creating from develop" >&2
  git checkout -B main origin/develop >&2
fi
echo "==> merging origin/develop into main" >&2
git merge origin/develop --no-edit >&2

# --- 3. Deploy backend to prod (before push, avoids version skew) ----------
if [[ "${PIPELINE_SKIP_DEPLOY:-}" == "1" ]]; then
  echo "==> PIPELINE_SKIP_DEPLOY=1 — skipping serverless deploy" >&2
else
  pl_deploy_stage prod
fi

# --- 4. Push main ----------------------------------------------------------
echo "==> pushing main (Amplify auto-deploys frontend)" >&2
git push origin main >&2
NEW_MAIN_SHA="$(git rev-parse main)"

# --- 5. Flip qa-approved -> released + GitHub Release ----------------------
APPROVED="$(gh issue list --state all --label "status:qa-approved" --limit 200 \
  --json number -q '.[].number' 2>/dev/null || true)"

RELEASE_TAG="release-$(date -u +%Y-%m-%d-%H%M)"
RELEASE_TITLE="Production release $(date -u +'%Y-%m-%d %H:%M') UTC"
NOTES_FILE="$(mktemp -t prod-release-notes.XXXXXX)"
trap 'rm -f "$NOTES_FILE"' EXIT

{
  echo "## What's Changed"
  echo
  if [[ -n "$APPROVED" ]]; then
    while IFS= read -r t; do
      [[ -z "$t" ]] && continue
      title="$(gh issue view "$t" --json title -q .title 2>/dev/null || echo '(title unavailable)')"
      echo "* $title (#$t)"
    done <<< "$APPROVED"
  else
    echo "* (mirror of develop; no qa-approved tickets resolved this run)"
  fi
  echo
  echo "**Compare**: \`${OLD_MAIN_SHA:-?}\`...\`$NEW_MAIN_SHA\`"
} > "$NOTES_FILE"

RELEASE_URL=""
if gh release create "$RELEASE_TAG" --target main --title "$RELEASE_TITLE" \
     --notes-file "$NOTES_FILE" >/dev/null 2>&1; then
  RELEASE_URL="$(gh release view "$RELEASE_TAG" --json url -q .url 2>/dev/null || echo '')"
  echo "    release: $RELEASE_URL" >&2
else
  echo "    (release create failed; continuing without release URL)" >&2
fi

if [[ -n "$APPROVED" ]]; then
  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    if [[ -n "$RELEASE_URL" ]]; then
      gh issue comment "$t" --body "[/prod-release] Released to prod $(date -u +'%Y-%m-%d %H:%M') UTC.

Release: $RELEASE_URL" >/dev/null 2>&1 || true
    fi
    pl_set_status "$t" released || true
  done <<< "$APPROVED"
fi

git checkout develop >&2 2>/dev/null || git checkout -B develop origin/develop >&2
echo "prod-release complete: develop mirrored to main ($NEW_MAIN_SHA)" >&2

# Kick the manager so any post-release state changes get picked up promptly.
if gh workflow run pipeline-manager.yml >/dev/null 2>&1; then
  echo "kicked pipeline-manager workflow" >&2
fi
