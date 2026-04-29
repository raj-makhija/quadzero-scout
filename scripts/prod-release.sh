#!/usr/bin/env bash
# prod-release.sh -- nightly batch release using per-ticket cherry-pick.
#
# Finds all tickets with status:qa-approved (or status:prod-release-blocked
# from a prior failed nightly), excludes anything already status:released,
# sorts by their merge order on develop (oldest first), and cherry-picks
# each onto main on a fresh release branch.
#
#   - Tickets that cherry-pick cleanly: applied to main; status set to
#     released; release URL commented on the ticket.
#   - Tickets that conflict: marked status:prod-release-blocked; conflict
#     files commented on the ticket; retried automatically next nightly.
#
# Usage:
#   scripts/prod-release.sh
#
# Set PIPELINE_SKIP_DEPLOY=1 to skip the serverless deploy step (frontend
# still ships via Amplify auto-deploy on main push).
#
# This is the only script that writes to main (other than hotfixes).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

command -v gh  >/dev/null || { echo "error: gh not found"  >&2; exit 127; }
command -v git >/dev/null || { echo "error: git not found" >&2; exit 127; }
command -v jq  >/dev/null || { echo "error: jq not found"  >&2; exit 127; }

pl_require_clean_tree

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Single trap for all temp files
TMPDIR_RUN="$(mktemp -d -t prod-release.XXXXXX)"
trap 'rm -rf "$TMPDIR_RUN"' EXIT

CANDIDATES_FILE="$TMPDIR_RUN/candidates.json"
RESOLVED_FILE="$TMPDIR_RUN/resolved.txt"        # "<ticket> <sha> <pr>" lines
DEVELOP_ORDER_FILE="$TMPDIR_RUN/develop-order.txt"
ORDERED_FILE="$TMPDIR_RUN/ordered.txt"
RELEASED_FILE="$TMPDIR_RUN/released.txt"
BLOCKED_FILE="$TMPDIR_RUN/blocked.txt"          # "<ticket>|<sha>|<pr>|<files>"
CP_OUT="$TMPDIR_RUN/cp-out.txt"
NOTES_FILE="$TMPDIR_RUN/notes.md"

echo "==> fetching origin (branches + tags)" >&2
git fetch origin --tags --quiet

# --- Build candidate list ---------------------------------------------------
echo "==> finding qa-approved + prod-release-blocked tickets" >&2

{
  gh issue list --state all --label "status:qa-approved" --limit 200 \
    --json number,title,labels 2>/dev/null || echo '[]'
  gh issue list --state all --label "status:prod-release-blocked" --limit 200 \
    --json number,title,labels 2>/dev/null || echo '[]'
} | jq -s '
  add
  | unique_by(.number)
  | map(select(.labels | map(.name) | index("status:released") | not))
  | sort_by(.number)
' > "$CANDIDATES_FILE"

CANDIDATE_COUNT="$(jq 'length' "$CANDIDATES_FILE")"
if [[ "$CANDIDATE_COUNT" -eq 0 ]]; then
  echo "no qa-approved tickets pending release tonight; exiting" >&2
  exit 0
fi
echo "==> $CANDIDATE_COUNT candidate ticket(s) found" >&2

# Resolve each candidate to its merge SHA on develop. Skip anything we
# can't pin to a real merge commit reachable from develop.
: > "$RESOLVED_FILE"
while IFS= read -r ticket; do
  pr="$("$SCRIPT_DIR/get-field.sh" "$ticket" "PR Number" 2>/dev/null || true)"
  if [[ -z "$pr" ]]; then
    pr="$(gh issue view "$ticket" --json closedByPullRequestsReferences \
      -q '.closedByPullRequestsReferences[0].number // empty' 2>/dev/null || true)"
  fi
  if [[ -z "$pr" ]]; then
    echo "  #$ticket: no PR found, skipping" >&2
    continue
  fi
  sha="$(gh pr view "$pr" --json mergeCommit -q '.mergeCommit.oid // empty' 2>/dev/null || true)"
  if [[ -z "$sha" ]]; then
    echo "  #$ticket: PR #$pr not merged, skipping" >&2
    continue
  fi
  if ! git merge-base --is-ancestor "$sha" origin/develop 2>/dev/null; then
    echo "  #$ticket: merge SHA $sha not reachable from develop, skipping" >&2
    continue
  fi
  echo "$ticket $sha $pr" >> "$RESOLVED_FILE"
