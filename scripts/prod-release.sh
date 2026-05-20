#!/usr/bin/env bash
# prod-release.sh -- nightly batch release using merge-forward with
# cherry-pick fallback.
#
# Phase 1 (merge-forward): walks develop-only commits oldest-first.
# As long as every commit belongs to an approved or released ticket
# (or is a back-merge from main), the script extends a "merge-up-to"
# pointer. It then `git merge --no-ff` that pointer onto a release
# branch created from main. Because main is a strict subset of
# develop, this merge is always conflict-free.
#
# Phase 2 (cherry-pick fallback): any approved tickets whose merge
# commits sit after the first unapproved gap on develop are
# cherry-picked individually, same as the legacy model.
#
#   - Tickets that apply cleanly (via merge or cherry-pick): applied
#     to main; status set to released; release URL commented.
#   - Tickets that conflict (cherry-pick only): marked
#     status:prod-release-blocked; retried next nightly.
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
RELEASED_TICKETS="$TMPDIR_RUN/released-tickets.txt"
BLOCKED_TICKETS="$TMPDIR_RUN/blocked-tickets.txt"
CP_OUT="$TMPDIR_RUN/cp-out.txt"
NOTES_FILE="$TMPDIR_RUN/notes.md"
RELEASED_SHAS_FILE="$TMPDIR_RUN/released-shas.txt"
SAFE_SHAS_FILE="$TMPDIR_RUN/safe-shas.txt"

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

# Resolve each candidate to its merge SHA(s) on develop. A ticket may
# have been implemented across multiple PRs; resolve all of them.
: > "$RESOLVED_FILE"
while IFS= read -r ticket; do
  # Collect all PRs: closedByPullRequestsReferences + PR Number field
  all_prs="$(gh issue view "$ticket" --json closedByPullRequestsReferences \
    -q '[.closedByPullRequestsReferences[].number] | .[]' 2>/dev/null || true)"
  field_pr="$("$SCRIPT_DIR/get-field.sh" "$ticket" "PR Number" 2>/dev/null || true)"
  if [[ -n "$field_pr" ]]; then
    all_prs="$(printf '%s\n%s' "$all_prs" "$field_pr")"
  fi
  # Deduplicate and drop blanks
  all_prs="$(echo "$all_prs" | sort -un | sed '/^$/d')"

  if [[ -z "$all_prs" ]]; then
    echo "  #$ticket: no PR found, skipping" >&2
    continue
  fi

  pr_count="$(echo "$all_prs" | wc -l | awk '{print $1}')"
  if [[ "$pr_count" -gt 1 ]]; then
    echo "  #$ticket: multi-PR ticket ($pr_count PRs: $(echo "$all_prs" | tr '\n' ' '))" >&2
  fi

  resolved_any=false
  while IFS= read -r pr; do
    [[ -z "$pr" ]] && continue
    sha="$(gh pr view "$pr" --json mergeCommit -q '.mergeCommit.oid // empty' 2>/dev/null || true)"
    if [[ -z "$sha" ]]; then
      echo "  #$ticket: PR #$pr not merged, skipping" >&2
      continue
    fi
    if ! git merge-base --is-ancestor "$sha" origin/develop 2>/dev/null; then
      echo "  #$ticket: merge SHA $sha (PR #$pr) not reachable from develop, skipping" >&2
      continue
    fi
    echo "$ticket $sha $pr" >> "$RESOLVED_FILE"
    resolved_any=true
  done <<< "$all_prs"

  if [[ "$resolved_any" == "false" ]]; then
    echo "  #$ticket: no valid merge commits found across $pr_count PR(s)" >&2
  fi
done < <(jq -r '.[].number' "$CANDIDATES_FILE")

if [[ ! -s "$RESOLVED_FILE" ]]; then
  echo "no candidate tickets have valid merge commits; exiting" >&2
  exit 0
fi

# --- Resolve released ticket SHAs (for merge-forward safe set) ------------
echo "==> resolving status:released tickets for merge-forward path" >&2

