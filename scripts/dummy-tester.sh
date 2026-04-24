#!/usr/bin/env bash
# dummy-tester.sh — simulate the tester agent for pipeline validation.
#
# Real tester agent would write tests / validate coverage with Claude Code.
# This dummy just posts a comment and advances state so we can exercise
# the manager + plumbing without burning LLM tokens.
#
# Usage:
#   scripts/dummy-tester.sh <ticket> <mode>
# Modes:
#   write    — tests-pending → dev-pending (hands to developer)
#   validate — validation-pending → pr-pending (hands back to developer)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <ticket> <mode>" >&2
  exit 2
fi

TICKET="$1"
MODE="$2"

case "$MODE" in
  write)
    gh issue comment "$TICKET" --body "[dummy tester] Happy-path + edge-case tests written. Handing to developer." >&2
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" developer
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" dev-pending
    echo "tester → wrote tests; #$TICKET now dev-pending" >&2
    ;;
  validate)
    gh issue comment "$TICKET" --body "[dummy tester] Coverage validated against implementation. No edge-case gaps. Handing back to developer for PR." >&2
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" developer
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" pr-pending
    echo "tester → validated; #$TICKET now pr-pending" >&2
    ;;
  *)
    echo "error: unknown mode '$MODE' (expected: write | validate)" >&2
    exit 1
    ;;
esac
