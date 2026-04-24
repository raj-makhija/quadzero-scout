#!/usr/bin/env bash
# setup-pipeline.sh — idempotent one-shot: create (or adopt) the GitHub
# Project, add missing fields, add missing labels, and run discover-ids.sh.
#
# Re-run it any time; it only creates what's missing. Intended for the
# initial Phase 1 setup of the automated Claude Code pipeline.
#
# Usage:
#   scripts/setup-pipeline.sh [owner]
#
# Env:
#   PIPELINE_OWNER         (default: raj-makhija)
#   PIPELINE_PROJECT_TITLE (default: "Quadzero Scout Pipeline")
#
# Requires: gh (authenticated, scopes: project, read:project, repo), jq.

set -euo pipefail

OWNER="${1:-${PIPELINE_OWNER:-raj-makhija}}"
PROJECT_TITLE="${PIPELINE_PROJECT_TITLE:-Quadzero Scout Pipeline}"

command -v gh >/dev/null || { echo "error: gh CLI not found" >&2; exit 127; }
command -v jq >/dev/null || { echo "error: jq not found" >&2; exit 127; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

log() { echo "==> $*" >&2; }

################################################################################
# gh auth + scope preflight
################################################################################
log "checking gh auth"
if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh not authenticated. Run: gh auth login -s project,read:project,repo" >&2
  exit 1
fi

# Check for 'project' scope — it's the one that Projects v2 needs.
SCOPES="$(gh auth status 2>&1 | grep -i 'token scopes' || true)"
if ! echo "$SCOPES" | grep -Eq "'project'|'read:project'"; then
  echo "warning: gh token may be missing 'project' scope. Current: $SCOPES" >&2
  echo "fix: gh auth refresh -s project,read:project" >&2
fi

################################################################################
# project: find or create
################################################################################
log "looking up project '$PROJECT_TITLE' for owner $OWNER"
PROJECT_NUMBER="$(
  gh project list --owner "$OWNER" --format json --limit 200 \
    | jq -r --arg t "$PROJECT_TITLE" '.projects[] | select(.title == $t) | .number' \
    | head -n1
)"

if [[ -z "$PROJECT_NUMBER" ]]; then
  log "creating project"
  gh project create --owner "$OWNER" --title "$PROJECT_TITLE" >/dev/null
  PROJECT_NUMBER="$(
    gh project list --owner "$OWNER" --format json --limit 200 \
      | jq -r --arg t "$PROJECT_TITLE" '.projects[] | select(.title == $t) | .number' \
      | head -n1
  )"
  if [[ -z "$PROJECT_NUMBER" ]]; then
    echo "error: created project but can't find it via list — aborting" >&2
    exit 1
  fi
else
  log "project exists: #$PROJECT_NUMBER"
fi

################################################################################
# fields: create any that are missing
################################################################################
log "listing existing fields on project #$PROJECT_NUMBER"
EXISTING_FIELDS_JSON="$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 100)"
existing_field() {
  echo "$EXISTING_FIELDS_JSON" | jq -e --arg n "$1" '.fields[] | select(.name == $n)' >/dev/null 2>&1
}

create_single_select() {
  local name="$1" opts="$2"
  if existing_field "$name"; then
    log "field '$name' exists — skipping"
    return
  fi
  log "creating single-select field '$name'"
  gh project field-create "$PROJECT_NUMBER" --owner "$OWNER" \
    --name "$name" --data-type SINGLE_SELECT \
    --single-select-options "$opts" >/dev/null
}
create_simple_field() {
  local name="$1" type="$2"
  if existing_field "$name"; then
    log "field '$name' exists — skipping"
    return
  fi
  log "creating $type field '$name'"
  gh project field-create "$PROJECT_NUMBER" --owner "$OWNER" \
    --name "$name" --data-type "$type" >/dev/null
}

# "Pipeline Status" instead of "Status" — the latter is reserved by Projects v2.
create_single_select "Pipeline Status" \
  "new,tests-pending,dev-pending,validation-pending,pr-pending,pr-review-pending,merged-to-develop,rework,needs-human,cost-review-pending"
create_single_select "Agent" \
  "manager,tester,developer,pr-reviewer"
create_simple_field "Attempt"   "NUMBER"
create_simple_field "PR Number" "TEXT"
create_simple_field "Base SHA"  "TEXT"

################################################################################
# labels: create any that are missing
################################################################################
log "ensuring repo labels"
cd "$REPO_ROOT"

EXISTING_LABELS="$(gh label list --limit 200 --json name | jq -r '.[].name')"

ensure_label() {
  local name="$1" color="$2" desc="$3"
  if echo "$EXISTING_LABELS" | grep -Fxq "$name"; then
    log "label '$name' exists — skipping"
    return
  fi
  log "creating label '$name'"
  gh label create "$name" --color "$color" --description "$desc" >/dev/null
}

ensure_label "type:bug"      "d73a4a" "Bug fix"
ensure_label "type:feature"  "0075ca" "New feature"
ensure_label "type:chore"    "cfd3d7" "Maintenance"
ensure_label "type:docs"     "0052cc" "Documentation"
ensure_label "type:refactor" "a2eeef" "Refactor (no behavior change)"
ensure_label "scope:small"   "c2e0c6" "Small change"
ensure_label "scope:medium"  "fbca04" "Medium change"
ensure_label "scope:large"   "e99695" "Large change"
ensure_label "auto-pipeline" "5319e7" "Opt into the automated pipeline"

################################################################################
# discover ids
################################################################################
log "running discover-ids to write .pipeline-config.json"
PIPELINE_OWNER="$OWNER" "$SCRIPT_DIR/discover-ids.sh" "$PROJECT_NUMBER" "$OWNER"

log "done"
echo >&2
echo "Next steps:" >&2
echo "  1. Review and commit .pipeline-config.json:" >&2
echo "       git checkout -b chore/pipeline-phase-1-setup" >&2
echo "       git add .pipeline-config.json scripts/" >&2
echo "       git commit -m 'chore: add pipeline phase 1 scripts + config'" >&2
echo "  2. Create a test issue, label it auto-pipeline, add it to the project." >&2
echo "  3. Smoke-test:" >&2
echo "       scripts/set-field.sh <issue> 'Pipeline Status' new" >&2
echo "       scripts/get-field.sh <issue> 'Pipeline Status'" >&2
echo "       scripts/next-ticket.sh" >&2