: > "$RELEASED_SHAS_FILE"
released_query="$(gh issue list --state all --label "status:released" --limit 500 \
  --json number -q '.[].number' 2>/dev/null || true)"

if [[ -n "$released_query" ]]; then
  while IFS= read -r ticket; do
    [[ -z "$ticket" ]] && continue
    all_prs="$(gh issue view "$ticket" --json closedByPullRequestsReferences \
      -q '[.closedByPullRequestsReferences[].number] | .[]' 2>/dev/null || true)"
    field_pr="$("$SCRIPT_DIR/get-field.sh" "$ticket" "PR Number" 2>/dev/null || true)"
    if [[ -n "$field_pr" ]]; then
      all_prs="$(printf '%s\n%s' "$all_prs" "$field_pr")"
    fi
    all_prs="$(echo "$all_prs" | sort -un | sed '/^$/d')"
    [[ -z "$all_prs" ]] && continue

    while IFS= read -r pr; do
      [[ -z "$pr" ]] && continue
      sha="$(gh pr view "$pr" --json mergeCommit -q '.mergeCommit.oid // empty' 2>/dev/null || true)"
      [[ -z "$sha" ]] && continue
      if git merge-base --is-ancestor "$sha" origin/develop 2>/dev/null; then
        echo "$sha" >> "$RELEASED_SHAS_FILE"
      fi
    done <<< "$all_prs"
  done <<< "$released_query"
fi

RELEASED_SHA_COUNT="$(wc -l < "$RELEASED_SHAS_FILE" | awk '{print $1}')"
echo "==> $RELEASED_SHA_COUNT released ticket SHA(s) resolved for merge-forward" >&2

# --- Build safe SHA set (approved + released) -----------------------------
{
  awk '{print $2}' "$RESOLVED_FILE"
  cat "$RELEASED_SHAS_FILE"
} | sort -u > "$SAFE_SHAS_FILE"

# --- Topo-sort by develop merge order (oldest first) ----------------------
echo "==> topo-sorting candidates by develop merge order" >&2

if git show-ref --verify --quiet refs/remotes/origin/main; then
  RANGE="origin/main..origin/develop"
else
  RANGE="origin/develop"
fi
git rev-list --topo-order --reverse "$RANGE" > "$DEVELOP_ORDER_FILE"

# --- Classify develop-only commits and find merge-up-to point ---------------
echo "==> classifying develop-only commits for merge-forward" >&2

MERGE_UP_TO_SHA=""
UNAPPROVED_FOUND=false

while IFS= read -r develop_sha; do
  if grep -qxF "$develop_sha" "$SAFE_SHAS_FILE"; then
    if [[ "$UNAPPROVED_FOUND" == "false" ]]; then
      MERGE_UP_TO_SHA="$develop_sha"
    fi
    continue
  fi

  # Back-merge commit: a merge with a second parent reachable from main
  if git rev-parse --verify "$develop_sha^2" >/dev/null 2>&1; then
    parent2="$(git rev-parse "$develop_sha^2")"
    if git merge-base --is-ancestor "$parent2" origin/main 2>/dev/null; then
      if [[ "$UNAPPROVED_FOUND" == "false" ]]; then
        MERGE_UP_TO_SHA="$develop_sha"
      fi
      continue
    fi
  fi

  UNAPPROVED_FOUND=true
done < "$DEVELOP_ORDER_FILE"

if [[ -n "$MERGE_UP_TO_SHA" ]]; then
  echo "==> merge-up-to point: $(git log --oneline -1 "$MERGE_UP_TO_SHA")" >&2
else
  echo "==> no merge-up-to point (first develop commit is unapproved or no safe prefix)" >&2
fi

# --- Build ordered list of approved tickets (for cherry-pick fallback) ------
: > "$ORDERED_FILE"
while IFS= read -r develop_sha; do
  match="$(awk -v sha="$develop_sha" '$2 == sha {print; exit}' "$RESOLVED_FILE" || true)"
  if [[ -n "$match" ]]; then
    echo "$match" >> "$ORDERED_FILE"
  fi
