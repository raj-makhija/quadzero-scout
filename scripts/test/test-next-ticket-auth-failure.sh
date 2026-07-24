#!/usr/bin/env bash
# test-next-ticket-auth-failure.sh -- tests that next-ticket.sh distinguishes
# an auth/API failure from a genuinely empty queue.
#
# Stubs `gh` via PATH prepending; does not make real API calls.
# Run: bash scripts/test/test-next-ticket-auth-failure.sh
# Exit 0 if all tests pass, non-zero if any fail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NEXT_TICKET="$SCRIPTS_DIR/next-ticket.sh"

PASS=0
FAIL=0

assert() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc -- expected=$expected actual=$actual"
    FAIL=$((FAIL + 1))
  fi
}

# Fake gh stub: exits with GH_STUB_EXIT, prints GH_STUB_BODY to stdout,
# and on non-zero exit writes an error phrase to stderr (matching real gh's behaviour).
GH_DIR="$(mktemp -d)"
cat > "$GH_DIR/gh" << 'GHSTUB'
#!/usr/bin/env bash
if [[ -n "${GH_STUB_BODY:-}" ]]; then
  printf '%s\n' "$GH_STUB_BODY"
fi
if [[ "${GH_STUB_EXIT:-0}" != "0" ]]; then
  echo "error: Bad credentials (HTTP 401)" >&2
fi
exit "${GH_STUB_EXIT:-0}"
GHSTUB
chmod +x "$GH_DIR/gh"
export PATH="$GH_DIR:$PATH"

trap 'rm -rf "$GH_DIR"' EXIT

# Set a fake token so PL_PROJECT_TOKEN is non-empty (except in the unset test).
export PL_PROJECT_TOKEN="fake-token-for-testing"

# Run next-ticket.sh; return combined stdout+stderr and the exit code via RC var.
run_next() {
  local rc=0
  RC_OUT="$("$NEXT_TICKET" 2>&1)" || rc=$?
  LAST_RC=$rc
}

# Valid empty-queue response (no errors, empty nodes array).
EMPTY_RESP='{"data":{"repository":{"issues":{"pageInfo":{"hasNextPage":false},"nodes":[]}}}}'

# GraphQL error response (HTTP 200 body with errors array -- auth failure).
AUTH_ERROR_RESP='{"errors":[{"message":"Bad credentials","locations":[],"path":null}]}'

# ============================================================

echo "Test 1: gh exits non-zero => next-ticket.sh exits non-zero"
export GH_STUB_EXIT=1
export GH_STUB_BODY=""
RC_OUT="" LAST_RC=0
run_next || true
assert "exit code non-zero on gh failure" "1" "$([[ $LAST_RC -ne 0 ]] && echo 1 || echo 0)"

echo "Test 2: gh exits non-zero => output contains 'error'"
assert "error phrase present on gh failure" "1" "$([[ "$RC_OUT" == *error* ]] && echo 1 || echo 0)"

echo "Test 3: gh returns errors array (HTTP 200) => next-ticket.sh exits non-zero"
export GH_STUB_EXIT=0
export GH_STUB_BODY="$AUTH_ERROR_RESP"
RC_OUT="" LAST_RC=0
run_next || true
assert "exit code non-zero on GraphQL error" "1" "$([[ $LAST_RC -ne 0 ]] && echo 1 || echo 0)"

echo "Test 4: gh returns errors array => output contains 'project query failed'"
assert "error phrase present on GraphQL error" "1" "$([[ "$RC_OUT" == *"project query failed"* ]] && echo 1 || echo 0)"

echo "Test 5: gh returns errors array => output does NOT contain 'queue drained'"
assert "no drained message on error" "1" "$([[ "$RC_OUT" == *"queue drained"* ]] && echo 0 || echo 1)"

echo "Test 6: empty errors array (errors:[]) is NOT treated as failure => exit 0"
export GH_STUB_EXIT=0
export GH_STUB_BODY="${EMPTY_RESP%\}},\"errors\":[]}"
# Build a response that has data AND an empty errors array.
export GH_STUB_BODY='{"data":{"repository":{"issues":{"pageInfo":{"hasNextPage":false},"nodes":[]}}},"errors":[]}'
RC_OUT="" LAST_RC=0
run_next || true
assert "empty errors array does not cause failure" "0" "$LAST_RC"

echo "Test 7: valid empty queue (no errors, no nodes) => exit 0 and no ticket output"
export GH_STUB_EXIT=0
export GH_STUB_BODY="$EMPTY_RESP"
RC_OUT="" LAST_RC=0
run_next || true
assert "exit 0 on empty queue" "0" "$LAST_RC"
assert "no ticket output on empty queue" "" "$RC_OUT"

echo "Test 8: PL_PROJECT_TOKEN unset => exit non-zero with clear message"
unset PL_PROJECT_TOKEN
export GH_STUB_EXIT=0
export GH_STUB_BODY="$EMPTY_RESP"
RC_OUT="" LAST_RC=0
run_next || true
assert "exit non-zero when PL_PROJECT_TOKEN unset" "1" "$([[ $LAST_RC -ne 0 ]] && echo 1 || echo 0)"
assert "error mentions PL_PROJECT_TOKEN" "1" "$([[ "$RC_OUT" == *"PL_PROJECT_TOKEN"* ]] && echo 1 || echo 0)"
export PL_PROJECT_TOKEN="fake-token-for-testing"

# ============================================================

echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
