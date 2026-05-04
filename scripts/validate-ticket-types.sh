#!/usr/bin/env bash
# validate-ticket-types.sh -- pre-flight check for auto-pipeline tickets
# without a type:* label.
#
# Run by pipeline-manager.yml at the top of every drain. For every open
# auto-pipeline ticket:
#
#   - If the ticket lacks any type:* label AND lacks pipeline:awaiting-type:
#     post a one-line comment asking for a type label, add the
#     pipeline:awaiting-type label so the ticket is visibly flagged on
#     the project board AND excluded from next-ticket.sh's queue.
#
#   - If the ticket has a type:* label AND has pipeline:awaiting-type:
#     remove pipeline:awaiting-type so the ticket re-enters the queue.
#     This is the auto-recovery path: human adds the type label, next
#     manager run unblocks the ticket.
#
# Always exits 0. Failures to comment / edit labels are logged but
# don't fail the workflow -- the validator is best-effort and the
# manager drain runs unconditionally afterwards.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

command -v gh >/dev/null || { echo "validate-ticket-types: gh not found; skipping" >&2; exit 0; }
command -v jq >/dev/null || { echo "validate-ticket-types: jq not found; skipping" >&2; exit 0; }

# Get every open auto-pipeline ticket with its labels
RAW="$(gh issue list \
  --state open \
  --label "auto-pipeline" \
  --limit 200 \
  --json number,title,labels \
  2>/dev/null || echo '[]')"

if [[ -z "$RAW" || "$RAW" == "[]" ]]; then
  echo "validate-ticket-types: no auto-pipeline tickets to validate" >&2
  exit 0
fi

# Project each ticket to: number, title, has_type, has_awaiting
PROJECTED="$(echo "$RAW" | jq -c '
  .[] | {
    number: .number,
    title: .title,
    has_type: (.labels | map(.name) | any(startswith("type:"))),
    has_awaiting: (.labels | map(.name) | any(. == "pipeline:awaiting-type"))
  }
')"

ADDED=0
CLEARED=0

while IFS= read -r ticket_json; do
  num="$(echo "$ticket_json" | jq -r .number)"
  has_type="$(echo "$ticket_json" | jq -r .has_type)"
  has_awaiting="$(echo "$ticket_json" | jq -r .has_awaiting)"

  if [[ "$has_type" == "false" && "$has_awaiting" == "false" ]]; then
    # Bad: no type label, not yet flagged. Flag it.
    echo "validate-ticket-types: #$num is missing type:* -- flagging" >&2
    if gh issue comment "$num" --body "[manager] This ticket has the \`auto-pipeline\` label but no \`type:*\` label, which the pipeline needs to pick a branch prefix and PR title.

Please add one of:
- \`type:feature\`
- \`type:bug\` (or \`type:bugfix\`)
- \`type:chore\`
- \`type:docs\`
- \`type:refactor\`
- \`type:hotfix\`

The pipeline will resume automatically once the label is added (no further action needed)." >/dev/null 2>&1; then
      :
    else
      echo "  (warning: failed to comment on #$num)" >&2
    fi
    if gh issue edit "$num" --add-label "pipeline:awaiting-type" >/dev/null 2>&1; then
      ADDED=$((ADDED + 1))
    else
      echo "  (warning: failed to add pipeline:awaiting-type to #$num)" >&2
    fi
    continue
  fi

  if [[ "$has_type" == "true" && "$has_awaiting" == "true" ]]; then
    # Auto-recovery: human added the type label after we flagged
    echo "validate-ticket-types: #$num now has type:* -- clearing flag" >&2
    if gh issue edit "$num" --remove-label "pipeline:awaiting-type" >/dev/null 2>&1; then
      gh issue comment "$num" --body "[manager] Type label detected. Clearing \`pipeline:awaiting-type\`; pipeline will pick this ticket up on the next drain." >/dev/null 2>&1 || true
      CLEARED=$((CLEARED + 1))
    else
      echo "  (warning: failed to remove pipeline:awaiting-type from #$num)" >&2
    fi
  fi
done <<< "$PROJECTED"

echo "validate-ticket-types: done -- $ADDED flagged, $CLEARED cleared" >&2
exit 0