done < <(jq -r '.[].number' "$CANDIDATES_FILE")

if [[ ! -s "$RESOLVED_FILE" ]]; then
  echo "no candidate tickets have valid merge commits; exiting" >&2
  exit 0
fi

# --- Topo-sort by develop merge order (oldest first) ----------------------
echo "==> topo-sorting candidates by develop merge order" >&2

if git show-ref --verify --quiet refs/remotes/origin/main; then
  RANGE="origin/main..origin/develop"
else
  RANGE="origin/develop"
fi
git rev-list --topo-order --reverse "$RANGE" > "$DEVELOP_ORDER_FILE"

: > "$ORDERED_FILE"
while IFS= read -r develop_sha; do
  match="$(awk -v sha="$develop_sha" '$2 == sha {print; exit}' "$RESOLVED_FILE" || true)"
  if [[ -n "$match" ]]; then
    echo "$match" >> "$ORDERED_FILE"
  fi
done < "$DEVELOP_ORDER_FILE"

ORDERED_COUNT="$(wc -l < "$ORDERED_FILE" | awk '{print $1}')"
echo "==> $ORDERED_COUNT ticket(s) to attempt cherry-pick (in develop merge order)" >&2

if [[ "$ORDERED_COUNT" -eq 0 ]]; then
  echo "no tickets remain after topo-sort; exiting" >&2
  exit 0
fi

# --- Set up release branch ------------------------------------------------
RELEASE_TAG="release-$(date -u +%Y-%m-%d-%H%M)"
RELEASE_BRANCH="release/$(date -u +%Y-%m-%d-%H%M)"

echo "==> checking out main" >&2
if git show-ref --verify --quiet refs/remotes/origin/main; then
  git checkout -B main origin/main >&2
  git pull origin main --ff-only --quiet
else
  echo "    main does not exist on origin; will create it on push" >&2
  git checkout -B main >&2
fi

OLD_MAIN_SHA="$(git rev-parse HEAD)"

# Prune stale local release branches from earlier runs, then create fresh
git branch | awk '/release\//{print $NF}' | grep -v '^\*' \
  | xargs -r -I{} git branch -D {} 2>/dev/null || true
git checkout -B "$RELEASE_BRANCH" >&2

# --- Cherry-pick each ticket ---------------------------------------------
: > "$RELEASED_FILE"
: > "$BLOCKED_FILE"

while IFS=' ' read -r ticket sha pr; do
  echo "==> #$ticket: cherry-picking $sha (PR #$pr)" >&2
  set +e
  git cherry-pick --no-edit "$sha" > "$CP_OUT" 2>&1
  CP_RC=$?
  set -e

  if [[ $CP_RC -eq 0 ]]; then
    echo "    OK -- applied to release branch" >&2
    echo "$ticket $sha $pr" >> "$RELEASED_FILE"
    continue
  fi

  # Detect "empty cherry-pick" (commit's diff is already in main)
  if grep -qiE 'nothing to commit|empty commit|previous cherry-pick is now empty' "$CP_OUT"; then
    echo "    EMPTY -- already in main, marking released" >&2
    git cherry-pick --skip >/dev/null 2>&1 || git cherry-pick --abort >/dev/null 2>&1 || true
    echo "$ticket $sha $pr" >> "$RELEASED_FILE"
    continue
  fi

  # Real conflict: capture files BEFORE abort
  CONFLICT_FILES="$(git diff --name-only --diff-filter=U 2>/dev/null | sort -u | tr '\n' ' ' | sed 's/ $//')"
  git cherry-pick --abort >/dev/null 2>&1 || true
  if [[ -z "$CONFLICT_FILES" ]]; then
    CONFLICT_FILES="(unknown -- see workflow logs)"
  fi
  echo "    CONFLICT -- files: $CONFLICT_FILES" >&2
  echo "$ticket|$sha|$pr|$CONFLICT_FILES" >> "$BLOCKED_FILE"
