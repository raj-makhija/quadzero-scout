#!/usr/bin/env bash
# check-staleness.sh — is a PR's branch stale relative to develop?
#
# Usage:
#   scripts/check-staleness.sh <pr> <base-sha>
#
# Computes the file-level overlap between the PR's changed files and
# files changed on origin/develop since <base-sha>. If overlap is
# non-empty, the branch is stale (exit 1, prints overlap to stdout).
# If overlap is empty, the branch is clean (exit 0, no output).
#
# Staleness is intentionally dumb: any overlap is stale. False positives
# are cheap; missed conflicts are expensive.

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <pr> <base-sha>" >&2
  exit 2
fi

PR="$1"
BASE_SHA="$2"

command -v gh >/dev/null || { echo "error: gh not found" >&2; exit 127; }
command -v comm >/dev/null || { echo "error: comm not found" >&2; exit 127; }

git fetch origin develop --quiet

PR_FILES="$(gh pr view "$PR" --json files -q '.files[].path' | sort -u)"
DEV_FILES="$(git diff --name-only "$BASE_SHA..origin/develop" | sort -u)"

# Empty set handling: if either side is empty, overlap is empty.
if [[ -z "$PR_FILES" || -z "$DEV_FILES" ]]; then
  exit 0
fi

OVERLAP="$(comm -12 <(echo "$PR_FILES") <(echo "$DEV_FILES"))"

if [[ -n "$OVERLAP" ]]; then
  echo "$OVERLAP"
  exit 1
fi
exit 0
