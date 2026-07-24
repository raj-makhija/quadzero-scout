#!/usr/bin/env bash
# test-next-ticket.sh -- tests for next-ticket.sh's exit-code contract.
#
# Covers #568: a failed project query must be distinguishable from an empty
# queue. Before this, a 401 from the Projects v2 GraphQL call produced the
# same observable result as "nothing to do" -- empty stdout -- and the
# manager's drain loop reported "queue drained" and stayed green through a
# ~15h PL_PROJECT_TOKEN outage.
#
# Contract under test:
#   exit 0 + no output  -> queue genuinely empty
#   exit 0 + output     -> actionable tickets, one per line
#   exit 3              -> query failed; queue state unknown
#
# gh is stubbed via PATH prepending. Everything else (jq, .pipeline-config.json,
# the git remote) is used for real, so the script's own plumbing is exercised.
#
# Usage: bash scripts/test/test-next-ticket.sh
# Exit 0 if all tests pass, non-zero if any fail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPTS_DIR/.." && pwd)"

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

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  case "$haystack" in
    *"$needle"*)
      PASS=$((PASS + 1)); echo "ok   - $name" ;;
    *)
      FAIL=$((FAIL + 1))
      echo "FAIL - $name"
      echo "       expected to contain: $needle"
      echo "       actual: $haystack" ;;
  esac
}

# The project id the script filters on; read from the real config so this
# test keeps working if the board is re-provisioned.
PROJECT_ID="$(jq -r '.project.id' "$REPO_ROOT/.pipeline-config.json")"

GH_DIR="$(mktemp -d)"
trap 'rm -rf "$GH_DIR"' EXIT

# Stub gh. $STUB_MODE selects the behaviour of `gh api graphql`:
#   auth-fail   -> 401 on stderr, non-zero exit (the #568 outage)
#   gql-errors  -> HTTP 200 carrying an `errors` array, exit 0
#   empty       -> a well-formed response with no issues
#   populated   -> a well-formed response with one actionable ticket
cat > "$GH_DIR/gh" << STUBEOF
#!/usr/bin/env bash
case "\${STUB_MODE:-empty}" in
  auth-fail)
    echo "gh: Bad credentials (HTTP 401)" >&2
    exit 1
    ;;
  gql-errors)
    echo '{"errors":[{"message":"Bad credentials"}]}'
    exit 0
    ;;
  empty)
    echo '{"data":{"repository":{"issues":{"pageInfo":{"hasNextPage":false},"nodes":[]}}}}'
    exit 0
    ;;
  populated)
    cat << 'JSONEOF'
{"data":{"repository":{"issues":{"pageInfo":{"hasNextPage":false},"nodes":[
  {"number":42,"title":"Test ticket","createdAt":"2024-01-01T00:00:00Z",
   "labels":{"nodes":[{"name":"auto-pipeline"}]},
   "projectItems":{"nodes":[{"project":{"id":"__PROJECT_ID__"},
     "fieldValues":{"nodes":[
       {"__typename":"ProjectV2ItemFieldSingleSelectValue",
        "field":{"name":"Pipeline Status"},"name":"new"}
     ]}}]}}
]}}}}
JSONEOF
    exit 0
    ;;
esac
STUBEOF
sed -i "s|__PROJECT_ID__|$PROJECT_ID|" "$GH_DIR/gh"
chmod +x "$GH_DIR/gh"

export PATH="$GH_DIR:$PATH"

# Run next-ticket.sh in a given stub mode, capturing stdout, stderr and status.
run_next() {
  local err_file
  err_file="$(mktemp)"
  NT_RC=0
  NT_OUT="$(STUB_MODE="$1" "$SCRIPTS_DIR/next-ticket.sh" 2>"$err_file")" || NT_RC=$?
  NT_ERR="$(cat "$err_file")"
  rm -f "$err_file"
}

echo "--- next-ticket.sh exit-code contract (#568) ---"

# The regression: an auth failure must NOT look like an empty queue.
echo "Test: project query 401s -> exit 3, not a silent empty result"
run_next auth-fail
assert_eq "auth failure: exit 3" "3" "$NT_RC"
assert_eq "auth failure: no tickets on stdout" "" "$NT_OUT"
assert_contains "auth failure: names PL_PROJECT_TOKEN" "PL_PROJECT_TOKEN" "$NT_ERR"
assert_contains "auth failure: says queue state is unknown" "UNKNOWN" "$NT_ERR"
assert_contains "auth failure: gh's own error reaches stderr" "HTTP 401" "$NT_ERR"

# HTTP 200 with an errors array is still a failed query.
echo "Test: GraphQL errors array on a 200 -> exit 3"
run_next gql-errors
assert_eq "gql errors: exit 3" "3" "$NT_RC"
assert_eq "gql errors: no tickets on stdout" "" "$NT_OUT"
assert_contains "gql errors: names PL_PROJECT_TOKEN" "PL_PROJECT_TOKEN" "$NT_ERR"
assert_contains "gql errors: reports the GraphQL message" "Bad credentials" "$NT_ERR"

# The other half of the contract: a real empty queue must stay green, or the
# 5-minute cron would alarm on every idle tick.
echo "Test: genuinely empty queue -> exit 0, no output"
run_next empty
assert_eq "empty queue: exit 0" "0" "$NT_RC"
assert_eq "empty queue: no output" "" "$NT_OUT"

# Positive control: a successful query still emits the documented TSV.
echo "Test: actionable ticket -> exit 0 with the ticket on stdout"
run_next populated
assert_eq "populated: exit 0" "0" "$NT_RC"
assert_eq "populated: emits the ticket row" "$(printf '42\tnew\t-\tTest ticket')" "$NT_OUT"

# Source guard: the drain loop must not re-introduce the swallowing pipe.
echo "Test: drain loop captures next-ticket.sh's status before piping"
MANAGER_YML="$REPO_ROOT/.github/workflows/pipeline-manager.yml"
if grep -qE 'NEXT="\$\(scripts/next-ticket\.sh \|' "$MANAGER_YML"; then
  FAIL=$((FAIL + 1))
  echo "FAIL - drain loop still pipes next-ticket.sh directly (its exit status is lost)"
else
  PASS=$((PASS + 1))
  echo "ok   - drain loop no longer pipes next-ticket.sh directly"
fi

if grep -qF 'NT_OUT="$(scripts/next-ticket.sh)" || NT_RC=$?' "$MANAGER_YML"; then
  PASS=$((PASS + 1))
  echo "ok   - drain loop captures next-ticket.sh's exit status explicitly"
else
  FAIL=$((FAIL + 1))
  echo "FAIL - drain loop does not capture next-ticket.sh's exit status"
fi

echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
