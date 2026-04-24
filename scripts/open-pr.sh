#!/usr/bin/env bash
# open-pr.sh — open a PR against develop, write PR number to the ticket.
#
# Usage:
#   scripts/open-pr.sh <ticket> <branch> <title>
#
# Creates a PR targeting develop with `Closes #<ticket>` in the body so
# the issue closes automatically when the PR merges. Writes the PR number
# to the ticket's "PR Number" field.
#
# Prints the PR number to stdout.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 3 ]]; then
  echo "usage: $0 <ticket> <branch> <title>" >&2
  exit 2
fi

TICKET="$1"
BRANCH="$2"
TITLE="$3"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }
command -v jq >/dev/null || { echo "error: jq not found" >&2; exit 127; }

pl_load_config

BODY="Automated PR for issue #${TICKET}.

Closes #${TICKET}."

echo "opening PR $BRANCH -> develop ..." >&2
PR_URL="$(gh pr create \
  --base develop \
  --head "$BRANCH" \
  --title "$TITLE" \
  --body "$BODY")"

PR_NUM="$(basename "$PR_URL")"
echo "opened PR #$PR_NUM ($PR_URL)" >&2

"$SCRIPT_DIR/set-field.sh" "$TICKET" "PR Number" "$PR_NUM"

printf '%s\n' "$PR_NUM"
