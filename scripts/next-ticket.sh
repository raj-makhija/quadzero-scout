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
# Exit codes:
#   0   - the query succeeded. Zero or more actionable tickets on stdout;
#         no output means the queue is genuinely empty.
#   3   - the project query FAILED, so the queue state is unknown. Callers
#         must not read this as an empty queue: conflating the two let a 15h
#         PL_PROJECT_TOKEN outage report "queue drained" on every 5-minute
#         cron tick while four tickets sat stuck at ready-for-qa (#568).
#   127 - gh or jq is not installed.
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
pl_use_project_token

OWNER_REPO="$(pl_repo_slug)"
OWNER="${OWNER_REPO%/*}"
REPO="${OWNER_REPO#*/}"

# States the pipeline should NOT pick up (terminal or blocked on human).
# awaiting-qa is the dev-phase terminal: the branch is built + reviewed and
# is waiting for a human pipeline:qa-deploy, not for any agent.
EXCLUDE_STATES='["awaiting-qa","merged-to-develop","needs-human","cost-review-pending"]'

RESP=""
GH_RC=0
RESP="$(gh api graphql \
  -f query='
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(first: 100, states: OPEN, labels: ["auto-pipeline"], orderBy: {field: CREATED_AT, direction: ASC}) {
          pageInfo { hasNextPage }
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
  -f owner="$OWNER" -f repo="$REPO")" || GH_RC=$?

# A failed query must be loud and distinguishable from an empty queue (#568).
# gh's own stderr -- e.g. "gh: Bad credentials (HTTP 401)" -- is not redirected,
# so it has already reached the log by the time these run.
if [[ $GH_RC -ne 0 ]]; then
  echo "next-ticket.sh: project query failed (gh exit $GH_RC) -- check PL_PROJECT_TOKEN. Queue state is UNKNOWN, not empty." >&2
  exit 3
fi

# GraphQL can answer HTTP 200 while reporting the failure in an `errors` array
# (partial results, field-level auth denials), which gh does not reliably
# surface as a non-zero exit -- so check the body too.
if [[ -n "$(printf '%s' "$RESP" | jq -r '.errors // empty' 2>/dev/null)" ]]; then
  echo "next-ticket.sh: project query returned GraphQL errors -- check PL_PROJECT_TOKEN. Queue state is UNKNOWN, not empty." >&2
  printf '%s' "$RESP" | jq -r '.errors[]? | "  - " + (.message // "unknown error")' >&2 || true
  exit 3
fi

# Warn if GitHub returned exactly 100 issues (possible truncation).
if [ "$(echo "$RESP" | jq '.data.repository.issues.pageInfo.hasNextPage')" = "true" ]; then
  echo "warning: next-ticket.sh: more than 100 open auto-pipeline issues exist; results may be truncated." >&2
fi

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
