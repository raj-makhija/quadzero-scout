#!/usr/bin/env bash
# _pipeline-lib.sh -- shared helpers sourced by the other pipeline scripts.
# Not intended to be executed directly.

# Field name used for the pipeline state machine. We use "Pipeline Status"
# rather than "Status" because Projects v2 reserves the "Status" name.
PL_STATE_FIELD="${PL_STATE_FIELD:-Pipeline Status}"

# Allowed ticket types (must match the type:* labels on the repo).
PL_VALID_TYPES="feature bug bugfix chore docs refactor hotfix"

_pl_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || {
    echo "error: not inside a git repo" >&2
    return 1
  }
}

# Load .pipeline-config.json into env vars:
#   PL_CONFIG       -- path to the config file
#   PL_PROJECT_ID   -- GraphQL node ID of the project
#   PL_OWNER        -- project owner login
pl_load_config() {
  local root
  root="$(_pl_repo_root)" || return 1
  local cfg="$root/.pipeline-config.json"
  if [[ ! -f "$cfg" ]]; then
    echo "error: $cfg not found -- run scripts/discover-ids.sh first" >&2
    return 1
  fi
  PL_CONFIG="$cfg"
  PL_PROJECT_ID="$(jq -r '.project.id' "$cfg")"
  PL_OWNER="$(jq -r '.owner' "$cfg")"
  export PL_CONFIG PL_PROJECT_ID PL_OWNER
}

# Point gh at the Projects v2 board token for the rest of the calling script.
# The pipeline board is USER-owned (project #1, owner raj-makhija). GitHub App
# installation tokens have no permission scope for user-owned Projects v2 --
# only org boards expose `organization_projects` -- so under the App token
# (#145) every project read/write silently returns empty or no-ops. The
# scripts that hit the project GraphQL API (get-field.sh, set-field.sh,
# next-ticket.sh, and pl_item_id_for_issue which they call) invoke this right
# after pl_load_config so their gh calls use PL_PROJECT_TOKEN, a user PAT with
# Projects access. The App token (GH_TOKEN) still drives comments, label edits,
# and PR + git ops, preserving the bot identity. When PL_PROJECT_TOKEN is unset
# -- e.g. local runs where gh is already authed as the user's PAT -- no-op.
pl_use_project_token() {
  if [[ -n "${PL_PROJECT_TOKEN:-}" ]]; then
    export GH_TOKEN="$PL_PROJECT_TOKEN"
  fi
}

# Resolve a field name to its metadata. Prints JSON {id, dataType, options}.
pl_field() {
  local name="$1"
  local out
  out="$(jq -e --arg n "$name" '.fields[$n] // empty' "$PL_CONFIG" 2>/dev/null)"
  if [[ -z "$out" ]]; then
    echo "error: field '$name' not found in $PL_CONFIG" >&2
    return 1
  fi
  printf '%s' "$out"
}

# Repo slug (owner/name), inferred from the origin remote.
pl_repo_slug() {
  local url
  url="$(git config --get remote.origin.url)"
  echo "$url" | sed -E 's#^git@github\.com:##; s#^https?://github\.com/##; s#\.git$##'
}

# Find the project-item ID for an issue number in the origin repo.
pl_item_id_for_issue() {
  local issue="$1"
  local slug owner repo
  slug="$(pl_repo_slug)"
  owner="${slug%/*}"
  repo="${slug#*/}"

  local resp
  resp="$(gh api graphql \
    -f query='
      query($owner: String!, $repo: String!, $issue: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            projectItems(first: 20) {
              nodes { id project { id } }
            }
          }
        }
      }' \
    -f owner="$owner" -f repo="$repo" -F issue="$issue")"

  local item_id
  item_id="$(echo "$resp" | jq -r --arg pid "$PL_PROJECT_ID" '
    .data.repository.issue.projectItems.nodes[]
    | select(.project.id == $pid)
    | .id' | head -n1)"

  if [[ -z "$item_id" ]]; then
    echo "error: issue #$issue is not on the pipeline project -- add it first" >&2
    return 1
  fi
  printf '%s' "$item_id"
}

