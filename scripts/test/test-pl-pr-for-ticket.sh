#!/usr/bin/env bash
# test-pl-pr-for-ticket.sh -- unit tests for _pl_pick_best_pr and
# pl_pr_for_ticket in _pipeline-lib.sh.
#
# Covers #318: the broken select(.state == "OPEN") filter on
# closedByPullRequestsReferences is replaced with per-PR gh pr view calls,
# and the resolved PR is written back to the "PR Number" field.
#
# Pure-function tests use _pl_pick_best_pr directly.
# Integration tests stub get-field.sh / set-field.sh via _PL_LIBDIR and
# stub gh via PATH prepending.
#
# Usage: bash scripts/test/test-pl-pr-for-ticket.sh
# Exit 0 if all tests pass, non-zero if any fail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../_pipeline-lib.sh
source "$SCRIPTS_DIR/_pipeline-lib.sh"

PASS=0
FAIL=0

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1))
    echo "ok   - $name"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL - $name"
    echo "       expected: $(printf '%q' "$expected")"
    echo "       actual:   $(printf '%q' "$actual")"
  fi
}

# ===== Pure function tests: _pl_pick_best_pr ==================================
# Input format: one tab-separated line per PR: number<TAB>state<TAB>headRefName<TAB>createdAt

echo "--- _pl_pick_best_pr ---"

echo "Test: cowork branch beats attempt branch (regardless of creation order)"
result="$(printf '%s\n' \
  $'309\tOPEN\tbug/ticket-308-attempt-1\t2024-01-01T12:00:00Z' \
  $'312\tOPEN\tbug/ticket-308-cowork\t2024-01-01T09:00:00Z' \
  | _pl_pick_best_pr)"
assert_eq "cowork (312) beats newer attempt (309)" "312" "$result"

echo "Test: attempt branch beats other branch"
result="$(printf '%s\n' \
  $'100\tOPEN\tfeature/other\t2024-01-01T12:00:00Z' \
  $'309\tOPEN\tbug/ticket-308-attempt-1\t2024-01-01T09:00:00Z' \
  | _pl_pick_best_pr)"
assert_eq "attempt (309) beats newer other (100)" "309" "$result"

echo "Test: among attempts with same rank, newer wins"
result="$(printf '%s\n' \
  $'309\tOPEN\tbug/ticket-308-attempt-1\t2024-01-01T09:00:00Z' \
  $'311\tOPEN\tbug/ticket-308-attempt-2\t2024-01-01T11:00:00Z' \
  | _pl_pick_best_pr)"
assert_eq "newer attempt (311) wins" "311" "$result"

echo "Test: among other branches with same rank, newer wins"
result="$(printf '%s\n' \
  $'100\tOPEN\tfeature/older-work\t2024-01-01T08:00:00Z' \
  $'101\tOPEN\tfeature/newer-work\t2024-01-01T12:00:00Z' \
  | _pl_pick_best_pr)"
assert_eq "newer other PR (101) wins" "101" "$result"

echo "Test: single OPEN PR is returned"
result="$(printf '%s\n' \
  $'312\tOPEN\tbug/ticket-308-cowork\t2024-01-01T09:00:00Z' \
  | _pl_pick_best_pr)"
assert_eq "single open PR returns 312" "312" "$result"

echo "Test: CLOSED PR is skipped"
result="$(printf '%s\n' \
  $'309\tCLOSED\tbug/ticket-308-attempt-1\t2024-01-01T10:00:00Z' \
  | _pl_pick_best_pr)"
assert_eq "CLOSED PR returns empty" "" "$result"

echo "Test: MERGED PR is skipped"
result="$(printf '%s\n' \
  $'309\tMERGED\tbug/ticket-308-attempt-1\t2024-01-01T10:00:00Z' \
  | _pl_pick_best_pr)"
assert_eq "MERGED PR returns empty" "" "$result"

