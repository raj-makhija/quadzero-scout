#!/usr/bin/env bash
# get-field.sh — read a project field value on an issue.
#
# Usage:
#   scripts/get-field.sh <issue-number> <field-name>
#
# Prints the value to stdout (single-select: option name; text: the string;
# number: the number). Prints nothing if the field is unset on that item.
#
# Example:
#   scripts/get-field.sh 42 "Pipeline Status"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <issue-number> <field-name>" >&2
  exit 2
fi

ISSUE="$1"
FIELD_NAME="$2"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }
command -v jq >/dev/null || { echo "error: jq not found" >&2; exit 127; }

pl_load_config

FIELD_JSON="$(pl_field "$FIELD_NAME")"
FIELD_ID="$(echo "$FIELD_JSON" | jq -r '.id')"

ITEM_ID="$(pl_item_id_for_issue "$ISSUE")"

# Query field values on the item and pick ours out by field id.
RESP="$(gh api graphql \
  -f query='
    query($item: ID!) {
      node(id: $item) {
        ... on ProjectV2Item {
          fieldValues(first: 50) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue {
                field { ... on ProjectV2FieldCommon { id } }
                name
              }
              ... on ProjectV2ItemFieldTextValue {
                field { ... on ProjectV2FieldCommon { id } }
                text
              }
              ... on ProjectV2ItemFieldNumberValue {
                field { ... on ProjectV2FieldCommon { id } }
                number
              }
            }
          }
        }
      }
    }' \
  -f item="$ITEM_ID")"

echo "$RESP" | jq -r --arg fid "$FIELD_ID" '
  .data.node.fieldValues.nodes[]
  | select(.field.id == $fid)
  | (.name // .text // .number)
  | tostring' | head -n1