# Extract the type from a ticket's type:* label. Errors if 0 or 2+.
# Prints the type (e.g. "feature", "bugfix") to stdout.
pl_type_from_labels() {
  local issue="$1"
  local labels
  labels="$(gh issue view "$issue" --json labels -q '.labels[].name')"

  local types
  types="$(echo "$labels" | grep -E '^type:' | sed 's/^type://')"

  local count
  count="$(echo -n "$types" | grep -c . || true)"

  if [[ "$count" -eq 0 ]]; then
    echo "error: issue #$issue has no type:* label" >&2
    return 1
  fi
  if [[ "$count" -gt 1 ]]; then
    echo "error: issue #$issue has multiple type:* labels: $types" >&2
    return 1
  fi

  if ! echo " $PL_VALID_TYPES " | grep -q " $types "; then
    echo "error: unknown type '$types'; must be one of: $PL_VALID_TYPES" >&2
    return 1
  fi

  printf '%s' "$types"
}

# Return 0 if the ticket carries the `type:docs` label, 1 otherwise.
pl_ticket_is_docs() {
  local issue="$1"
  gh issue view "$issue" --json labels -q '.labels[].name' 2>/dev/null \
    | grep -qx 'type:docs'
}

# Read a newline-separated list of file paths on stdin and return 0 only if
# the list is NON-EMPTY and every path is a docs file: a markdown file
# (case-insensitive *.md) or anything under a `docs/` directory at any depth.
#
# An EMPTY list returns 1 (NOT docs-only). This is the safe fallback: if a
# diff can't be fetched (e.g. no PR/branch yet), the caller must take the
# full tester + QA lifecycle rather than silently skipping the QA gate.
pl_is_docs_only() {
  local files non_docs
  files="$(sed '/^[[:space:]]*$/d')"
  [[ -z "$files" ]] && return 1
  non_docs="$(printf '%s\n' "$files" | grep -viE '\.md$|(^|/)docs/' || true)"
  [[ -n "$non_docs" ]] && return 1
  return 0
}

# Abort if the working tree has uncommitted changes. Respects gitignore.
# Tolerates the tsbuildinfo noise by filtering well-known transient paths.
pl_require_clean_tree() {
  local dirty
  dirty="$(git status --porcelain | grep -v -E '(tsconfig\.tsbuildinfo|\.next/|node_modules/)$' || true)"
  if [[ -n "$dirty" ]]; then
    echo "error: working tree has uncommitted changes; commit or stash first:" >&2
    echo "$dirty" >&2
    return 1
  fi
}

# Return 0 if <tip> carries commits NOT reachable from <base> (genuine
# un-merged work that must not be clobbered). Return 1 if <tip> is empty or
# already contained in <base> -- merged, identical, or an older state of the
# same line -- which is safe to reset and reuse.
#
# create-branch.sh keys its clobber guard on this. The distinction is
# ancestry, NOT SHA-equality: develop HEAD advances as other tickets merge,
# so a leftover attempt branch whose PR already merged is almost never equal
# to current develop HEAD. The old equality check mis-flagged such stale
# branches as "real work" and wedged retried tickets at needs-human (#430).
pl_has_unmerged_commits() {
  local tip="$1" base="$2"
  [[ -z "$tip" ]] && return 1
  git merge-base --is-ancestor "$tip" "$base" 2>/dev/null && return 1
  return 0
}

# Generate a kebab-case slug from a free-form title.
# "Fix: login bug (#42)" -> "fix-login-bug-42"
pl_slug_from_title() {
  local title="$1"
  echo "$title" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
    | head -c 50
}

