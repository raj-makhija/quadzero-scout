#!/usr/bin/env bash
# test-strike-guard.sh -- unit tests for the strike-ticket.sh mismatch guard.
#
# Stubs `gh` via PATH prepending to prevent real API calls and record invocations.
# Uses PIPELINE_INVOCATION_SENTINEL to point at a temp file (the sentinel).
#
# Usage: bash scripts/test/test-strike-guard.sh
# Exit 0 if all tests pass, non-zero if any fail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STRIKE="$SCRIPTS_DIR/strike-ticket.sh"

PASS=0
FAIL=0

# ---- Setup: temp sentinel file controlled by PIPELINE_INVOCATION_SENTINEL
SENTINEL="$(mktemp)"
export PIPELINE_INVOCATION_SENTINEL="$SENTINEL"

# ---- Setup: gh stub that records calls, returns empty output, exits 0
GH_DIR="$(mktemp -d)"
GH_LOG="$GH_DIR/calls.log"
export GH_LOG
cat > "$GH_DIR/gh" << 'GHSTUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
exit 0
GHSTUB
chmod +x "$GH_DIR/gh"
export PATH="$GH_DIR:$PATH"

trap 'rm -rf "$GH_DIR"; rm -f "$SENTINEL"' EXIT

# ---- Helper: run strike-ticket.sh and return its exit code
strike_rc() {
  local rc=0
  "$STRIKE" "$@" 2>/dev/null || rc=$?
  echo "$rc"
}

# ---- Helper: count gh issue edit --add-label pipeline:struck-* calls in log
# Uses `;:` to ensure exit 0 regardless of grep's exit code (grep exits 1 on no match
# which would cause set -o pipefail to propagate a false failure).
label_calls() {
  grep -c 'issue edit.*--add-label.*pipeline:struck' "$GH_LOG" 2>/dev/null
  :
}

# ---- Helper: count all gh calls in log (including gh issue view)
all_gh_calls() {
  wc -l < "$GH_LOG" 2>/dev/null | tr -d ' '
  :
}

# ---- Helper: assert equality, record pass/fail
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

# ============================================================

echo "Test 1: mismatch -- iteration=#197 banner=#103 => exit non-zero, no label applied"
> "$GH_LOG"
printf '103' > "$SENTINEL"
rc="$(strike_rc 197 "test reason" --expected-invocation-ticket 197)"
assert "exit code is 1" "1" "$rc"
assert "no pipeline:struck label applied" "0" "$(label_calls)"

echo "Test 2: match -- iteration=#197 banner=#197 => exit 0, label applied"
> "$GH_LOG"
printf '197' > "$SENTINEL"
rc="$(strike_rc 197 "test reason" --expected-invocation-ticket 197)"
assert "exit code is 0" "0" "$rc"
assert "pipeline:struck label applied once" "1" "$(label_calls)"

echo "Test 3: no sentinel file (failure before dispatch) => guard does not fire, strike proceeds"
> "$GH_LOG"
rm -f "$SENTINEL"
rc="$(strike_rc 197 "test reason" --expected-invocation-ticket 197)"
assert "exit code is 0" "0" "$rc"
assert "label applied" "1" "$(label_calls)"
touch "$SENTINEL"  # recreate so trap cleanup works

echo "Test 4: flag omitted => backward compatible, strike proceeds regardless of sentinel"
> "$GH_LOG"
printf '103' > "$SENTINEL"
rc="$(strike_rc 197 "test reason")"
assert "exit code is 0" "0" "$rc"
assert "label applied" "1" "$(label_calls)"

echo "Test 5: exact numeric match -- iteration=#19 banner=#197 => mismatch (not substring)"
> "$GH_LOG"
printf '197' > "$SENTINEL"
rc="$(strike_rc 19 "test reason" --expected-invocation-ticket 19)"
assert "197 != 19 is a mismatch => exit 1" "1" "$rc"
assert "no label applied" "0" "$(label_calls)"

echo "Test 6: exact numeric match reverse -- iteration=#197 banner=#19 => mismatch"
> "$GH_LOG"
printf '19' > "$SENTINEL"
rc="$(strike_rc 197 "test reason" --expected-invocation-ticket 197)"
assert "19 != 197 is a mismatch => exit 1" "1" "$rc"
assert "no label applied" "0" "$(label_calls)"

echo "Test 7: multiple sentinel writes -- last write wins"
> "$GH_LOG"
printf '197' > "$SENTINEL"
printf '103' > "$SENTINEL"  # overwrites; most-recent banner = 103
rc="$(strike_rc 197 "test reason" --expected-invocation-ticket 197)"
assert "last-write 103 != 197 => exit 1" "1" "$rc"
assert "no label applied" "0" "$(label_calls)"

echo "Test 8: mismatch on what-would-be 3rd-strike => guard fires before any gh calls"
> "$GH_LOG"
printf '103' > "$SENTINEL"
rc="$(strike_rc 197 "test reason" --expected-invocation-ticket 197)"
assert "exit 1 (guard fires)" "1" "$rc"
assert "no gh calls at all (guard exits before gh issue view)" "0" "$(all_gh_calls)"

echo "Test 9: stderr message names both tickets and contains mismatch phrase"
> "$GH_LOG"
printf '103' > "$SENTINEL"
STDERR="$("$STRIKE" 197 "test reason" --expected-invocation-ticket 197 2>&1 1>/dev/null || true)"
assert "stderr mentions iteration ticket 197" \
  "true" "$(echo "$STDERR" | grep -q '197' && echo true || echo false)"
assert "stderr mentions banner ticket 103" \
  "true" "$(echo "$STDERR" | grep -q '103' && echo true || echo false)"
assert "stderr contains 'MISMATCH' or 'mismatch'" \
  "true" "$(echo "$STDERR" | grep -qi 'mismatch' && echo true || echo false)"

# ============================================================

echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
