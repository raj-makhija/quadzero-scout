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

# Generate a kebab-case slug from a free-form title.
# "Fix: login bug (#42)" -> "fix-login-bug-42"
pl_slug_from_title() {
  local title="$1"
  echo "$title" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
    | head -c 50
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

# Resolve the PR number for a ticket. Prefers the "PR Number" project field
# (set by the autonomous open-pr.sh); falls back to an OPEN pull request the
# issue links via "Closes #N" (covers the manual -cowork route, which does
# not populate the field). Prints the PR number, or empty if none found.
pl_pr_for_ticket() {
  local ticket="$1" libdir pr
  libdir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  pr="$("$libdir/get-field.sh" "$ticket" "PR Number" 2>/dev/null || true)"
  if [[ -z "$pr" ]]; then
    pr="$(gh issue view "$ticket" --json closedByPullRequestsReferences \
      -q '[.closedByPullRequestsReferences[] | select(.state == "OPEN") | .number][0] // empty' \
      2>/dev/null || true)"
  fi
  printf '%s' "$pr"
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
  (cd infra/ && npx serverless deploy --stage "$stage")
}
