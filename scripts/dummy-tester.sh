#!/usr/bin/env bash
# dummy-tester.sh -- tester agent script.
#
# Despite the "dummy-" prefix (kept for stable manager.sh references),
# this dispatches to a real Claude tester when PIPELINE_TESTER_AGENT=claude.
# Otherwise it falls back to the original dummy auto-pass that just
# advances state -- useful for plumbing tests without burning tokens.
#
# Modes:
#   write    -- tests-pending -> dev-pending. Real claude posts a
#               behavior-focused test plan as an issue comment under the
#               [tester:test-plan] header; dummy posts a canned line.
#               No code is committed in either path (no branch yet).
#   validate -- validation-pending -> pr-pending OR rework. Real claude
#               checks out the developer's branch, reads the diff vs the
#               test plan, and emits VERDICT: PASS or VERDICT: FAIL.
#               PASS -> pr-pending. FAIL -> deletes the failed attempt
#               branch, clears Base SHA, sets Pipeline Status=rework so
#               manager.sh increments Attempt and routes to developer
#               rework mode (3-strike rule applies).
#
# Usage:
#   scripts/dummy-tester.sh <ticket> <mode>

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

USE_REAL_AGENT="false"
if [[ "${PIPELINE_TESTER_AGENT:-dummy}" == "claude" ]]; then
  USE_REAL_AGENT="true"
fi

case "$MODE" in
  # ----------------------------------------------------------------- write
  write)
    if [[ "$USE_REAL_AGENT" != "true" ]]; then
      gh issue comment "$TICKET" --body "[dummy tester] Happy-path + edge-case tests written. Handing to developer." >&2
    else
      PROMPT="$(cat <<PROMPT
You are the tester agent in an automated CI/CD pipeline. Issue #${TICKET}
just landed. Before the developer agent writes any code, your job is to
define the test plan that will be used to validate the implementation later.

CONTEXT
- Repo root: \$(pwd) -- you are on develop HEAD; no branch exists yet.
- CLAUDE.md is auto-loaded.