# Return 0 if the commit message on stdin contains at least one
# Co-Authored-By trailer line, 1 otherwise. Used to gate the strip step so
# it is a true no-op (no amend, no force-push, no hash change) when the
# message has none -- the gate must key on presence, NOT on whether
# stripping would change the text, so trailing-blank-only messages are
# left untouched.
pl_has_coauthors() {
  grep -qiE '^[[:space:]]*co-authored-by:'
}

# Read a commit message on stdin, print it with every Co-Authored-By trailer
# line removed and any resulting trailing blank lines trimmed.
#
# Policy: ALL Co-Authored-By lines are stripped regardless of email. In this
# automated pipeline none represent meaningful human co-authorship (CLAUDE.md
# instructs agents not to add them); they leak into squash commits anyway.
pl_strip_coauthors() {
  grep -viE '^[[:space:]]*co-authored-by:' \
    | awk 'NF{last=NR} {a[NR]=$0} END{for(i=1;i<=last;i++) print a[i]}'
}

# Transition a ticket's status:* label to a new value. Removes any existing
# status:* label, then adds status:<new-status>. Idempotent.
#
# Usage: pl_set_status <issue> <new-status>
#   Where <new-status> is one of:
#     in-progress, ready-for-qa, in-qa, qa-approved,
#     prod-release-blocked, released, needs-human
pl_set_status() {
  local issue="$1" new_status="status:$2"
  local labels
  labels="$(gh issue view "$issue" --json labels -q '.labels[].name' 2>/dev/null || true)"
  while IFS= read -r label; do
    if [[ -n "$label" && "$label" == status:* && "$label" != "$new_status" ]]; then
      gh issue edit "$issue" --remove-label "$label" 2>/dev/null >&2 || true
    fi
  done <<< "$labels"
  gh issue edit "$issue" --add-label "$new_status" 2>/dev/null >&2 || true
}

# Given PR candidate data on stdin (one per line, tab-separated:
# number<TAB>state<TAB>headRefName<TAB>createdAt), select the best open PR:
#   1. Only OPEN entries (CLOSED/MERGED/null are skipped).
#   2. Branch-name rank: -cowork (1) > -attempt-* (2) > other (3).
#   3. Tie-break: most recently created (lexicographic ISO-8601 createdAt).
# Prints the winning PR number, or empty if no OPEN PR.
_pl_pick_best_pr() {
  local best_pr="" best_rank=99 best_created="" num state head created rank
  while IFS=$'\t' read -r num state head created; do
    [[ "$state" != "OPEN" ]] && continue
    rank=3
    if [[ "$head" == *"-cowork" ]]; then rank=1
    elif [[ "$head" == *"-attempt-"* ]]; then rank=2
    fi
    if [[ $rank -lt $best_rank ]] || \
       [[ $rank -eq $best_rank && "$created" > "$best_created" ]]; then
      best_pr="$num"
      best_rank=$rank
      best_created="$created"
    fi
  done
  printf '%s' "$best_pr"
}

