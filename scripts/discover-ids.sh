#!/usr/bin/env bash
# discover-ids.sh — one-time: fetch project + field + option IDs from GitHub
# Projects v2 and write .pipeline-config.json at the repo root.
#
# Usage:
#   scripts/discover-ids.sh <project-number> [owner]
#
# Env fallbacks:
#   PIPELINE_OWNER          (default: raj-makhija)
#   PIPELINE_PROJECT_NUMBER (used if $1 not provided)
#
# Requires: gh (authenticated, scopes: project + repo), jq.

set -euo pipefail

OWNER="${2:-${PIPELINE_OWNER:-raj-makhija}}"
PROJECT_NUMBER="${1:-${PIPELINE_PROJECT_NUMBER:-}}"

if [[ -z "$PROJECT_NUMBER" ]]; then
  echo "error: project number required (as \$1 or PIPELINE_PROJECT_NUMBER)" >&2
  echo "usage: $0 <project-number> [owner]" >&2
  exit 2
fi

command -v gh >/dev/null || { echo "error: gh CLI not found" >&2; exit 127; }
command -v jq >/dev/null || { echo "error: jq not found" >&2; exit 127; }

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
OUT="$REPO_ROOT/.pipeline-config.json"

echo "fetching project $OWNER/#$PROJECT_NUMBER ..." >&2

# User-scoped project. For org-owned projects, swap `user(login:)` for
# `organization(login:)` below.
RESPONSE=$(gh api graphql \
  -f query='
    query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
          title
          fields(first: 50) {
            nodes {
              __typename
              ... on ProjectV2Field {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                options { id name }
              }
              ... on ProjectV2IterationField {
                id
                name
                dataType
              }
            }
          }
        }
      }
    }' \
  -f owner="$OWNER" \
  -F number="$PROJECT_NUMBER")

PROJECT_ID=$(echo "$RESPONSE" | jq -r '.data.user.projectV2.id // empty')
if [[ -z "$PROJECT_ID" ]]; then
  echo "error: project not found or not accessible. raw response:" >&2
  echo "$RESPONSE" | jq . >&2
  exit 1
fi

# Flatten into .pipeline-config.json. Fields keyed by their display name so
# callers can do `.fields["Pipeline Status"].id`. Single-select options are
# keyed by their display name → option id.
echo "$RESPONSE" | jq \
  --arg owner "$OWNER" \
  --argjson number "$PROJECT_NUMBER" \
  '{
    owner: $owner,
    project: {
      number: $number,
      id:    .data.user.projectV2.id,
      title: .data.user.projectV2.title
    },
    fields: (
      .data.user.projectV2.fields.nodes
      | map(select(.id != null))
      | map({
          key: .name,
          value: (
            { id: .id, name: .name, dataType: .dataType }
            + (if .options
               then { options: (.options | map({key: .name, value: .id}) | from_entries) }
               else { options: null }
               end)
          )
        })
      | from_entries
    )
  }' > "$OUT"

echo "wrote $OUT" >&2
jq '{project: .project.title, number: .project.number, fields: (.fields | keys)}' "$OUT" >&2
