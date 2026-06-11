#!/usr/bin/env bash
# qa-tester.sh -- 5th pipeline agent. Runs the documented acceptance cases
# against the DEPLOYED qa environment, as an automated safety net before
# human QA sign-off.
#
# Dispatched post-deploy from inside qa-deploy.sh (after the serverless
# deploy + qa push, before status:in-qa). The unit/regression suite already
# ran pre-deploy inside qa-deploy.sh; this agent is specifically about
# exercising the behavioral acceptance items the tester documented in its
# [tester:test-plan] comment, against the live system -- which no other
# suite does.
#
# Browser-driven: the tester's acceptance items are mostly UI behavior, so a
# real Claude agent drives the deployed qa frontend through a browser MCP
# (Playwright MCP, see scripts/qa-tester-mcp.json). It posts a [qa-tester]
# per-item report and ends with VERDICT: PASS or VERDICT: FAIL.
#
# Modes of operation (set by env, off by default so current behavior is
# unchanged until the QA account + secret are provisioned):
#   PIPELINE_QA_TESTER_AGENT=claude  -- run the real browser agent.
#       (anything else -> dummy auto-pass: posts a canned [qa-tester]
#        comment and exits 0, for plumbing tests without burning tokens.)
#   PIPELINE_QA_TESTER_MODEL          -- default claude-sonnet-4-6.
#   PIPELINE_QA_FRONTEND_URL          -- default https://qa.scout.quadzero.com.
#   QA_TEST_USER / QA_TEST_PASSWORD   -- credentials for authenticated flows.
#       If absent, the agent marks auth-required items UNVERIFIABLE (never
#       FAIL) so a missing account can't spuriously bounce a good ticket.
#
# Exit codes (consumed by qa-deploy.sh to decide PASS vs auto-reject):
#   0  -- PASS (or dummy auto-pass).
#   3  -- definitive FAIL (>=1 acceptance item failed).
#   1  -- could-not-run (no verdict, browser/tooling error). qa-deploy treats
#         this as a soft warning and proceeds to human QA -- a flaky gate must
#         not bounce a good ticket.
#
# Usage:
#   scripts/qa-tester.sh <ticket> <branch>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <ticket> <branch>" >&2
  exit 2
fi

TICKET="$1"
BRANCH="$2"

pl_load_config

# ---- Dummy fallback: auto-pass without an LLM call -----------------------
if [[ "${PIPELINE_QA_TESTER_AGENT:-dummy}" != "claude" ]]; then
  gh issue comment "$TICKET" --body "[qa-tester] (dummy) skipped -- \`PIPELINE_QA_TESTER_AGENT\` is not \`claude\`. No acceptance cases were run against the deployed qa env." >&2
  echo "qa-tester: dummy auto-pass for #$TICKET" >&2
  exit 0
fi

# ---- Real browser agent --------------------------------------------------
export PIPELINE_AGENT_MODEL="${PIPELINE_QA_TESTER_MODEL:-claude-sonnet-4-6}"
export PIPELINE_AGENT_MCP_CONFIG="$SCRIPT_DIR/qa-tester-mcp.json"

QA_URL="${PIPELINE_QA_FRONTEND_URL:-https://qa.scout.quadzero.com}"

# Credential block for the prompt. Keep secrets out of the prompt text where
# possible -- the agent reads them from its own environment via the browser
# MCP / shell. We only tell it WHETHER creds exist.
if [[ -n "${QA_TEST_USER:-}" && -n "${QA_TEST_PASSWORD:-}" ]]; then
  CRED_NOTE="A seeded QA account is available. Username is in \$QA_TEST_USER and password in \$QA_TEST_PASSWORD (read them from the environment; never print the password). Use them to authenticate and exercise authenticated flows."
else
  CRED_NOTE="No QA test account is configured (\$QA_TEST_USER / \$QA_TEST_PASSWORD are unset). For any acceptance item that requires authentication, mark it UNVERIFIABLE -- do NOT mark it FAIL."
fi

# Best-effort: make sure a Chromium build is available for the Playwright MCP.
# Non-fatal -- the MCP also self-installs on first launch on most runners.
echo "==> ensuring Playwright chromium is installed" >&2
npx -y playwright@latest install chromium >&2 2>&1 || \
  echo "    (playwright install returned non-zero; relying on MCP self-install)" >&2