echo "Test: null-state entry (GitHub API quirk) is skipped"
result="$(printf '%s\n' \
  $'309\tnull\tbug/ticket-308-attempt-1\t2024-01-01T10:00:00Z' \
  | _pl_pick_best_pr)"
assert_eq "null-state PR returns empty" "" "$result"

echo "Test: only OPEN PR wins among mixed states"
result="$(printf '%s\n' \
  $'309\tCLOSED\tbug/ticket-308-attempt-1\t2024-01-01T10:00:00Z' \
  $'312\tOPEN\tbug/ticket-308-cowork\t2024-01-01T09:00:00Z' \
  $'315\tMERGED\tbug/ticket-308-attempt-2\t2024-01-01T11:00:00Z' \
  | _pl_pick_best_pr)"
assert_eq "only OPEN PR (312) returned from mixed set" "312" "$result"

echo "Test: empty input returns empty"
result="$(printf '' | _pl_pick_best_pr)"
assert_eq "empty input returns empty" "" "$result"

# ===== Integration tests: pl_pr_for_ticket (with stubs) =======================

echo ""
echo "--- pl_pr_for_ticket (integration with stubs) ---"

# Setup: temp stub directory for get-field.sh and set-field.sh
STUB_DIR="$(mktemp -d)"
GH_DIR="$(mktemp -d)"
SET_FIELD_LOG="$(mktemp)"
GH_LOG="$(mktemp)"
trap 'rm -rf "$STUB_DIR" "$GH_DIR"; rm -f "$SET_FIELD_LOG" "$GH_LOG"' EXIT

# Stub get-field.sh: outputs $STUB_GET_FIELD_RESULT (empty by default).
# $STUB_GET_FIELD_FAIL=1 simulates a dead PL_PROJECT_TOKEN (401 -> non-zero).
cat > "$STUB_DIR/get-field.sh" << 'STUBEOF'
#!/usr/bin/env bash
if [[ "${STUB_GET_FIELD_FAIL:-0}" == "1" ]]; then
  echo "stub get-field.sh: gh: Bad credentials (HTTP 401)" >&2
  exit 1
fi
printf '%s' "${STUB_GET_FIELD_RESULT:-}"
STUBEOF
chmod +x "$STUB_DIR/get-field.sh"

# Stub set-field.sh: logs call args to $SET_FIELD_LOG; respects $STUB_SET_FIELD_FAIL
cat > "$STUB_DIR/set-field.sh" << 'STUBEOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SET_FIELD_LOG"
[[ "${STUB_SET_FIELD_FAIL:-0}" == "1" ]] && exit 1 || exit 0
STUBEOF
chmod +x "$STUB_DIR/set-field.sh"

# Stub gh: dispatches on first two args
#   gh issue view <N> --json closedByPullRequestsReferences ...
#     -> outputs $STUB_ISSUE_PR_NUMBERS (one number per line, as if jq-filtered)
#   gh pr view <N> --json ...
#     -> outputs $STUB_PR_<N>_JSON
#   gh *
#     -> records the call in $GH_LOG; exits 0
# Each logged line carries the GH_TOKEN the call actually ran under, so tests
# can assert which credential a given lookup used (#567).
# Failure injection: $STUB_ISSUE_VIEW_FAIL=1 and $STUB_PR_<N>_FAIL=1.
cat > "$GH_DIR/gh" << 'STUBEOF'
#!/usr/bin/env bash
printf '%s [GH_TOKEN=%s]\n' "$*" "${GH_TOKEN:-unset}" >> "$GH_LOG"
if [[ "$1" == "pr" && "$2" == "view" ]]; then
  num="$3"
  failvar="STUB_PR_${num}_FAIL"
  if [[ "${!failvar:-0}" == "1" ]]; then
    echo "stub gh: could not resolve PR $num" >&2
    exit 1
  fi
  varname="STUB_PR_${num}_JSON"
  printf '%s\n' "${!varname:-}"
