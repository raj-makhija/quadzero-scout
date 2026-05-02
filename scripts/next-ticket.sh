#!/usr/bin/env bash
# next-ticket.sh -- find actionable tickets in the pipeline.
#
# Criteria (all must hold):
#   - Issue is open.
#   - Issue has the `auto-pipeline` label.
#   - Issue has a project item on the configured project.
#   - Pipeline Status is either unset (treated as `new`, will be primed by
#     manager.sh) OR is set to a non-terminal state.
#
# Output: one line per actionable ticket, oldest first:
#   <issue-number>\t<status>\t<agent>\t<title>
#
# Exits 0 with no output if nothing is actionable.
#
# Implementation note: this queries from the *issue* side
# (repository.issues + each issue's projectItems edge) rather than the
# project side (Project.items). The project-side enumeration was found
# to return empty even when items demonstrably exist (item IDs
# resolve, set-field mutates them successfully, and the issue-side edge
# lists them with valid project IDs). The issue-side approach has been
# the reliable path all along and avoids the empty-aggregate quirk.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }
command -v jq >/dev/null || { echo "error: jq not found" >&2; exit 127; }

pl_load_config

OWNER_REPO="$(pl_repo_slug)"
OWNER="${OWNER_REPO%/*}"
REPO="${OWNER_REPO#*/}"

# States the pipeline should NOT pick up (terminal or blocked on human).
EXCLUDE_STATES='["merged-to-develop","needs-human","cost-review-pending"]'

RESP="$(gh api graphql \
  -f query='
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(first: 100, states: OPEN, labels: ["auto-pipeline"], orderBy: {field: CREATED_AT, direction: ASC}) {
          nodes {
            number
            title
            createdAt
            labels(first: 20) { nodes { name } }
            projectItems(first: 10) {
              nodes {
                project { id }
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
      }
    }' \
  -f owner="$OWNER" -f repo="$REPO")"

# Filter: only issues that have a project item on OUR project, are not
# flagged pipeline:awaiting-type (validator-set; needs human to add a
# type:* label before they're actionable), then check that Pipeline
# Status is unset OR not in the exclude list. Same output contract as
# the previous Project.items implementation.
echo "$RESP" | jq -r --argjson exclude "$EXCLUDE_STATES" --arg sf "$PL_STATE_FIELD" --arg pid "$PL_PROJECT_ID" '
  .data.repository.issues.nodes[]
  | . as $issue
  | ($issue.labels.nodes | map(.name)) as $labels
  | select($labels | any(. == "pipeline:awaiting-type") | not)
  | ($issue.projectItems.nodes
      | map(select(.project.id == $pid))
      | .[0]) as $item
  | select($item != null)
  | ($item.fieldValues.nodes
      | map(select(.field != null))
      | map({key: .field.name, value: .name})
      | from_entries) as $fv
  | select($fv[$sf] == null or ($exclude | index($fv[$sf]) | not))
  | [
      $issue.createdAt,
      ($issue.number | tostring),
      ($fv[$sf] // "new"),
      ($fv["Agent"] // "-"),
      $issue.title
    ]
  | @tsv' \
  | sort \
  | cut -f2-