# Resolve the PR number for a ticket. Prefers the "PR Number" project field
# (set by the autonomous open-pr.sh); falls back to resolving the open PR via
# the issue's closedByPullRequestsReferences (covers the manual -cowork route,
# which does not populate the field). The state field in that API is always
# null (verified live on #308), so each candidate is confirmed OPEN via a
# separate gh pr view call. When resolved via fallback, writes the number back
# to the "PR Number" field so downstream steps and re-runs are stable.
#
# Prints the PR number on success. The exit status separates the two empty
# outcomes, which have different causes and different fixes (#569):
#   0 - resolved; PR number on stdout
#   1 - no open PR for this ticket; the lookups worked and found none
#   2 - a lookup failed, so the answer is unknown; stdout empty
# Callers must capture the status explicitly -- they all run under `set -e`,
# where a bare PR="$(pl_pr_for_ticket ...)" would abort on 1 and 2 alike.
#
# gh's own stderr is passed through to the caller's stderr (the workflow log)
# instead of being discarded, so a credential failure is diagnosable. Callers
# must NOT put it in an issue comment -- it can carry tokens and API URLs.
#
# Set _PL_LIBDIR to override the helper-script directory (for tests).
pl_pr_for_ticket() {
  local ticket="$1"
  local libdir
  libdir="${_PL_LIBDIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

  # 1. Preferred: the board's "PR Number" field, which needs the project PAT.
  # A failure here is not fatal -- the manual -cowork route never populates the
  # field, so "unreadable" and "unset" both legitimately fall through to the
  # linked-PR lookup below.
  local pr
  if pr="$("$libdir/get-field.sh" "$ticket" "PR Number")" && [[ -n "$pr" ]]; then
    printf '%s' "$pr"
    return 0
  fi

  # 2. Fallback: derive candidate PR numbers from the issue's linked PRs, then
  # confirm each candidate's state via gh pr view (the closedByPullRequestsReferences
  # state field is null in the GitHub API -- do not filter on it).
  #
  # This reads plain repository data, which the App token can see, so it runs
  # under the ambient GH_TOKEN. Pinning it to PL_PROJECT_TOKEN meant one dead
  # PAT took out both resolution paths at once, and #556 reported "no open PR"
  # while PR #566 was open (#567).
  local refs
  if ! refs="$(gh issue view "$ticket" \
      --json closedByPullRequestsReferences \
      -q '[.closedByPullRequestsReferences[].number] | unique[]')"; then
    echo "pl_pr_for_ticket: linked-PR lookup failed for #$ticket (gh error above)" >&2
    return 2
  fi

  if [[ -z "$refs" ]]; then
    return 1
  fi

  local pr_table="" num info row failed=0
  while IFS= read -r num; do
    [[ -z "$num" ]] && continue
    if ! info="$(gh pr view "$num" --json number,state,headRefName,createdAt)"; then
      failed=1
      continue
    fi
    [[ -z "$info" ]] && continue
    row="$(printf '%s' "$info" | jq -r '[.number,.state,.headRefName,.createdAt] | @tsv')"
    pr_table="${pr_table}${row}"$'\n'
  done <<< "$refs"

  pr="$(printf '%s' "$pr_table" | _pl_pick_best_pr)"

  if [[ -z "$pr" ]]; then
    # No open PR among the candidates we could read. If any candidate lookup
    # errored, "none open" is not a safe conclusion -- the one we failed to
    # read could have been it.
    if [[ $failed -eq 1 ]]; then
      echo "pl_pr_for_ticket: a PR lookup failed for #$ticket; cannot confirm there is no open PR" >&2
      return 2
    fi
    return 1
  fi

  # Persist so downstream steps and re-runs don't re-resolve. Best-effort: this
  # one genuinely needs the project PAT, and a dead PAT must not fail a resolve
  # that already succeeded (#567).
  "$libdir/set-field.sh" "$ticket" "PR Number" "$pr" 2>/dev/null || true

  printf '%s' "$pr"
  return 0
}