elif [[ "$1" == "issue" && "$2" == "view" ]]; then
  if [[ "${STUB_ISSUE_VIEW_FAIL:-0}" == "1" ]]; then
    echo "stub gh: Bad credentials (HTTP 401)" >&2
    exit 1
  fi
  printf '%s\n' "${STUB_ISSUE_PR_NUMBERS:-}"
fi
STUBEOF
chmod +x "$GH_DIR/gh"

export PATH="$GH_DIR:$PATH"
export _PL_LIBDIR="$STUB_DIR"
export SET_FIELD_LOG
export GH_LOG

# Helper: reset between tests
reset_stubs() {
  > "$SET_FIELD_LOG"
  > "$GH_LOG"
  unset STUB_GET_FIELD_RESULT STUB_ISSUE_PR_NUMBERS STUB_SET_FIELD_FAIL \
    STUB_PR_309_JSON STUB_PR_311_JSON STUB_PR_312_JSON STUB_PR_315_JSON \
    STUB_GET_FIELD_FAIL STUB_ISSUE_VIEW_FAIL STUB_PR_309_FAIL STUB_PR_312_FAIL \
    2>/dev/null || true
}

# Helper: count times set-field was invoked for "PR Number"
set_field_pr_calls() {
  grep -c "PR Number" "$SET_FIELD_LOG" 2>/dev/null || true
}

# Test: field already populated -> returned immediately, no gh issue view
echo "Test: 'PR Number' field set -> returns it, no fallback lookup"
reset_stubs
export STUB_GET_FIELD_RESULT="312"
result="$(pl_pr_for_ticket 308)"
assert_eq "field set: returns 312" "312" "$result"
issue_view_calls="$(grep -c "issue view" "$GH_LOG" 2>/dev/null || true)"
assert_eq "field set: gh issue view not called" "0" "$issue_view_calls"

# Test: field empty, single open PR -> returns it and writes back
echo "Test: field empty, single open PR -> resolved and persisted"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_PR_NUMBERS="312"
export STUB_PR_312_JSON='{"number":312,"state":"OPEN","headRefName":"bug/ticket-308-cowork","createdAt":"2024-01-01T09:00:00Z"}'
result="$(pl_pr_for_ticket 308)"
assert_eq "empty field, single open PR: returns 312" "312" "$result"
assert_eq "set-field called with resolved PR" "1" "$(set_field_pr_calls)"
written="$(cat "$SET_FIELD_LOG")"
assert_eq "set-field called with correct args" "308 PR Number 312" "$written"

# Test: field empty, cowork beats attempt-K
echo "Test: field empty, cowork PR beats attempt PR"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_PR_NUMBERS="309
312"
export STUB_PR_309_JSON='{"number":309,"state":"OPEN","headRefName":"bug/ticket-308-attempt-1","createdAt":"2024-01-01T10:00:00Z"}'
export STUB_PR_312_JSON='{"number":312,"state":"OPEN","headRefName":"bug/ticket-308-cowork","createdAt":"2024-01-01T09:00:00Z"}'
result="$(pl_pr_for_ticket 308)"
assert_eq "cowork (312) selected over attempt (309)" "312" "$result"

# Test: field empty, multiple open PRs same rank -> newest wins
echo "Test: field empty, two attempt PRs -> newest selected"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_PR_NUMBERS="309
311"
export STUB_PR_309_JSON='{"number":309,"state":"OPEN","headRefName":"bug/ticket-308-attempt-1","createdAt":"2024-01-01T09:00:00Z"}'
export STUB_PR_311_JSON='{"number":311,"state":"OPEN","headRefName":"bug/ticket-308-attempt-2","createdAt":"2024-01-01T11:00:00Z"}'
result="$(pl_pr_for_ticket 308)"
assert_eq "newer attempt (311) selected" "311" "$result"

