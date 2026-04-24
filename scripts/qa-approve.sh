#!/usr/bin/env bash
# qa-approve.sh — advance the `frontier` git tag to a SHA (QA-approved watermark).
#
# Usage:
#   scripts/qa-approve.sh <sha>
#
# The `frontier` tag marks the latest commit that has been human-QA-approved.
# prod-release.sh refuses to release anything past the frontier. This script
# is the ONLY way to move the frontier forward.
#
# Guardrail: refuses to move frontier backward (target is an ancestor of
# current frontier). Set PIPELINE_FORCE=1 to override.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <sha>" >&2
  exit 2
fi

TARGET="$1"

echo "==> fetching tags" >&2
git fetch origin --tags --quiet

if ! git cat-file -e "$TARGET^{commit}" 2>/dev/null; then
  echo "error: SHA '$TARGET' not found" >&2
  exit 1
fi

SHA="$(git rev-parse "$TARGET")"

# If frontier exists, enforce monotonic forward motion.
if git rev-parse frontier >/dev/null 2>&1; then
  CURRENT="$(git rev-parse frontier)"

  if [[ "$CURRENT" == "$SHA" ]]; then
    echo "frontier already at $SHA; nothing to do" >&2
    exit 0
  fi

  if git merge-base --is-ancestor "$SHA" "$CURRENT"; then
    echo "error: target $SHA is BEHIND current frontier $CURRENT" >&2
    echo "to move frontier backward (rare), re-run with PIPELINE_FORCE=1" >&2
    if [[ "${PIPELINE_FORCE:-}" != "1" ]]; then
      exit 1
    fi
    echo "PIPELINE_FORCE=1 — proceeding with backward move" >&2
  fi
fi

echo "==> moving frontier to $SHA" >&2
git tag -f frontier "$SHA"
git push origin frontier --force

echo "frontier now at $SHA" >&2