# Build the serverless package prerequisites on a fresh Linux runner and
# deploy the backend to the given stage (dev|qa|prod). Reads AWS creds from
# the environment (the workflow sets them). Callers gate PIPELINE_SKIP_DEPLOY
# themselves -- this always deploys when invoked.
#
# The infra/src copy, node_modules symlink, and chromium-layer build all
# exist because infra/layers and infra/src are gitignored (built from npm /
# a local junction to backend/src) and serverless-esbuild needs real files
# at those paths to package the handlers. See the inline notes in the
# original qa-deploy.sh history for the full rationale.
#
# Usage: pl_deploy_stage <stage>
pl_deploy_stage() {
  local stage="$1"
  local root
  root="$(_pl_repo_root)" || return 1
  cd "$root" || return 1

  echo "==> verifying AWS credentials" >&2
  local aws_out
  if ! aws_out="$(aws sts get-caller-identity --output text 2>&1)"; then
    echo "error: aws sts get-caller-identity failed: $aws_out" >&2
    return 1
  fi
  echo "    aws sts OK: $aws_out" >&2

  echo "==> installing infra/ deps" >&2
  (cd infra/ && npm ci --silent)
  if [[ ! -e infra/src ]]; then
    echo "==> copying backend/src -> infra/src (real files for serverless-esbuild)" >&2
    cp -r backend/src infra/src
  fi
  echo "==> installing backend/ deps" >&2
  (cd backend/ && npm ci --silent)
  if [[ ! -e infra/src/node_modules ]]; then
    echo "==> linking infra/src/node_modules -> backend/node_modules" >&2
    ln -s ../../backend/node_modules infra/src/node_modules
  fi
  if [[ ! -d infra/layers/chromium/nodejs/node_modules/@sparticuz/chromium ]]; then
    local chromium_ver
    chromium_ver="$(jq -r '.dependencies."@sparticuz/chromium" // .devDependencies."@sparticuz/chromium" // empty' backend/package.json)"
    if [[ -z "$chromium_ver" ]]; then
      echo "error: @sparticuz/chromium not declared in backend/package.json" >&2
      return 1
    fi
    echo "==> building chromium Lambda layer (@sparticuz/chromium $chromium_ver, ~80MB)" >&2
    mkdir -p infra/layers/chromium/nodejs
    (cd infra/layers/chromium/nodejs && \
      npm init -y >/dev/null && \
      npm install --silent --no-audit --no-fund "@sparticuz/chromium@$chromium_ver")
  fi
  echo "==> deploying backend to $stage (npx serverless deploy --stage $stage)" >&2
  (cd infra/ && npx serverless deploy --stage "$stage") || return 1
  # Portal-scan is a second serverless service (ticket #535) with its own stack;
  # deploy it too so qa-deploy and prod-release ship both. Depends on the chromium
  # layer built above being present for the worker's HireBound headless path (#538).
  echo "==> deploying portal-scan service to $stage (serverless-portal-scan.yml)" >&2
  (cd infra/ && npx serverless deploy --config serverless-portal-scan.yml --stage "$stage")
}

# Compile-time gate for a project dir: `npm run typecheck` then `npm run build`.
# This catches breakage that the `npm test` (vitest) gate does NOT:
#   - a frontend `next build` failure -- e.g. an invalid route/page export that
#     both `tsc --noEmit` and vitest pass, yet freezes the Amplify deploy
#     (the #515 class that this gate exists to close, ticket #543)
#   - a backend `tsc` emit error or a bundle-visible type error
# Assumes dependencies are already installed in <dir>: callers run the npm-test
# gate (which does `npm ci`) immediately before this. A dir that lacks the
# package.json or a given script is skipped for that step (no-op), so this is
# safe on repos without a build/typecheck script.
#
# On the first failing step it stashes context in globals for the caller's
# issue comment: PL_BUILD_FAIL_WHERE ("<dir> (<step>)") and PL_BUILD_FAIL_TAIL
# (last 60 lines of output). Returns 0 if every present step passes, 1 on the
# first failure.
pl_build_check() {
  local dir="$1"
  [[ -f "$dir/package.json" ]] || return 0
  local step out
  for step in typecheck build; do
    grep -qE "\"$step\"[[:space:]]*:" "$dir/package.json" || continue
    echo "==> running npm run $step in $dir/" >&2
    out="$(mktemp -t "npm-$step-${dir//\//_}.XXXXXX")"
    if (cd "$dir" && npm run "$step") >"$out" 2>&1; then
      echo "    OK -- $dir/ $step" >&2
      rm -f "$out"
    else
      echo "    FAIL -- $dir/ $step" >&2
      cat "$out" >&2
      PL_BUILD_FAIL_WHERE="$dir ($step)"
      PL_BUILD_FAIL_TAIL="$(tail -n 60 "$out")"
      rm -f "$out"
      return 1
    fi
  done
  return 0
}