# Test: field empty, no linked PRs -> returns empty
echo "Test: field empty, no linked PRs -> returns empty"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_PR_NUMBERS=""
result="$(pl_pr_for_ticket 308)"
assert_eq "no linked PRs: returns empty" "" "$result"
assert_eq "no linked PRs: set-field not called" "0" "$(set_field_pr_calls)"

# Test: field empty, all linked PRs are CLOSED -> returns empty
echo "Test: field empty, all linked PRs CLOSED -> returns empty"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_PR_NUMBERS="309"
export STUB_PR_309_JSON='{"number":309,"state":"CLOSED","headRefName":"bug/ticket-308-attempt-1","createdAt":"2024-01-01T10:00:00Z"}'
result="$(pl_pr_for_ticket 308)"
assert_eq "all CLOSED: returns empty" "" "$result"
assert_eq "all CLOSED: set-field not called" "0" "$(set_field_pr_calls)"

# Test: gh pr view fails for one candidate, other is valid -> still resolves
echo "Test: gh pr view fails for one candidate -> valid open PR still returned"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_PR_NUMBERS="309
312"
export STUB_PR_309_JSON=""  # simulate failure / deleted PR
export STUB_PR_312_JSON='{"number":312,"state":"OPEN","headRefName":"bug/ticket-308-cowork","createdAt":"2024-01-01T09:00:00Z"}'
result="$(pl_pr_for_ticket 308)"
assert_eq "failed gh pr view skipped; valid PR 312 returned" "312" "$result"

# Test: set-field.sh fails silently -> still returns resolved PR
echo "Test: set-field.sh failure is non-fatal"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_PR_NUMBERS="312"
export STUB_PR_312_JSON='{"number":312,"state":"OPEN","headRefName":"bug/ticket-308-cowork","createdAt":"2024-01-01T09:00:00Z"}'
export STUB_SET_FIELD_FAIL="1"
result="$(pl_pr_for_ticket 308)"
assert_eq "set-field failure non-fatal: still returns 312" "312" "$result"

# ===== Exit-status contract: no-PR vs lookup-failed (#567, #569) ==============
#
# pl_pr_for_ticket returns 0 (resolved), 1 (definitively no open PR) or
# 2 (a lookup failed, answer unknown). Callers report 1 and 2 differently --
# they point at opposite ends of the pipeline.

echo ""
echo "--- pl_pr_for_ticket exit-status contract (#567, #569) ---"

# Run pl_pr_for_ticket capturing stdout and exit status separately.
run_resolve() {
  RESOLVE_RC=0
  RESOLVE_OUT="$(pl_pr_for_ticket "$1")" || RESOLVE_RC=$?
}

# #567: the linked-PR fallback reads plain repo data, so it must run under the
# ambient App token. Pinning it to the project PAT meant one dead PAT took out
# both resolution paths -- #556 reported "no open PR" while PR #566 was open.
echo "Test: dead PL_PROJECT_TOKEN still resolves via the App-token fallback"
reset_stubs
export STUB_GET_FIELD_FAIL="1"          # board read 401s, as in the #556 outage
export STUB_ISSUE_PR_NUMBERS="312"
export STUB_PR_312_JSON='{"number":312,"state":"OPEN","headRefName":"bug/ticket-308-cowork","createdAt":"2024-01-01T09:00:00Z"}'
PL_PROJECT_TOKEN="dead-pat" GH_TOKEN="live-app-token" run_resolve 308
assert_eq "dead PAT: still resolves 312" "312" "$RESOLVE_OUT"
assert_eq "dead PAT: exit 0" "0" "$RESOLVE_RC"
issue_view_line="$(grep "issue view" "$GH_LOG" | head -n1)"
case "$issue_view_line" in
  *"GH_TOKEN=live-app-token"*)
    PASS=$((PASS + 1)); echo "ok   - fallback ran under GH_TOKEN, not PL_PROJECT_TOKEN" ;;
  *)
    FAIL=$((FAIL + 1))
    echo "FAIL - fallback token: expected GH_TOKEN=live-app-token"
    echo "       actual log line: $issue_view_line" ;;
