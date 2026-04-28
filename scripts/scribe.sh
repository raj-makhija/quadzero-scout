#!/usr/bin/env bash
# scribe.sh -- post-QA documentarian.
#
# Reads what was just shipped + validated through QA in the given ticket
# (its [developer:rationale] comment + merge-commit diff + likely-affected
# docs in their current state) and decides whether documentation needs
# updating to reflect the change. If yes, files a follow-up auto-pipeline
# ticket (type:docs) that walks through the normal pipeline like any other
# change. If no, just posts a comment.
#
# Invoked from pipeline-commands.yml's qa-approve route after qa-approve.sh
# succeeds. Best-effort: failures are logged but do NOT block QA approval.
#
# Recursion safety: if the source ticket is itself a docs ticket (and the
# scribe agent recognizes its diff as docs-only), claude returns
# NO_DOCS_NEEDED and no follow-up is created.
#
# Usage: scripts/scribe.sh <ticket>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_pipeline-lib.sh
source "$SCRIPT_DIR/_pipeline-lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <ticket>" >&2
  exit 2
fi

TICKET="$1"
pl_load_config

# Find the merge SHA for this ticket
PR="$("$SCRIPT_DIR/get-field.sh" "$TICKET" "PR Number" 2>/dev/null || true)"
if [[ -z "$PR" ]]; then
  PR="$(gh issue view "$TICKET" --json closedByPullRequestsReferences \
    -q '.closedByPullRequestsReferences[0].number // empty' 2>/dev/null || true)"
fi
if [[ -z "$PR" ]]; then
  echo "scribe: no PR for #$TICKET; skipping" >&2
  exit 0
fi

MERGE_SHA="$(gh pr view "$PR" --json mergeCommit -q '.mergeCommit.oid // empty' 2>/dev/null || true)"
if [[ -z "$MERGE_SHA" ]]; then
  echo "scribe: no merge SHA for PR #$PR; skipping" >&2
  exit 0
fi

TITLE="$(gh issue view "$TICKET" --json title -q .title)"

PROMPT="$(cat <<PROMPT
You are the scribe agent in an automated CI/CD pipeline. Your job is to
read what was just shipped and validated through QA in ticket #${TICKET},
and decide whether any documentation needs updating to reflect the change.

CONTEXT
- Repo working directory: \$(pwd) -- the repository root.
- CLAUDE.md is auto-loaded; apply its standards.
- Ticket: #${TICKET} -- ${TITLE}
- Merge commit: ${MERGE_SHA}

MUST-DO STEPS
1. Read the ticket's spec and full comment thread:
   \`gh issue view ${TICKET} --comments\`
   Specifically look at the \`[developer:rationale]\` comment if present
   (it lists alternatives considered, assumptions made, and the
   developer's own assessment of which docs need updating).
2. Look at what actually changed in the merge:
   \`git show --stat ${MERGE_SHA}\` for the file list,
   \`git show ${MERGE_SHA}\` for the full diff.
3. Look at the current state of likely-affected docs:
   - \`README.md\`
   - \`CLAUDE.md\`
   - \`CI-CD.md\`
   - any \`docs/*.md\` or \`docs/**/*.md\` files relevant to the changed code
4. Decide: do the docs need updating?
   - YES if the change adds/modifies a public API, public behavior, env
     var, IAM permission, AWS resource, build step, deploy step, or
     anything a future engineer would need to know that's NOT derivable
     from reading the code.
   - NO if the change is purely internal (refactor, bug fix that restores
     intended behavior, internal helper, perf tweak with no API change).
   - NO if THIS ticket is itself a docs update (the diff is markdown-only
     and the ticket title or labels indicate docs work) -- the change IS
     the docs update; no follow-up needed.

OUTPUT FORMAT (REQUIRED)

If no docs update is needed, output EXACTLY this single line and nothing
else:

NO_DOCS_NEEDED

Otherwise, output a markdown ticket body for a follow-up auto-pipeline
ticket, formatted EXACTLY like this (including the begin/end markers):

---FOLLOW_UP_BEGIN---
## Source ticket
#${TICKET} -- ${TITLE}
Merge commit: \`${MERGE_SHA}\`

## Why this doc update is needed
[2-3 sentences explaining what changed and why docs need to reflect it]

## Doc updates required
- \`<filepath>\`: [what to add/change/remove, in detail enough that the
  developer agent can implement it without re-reading the source ticket]
- \`<filepath>\`: [...]

## Acceptance criteria
- \`<filepath>\` contains [specific content/section]
- \`<filepath>\`'s [section] mentions [specific change]
- No code files are modified (this is docs-only)
- Conventional commit (\`docs: ...\`)
---FOLLOW_UP_END---

Generate now. Output either NO_DOCS_NEEDED on its own line, or the
---FOLLOW_UP_BEGIN--- ... ---FOLLOW_UP_END--- block. Nothing else.
PROMPT
)"

echo "==> invoking scribe agent (claude) for #$TICKET" >&2

RESPONSE_FILE="$(mktemp -t scribe.XXXXXX)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

if ! echo "$PROMPT" | "$SCRIPT_DIR/_agent-claude.sh" - > "$RESPONSE_FILE" 2>&1; then
  echo "scribe: claude call failed; continuing without docs follow-up" >&2
  gh issue comment "$TICKET" --body "[scribe] Claude call failed; manual review of doc impact recommended." >/dev/null 2>&1 || true
  exit 0
fi

if grep -q "^NO_DOCS_NEEDED" "$RESPONSE_FILE"; then
  gh issue comment "$TICKET" --body "[scribe] No doc updates needed for this change." >/dev/null 2>&1 || true
  echo "scribe: no docs needed for #$TICKET" >&2
  exit 0
fi

# Extract follow-up body between markers
BODY="$(awk '/---FOLLOW_UP_BEGIN---/,/---FOLLOW_UP_END---/' "$RESPONSE_FILE" \
  | sed '/^---FOLLOW_UP_BEGIN---$/d; /^---FOLLOW_UP_END---$/d')"

if [[ -z "$BODY" ]]; then
  gh issue comment "$TICKET" --body "[scribe] Could not parse follow-up; manual review of recent changes recommended.

----- scribe output (last 40 lines) -----
$(tail -n 40 "$RESPONSE_FILE")
-----" >/dev/null 2>&1 || true
  echo "scribe: failed to parse output; logged on #$TICKET" >&2
  exit 0
fi

# File the follow-up
NEW_TITLE="docs: update for #${TICKET} -- ${TITLE}"
NEW_ISSUE_URL="$(gh issue create \
  --title "$NEW_TITLE" \
  --body "$BODY" \
  --label "auto-pipeline,type:docs" \
  --project "Quadzero Scout Pipeline" 2>/dev/null || echo "")"

if [[ -z "$NEW_ISSUE_URL" ]]; then
  gh issue comment "$TICKET" --body "[scribe] Failed to file follow-up doc ticket. Proposed body:

---
$BODY" >/dev/null 2>&1 || true
  echo "scribe: failed to file ticket; body logged on #$TICKET" >&2
  exit 0
fi

NEW_NUM="$(echo "$NEW_ISSUE_URL" | grep -oE '[0-9]+$')"
gh issue comment "$TICKET" --body "[scribe] Filed #${NEW_NUM} for follow-up doc updates.

$NEW_ISSUE_URL" >/dev/null 2>&1 || true
echo "scribe: filed #${NEW_NUM} for #${TICKET}" >&2
