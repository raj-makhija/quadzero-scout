#!/usr/bin/env bash
# dummy-developer.sh — developer agent script.
#
# Despite the "dummy-" prefix (kept for stable manager.sh references),
# this can dispatch to a real Claude Code agent when PIPELINE_DEVELOPER_AGENT
# is set to "claude" and ANTHROPIC_API_KEY is available. Otherwise it falls
# back to the dummy implementation that writes a marker file under
# dummy-work/ — useful for testing the plumbing without burning tokens.
#
# Usage:
#   scripts/dummy-developer.sh <ticket> <mode>
# Modes:
#   implement — dev-pending → validation-pending
#   open_pr   — pr-pending → pr-review-pending  (always plumbing, no agent)
#   rework    — rework → validation-pending

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

# When false, use the dummy-marker-file behaviour. When true, invoke claude.
USE_REAL_AGENT="false"
if [[ "${PIPELINE_DEVELOPER_AGENT:-dummy}" == "claude" ]]; then
  USE_REAL_AGENT="true"
fi

# Helper: dummy commit (marker file under dummy-work/).
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
pipeline end-to-end without a real Claude Code invocation.
DUMMY
  git add "$file"
  git commit -m "chore: dummy developer work (#$ticket attempt $attempt)" >&2
  git push >&2
}