MUST-DO STEPS
1. Read the ticket: \`gh issue view ${TICKET} --comments\`. Note the
   acceptance criteria and any constraints.
2. Inspect any obviously-touched code or docs to understand the surface area.
3. Post a single comment to the issue with \`gh issue comment ${TICKET}\`
   containing a structured behavior-focused test plan. Use this header
   exactly so the later validate-mode pass can find it:

   [tester:test-plan]
   Acceptance items:
   - <criterion 1> -- how it would be verified
   - <criterion 2> -- how it would be verified
   ...
   Edge cases:
   - <edge case 1>
   - <edge case 2>

   Keep the items behavior-level (what the change should do or not do),
   not implementation-level (do not prescribe variable names or file paths).

DO NOT
- Modify, commit, or push any files.
- Run tests.
- Create branches.
- Open PRs.

End your response with the literal line:
TEST_PLAN_POSTED
PROMPT
)"
      echo "==> invoking real tester agent (claude) for #$TICKET write" >&2
      echo "$PROMPT" | "$SCRIPT_DIR/_agent-claude.sh" - >/dev/null
    fi
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" developer
    "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" dev-pending
    echo "tester -> wrote test plan; #$TICKET now dev-pending" >&2
    ;;

  # -------------------------------------------------------------- validate
  validate)
    if [[ "$USE_REAL_AGENT" != "true" ]]; then
      gh issue comment "$TICKET" --body "[dummy tester] Coverage validated against implementation. No edge-case gaps. Handing back to developer for PR." >&2
      "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" developer
      "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" pr-pending
      echo "tester -> validated (dummy); #$TICKET now pr-pending" >&2
      exit 0
    fi

    # Real-claude validate path.
    ATTEMPT="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Attempt")"
    BASE_SHA="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "Base SHA")"
    TYPE="$(pl_type_from_labels "$TICKET")"
    BRANCH="$TYPE/ticket-$TICKET-attempt-$ATTEMPT"

    # Each Actions run starts checked out on develop. Make sure the dev
    # branch is fetched and checked out so claude sees the actual diff.
    git fetch origin "$BRANCH" --quiet || true
    git checkout "$BRANCH" >&2

    PROMPT="$(cat <<PROMPT
You are the tester agent in an automated CI/CD pipeline. Issue
#${TICKET} has been implemented by the developer on branch
\`${BRANCH}\`. Validate whether the diff achieves the acceptance
criteria from the earlier [tester:test-plan] comment on the issue.

CONTEXT
- Repo root: \$(pwd) -- already checked out at branch \`${BRANCH}\`.
- Base SHA (develop tip the branch was created from): ${BASE_SHA}.
- CLAUDE.md is auto-loaded.

MUST-DO STEPS
1. Re-read the ticket and locate the prior test plan:
   \`gh issue view ${TICKET} --comments\`. Find the
   \`[tester:test-plan]\` comment. If it is missing for any reason,
   derive an equivalent plan from the ticket spec and proceed.
2. Inspect the developer's diff:
   \`git diff ${BASE_SHA}..HEAD\` and any touched files in their
   current state.
3. For each acceptance item from the plan, decide whether the
   implementation appears to satisfy it. Note any edge cases the
   developer missed.
4. Post a comment to issue #${TICKET} with per-item verdicts and
   reasoning. Use the header \`[tester:validation-report]\` so the
   reviewer can find it.

DO NOT
- Modify, commit, or push any files.
- Run any test suite (this is a static review).
- Open or modify a PR.

OUTPUT FORMAT (REQUIRED)
End your response with EXACTLY ONE of these single-line verdict lines,
on its own line, with no markdown formatting:
  VERDICT: PASS
  VERDICT: FAIL

Before the verdict line, write a brief per-item summary. If FAIL, the
summary MUST clearly state which acceptance items are unmet so the
developer can address them on the next rework attempt.
PROMPT
)"

    echo "==> invoking real tester agent (claude) for #$TICKET validate" >&2

    RESPONSE_FILE="$(mktemp -t tester.XXXXXX)"
    trap 'rm -f "$RESPONSE_FILE"' EXIT
    echo "$PROMPT" | "$SCRIPT_DIR/_agent-claude.sh" - > "$RESPONSE_FILE"

    VERDICT_LINE="$(grep -E '^[[:space:]]*\**[[:space:]]*VERDICT:[[:space:]]*(PASS|FAIL)' "$RESPONSE_FILE" | tail -n1 || true)"
    VERDICT=""
    case "$VERDICT_LINE" in
      *FAIL*) VERDICT="FAIL" ;;
      *PASS*) VERDICT="PASS" ;;
    esac

    REVIEW_BODY="$(cat "$RESPONSE_FILE")"

    if [[ -z "$VERDICT" ]]; then
      echo "error: tester did not emit a recognized VERDICT line" >&2
      echo "----- last 40 lines of agent output -----" >&2
      tail -n40 "$RESPONSE_FILE" >&2
      echo "------------------------------------------" >&2
      exit 1
    fi

    case "$VERDICT" in
      PASS)
        gh issue comment "$TICKET" --body "[tester] PASS on \`$BRANCH\`.

$REVIEW_BODY

Handing back to developer to open the PR." >&2
        "$SCRIPT_DIR/set-field.sh" "$TICKET" "Agent" developer
        "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" pr-pending
        echo "tester -> PASS; #$TICKET now pr-pending" >&2
        ;;
      FAIL)
        gh issue comment "$TICKET" --body "[tester] FAIL on \`$BRANCH\`.

$REVIEW_BODY

Routing to rework. Developer will branch fresh from develop and address the unmet criteria on the next attempt." >&2
        # Drop the failed attempt branch so the next rework starts clean.
        CUR="$(git branch --show-current)"
        if [[ "$CUR" == "$BRANCH" ]]; then
          git checkout develop >&2
        fi
        git push origin --delete "$BRANCH" >&2 || true
        git branch -D "$BRANCH" 2>/dev/null >&2 || true
        # Clear Base SHA so manager.sh's rework path treats next attempt as fresh.
        "$SCRIPT_DIR/set-field.sh" "$TICKET" "Base SHA" ""
        "$SCRIPT_DIR/set-field.sh" "$TICKET" "Pipeline Status" rework
        echo "tester -> FAIL; #$TICKET routed to rework, $BRANCH dropped" >&2
        ;;
    esac
    ;;

  *)
    echo "error: unknown mode '$MODE' (expected: write | validate)" >&2
    exit 1
    ;;
esac
