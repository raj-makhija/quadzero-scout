#!/usr/bin/env bash
# clear-strikes.sh -- remove pipeline:struck-* labels from a ticket.
#
# Called after every successful manager.sh dispatch in the drain
# loop, so that a ticket which had transient failures resets its
# strike counter on the next successful state advancement. Also
# called by the pipeline:retry route.
#
# Idempotent and cheap: removing a label that doesn't exist is a
# no-op (the API call returns an error which we swallow). For
# tickets that have never struck, this is two harmless 4xx calls.
#
# Usage: scripts/clear-strikes.sh <ticket>
#
# Always exits 0.

set -uo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <ticket>" >&2
  exit 0
fi

TICKET="$1"

command -v gh >/dev/null || { echo "clear-strikes: gh not found; skipping" >&2; exit 0; }

# Cheap optimization: skip the remove calls if the ticket has no
# pipeline:struck-* labels in the first place. Single API call.
HAS_STRIKE="$(gh issue view "$TICKET" --json labels \
  -q '.labels[] | select(.name | startswith("pipeline:struck")) | .name' \
  2>/dev/null | head -1)"

if [[ -z "$HAS_STRIKE" ]]; then
  exit 0
fi

echo "clear-strikes: #$TICKET clearing $HAS_STRIKE (and any siblings)" >&2

for label in pipeline:struck-1 pipeline:struck-2 pipeline:struck-out; do
  gh issue edit "$TICKET" --remove-label "$label" >/dev/null 2>&1 || true
done

exit 0