done < "$ORDERED_FILE"

RELEASED_COUNT="$(wc -l < "$RELEASED_FILE" | awk '{print $1}')"
BLOCKED_COUNT="$(wc -l < "$BLOCKED_FILE" | awk '{print $1}')"
echo "==> cherry-pick summary: $RELEASED_COUNT applied, $BLOCKED_COUNT blocked" >&2

# --- Comment on blocked tickets + flip their status ----------------------
TODAY="$(date -u +%Y-%m-%d)"
if [[ "$BLOCKED_COUNT" -gt 0 ]]; then
  while IFS='|' read -r ticket sha pr files; do
    files_md="$(echo "$files" | tr ' ' '\n' | sed '/^$/d' | sed 's/^/- /')"
    gh issue comment "$ticket" --body "[/prod-release] BLOCKED at nightly batch $TODAY.

Cherry-pick of merge commit \`$sha\` (PR #$pr) onto main failed -- conflicts in:

\`\`\`
$files_md
\`\`\`

This ticket has been QA-approved, but its commits depend on something that
is not yet on main. Likely cause: an earlier ticket sitting underneath this
one on develop has not been approved yet, or a conflicting change was
merged to main directly.

Status moved to \`status:prod-release-blocked\`. The pipeline will retry
automatically at the next nightly batch. To unblock now:

(a) Get the dependency ticket through QA + approval (preferred)
(b) Revert the dependency from develop, then re-merge this ticket
(c) Use \`pipeline:retry\` to have the developer agent refactor this
    ticket to remove the dependency" >/dev/null 2>&1 || \
      echo "    (warning: failed to comment on #$ticket)" >&2
    "$SCRIPT_DIR/set-status.sh" "$ticket" prod-release-blocked || true
  done < "$BLOCKED_FILE"
fi

# --- If nothing applied, exit cleanly ------------------------------------
if [[ "$RELEASED_COUNT" -eq 0 ]]; then
  echo "no tickets cherry-picked successfully; nothing to ship tonight" >&2
  git checkout develop >&2
  git branch -D "$RELEASE_BRANCH" 2>/dev/null || true
  exit 0
fi

# --- Fast-forward main -> release branch ---------------------------------
echo "==> fast-forwarding main to $RELEASE_BRANCH" >&2
git checkout main >&2
if ! git merge --ff-only "$RELEASE_BRANCH" >&2; then
  echo "error: main can't fast-forward to $RELEASE_BRANCH (unexpected)" >&2
  git checkout develop >&2
  exit 1
fi

echo "==> pushing main (Amplify will auto-deploy frontend)" >&2
git push origin main >&2

# --- Deploy backend (skipped via PIPELINE_SKIP_DEPLOY=1) -----------------
if [[ "${PIPELINE_SKIP_DEPLOY:-}" == "1" ]]; then
  echo "==> PIPELINE_SKIP_DEPLOY=1 -- skipping serverless deploy" >&2
else
  echo "==> verifying AWS credentials" >&2
  if ! AWS_OUT="$(aws sts get-caller-identity --output text 2>&1)"; then
    echo "error: aws sts get-caller-identity failed: $AWS_OUT" >&2
    exit 1
  fi
  echo "    aws sts OK: $AWS_OUT" >&2

  echo "==> installing infra/ deps" >&2
  (cd infra/ && npm ci --silent)
  if [[ ! -e infra/src ]]; then
    echo "==> copying backend/src -> infra/src" >&2
    cp -r backend/src infra/src
  fi
  echo "==> installing backend/ deps" >&2
  (cd backend/ && npm ci --silent)
  if [[ ! -e infra/src/node_modules ]]; then
    echo "==> linking infra/src/node_modules -> backend/node_modules" >&2
    ln -s ../../backend/node_modules infra/src/node_modules
  fi
  if [[ ! -d infra/layers/chromium/nodejs/node_modules/@sparticuz/chromium ]]; then
    CHROMIUM_VER="$(jq -r '.dependencies."@sparticuz/chromium" // .devDependencies."@sparticuz/chromium" // empty' backend/package.json)"
    if [[ -z "$CHROMIUM_VER" ]]; then
      echo "error: @sparticuz/chromium not declared in backend/package.json" >&2
      exit 1
    fi
    echo "==> building chromium Lambda layer (@sparticuz/chromium $CHROMIUM_VER)" >&2
    mkdir -p infra/layers/chromium/nodejs
    (cd infra/layers/chromium/nodejs && \
      npm init -y >/dev/null && \
      npm install --silent --no-audit --no-fund "@sparticuz/chromium@$CHROMIUM_VER")
  fi
  echo "==> deploying backend to prod" >&2
  (cd infra/ && npx serverless deploy --stage prod)
fi

# --- Build release notes manually + create GitHub Release ----------------
NEW_MAIN_SHA="$(git rev-parse main)"
RELEASE_TITLE="Production release $(date -u +'%Y-%m-%d %H:%M') UTC"

echo "==> building release notes from $RELEASED_COUNT released ticket(s)" >&2

{
  echo "## What's Changed"
  echo
  while IFS=' ' read -r ticket sha pr; do
    title="$(gh issue view "$ticket" --json title -q .title 2>/dev/null || echo "(title unavailable)")"
    echo "* $title (#$ticket, PR #$pr)"
  done < "$RELEASED_FILE"

  if [[ "$BLOCKED_COUNT" -gt 0 ]]; then
    echo
    echo "## Blocked tickets (retrying next nightly)"
    echo
    while IFS='|' read -r ticket sha pr files; do
      title="$(gh issue view "$ticket" --json title -q .title 2>/dev/null || echo "(title unavailable)")"
      echo "* $title (#$ticket) -- conflicts: $files"
    done < "$BLOCKED_FILE"
  fi

  echo
  echo "**Compare**: \`$OLD_MAIN_SHA\`...\`$NEW_MAIN_SHA\`"
} > "$NOTES_FILE"

RELEASE_URL=""
if gh release create "$RELEASE_TAG" \
     --target main \
     --title "$RELEASE_TITLE" \
     --notes-file "$NOTES_FILE" \
     >/dev/null 2>&1; then
  RELEASE_URL="$(gh release view "$RELEASE_TAG" --json url -q .url 2>/dev/null || echo '')"
  echo "    release: $RELEASE_URL" >&2
else
  echo "    (release create failed; continuing without release URL)" >&2
fi

# --- Comment + status:released on every released ticket ------------------
while IFS=' ' read -r ticket sha pr; do
  if [[ -n "$RELEASE_URL" ]]; then
    gh issue comment "$ticket" --body "[/prod-release] Released to prod $(date -u +'%Y-%m-%d %H:%M') UTC.

Release: $RELEASE_URL" >/dev/null 2>&1 || true
  fi
  "$SCRIPT_DIR/set-status.sh" "$ticket" released || true
done < "$RELEASED_FILE"

# --- Cleanup -------------------------------------------------------------
git checkout develop >&2
git branch -D "$RELEASE_BRANCH" 2>/dev/null || true

echo "prod-release complete: $RELEASED_COUNT shipped, $BLOCKED_COUNT blocked" >&2

# Kick the manager so any post-release state changes (status transitions
# etc.) get picked up immediately rather than waiting for cron.
if gh workflow run pipeline-manager.yml >/dev/null 2>&1; then
  echo "kicked pipeline-manager workflow" >&2
fi
