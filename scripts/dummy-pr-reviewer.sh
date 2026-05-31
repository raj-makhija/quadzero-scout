#!/usr/bin/env bash
# dummy-pr-reviewer.sh -- pr-reviewer agent script.
#
# Despite the "dummy-" prefix (kept for stable manager.sh references),
# this dispatches to a real Claude Code reviewer when
# PIPELINE_PR_REVIEWER_AGENT=claude is set. Otherwise it falls back to
# the original dummy that auto-approves and delegates to merge-pr.sh --
# useful for plumbing tests without burning tokens.
#
# Real reviewer outcomes:
#   APPROVE         -> comment the review on the issue, then invoke
#                     merge-pr.sh (which still owns staleness logic and
#                     can re-route to rework on overlap).
#   REQUEST_CHANGES -> comment the review on the issue + the PR, close
#                     the PR with --delete-branch, clear PR Number and
#                     Base SHA, set Pipeline Status=rework. Manager will
#                     increment Attempt and dispatch the developer agent
#                     in rework mode (3-strike rule applies).
#
# Model tiering: PIPELINE_PR_REVIEWER_MODEL (default: claude-haiku-4-5-20251001).
# The tester has already validated correctness; the reviewer checks scope,
# conventions, security, and cost flags -- a classification-shaped task
# Haiku handles well at a fraction of the cost. Override to Sonnet on
# unusually large/complex diffs if needed.
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

pl_load_config

PR="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "PR Number")"
if [[ -z "$PR" ]]; then
  echo "error: ticket #$TICKET has no PR Number; cannot review" >&2
  exit 1
fi

USE_REAL_AGENT="false"
if [[ "${PIPELINE_PR_REVIEWER_AGENT:-dummy}" == "claude" ]]; then
  USE_REAL_AGENT="true"
fi

# ---------------------------------------------------------------- dummy path
if [[ "$USE_REAL_AGENT" != "true" ]]; then
  gh issue comment "$TICKET" --body "[dummy pr-reviewer] Review approved (conventions, style, security -- all dummy-checked). Invoking merge-pr.sh (handles staleness + merge-or-rework)." >&2
  "$SCRIPT_DIR/merge-pr.sh" "$TICKET" "$PR"
  exit 0
fi

# ---------------------------------------------------------- real-claude path
BASE_SHA="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Base SHA")"
HEAD_BRANCH="$(gh pr view "$PR" --json headRefName -q .headRefName)"

PROMPT="$(cat <<PROMPT
You are the pr-reviewer agent in an automated CI/CD pipeline. Your job
is to review pull request #${PR}, which addresses issue #${TICKET}.

