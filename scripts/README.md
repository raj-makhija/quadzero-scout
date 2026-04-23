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

| Script | Purpose |
|---|---|
| `setup-pipeline.sh` | Idempotent initial setup: project + fields + labels + config. |
| `discover-ids.sh` | Fetches opaque Projects v2 IDs, writes `.pipeline-config.json`. Re-run if you add/rename fields or options. |
| `set-field.sh` | `<issue> <field> <value>` — update a project field on an issue. |
| `get-field.sh` | `<issue> <field>` — read a project field value. |
| `next-ticket.sh` | Lists actionable tickets (has `auto-pipeline` label, `Pipeline Status` is not terminal/blocked). |
| `_pipeline-lib.sh` | Shared helpers; not executed directly. |

## Examples

```bash
# Move a ticket through early states (manual drive, for testing).
scripts/set-field.sh 42 "Pipeline Status" new
scripts/set-field.sh 42 "Agent" tester
scripts/set-field.sh 42 "Attempt" 1
scripts/set-field.sh 42 "Base SHA" $(git rev-parse origin/develop)

# Read back.
scripts/get-field.sh 42 "Pipeline Status"   # -> new
scripts/get-field.sh 42 "Base SHA"           # -> abc123...

# Ask the manager (once it exists) "what's next".
scripts/next-ticket.sh
# 42  tests-pending  tester  Fix login redirect loop
```

## Adding an issue to the project

Issues must be **added to the project** before the scripts can see them.
From Git Bash:

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
