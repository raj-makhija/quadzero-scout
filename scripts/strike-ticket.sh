#!/usr/bin/env bash
# strike-ticket.sh -- record a manager-dispatch failure on a ticket;
# escalate to needs-human after PIPELINE_MAX_STRIKES (default 3)
# consecutive failures.
#
# Strike state lives in labels: pipeline:struck-1, pipeline:struck-2,
# pipeline:struck-out (terminal). Visible on the project board, easy
# to query, and avoids comment noise on tickets that never strike.
#
# "Consecutive" means since the last successful manager dispatch on
# this ticket -- clear-strikes.sh removes the label after success.
#
# Usage: scripts/strike-ticket.sh <ticket> [reason]
#
# Always exits 0. Best-effort: comment / label failures are logged
# but don't fail the workflow.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <ticket> [reason]" >&2
  exit 0
fi

TICKET="$1"
REASON="${2:-(no reason provided)}"
MAX_STRIKES="${PIPELINE_MAX_STRIKES:-3}"

command -v gh >/dev/null || { echo "strike-ticket: gh not found; skipping" >&2; exit 0; }

# Determine current strike count by scanning labels for pipeline:struck-N
LABELS="$(gh issue view "$TICKET" --json labels -q '.labels[].name' 2>/dev/null || echo "")"

CURRENT=0
while IFS= read -r label; do
  case "$label" in
    pipeline:struck-1) (( CURRENT < 1 )) && CURRENT=1 ;;
    pipeline:struck-2) (( CURRENT < 2 )) && CURRENT=2 ;;
    pipeline:struck-out) CURRENT=$MAX_STRIKES ;;  # already escalated
  esac
done <<< "$LABELS"

NEW_COUNT=$((CURRENT + 1))

# Remove the previous strike label (if any) so we don't accumulate
if [[ $CURRENT -gt 0 && $CURRENT -lt $MAX_STRIKES ]]; then
  gh issue edit "$TICKET" --remove-label "pipeline:struck-$CURRENT" >/dev/null 2>&1 || true
fi

if [[ $NEW_COUNT -ge $MAX_STRIKES ]]; then
  echo "strike-ticket: #$TICKET hit $NEW_COUNT/$MAX_STRIKES strikes; parking at needs-human" >&2

  gh issue comment "$TICKET" --body "[manager:strike] strike $NEW_COUNT/$MAX_STRIKES at $(date -u +%Y-%m-%dT%H:%M:%SZ).

Reason: $REASON

THRESHOLD REACHED. Parking ticket at \`needs-human\` to stop the queue from being repeatedly starved by this single failure.

Inspect the strike comments above for the failure pattern. Common causes:
- Agent timeout (raise \`PIPELINE_AGENT_TIMEOUT_SEC\` if the work is genuinely large)
- Branch conflict that needs manual resolution
- Ticket scope too large to implement in one pass (split into smaller tickets)
- Bug in agent prompt / tool use

To unblock once resolved: add the \`pipeline:retry\` label, which clears strikes and re-enters the actionable queue." >/dev/null 2>&1 || \
    echo "  (warning: failed to comment on #$TICKET)" >&2

  gh issue edit "$TICKET" --add-label "pipeline:struck-out" >/dev/null 2>&1 || true
  "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" needs-human || true
  "$SCRIPT_DIR/set-status.sh" "$TICKET" needs-human || true
else
  echo "strike-ticket: #$TICKET strike $NEW_COUNT/$MAX_STRIKES" >&2

  gh issue comment "$TICKET" --body "[manager:strike] strike $NEW_COUNT/$MAX_STRIKES at $(date -u +%Y-%m-%dT%H:%M:%SZ).

Reason: $REASON

Manager will skip this ticket for the rest of this drain and re-attempt at the next cron tick. Threshold is $MAX_STRIKES consecutive strikes -- after that, the ticket gets parked at \`needs-human\` so other tickets can drain." >/dev/null 2>&1 || \
    echo "  (warning: failed to comment on #$TICKET)" >&2

  gh issue edit "$TICKET" --add-label "pipeline:struck-$NEW_COUNT" >/dev/null 2>&1 || true
fi

exit 0
