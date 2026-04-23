#!/usr/bin/env bash
# _pipeline-lib.sh — shared helpers sourced by the other pipeline scripts.
# Not intended to be executed directly.

# Field name used for the pipeline state machine. We use "Pipeline Status"
# rather than "Status" because Projects v2 reserves the "Status" name.
PL_STATE_FIELD="${PL_STATE_FIELD:-Pipeline Status}"

_pl_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || {
    echo "error: not inside a git repo" >&2
    return 1
  }
}

# Load .pipeline-config.json into env vars:
#   PL_CONFIG       — path to the config file
#   PL_PROJECT_ID   — GraphQL node ID of the project
#   PL_OWNER        — project owner login
pl_load_config() {
  local root
  root="$(_pl_repo_root)" || return 1
  local cfg="$root/.pipeline-config.json"
  if [[ ! -f "$cfg" ]]; then
    echo "error: $cfg not found — run scripts/discover-ids.sh first" >&2
    return 1
  fi
  PL_CONFIG="$cfg"
  PL_PROJECT_ID="$(jq -r '.project.id' "$cfg")"
  PL_OWNER="$(jq -r '.owner' "$cfg")"
  export PL_CONFIG PL_PROJECT_ID PL_OWNER
}

# Resolve a field name to its metadata. Prints JSON {id, dataType, options}.
# Usage: pl_field "Pipeline Status"
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
  # Normalize ssh and https forms into "owner/repo".
  echo "$url" | sed -E 's#^git@github\.com:##; s#^https?://github\.com/##; s#\.git$##'
}

# Find the project-item ID for an issue number in the origin repo.
# Prints the item id, or exits non-zero if the issue isn't on the project.
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
    echo "error: issue #$issue is not on the pipeline project — add it first" >&2
    return 1
  fi
  printf '%s' "$item_id"
}
