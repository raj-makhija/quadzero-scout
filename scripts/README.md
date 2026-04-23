# Pipeline Scripts

Shell scripts that implement the automated Claude Code pipeline described in
the project's pipeline design handoff. They're intended to be called both
manually (during bring-up and when debugging) and from agent prompts / a
GitHub Actions scheduler.

## Prerequisites

- **`gh` CLI** authenticated with scopes `project`, `read:project`, `repo`.
  Check with `gh auth status`; refresh with
  `gh auth refresh -s project,read:project,repo`.
- **`jq`** for JSON parsing.
- Run from a shell that can execute `.sh` files — Git Bash, WSL, or Linux.

## One-time setup

```bash
scripts/setup-pipeline.sh
```

Idempotent. Creates (or adopts) the "Quadzero Scout Pipeline" Projects v2
board, adds custom fields (`Pipeline Status`, `Agent`, `Attempt`, `PR
Number`, `Base SHA`), adds labels (`type:*`, `scope:*`, `auto-pipeline`),
and runs discover-ids to write `.pipeline-config.json` at the repo root.
Commit the generated file — downstream scripts read it.

> **Field naming note:** We use `Pipeline Status` instead of the design doc's
> `Status` because Projects v2 reserves the latter name for its built-in
> default field.

## Scripts

### Phase 1 — state helpers

| Script | Purpose |
|---|---|
| `setup-pipeline.sh` | Idempotent initial setup: project + fields + labels + config. |
| `discover-ids.sh` | Fetches opaque Projects v2 IDs, writes `.pipeline-config.json`. Re-run if you add/rename fields or options. |
| `set-field.sh` | `<issue> <field> <value>` — update a project field on an issue. Pass `""` as value to clear. |
| `get-field.sh` | `<issue> <field>` — read a project field value. |
| `next-ticket.sh` | Lists actionable tickets (has `auto-pipeline` label, `Pipeline Status` is not terminal/blocked). |

### Phase 2 — git operations

| Script | Purpose |
|---|---|
| `create-branch.sh` | `<ticket> <slug>` — branch from `develop` HEAD using `<type>/ticket-<N>-<slug>` (type inferred from ticket's `type:*` label). Pushes to origin. Records Base SHA on the ticket. |
| `check-staleness.sh` | `<pr> <base-sha>` — compares files changed in the PR against files changed on `develop` since `base-sha`. Exit 0 clean, exit 1 stale (prints overlap). |
| `open-pr.sh` | `<ticket> <branch> <title>` — opens a PR against `develop`, writes PR number to ticket. |
| `merge-pr.sh` | `<ticket> <pr>` — runs staleness check. Clean → squash-merge + mark `merged-to-develop`. Stale → close PR, clear Base SHA + PR Number, set `rework`. |

### Shared

| Script | Purpose |
|---|---|
| `_pipeline-lib.sh` | Shared helpers (config loader, field lookup, item-id resolution, label-type extraction, clean-tree check). Not executed directly. |

## Examples

### Move a ticket through early states (manual drive)

```bash
scripts/set-field.sh 42 "Pipeline Status" new
scripts/set-field.sh 42 "Agent" tester
scripts/set-field.sh 42 "Attempt" 1
scripts/set-field.sh 42 "Base SHA" "$(git rev-parse origin/develop)"

scripts/get-field.sh 42 "Pipeline Status"   # -> new
scripts/get-field.sh 42 "Base SHA"          # -> abc123...
```

### Walk a ticket through the Phase 2 happy path

```bash
# Branch from develop for ticket #42, slug "add-foo"
BRANCH=$(scripts/create-branch.sh 42 add-foo)
# Developer work happens here: edit files, commit, push
# ...
# Open PR
PR=$(scripts/open-pr.sh 42 "$BRANCH" "feat: add foo (#42)")
# Merge — will refuse and route to rework if stale
scripts/merge-pr.sh 42 "$PR"
```

### Ask "what's next"

```bash
scripts/next-ticket.sh
# 42  tests-pending  tester  Fix login redirect loop
```

## Adding an issue to the project

Issues labeled `auto-pipeline` land on the project automatically (via the
Projects v2 "Auto-add to project" workflow, configured to point at
`raj-makhija/quadzero-scout`). If for some reason an issue isn't on the
board, add it manually:

```bash
gh project item-add <project-number> --owner raj-makhija \
  --url https://github.com/raj-makhija/quadzero-scout/issues/<N>
```

The project number is in `.pipeline-config.json` under `.project.number`.

## Re-running `discover-ids.sh`

Any time you rename a field, add an option to a single-select, or otherwise
change the project schema, re-run:

```bash
scripts/discover-ids.sh $(jq -r .project.number .pipeline-config.json)
```

Commit the updated `.pipeline-config.json`.
