#!/usr/bin/env bash
# dummy-developer.sh — simulate the developer agent for pipeline validation.
#
# This dummy does real git work (branches, commits, pushes, PRs) so the
# Phase 2 plumbing gets exercised. The "code" it writes is a marker file
# under dummy-work/ticket-<N>.md — nothing meaningful, just a real-enough
# change to make a real PR.
#
# Usage:
#   scripts/dummy-developer.sh <ticket> <mode>
# Modes:
#   implement — dev-pending → validation-pending
#                 create-branch, write dummy file, commit, push
#   open_pr   — pr-pending → pr-review-pending
#                 call open-pr.sh against the existing attempt branch
#   rework    — rework → validation-pending
#                 fresh branch (new attempt number), write, commit, push

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

pl_load_config

TITLE="$(gh issue view "$TICKET" --json title -q .title)"

# Helper: make the dummy implementation file + real commit + push.
_dummy_commit_and_push() {
  local ticket="$1" attempt="$2" note="$3"
  mkdir -p dummy-work
  local file="dummy-work/ticket-$ticket.md"
  cat > "$file" <<DUMMY
# Dummy implementation for #$ticket

Attempt: $attempt
Note: $note
Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)

This file is written by the dummy developer agent to exercise the
pipeline end-to-end without a real Claude Code invocation. Safe to
delete in bulk after pipeline validation is complete.
DUMMY
  git add "$file"
  git commit -m "chore: dummy developer work (#$ticket attempt $attempt)" >&2
  git push >&2
}

case "$MODE" in
  implement)
    ATTEMPT="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Attempt")"
    SLUG="attempt-$ATTEMPT"

    BRANCH="$("$SCRIPT_DIR/create-branch.sh" "$TICKET" "$SLUG")"

    _dummy_commit_and_push "$TICKET" "$ATTEMPT" "initial implementation"

    gh issue comment "$TICKET" --body "[dummy developer] Implementation pushed to \`$BRANCH\` (attempt $ATTEMPT). Handing to tester for validation." >&2
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" tester
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" validation-pending
    echo "developer → implemented; #$TICKET now validation-pending on $BRANCH" >&2
    ;;

  open_pr)
    ATTEMPT="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Attempt")"
    SLUG="attempt-$ATTEMPT"
    TYPE="$(pl_type_from_labels "$TICKET")"
    BRANCH="$TYPE/ticket-$TICKET-$SLUG"
    PR_TITLE="$TYPE: $TITLE (#$TICKET)"

    PR="$("$SCRIPT_DIR/open-pr.sh" "$TICKET" "$BRANCH" "$PR_TITLE")"

    gh issue comment "$TICKET" --body "[dummy developer] PR #$PR opened. Handing to pr-reviewer." >&2
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" pr-reviewer
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" pr-review-pending
    echo "developer → opened PR #$PR; #$TICKET now pr-review-pending" >&2
    ;;

  rework)
    # The manager already bumped Attempt before calling us; read it back.
    ATTEMPT="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Attempt")"
    SLUG="attempt-$ATTEMPT"

    # Fresh branch from current develop HEAD (merge-pr stale path cleared
    # Base SHA + PR Number; create-branch writes a new Base SHA).
    BRANCH="$("$SCRIPT_DIR/create-branch.sh" "$TICKET" "$SLUG")"

    _dummy_commit_and_push "$TICKET" "$ATTEMPT" "rework after stale merge"

    gh issue comment "$TICKET" --body "[dummy developer] Rework pushed to \`$BRANCH\` (attempt $ATTEMPT). Handing to tester for validation." >&2
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" tester
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" validation-pending
    echo "developer → reworked; #$TICKET now validation-pending on $BRANCH" >&2
    ;;

  *)
    echo "error: unknown mode '$MODE' (expected: implement | open_pr | rework)" >&2
    exit 1
    ;;
esac
