#!/usr/bin/env bash
# dummy-pr-reviewer.sh — simulate the pr-reviewer agent for pipeline validation.
#
# Real reviewer agent would check conventions, style, security, deps, etc.
# This dummy just approves and delegates to merge-pr.sh, which owns the
# real logic (staleness check, squash-merge, rework routing on overlap).
#
# Usage:
#   scripts/dummy-pr-reviewer.sh <ticket>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <ticket>" >&2
  exit 2
fi

TICKET="$1"

PR="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "PR Number")"
if [[ -z "$PR" ]]; then
  echo "error: ticket #$TICKET has no PR Number; cannot review" >&2
  exit 1
fi

gh issue comment "$TICKET" --body "[dummy pr-reviewer] Review approved (conventions, style, security — all dummy-checked). Invoking merge-pr.sh (handles staleness + merge-or-rework)." >&2

# merge-pr.sh drives the terminal outcome — either merged-to-develop or rework.
"$SCRIPT_DIR/merge-pr.sh" "$TICKET" "$PR"