PROMPT="$(cat <<PROMPT
You are the qa-tester agent in an automated CI/CD pipeline. Ticket #${TICKET}
(branch \`${BRANCH}\`) has just been deployed to the live QA environment.
Your job: run the documented acceptance cases against the DEPLOYED system as
an automated safety net before a human signs off. You do NOT touch code.

ENVIRONMENT
- Deployed QA frontend: ${QA_URL}
- ${CRED_NOTE}
- You have a browser via the "playwright" MCP server. Drive the real frontend
  with it (navigate, click, fill, read the page). This is browser-driven
  verification, not API guessing.
- CLAUDE.md is auto-loaded; repo root is \$(pwd).

MUST-DO STEPS
1. Read the ticket and its test plan:
   \`gh issue view ${TICKET} --comments\`. Find the \`[tester:test-plan]\`
   comment and treat each acceptance item in it as a case to verify. If that
   comment is missing, derive the acceptance items from the ticket body.
2. For EACH acceptance item: drive ${QA_URL} in the browser to reproduce the
   behavior, and decide one of:
     - PASS         -- behavior observed as specified.
     - FAIL         -- behavior observably wrong / missing.
     - UNVERIFIABLE -- cannot be checked here (subjective UX, requires an
                       account you don't have, or external state). NOT a FAIL.
3. Post ONE comment to issue #${TICKET}, header \`[qa-tester]\`, with a concise
   per-item table: item | PASS/FAIL/UNVERIFIABLE | one-line evidence. Keep it
   short -- do not paste full page dumps.

DO NOT
- Modify, commit, or push any code or files.
- Open, modify, or merge any PR.
- Print the QA password.

OUTPUT FORMAT (REQUIRED)
After posting the comment, end your response with EXACTLY ONE of these
single-line verdict lines, on its own line, no markdown:
  VERDICT: PASS
  VERDICT: FAIL
Rules: VERDICT: FAIL if and only if at least one acceptance item is FAIL.
UNVERIFIABLE items do NOT cause FAIL. If every item is PASS or UNVERIFIABLE,
the verdict is PASS.
PROMPT
)"

echo "==> invoking qa-tester agent (claude) for #$TICKET against $QA_URL" >&2

RESPONSE_FILE="$(mktemp -t qa-tester.XXXXXX)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

set +e
echo "$PROMPT" | "$SCRIPT_DIR/_agent-claude.sh" - > "$RESPONSE_FILE"
AGENT_RC=$?
set -e

if [[ $AGENT_RC -ne 0 ]]; then
  echo "qa-tester: agent exited $AGENT_RC; treating as could-not-run (soft)" >&2
  gh issue comment "$TICKET" --body "[qa-tester] Could not run the acceptance cases against the deployed qa env (agent exited $AGENT_RC -- likely a browser/tooling or timeout error). This is NOT a failure verdict; human QA proceeds as normal. See the workflow logs." >&2
  exit 1
fi

VERDICT_LINE="$(grep -E '^[[:space:]]*\**[[:space:]]*VERDICT:[[:space:]]*(PASS|FAIL)' "$RESPONSE_FILE" | tail -n1 || true)"
VERDICT=""
case "$VERDICT_LINE" in
  *FAIL*) VERDICT="FAIL" ;;
  *PASS*) VERDICT="PASS" ;;
esac

if [[ -z "$VERDICT" ]]; then
  echo "qa-tester: no recognized VERDICT line; treating as could-not-run (soft)" >&2
  echo "----- last 40 lines of agent output -----" >&2
  tail -n40 "$RESPONSE_FILE" >&2
  gh issue comment "$TICKET" --body "[qa-tester] Ran but did not emit a clear PASS/FAIL verdict. Treating as inconclusive (NOT a failure); human QA proceeds as normal." >&2
  exit 1
fi

case "$VERDICT" in
  PASS)
    echo "qa-tester -> PASS for #$TICKET" >&2
    exit 0
    ;;
  FAIL)
    echo "qa-tester -> FAIL for #$TICKET" >&2
    exit 3
    ;;
esac
