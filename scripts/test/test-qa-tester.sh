#!/usr/bin/env bash
# test-qa-tester.sh -- unit tests for scripts/qa-tester.sh.
#
# Stubs `gh`, `npx`, and `claude` via PATH prepending so no real API calls,
# browser installs, or LLM invocations happen. The stub `claude` echoes
# whatever is in $STUB_CLAUDE_OUTPUT, letting us exercise verdict parsing and
# the exit-code contract qa-deploy.sh relies on (0=PASS, 3=FAIL, 1=soft).
#
# Usage: bash scripts/test/test-qa-tester.sh
# Exit 0 if all tests pass, non-zero if any fail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPTS_DIR/.." && pwd)"
QA_TESTER="$SCRIPTS_DIR/qa-tester.sh"

PASS=0
FAIL=0

# ---- Setup: stub bin dir (gh, npx, claude) -------------------------------
BIN_DIR="$(mktemp -d)"
GH_LOG="$BIN_DIR/gh-calls.log"
export GH_LOG

cat > "$BIN_DIR/gh" << 'GHSTUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
exit 0
GHSTUB

# npx no-op (stands in for `npx playwright install chromium`).
cat > "$BIN_DIR/npx" << 'NPXSTUB'
#!/usr/bin/env bash
exit 0
NPXSTUB

# claude stub: ignore all args, print whatever STUB_CLAUDE_OUTPUT holds.
cat > "$BIN_DIR/claude" << 'CLAUDESTUB'
#!/usr/bin/env bash
printf '%s\n' "${STUB_CLAUDE_OUTPUT:-}"
exit 0
CLAUDESTUB

chmod +x "$BIN_DIR/gh" "$BIN_DIR/npx" "$BIN_DIR/claude"
export PATH="$BIN_DIR:$PATH"
# _agent-claude.sh requires one auth var to be set.
export CLAUDE_CODE_OAUTH_TOKEN="dummy-token"

trap 'rm -rf "$BIN_DIR"' EXIT

# ---- Helper: run qa-tester.sh from repo root, return its exit code --------
run_rc() {
  local rc=0
  ( cd "$REPO_ROOT" && "$QA_TESTER" "$@" ) >/dev/null 2>&1 || rc=$?
  echo "$rc"
}

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

echo "== qa-tester.sh tests =="

# 1. Dummy fallback: agent not 'claude' -> exit 0, no LLM call.
: > "$GH_LOG"
unset PIPELINE_QA_TESTER_AGENT
assert_eq "dummy fallback exits 0" "0" "$(run_rc 255 feature/ticket-255-cowork)"
assert_eq "dummy fallback posts a [qa-tester] comment" "1" \
  "$(grep -c 'qa-tester' "$GH_LOG" 2>/dev/null; :)"

# 2. Real agent, VERDICT: PASS -> exit 0.
export PIPELINE_QA_TESTER_AGENT=claude
export STUB_CLAUDE_OUTPUT=$'all items checked\nVERDICT: PASS'
assert_eq "agent PASS exits 0" "0" "$(run_rc 255 feature/ticket-255-cowork)"

# 3. Real agent, VERDICT: FAIL -> exit 3 (qa-deploy auto-reject trigger).
export STUB_CLAUDE_OUTPUT=$'item 2 broken\nVERDICT: FAIL'
assert_eq "agent FAIL exits 3" "3" "$(run_rc 255 feature/ticket-255-cowork)"

# 4. Real agent, no verdict line -> exit 1 (soft could-not-run).
export STUB_CLAUDE_OUTPUT=$'I could not load the page'
assert_eq "agent no-verdict exits 1 (soft)" "1" "$(run_rc 255 feature/ticket-255-cowork)"

# 5. Missing args -> usage error exit 2.
assert_eq "missing branch arg exits 2" "2" "$(run_rc 255)"

echo ""
echo "== results: $PASS passed, $FAIL failed =="
[[ "$FAIL" -eq 0 ]]