done < "$DEVELOP_ORDER_FILE"

ORDERED_COUNT="$(wc -l < "$ORDERED_FILE" | awk '{print $1}')"
echo "==> $ORDERED_COUNT approved ticket SHA(s) total" >&2

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

# --- Two-phase apply: merge-forward + cherry-pick fallback -----------------
: > "$RELEASED_FILE"
: > "$BLOCKED_FILE"
MERGE_APPLIED=false

# Phase 1: merge-forward (if a safe contiguous prefix exists)
if [[ -n "$MERGE_UP_TO_SHA" ]]; then
  echo "==> Phase 1: merging develop up to $MERGE_UP_TO_SHA" >&2
  set +e
  git merge --no-ff "$MERGE_UP_TO_SHA" \
    -m "release: merge develop up to $(git log --format='%h %s' -1 "$MERGE_UP_TO_SHA")" \
    > "$CP_OUT" 2>&1
  MERGE_RC=$?
  set -e

  if [[ $MERGE_RC -eq 0 ]]; then
    echo "    merge OK" >&2
    MERGE_APPLIED=true

    # Record approved tickets covered by the merge
    while IFS=' ' read -r ticket sha pr; do
      if git merge-base --is-ancestor "$sha" "$MERGE_UP_TO_SHA" 2>/dev/null; then
        echo "$ticket $sha $pr" >> "$RELEASED_FILE"
      fi
    done < "$ORDERED_FILE"
  else
    echo "    UNEXPECTED merge conflict -- aborting, falling back to cherry-pick" >&2
    git merge --abort >/dev/null 2>&1 || true
    MERGE_UP_TO_SHA=""
  fi
else
  echo "==> Phase 1: skipped (no safe contiguous prefix)" >&2
fi

# Phase 2: cherry-pick remaining approved tickets not covered by the merge
FALLBACK_COUNT=0
while IFS=' ' read -r ticket sha pr; do
  # Skip if already released by Phase 1
  if grep -q "^$ticket $sha $pr$" "$RELEASED_FILE" 2>/dev/null; then
    continue
  fi

  FALLBACK_COUNT=$((FALLBACK_COUNT + 1))
  echo "==> Phase 2: #$ticket: cherry-picking $sha (PR #$pr)" >&2
  set +e
  git cherry-pick --no-edit --strategy-option=patience "$sha" > "$CP_OUT" 2>&1
  CP_RC=$?
  set -e

  if [[ $CP_RC -eq 0 ]]; then
    echo "    OK -- applied to release branch" >&2
    echo "$ticket $sha $pr" >> "$RELEASED_FILE"
    continue
  fi

  # Detect "empty cherry-pick" (commit's diff is already in main/merged content)
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
if [[ "$MERGE_APPLIED" == "true" ]]; then
  echo "==> release summary: merge-forward applied, $RELEASED_COUNT SHA(s) released, $BLOCKED_COUNT blocked, $FALLBACK_COUNT cherry-picked" >&2
else
  echo "==> release summary: cherry-pick only, $RELEASED_COUNT applied, $BLOCKED_COUNT blocked" >&2
fi

# --- Aggregate per-ticket status -----------------------------------------
# A ticket is "blocked" if ANY of its PRs conflicted; "released" only if
# ALL of its PRs applied cleanly and none are blocked.
awk '{print $1}' "$RELEASED_FILE" | sort -u > "$RELEASED_TICKETS"
awk -F'|' '{print $1}' "$BLOCKED_FILE" | sort -u > "$BLOCKED_TICKETS"

# Tickets with at least one blocked PR get blocked status (even if other
# PRs applied). Remove them from the released set.
PURE_RELEASED="$TMPDIR_RUN/pure-released.txt"
comm -23 "$RELEASED_TICKETS" "$BLOCKED_TICKETS" > "$PURE_RELEASED"

RELEASED_TICKET_COUNT="$(wc -l < "$PURE_RELEASED" | awk '{print $1}')"
BLOCKED_TICKET_COUNT="$(wc -l < "$BLOCKED_TICKETS" | awk '{print $1}')"