# Helper: invoke claude as the developer agent. Verifies the agent
# produced at least one commit on the branch beyond Base SHA.
_real_agent_commit_and_push() {
  local ticket="$1" attempt="$2" mode_label="$3" branch="$4"
  local base_sha
  base_sha="$("$SCRIPT_DIR/get-field.sh" "$ticket" "Base SHA")"

  local prompt
  prompt="$(cat <<PROMPT
You are the developer agent in an automated CI/CD pipeline. Your job is
to implement the change requested by issue #${ticket} on this repository.

CONTEXT
- Repo working directory: \$(pwd) — the repository root.
- You are on branch: \`${branch}\` (already created from develop HEAD;
  Base SHA is ${base_sha}).
- Attempt: ${attempt} (max 3 before manager escalates to needs-human).
- Mode: ${mode_label}  (implement = first attempt; rework = retry after stale merge)

MUST-DO STEPS
1. Read the ticket: run \`gh issue view ${ticket} --comments\` to see
   the spec, labels, and any prior agent comments. Pay attention to
   acceptance criteria and prior \`/reject\` reasons if present.
2. Read \`/docs/\` per CLAUDE.md ("Context Loading at Agent Start").
3. CLAUDE.md is already loaded. Follow its four coding principles
   (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven
   Execution). Do not touch unrelated files.
4. **Cost gate** (per CLAUDE.md "Cloud Cost Impact Assessment" + "LLM
   Cost Impact Assessment").

   First, scan the comments you read in step 1. If ANY comment starts
   with the literal text \`[cost-approved]\`, treat the cost gate as
   already approved by a human and SKIP the rest of step 4 entirely
   (proceed to step 5). The human approves cost by adding the
   \`pipeline:approve-cost\` label to the ticket, which posts that
   marker comment.

   Otherwise, if your change introduces, modifies, or removes AWS
   resources/usage patterns, OR affects LLM call sites, prompts,
   models, or call frequency:
   a. Post a cost-assessment comment on issue #${ticket}:
      \`gh issue comment ${ticket} --body "..."\`
   b. Set status:
      \`scripts/set-field.sh ${ticket} "Pipeline Status" cost-review-pending\`
   c. Exit. The human can then add the \`pipeline:approve-cost\` label
      to the ticket to approve and unblock you on the next dispatch.
5. Otherwise, implement the change. Stage with \`git add\`, commit with
   a conventional commit message that references the ticket
   (\`feat: ... (#${ticket})\`, \`fix: ... (#${ticket})\`, etc.). NO
   "Co-Authored-By" lines (CLAUDE.md says agents must strip them).
6. Push to origin/${branch}: \`git push\`.
7. Update \`/docs/\` per CLAUDE.md "Documentation" if the code change
   affects what's documented.

DO NOT
- Open a PR. The pipeline does that on the next iteration.
- Switch branches.
- Push to develop, qa, or main directly.
- Add unrelated cleanup or refactoring.

Report a one-sentence summary of what you did at the end of your output.
PROMPT
)"

  echo "==> invoking real developer agent (claude) for #$ticket attempt $attempt" >&2
  echo "$prompt" | "$SCRIPT_DIR/_agent-claude.sh" - >/dev/null

  # Post-condition: did the agent actually commit something on the branch?
  local commits_ahead
  commits_ahead="$(git rev-list --count "$base_sha..HEAD" 2>/dev/null || echo 0)"
  if [[ "$commits_ahead" -lt 1 ]]; then
    # Check if the agent moved to cost-review-pending — that's a valid no-commit exit.
    local current_status
    current_status="$("$SCRIPT_DIR/get-field.sh" "$ticket" "Pipeline Status" 2>/dev/null || true)"
    if [[ "$current_status" == "cost-review-pending" ]]; then
      echo "agent escalated to cost-review-pending without committing — that's fine" >&2
      return 0
    fi
    echo "error: developer agent produced no commits on $branch (and didn't escalate)" >&2
    return 1
  fi

  # Make sure pushed (agent should have done it; double-check).
  git push >&2 || echo "(push already complete)" >&2

  echo "==> agent produced $commits_ahead commit(s); pushed to origin/$branch" >&2
}

case "$MODE" in
  implement)
    ATTEMPT="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Attempt")"
    SLUG="attempt-$ATTEMPT"

    BRANCH="$("$SCRIPT_DIR/create-branch.sh" "$TICKET" "$SLUG")"

    if [[ "$USE_REAL_AGENT" == "true" ]]; then
      _real_agent_commit_and_push "$TICKET" "$ATTEMPT" "implement" "$BRANCH"
    else
      _dummy_commit_and_push "$TICKET" "$ATTEMPT" "initial implementation"
    fi

    # If the agent escalated to cost-review-pending, don't override.
    CUR_STATUS="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Pipeline Status" 2>/dev/null || true)"
    if [[ "$CUR_STATUS" != "cost-review-pending" ]]; then
      gh issue comment "$TICKET" --body "[developer] Implementation pushed to \`$BRANCH\` (attempt $ATTEMPT). Handing to tester for validation." >&2
      "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" tester
      "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" validation-pending
      echo "developer → implemented; #$TICKET now validation-pending on $BRANCH" >&2
    fi
    ;;

  open_pr)
    ATTEMPT="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Attempt")"
    SLUG="attempt-$ATTEMPT"
    TYPE="$(pl_type_from_labels "$TICKET")"
    BRANCH="$TYPE/ticket-$TICKET-$SLUG"
    PR_TITLE="$TYPE: $TITLE (#$TICKET)"

    PR="$("$SCRIPT_DIR/open-pr.sh" "$TICKET" "$BRANCH" "$PR_TITLE")"

    gh issue comment "$TICKET" --body "[developer] PR #$PR opened. Handing to pr-reviewer." >&2
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" pr-reviewer
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" pr-review-pending
    echo "developer → opened PR #$PR; #$TICKET now pr-review-pending" >&2
    ;;

  rework)
    ATTEMPT="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Attempt")"
    SLUG="attempt-$ATTEMPT"

    BRANCH="$("$SCRIPT_DIR/create-branch.sh" "$TICKET" "$SLUG")"

    if [[ "$USE_REAL_AGENT" == "true" ]]; then
      _real_agent_commit_and_push "$TICKET" "$ATTEMPT" "rework" "$BRANCH"
    else
      _dummy_commit_and_push "$TICKET" "$ATTEMPT" "rework after stale merge"
    fi

    CUR_STATUS="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Pipeline Status" 2>/dev/null || true)"
    if [[ "$CUR_STATUS" != "cost-review-pending" ]]; then
      gh issue comment "$TICKET" --body "[developer] Rework pushed to \`$BRANCH\` (attempt $ATTEMPT). Handing to tester for validation." >&2
      "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" tester
      "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" validation-pending
      echo "developer → reworked; #$TICKET now validation-pending on $BRANCH" >&2
    fi
    ;;

  *)
    echo "error: unknown mode '$MODE' (expected: implement | open_pr | rework)" >&2
    exit 1
    ;;
esac