esac

# --- exit 1: the lookups worked and there is genuinely no open PR -----------

echo "Test: no linked PRs -> exit 1"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_PR_NUMBERS=""
run_resolve 308
assert_eq "no linked PRs: empty stdout" "" "$RESOLVE_OUT"
assert_eq "no linked PRs: exit 1" "1" "$RESOLVE_RC"

echo "Test: all linked PRs CLOSED -> exit 1"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_PR_NUMBERS="309"
export STUB_PR_309_JSON='{"number":309,"state":"CLOSED","headRefName":"bug/ticket-308-attempt-1","createdAt":"2024-01-01T10:00:00Z"}'
run_resolve 308
assert_eq "all CLOSED: empty stdout" "" "$RESOLVE_OUT"
assert_eq "all CLOSED: exit 1" "1" "$RESOLVE_RC"

# --- exit 2: a lookup errored, so "no PR" is not a safe conclusion ----------

echo "Test: linked-PR lookup fails -> exit 2, not 'no PR'"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_VIEW_FAIL="1"
run_resolve 308
assert_eq "issue view failed: empty stdout" "" "$RESOLVE_OUT"
assert_eq "issue view failed: exit 2" "2" "$RESOLVE_RC"
assert_eq "issue view failed: set-field not called" "0" "$(set_field_pr_calls)"

echo "Test: the only candidate's gh pr view fails -> exit 2, not 'no PR'"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_PR_NUMBERS="312"
export STUB_PR_312_FAIL="1"
run_resolve 308
assert_eq "candidate lookup failed: empty stdout" "" "$RESOLVE_OUT"
assert_eq "candidate lookup failed: exit 2" "2" "$RESOLVE_RC"

echo "Test: one candidate errors but another is open -> exit 0"
reset_stubs
export STUB_GET_FIELD_RESULT=""
export STUB_ISSUE_PR_NUMBERS="309
312"
export STUB_PR_309_FAIL="1"
export STUB_PR_312_JSON='{"number":312,"state":"OPEN","headRefName":"bug/ticket-308-cowork","createdAt":"2024-01-01T09:00:00Z"}'
run_resolve 308
assert_eq "partial failure: resolves 312" "312" "$RESOLVE_OUT"
assert_eq "partial failure: exit 0" "0" "$RESOLVE_RC"

echo "Test: board field set -> exit 0"
reset_stubs
export STUB_GET_FIELD_RESULT="312"
run_resolve 308
assert_eq "field set: returns 312" "312" "$RESOLVE_OUT"
assert_eq "field set: exit 0" "0" "$RESOLVE_RC"

# Source guard: the fallback must not re-acquire the project PAT (#567).
echo "Test: linked-PR fallback does not pin GH_TOKEN to PL_PROJECT_TOKEN"
if grep -qF 'GH_TOKEN="${PL_PROJECT_TOKEN:-${GH_TOKEN:-}}" gh issue view' "$SCRIPTS_DIR/_pipeline-lib.sh"; then
  FAIL=$((FAIL + 1))
  echo "FAIL - linked-PR fallback still pins GH_TOKEN to PL_PROJECT_TOKEN"
else
  PASS=$((PASS + 1))
  echo "ok   - linked-PR fallback no longer pins GH_TOKEN to PL_PROJECT_TOKEN"
fi

# Test: broken select(.state == "OPEN") filter is gone from the source
echo "Test: broken jq filter is absent from _pipeline-lib.sh"
if grep -qF 'select(.state == "OPEN")' "$SCRIPTS_DIR/_pipeline-lib.sh"; then
  FAIL=$((FAIL + 1))
  echo "FAIL - broken select(.state == \"OPEN\") filter still present in _pipeline-lib.sh"
else
  PASS=$((PASS + 1))
  echo 'ok   - broken select(.state == "OPEN") filter is gone'
fi

# ============================================================

echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