# --- Comment on blocked tickets + flip their status ----------------------
TODAY="$(date -u +%Y-%m-%d)"
if [[ "$BLOCKED_TICKET_COUNT" -gt 0 ]]; then
  while IFS= read -r ticket; do
    # Collect all blocked PRs for this ticket
    blocked_detail=""
    while IFS='|' read -r _t sha pr files; do
      files_md="$(echo "$files" | tr ' ' '\n' | sed '/^$/d' | sed 's/^/- /')"
      blocked_detail="${blocked_detail}
Cherry-pick of merge commit \`$sha\` (PR #$pr) -- conflicts in:
\`\`\`
$files_md
\`\`\`
"
    done < <(grep "^$ticket|" "$BLOCKED_FILE")

    gh issue comment "$ticket" --body "[/prod-release] BLOCKED at nightly batch $TODAY.
${blocked_detail}
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
    pl_set_status "$ticket" prod-release-blocked || true
  done < "$BLOCKED_TICKETS"
fi

# --- If nothing applied, exit cleanly ------------------------------------
if [[ "$RELEASED_TICKET_COUNT" -eq 0 ]]; then
  echo "no tickets applied successfully; nothing to ship tonight" >&2
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

# --- Deploy backend (skipped via PIPELINE_SKIP_DEPLOY=1) -----------------
# Backend deploys BEFORE pushing main so the new API is live before
# Amplify auto-deploys the new frontend (avoids version-skew window).
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

echo "==> pushing main (Amplify will auto-deploy frontend)" >&2
git push origin main >&2

# --- Build release notes manually + create GitHub Release ----------------
NEW_MAIN_SHA="$(git rev-parse main)"
RELEASE_TITLE="Production release $(date -u +'%Y-%m-%d %H:%M') UTC"

echo "==> building release notes from $RELEASED_TICKET_COUNT released ticket(s)" >&2

{
  echo "## What's Changed"
  echo
  while IFS= read -r ticket; do
    title="$(gh issue view "$ticket" --json title -q .title 2>/dev/null || echo "(title unavailable)")"
    pr_list="$(awk -v t="$ticket" '$1 == t {print $3}' "$RELEASED_FILE" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, #/g')"
    echo "* $title (#$ticket, PR #$pr_list)"
  done < "$PURE_RELEASED"

  if [[ "$BLOCKED_TICKET_COUNT" -gt 0 ]]; then
    echo
    echo "## Blocked tickets (retrying next nightly)"
    echo
    while IFS= read -r ticket; do
      title="$(gh issue view "$ticket" --json title -q .title 2>/dev/null || echo "(title unavailable)")"
      all_files="$(grep "^$ticket|" "$BLOCKED_FILE" | awk -F'|' '{print $4}' | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/ $//')"
      echo "* $title (#$ticket) -- conflicts: $all_files"
    done < "$BLOCKED_TICKETS"
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

# --- Comment + status:released on every fully-released ticket ------------
while IFS= read -r ticket; do
  if [[ -n "$RELEASE_URL" ]]; then
    gh issue comment "$ticket" --body "[/prod-release] Released to prod $(date -u +'%Y-%m-%d %H:%M') UTC.

Release: $RELEASE_URL" >/dev/null 2>&1 || true
  fi
  pl_set_status "$ticket" released || true
done < "$PURE_RELEASED"

# --- Cleanup -------------------------------------------------------------
git checkout develop >&2
git branch -D "$RELEASE_BRANCH" 2>/dev/null || true

echo "prod-release complete: $RELEASED_TICKET_COUNT ticket(s) shipped, $BLOCKED_TICKET_COUNT ticket(s) blocked" >&2

# Kick the manager so any post-release state changes (status transitions
# etc.) get picked up immediately rather than waiting for cron.
if gh workflow run pipeline-manager.yml >/dev/null 2>&1; then
  echo "kicked pipeline-manager workflow" >&2
fi
