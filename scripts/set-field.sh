#!/usr/bin/env bash
# set-field.sh — set a project field on an issue.
#
# Usage:
#   scripts/set-field.sh <issue-number> <field-name> <value>
#
# For single-select fields, <value> is the option name (e.g. "tests-pending").
# For text fields, any string. For number fields, an integer or float.
# Pass an empty string ("") to CLEAR the field (works on any field type).
#
# Example:
#   scripts/set-field.sh 42 "Pipeline Status" tests-pending
#   scripts/set-field.sh 42 "PR Number" "123"
#   scripts/set-field.sh 42 "Attempt" 2
#   scripts/set-field.sh 42 "PR Number" ""       # clear

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 3 ]]; then
  echo "usage: $0 <issue-number> <field-name> <value>" >&2
  exit 2
fi

ISSUE="$1"
FIELD_NAME="$2"
VALUE="$3"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }
command -v jq >/dev/null || { echo "error: jq not found" >&2; exit 127; }

pl_load_config
pl_use_project_token

FIELD_JSON="$(pl_field "$FIELD_NAME")"
FIELD_ID="$(echo "$FIELD_JSON" | jq -r '.id')"
DATA_TYPE="$(echo "$FIELD_JSON" | jq -r '.dataType')"

ITEM_ID="$(pl_item_id_for_issue "$ISSUE")"

# Empty value means CLEAR. Uses a different mutation.
if [[ -z "$VALUE" ]]; then
  gh api graphql \
    -f query='
      mutation($project: ID!, $item: ID!, $field: ID!) {
        clearProjectV2ItemFieldValue(input: {
          projectId: $project, itemId: $item, fieldId: $field
        }) { projectV2Item { id } }
      }' \
    -f project="$PL_PROJECT_ID" \
    -f item="$ITEM_ID" \
    -f field="$FIELD_ID" \
    > /dev/null
  echo "cleared #$ISSUE '$FIELD_NAME'" >&2
  exit 0
fi

# GraphQL variable type + value fragment + gh api arg vary by field dataType.
case "$DATA_TYPE" in
  SINGLE_SELECT)
    OPT_ID="$(echo "$FIELD_JSON" | jq -r --arg v "$VALUE" '.options[$v] // empty')"
    if [[ -z "$OPT_ID" ]]; then
      echo "error: option '$VALUE' not found on field '$FIELD_NAME'" >&2
      echo "valid options:" >&2
      echo "$FIELD_JSON" | jq -r '.options | keys[]' | sed 's/^/  - /' >&2
      exit 1
    fi
    GQL_VAR_TYPE="String!"
    GQL_VALUE='singleSelectOptionId: $value'
    VALUE_ARGS=(-f "value=$OPT_ID")
    ;;
  TEXT)
    GQL_VAR_TYPE="String!"
    GQL_VALUE='text: $value'
    VALUE_ARGS=(-f "value=$VALUE")
    ;;
  NUMBER)
    if ! [[ "$VALUE" =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then
      echo "error: field '$FIELD_NAME' is NUMBER; got non-numeric '$VALUE'" >&2
      exit 1
    fi
    GQL_VAR_TYPE="Float!"
    GQL_VALUE='number: $value'
    VALUE_ARGS=(-F "value=$VALUE")
    ;;
  *)
    echo "error: unsupported field dataType '$DATA_TYPE' for field '$FIELD_NAME'" >&2
    exit 1
    ;;
esac

gh api graphql \
  -f query="
    mutation(\$project: ID!, \$item: ID!, \$field: ID!, \$value: ${GQL_VAR_TYPE}) {
      updateProjectV2ItemFieldValue(input: {
        projectId: \$project,
        itemId: \$item,
        fieldId: \$field,
        value: { ${GQL_VALUE} }
      }) {
        projectV2Item { id }
      }
    }" \
  -f project="$PL_PROJECT_ID" \
  -f item="$ITEM_ID" \
  -f field="$FIELD_ID" \
  "${VALUE_ARGS[@]}" \
  > /dev/null

echo "set #$ISSUE '$FIELD_NAME' = '$VALUE'" >&2
