#!/usr/bin/env bash
# test-create-branch-guard.sh -- unit tests for pl_has_unmerged_commits, the
# ancestry guard create-branch.sh uses to tell a stale (already merged)
# leftover attempt branch from one carrying real un-merged work.
#
# Reproduces #430: a leftover branch whose commits already merged to develop
# must be classified MERGED (reset + reuse), not "real work". The old
# SHA-equality check (tip != develop HEAD) mis-flagged any such tip as work,
# wedging retried tickets at needs-human.
#
# Builds a throwaway local git repo -- no network, no gh. Run:
#   bash scripts/test/test-create-branch-guard.sh
# Exit 0 if all tests pass, non-zero if any fail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../_pipeline-lib.sh
source "$SCRIPTS_DIR/_pipeline-lib.sh"

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

# Map the helper's exit status to a stable token: "refuse" (has unmerged
# work, return 0) or "reuse" (merged/empty, return 1).
verdict() {
  if pl_has_unmerged_commits "$1" "$2"; then echo refuse; else echo reuse; fi
}

# ---- Build a throwaway repo: A <- B(develop HEAD), and C off A (unmerged).
REPO="$(mktemp -d)"
trap 'rm -rf "$REPO"' EXIT
cd "$REPO"
git init -q
git config user.email t@example.com
git config user.name tester
git commit -q --allow-empty -m A; A="$(git rev-parse HEAD)"
git commit -q --allow-empty -m B; B="$(git rev-parse HEAD)"   # develop HEAD
git checkout -q -b feat "$A"
git commit -q --allow-empty -m C; C="$(git rev-parse HEAD)"   # not in B
git checkout -q -

# ============================================================

echo "Test 1: merged-ancestor tip (A) vs HEAD (B) => reuse (already in develop)"
assert "A is merged" "reuse" "$(verdict "$A" "$B")"

echo "Test 2: tip equals base (B vs B) => reuse"
assert "B == B" "reuse" "$(verdict "$B" "$B")"

echo "Test 3: un-merged tip (C, off A) vs HEAD (B) => refuse (real work)"
assert "C has commits not in B" "refuse" "$(verdict "$C" "$B")"

echo "Test 4: empty tip (no existing branch) => reuse (nothing to protect)"
assert "empty tip" "reuse" "$(verdict "" "$B")"

echo "Test 5: regression -- merged tip A differs from base SHA B"
echo "        old equality check (A != B) FALSELY refused; ancestry must not."
assert "A != B holds (would-be false positive)" \
  "true" "$([[ "$A" != "$B" ]] && echo true || echo false)"
assert "ancestry classifies A as reuse" "reuse" "$(verdict "$A" "$B")"

# ============================================================

echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
