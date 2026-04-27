#!/usr/bin/env bash
# next-ticket.sh — find actionable tickets in the pipeline.
#
# Criteria (all must hold):
#   - Issue is on the pipeline project.
#   - Issue has the `auto-pipeline` label.
#   - Issue is open.
#   - Pipeline Status is either unset (treated as `new`, will be primed by
#     manager.sh) OR is set to a non-terminal state.
#
# Output: one line per actionable ticket, oldest first:
#   <issue-number>\t<status>\t<agent>\t<title>
#
# Exits 0 with no output if nothing is actionable.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }
command -v jq >/dev/null || { echo "error: jq not found" >&2; exit 127; }

pl_load_config

# States the pipeline should NOT pick up (terminal or blocked on human).
EXCLUDE_STATES='["merged-to-develop","needs-human","cost-review-pending"]'

RESP="$(gh api graphql \
  -f query='
    query($project: ID!) {
      node(id: $project) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              id
              content {
                __typename
                ... on Issue {
                  number
                  title
                  state
                  createdAt
                  labels(first: 20) { nodes { name } }
                }
              }
              fieldValues(first: 50) {
                nodes {
                  __typename
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    field { ... on ProjectV2FieldCommon { name } }
                    name
                  }
                }
              }
            }
          }
        }
      }
    }' \
  -f project="$PL_PROJECT_ID")"

# A ticket is actionable when:
#   - content is an open Issue with the auto-pipeline label
#   - AND Pipeline Status is either unset OR not in the exclude list
echo "$RESP" | jq -r --argjson exclude "$EXCLUDE_STATES" --arg sf "$PL_STATE_FIELD" '
  .data.node.items.nodes[]
  | select(.content.__typename == "Issue")
  | select(.content.state == "OPEN")
  | select(.content.labels.nodes | map(.name) | index("auto-pipeline"))
  | . as $item
  | ($item.fieldValues.nodes
      | map(select(.field != null))
      | map({key: .field.name, value: .name})
      | from_entries) as $fv
  | select($fv[$sf] == null or ($exclude | index($fv[$sf]) | not))
  | [
      $item.content.createdAt,
      ($item.content.number | tostring),
      ($fv[$sf] // "new"),
      ($fv["Agent"] // "-"),
      $item.content.title
    ]
  | @tsv' \
  | sort \
  | cut -f2-
