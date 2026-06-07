#!/usr/bin/env bash
# test-strip-coauthors.sh -- unit tests for the Co-Authored-By strip helpers
# (pl_has_coauthors / pl_strip_coauthors) in _pipeline-lib.sh.
#
# These pure functions back the qa-approve.sh post-squash strip step. The
# critical property under test is idempotency: pl_has_coauthors must gate on
# the actual presence of a trailer line, NOT on whether stripping would alter
# the text, so a commit that merely ends with a trailing blank line (the
# common GitHub squash format) is left untouched.
#
# Usage: bash scripts/test/test-strip-coauthors.sh
# Exit 0 if all tests pass, non-zero if any fail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../_pipeline-lib.sh
source "$SCRIPTS_DIR/_pipeline-lib.sh"

PASS=0
FAIL=0

# has_coauthors_rc <message> -> echoes exit code of pl_has_coauthors
has_coauthors_rc() {
  local rc=0
  printf '%s' "$1" | pl_has_coauthors || rc=$?
  echo "$rc"
}

# assert_eq <name> <expected> <actual>
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

# ---- pl_has_coauthors: presence detection ----------------------------------

assert_eq "has_coauthors: detects a trailer" \
  "0" "$(has_coauthors_rc $'fix: thing (#1)\n\nCo-authored-by: A <a@x>')"

assert_eq "has_coauthors: case-insensitive" \
  "0" "$(has_coauthors_rc $'fix: thing (#1)\n\nCO-AUTHORED-BY: A <a@x>')"

assert_eq "has_coauthors: leading whitespace tolerated" \
  "0" "$(has_coauthors_rc $'fix: thing (#1)\n\n  Co-Authored-By: A <a@x>')"

assert_eq "has_coauthors: absent in plain message" \
  "1" "$(has_coauthors_rc $'fix: thing (#1)\n\nbody line')"

# Idempotency guard: a message with NO trailer but a trailing blank line
# (typical GitHub squash format) must report ABSENT, so qa-approve does not
# amend/force-push it. This is the attempt-1 FAIL this ticket fixes.
assert_eq "has_coauthors: trailing blank line is not a trailer (idempotency)" \
  "1" "$(has_coauthors_rc $'chore: update deps\n\n* Add library\n* Pin version\n\n')"

# ---- pl_strip_coauthors: transformation ------------------------------------

assert_eq "strip: removes a single trailer and trailing blank" \
  $'fix: thing (#1)\n\nbody' \
  "$(printf '%s' $'fix: thing (#1)\n\nbody\n\nCo-authored-by: A <a@x>' | pl_strip_coauthors)"

assert_eq "strip: removes multiple trailers" \
  $'fix: thing (#1)\n\nbody' \
  "$(printf '%s' $'fix: thing (#1)\n\nbody\n\nCo-authored-by: A <a@x>\nCo-authored-by: B <b@y>' | pl_strip_coauthors)"

# Documented policy: ALL Co-Authored-By lines are stripped, including a
# human-looking one. No silent partial data loss -- the policy is explicit.
assert_eq "strip: strips mixed agent + human trailers (documented policy)" \
  $'fix: thing (#1)' \
  "$(printf '%s' $'fix: thing (#1)\n\nCo-authored-by: bot <noreply@anthropic.com>\nCo-authored-by: Human <h@co>' | pl_strip_coauthors)"

assert_eq "strip: leaves body without trailers intact" \
  $'chore: update deps\n\n* Add library\n* Pin version' \
  "$(printf '%s' $'chore: update deps\n\n* Add library\n* Pin version' | pl_strip_coauthors)"

# ---- Summary ---------------------------------------------------------------

echo "----"
echo "passed: $PASS, failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
