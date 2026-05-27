#!/usr/bin/env bash
# _agent-claude.sh — invoke Claude Code CLI as a headless agent.
#
# Sourced or executed by the per-agent scripts (developer, tester, reviewer)
# when PIPELINE_*_AGENT=claude is set.
#
# Usage:
#   scripts/_agent-claude.sh <prompt-file>
#   echo "$PROMPT" | scripts/_agent-claude.sh -
#
# Reads the agent prompt from a file (or stdin via "-"). Runs `claude -p`
# with --dangerously-skip-permissions in the current working directory
# (the repo root, where CLAUDE.md auto-loads). Streams claude's output
# to stderr so it shows up in Actions logs; final summary text printed
# to stdout for the caller to capture.
#
# Auth: requires either ANTHROPIC_API_KEY (API billing) or
# CLAUDE_CODE_OAUTH_TOKEN (Pro/Max subscription).
# Optional:
#   PIPELINE_AGENT_TIMEOUT_SEC -- default 600 = 10 min per call.
#   PIPELINE_AGENT_MODEL       -- if set, passed to claude as `--model <value>`.
#                                 Per-agent scripts (developer/tester/reviewer/
#                                 scribe) set this for tiered model selection.
#                                 Unset = let claude pick its default.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <prompt-file|-->" >&2
  exit 2
fi

PROMPT_SRC="$1"

if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
  echo "error: neither ANTHROPIC_API_KEY nor CLAUDE_CODE_OAUTH_TOKEN is set" >&2
  echo "       (one of them is required to authenticate the claude CLI)" >&2
  exit 1
fi

if ! command -v claude >/dev/null; then
  echo "error: 'claude' CLI not found on PATH" >&2
  echo "install: npm install -g @anthropic-ai/claude-code" >&2
  exit 127
fi

# Get the prompt text
if [[ "$PROMPT_SRC" == "-" ]]; then
  PROMPT="$(cat)"
elif [[ -f "$PROMPT_SRC" ]]; then
  PROMPT="$(cat "$PROMPT_SRC")"
else
  echo "error: prompt source '$PROMPT_SRC' not a readable file" >&2
  exit 1
fi

if [[ -z "$PROMPT" ]]; then
  echo "error: empty prompt" >&2
  exit 1
fi

TIMEOUT_SEC="${PIPELINE_AGENT_TIMEOUT_SEC:-600}"

RESPONSE_FILE="$(mktemp -t claude-agent.XXXXXX)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

# Optional model override for tiered model selection. Unset = claude's default.
MODEL_ARGS=""
if [[ -n "${PIPELINE_AGENT_MODEL:-}" ]]; then
  MODEL_ARGS="--model ${PIPELINE_AGENT_MODEL}"
fi

echo "==> invoking claude (timeout ${TIMEOUT_SEC}s${PIPELINE_AGENT_MODEL:+, model=$PIPELINE_AGENT_MODEL})" >&2

set +e
# shellcheck disable=SC2086  # intentional word-splitting on MODEL_ARGS
timeout "$TIMEOUT_SEC" claude \
  --print \
  --dangerously-skip-permissions \
  $MODEL_ARGS \
  "$PROMPT" \
  > "$RESPONSE_FILE" 2>&1
RC=$?
set -e

cat "$RESPONSE_FILE" >&2

# Claude plan quota exhaustion (CLAUDE_CODE_OAUTH_TOKEN / Pro/Max subscription).
# The CLI prints a "usage limit reached" message and may exit 0 or non-zero
# depending on version; either way we want a distinguishable sentinel exit
# so the drain loop can bail without striking the in-flight ticket.
if grep -qiE 'claude (ai )?usage limit|usage limit reached|5[- ]hour limit|weekly limit|your limit will reset' "$RESPONSE_FILE"; then
  echo "error: claude plan quota exhausted (CLAUDE_CODE_OAUTH_TOKEN); exiting 75 to pause drain" >&2
  exit 75
fi

if [[ $RC -eq 124 ]]; then
  echo "error: claude timed out after ${TIMEOUT_SEC}s" >&2
  exit 124
fi
if [[ $RC -ne 0 ]]; then
  echo "error: claude exited with code $RC" >&2
  exit "$RC"
fi

cat "$RESPONSE_FILE"
