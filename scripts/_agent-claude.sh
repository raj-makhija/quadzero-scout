#!/usr/bin/env bash
# _agent-claude.sh — invoke Claude Code CLI as a headless agent.
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
# to stderr so it shows up in Actions logs; final summary text printed to
# stdout for the caller to capture and post as a ticket comment.
#
# Required env: ANTHROPIC_API_KEY.
# Optional env: PIPELINE_AGENT_TIMEOUT_SEC (default 600 = 10 min per call).

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <prompt-file|-->" >&2
  exit 2
fi

PROMPT_SRC="$1"

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "error: ANTHROPIC_API_KEY env var is not set" >&2
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

# Stream claude's stdout/stderr to our stderr so the Actions log shows
# the agent's reasoning/tool use as it happens. Capture the final
# response separately by saving to a file too.
RESPONSE_FILE="$(mktemp -t claude-agent.XXXXXX)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

echo "==> invoking claude (timeout ${TIMEOUT_SEC}s)" >&2

set +e
timeout "$TIMEOUT_SEC" claude \
  --print \
  --dangerously-skip-permissions \
  "$PROMPT" \
  > "$RESPONSE_FILE" 2>&1
RC=$?
set -e

# Echo the full output to stderr for the Actions log
cat "$RESPONSE_FILE" >&2

if [[ $RC -eq 124 ]]; then
  echo "error: claude timed out after ${TIMEOUT_SEC}s" >&2
  exit 124
fi
if [[ $RC -ne 0 ]]; then
  echo "error: claude exited with code $RC" >&2
  exit "$RC"
fi

# Emit the response on stdout for the caller to capture
cat "$RESPONSE_FILE"