CONTEXT
- Repo working directory: \$(pwd) -- the repository root.
- CLAUDE.md is auto-loaded by claude. Apply its standards.
- Branch under review: \`${HEAD_BRANCH}\`
- Base SHA: ${BASE_SHA} (the develop tip the branch was created from).

MUST-DO STEPS
1. Read the ticket: \`gh issue view ${TICKET} --comments\`. Understand
   what was requested and any prior agent context (tester verdict,
   developer notes, prior reviewer feedback if this is a rework).
2. Read the PR: \`gh pr view ${PR}\` for description, then
   \`gh pr diff ${PR}\` for the actual change.
3. Apply CLAUDE.md's coding principles (Think Before Coding, Simplicity
   First, Surgical Changes, Goal-Driven Execution). Check for:
   - Scope: does the diff match the ticket's intent? Flag drive-by edits
     to unrelated files.
   - Conventions: conventional commit style; NO "Co-Authored-By" lines
     (CLAUDE.md requires agents to strip them); follows existing patterns
     in touched files.
   - Quality: obvious bugs, unsafe assumptions, missing error handling,
     unhandled edge cases.
   - Cost: per CLAUDE.md "Cloud Cost Impact Assessment" + "LLM Cost
     Impact Assessment" -- does this introduce/change AWS resources or
     LLM call sites without a cost note? The developer agent is
     supposed to escalate to cost-review-pending in that case; flag if
     they slipped one through.
   - Security: leaked secrets, hardcoded credentials, obviously unsafe
     paths or shell construction.

DO NOT
- Modify, push, or merge anything. You are READ-ONLY.
- Run tests (the tester agent already validated this attempt).
- Use \`gh pr review --approve\` or \`--request-changes\`. The pipeline
  records the verdict via project fields, not GitHub's review state.

OUTPUT FORMAT (REQUIRED)
End your response with EXACTLY ONE of these single-line verdict lines,
on its own line, with no markdown formatting:
  VERDICT: APPROVE
  VERDICT: REQUEST_CHANGES

Before the verdict line, write a brief (3-8 sentence) review summarising
what you checked and why you decided as you did. If REQUEST_CHANGES, the
summary MUST clearly state what needs to change so the developer agent
can address it on the next rework attempt.
PROMPT
)"

PIPELINE_AGENT_MODEL="${PIPELINE_PR_REVIEWER_MODEL:-claude-haiku-4-5-20251001}"
export PIPELINE_AGENT_MODEL

printf '%s\n' "$TICKET" > "${PIPELINE_INVOCATION_SENTINEL:-/tmp/pipeline-last-invoked-ticket}"
echo "==> invoking real pr-reviewer agent (claude, model=$PIPELINE_AGENT_MODEL) for #$TICKET PR #$PR" >&2

RESPONSE_FILE="$(mktemp -t pr-reviewer.XXXXXX)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

# _agent-claude.sh streams its full response to stderr live, then prints
# the same response on stdout for the caller to capture.
echo "$PROMPT" | "$SCRIPT_DIR/_agent-claude.sh" - > "$RESPONSE_FILE"

# Pull the LAST `VERDICT: ...` line in case claude mentions the format
# verbatim earlier in its summary. Tolerate leading/trailing whitespace
# and accidental markdown emphasis around the line.
VERDICT_LINE="$(grep -E '^[[:space:]]*\**[[:space:]]*VERDICT:[[:space:]]*(APPROVE|REQUEST_CHANGES)' "$RESPONSE_FILE" | tail -n1 || true)"
VERDICT=""
case "$VERDICT_LINE" in
  *REQUEST_CHANGES*) VERDICT="REQUEST_CHANGES" ;;
  *APPROVE*)         VERDICT="APPROVE" ;;
esac

REVIEW_BODY="$(cat "$RESPONSE_FILE")"

if [[ -z "$VERDICT" ]]; then
  echo "error: pr-reviewer did not emit a recognized VERDICT line" >&2
  echo "----- last 40 lines of agent output -----" >&2
  tail -n40 "$RESPONSE_FILE" >&2
  echo "------------------------------------------" >&2
  exit 1
fi

case "$VERDICT" in
  APPROVE)
    gh issue comment "$TICKET" --body "[pr-reviewer] APPROVE on PR #$PR.

$REVIEW_BODY

Invoking merge-pr.sh (handles staleness + merge-or-rework)." >&2
    "$SCRIPT_DIR/merge-pr.sh" "$TICKET" "$PR"
    ;;

  REQUEST_CHANGES)
    gh pr comment "$PR" --body "Reviewer requested changes:

$REVIEW_BODY

Closing this PR; the pipeline will route ticket #$TICKET to rework so the developer agent can address the feedback on the next attempt." >&2
    gh issue comment "$TICKET" --body "[pr-reviewer] REQUEST_CHANGES on PR #$PR.

$REVIEW_BODY

Closing PR and routing to rework." >&2

    # Same cleanup pattern as merge-pr.sh's stale path.
    CUR="$(git branch --show-current)"
    if [[ "$CUR" == "$HEAD_BRANCH" ]]; then
      git checkout develop >&2
    fi
    gh pr close "$PR" --delete-branch >&2
    git branch -D "$HEAD_BRANCH" 2>/dev/null >&2 || true

    "$SCRIPT_DIR/set-field.sh" "$TICKET" "PR Number" ""
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Base SHA" ""
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" rework
    echo "pr-reviewer -> rework on #$TICKET (PR #$PR closed)" >&2
    ;;
esac
