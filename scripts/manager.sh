#!/usr/bin/env bash
# manager.sh — advance one ticket by one state transition.
#
# The manager is intentionally dumb: a case statement over Pipeline Status
# that dispatches to the appropriate (dummy or real) agent. Intended to
# be called by a scheduler (Phase 5) on a fixed interval.
#
# Usage:
#   scripts/manager.sh [<ticket>]
#
# If <ticket> is omitted, picks the first actionable ticket from
# next-ticket.sh. If no actionable ticket, exits 0 with no output.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

MAX_ATTEMPTS="${PIPELINE_MAX_ATTEMPTS:-3}"

if [[ $# -ge 1 ]]; then
  TICKET="$1"
else
  TICKET="$("$SCRIPT_DIR/next-ticket.sh" | head -n1 | awk '{print $1}')"
  if [[ -z "$TICKET" ]]; then
    echo "manager: no actionable tickets" >&2
    exit 0
  fi
fi

STATUS="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Pipeline Status" || true)"
AGENT="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Agent" || true)"
echo "manager: #$TICKET status='${STATUS:-<unset>}' agent='${AGENT:-<unset>}'" >&2

case "${STATUS:-new}" in
  ""|new)
    # First touch: prime the ticket for the tester.
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" tester
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Attempt" 1
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" tests-pending
    gh issue comment "$TICKET" --body "[manager] Primed. Routing to tester." >&2
    echo "manager: #$TICKET primed → tests-pending" >&2
    ;;

  tests-pending)
    "$SCRIPT_DIR/dummy-tester.sh" "$TICKET" write
    ;;

  dev-pending)
    "$SCRIPT_DIR/dummy-developer.sh" "$TICKET" implement
    ;;

  validation-pending)
    "$SCRIPT_DIR/dummy-tester.sh" "$TICKET" validate
    ;;

  pr-pending)
    "$SCRIPT_DIR/dummy-developer.sh" "$TICKET" open_pr
    ;;

  pr-review-pending)
    "$SCRIPT_DIR/dummy-pr-reviewer.sh" "$TICKET"
    ;;

  rework)
    # merge-pr.sh cleared Base SHA + PR Number; we increment Attempt and
    # hand to developer's rework mode. 3-strike → needs-human escalation.
    ATTEMPT="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Attempt" || echo 0)"
    : "${ATTEMPT:=0}"
    ATTEMPT=$((ATTEMPT + 1))
    if [[ "$ATTEMPT" -gt "$MAX_ATTEMPTS" ]]; then
      gh issue comment "$TICKET" --body "[manager] Max rework attempts ($MAX_ATTEMPTS) exceeded. Escalating to needs-human." >&2
      "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" needs-human
      echo "manager: #$TICKET escalated to needs-human (attempts=$ATTEMPT > $MAX_ATTEMPTS)" >&2
      exit 0
    fi
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Attempt" "$ATTEMPT"
    "$SCRIPT_DIR/dummy-developer.sh" "$TICKET" rework
    ;;

  merged-to-develop|needs-human|cost-review-pending)
    echo "manager: #$TICKET in terminal/blocked state '$STATUS'; no action" >&2
    ;;

  *)
    echo "error: #$TICKET has unknown Pipeline Status '$STATUS'" >&2
    exit 1
    ;;
esac
