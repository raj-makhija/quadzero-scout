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

> **Field naming note:** We use `Pipeline Status` instead of the design doc's
> `Status` because Projects v2 reserves the latter name for its built-in
> default field.

## Scripts

### Phase 1 — state helpers

| Script | Purpose |
|---|---|
| `setup-pipeline.sh` | Idempotent initial setup: project + fields + labels + config. |
| `discover-ids.sh` | Fetches opaque Projects v2 IDs, writes `.pipeline-config.json`. Re-run if you add/rename fields or options. |
| `set-field.sh` | `<issue> <field> <value>` — update a project field. Pass `""` as value to clear. |
| `get-field.sh` | `<issue> <field>` — read a project field value. |
| `next-ticket.sh` | Lists actionable tickets (has `auto-pipeline` label, `Pipeline Status` is not terminal/blocked). |

### Phase 2 — git operations

| Script | Purpose |
|---|---|
| `create-branch.sh` | `<ticket> <slug>` — branch from `develop` HEAD using `<type>/ticket-<N>-<slug>` (type inferred from ticket's `type:*` label). Pushes to origin. Records Base SHA on the ticket. |
| `check-staleness.sh` | `<pr> <base-sha>` — compares files changed in the PR against files changed on `develop` since `base-sha`. Exit 0 clean, exit 1 stale (prints overlap). |
| `open-pr.sh` | `<ticket> <branch> <title>` — opens a PR against `develop`, writes PR number to ticket. |
| `merge-pr.sh` | `<ticket> <pr>` — runs staleness check. Clean → checkout develop + squash-merge + mark `merged-to-develop`. Stale → close PR, clear Base SHA + PR Number, delete local branch, set `rework`. |

### Phase 3 — manager + dummy agents

These exercise the full state machine without invoking Claude. Swap in
real agent invocations once the plumbing is trusted.

| Script | Purpose |
|---|---|
| `manager.sh` | `[<ticket>]` — advance one ticket by one state transition. Dumb router over `Pipeline Status`. Auto-picks from `next-ticket.sh` if no arg. |
| `dummy-tester.sh` | `<ticket> write\|validate` — simulated tester: posts a comment, flips state. |
| `dummy-developer.sh` | `<ticket> implement\|open_pr\|rework` — simulated developer: does real git work (branches + commits + PRs) via Phase 2 scripts. |
| `dummy-pr-reviewer.sh` | `<ticket>` — simulated reviewer: posts approval, delegates to `merge-pr.sh` for the terminal step. |

### Shared

| Script | Purpose |
|---|---|
| `_pipeline-lib.sh` | Shared helpers (config loader, field lookup, item-id resolution, label-type extraction, clean-tree check, slug-from-title). Not executed directly. |

## State machine

```
               ┌─ manager primes
               ▼
            new → tests-pending → dev-pending → validation-pending → pr-pending
                   (tester)       (developer)    (tester)            (developer)
                                                                          │
                                                                          ▼
                                                                    pr-review-pending
                                                                     (pr-reviewer)
                                                                          │
                                             ┌────────────────────────────┴──┐
                                     clean merge                       stale overlap
                                             │                              │
                                             ▼                              ▼
                                      merged-to-develop                  rework
                                                                           │
                                                                ┌──────────┤
                                                     attempt ≤ 3          else
                                                                │           │
                                                                ▼           ▼
                                                 (manager bumps Attempt  needs-human
                                                  & calls developer      (terminal)
                                                  rework mode)
                                                                │
                                                                ▼
                                                       validation-pending
                                                         (back to tester)
```

Three terminal/blocked states: `merged-to-develop`, `needs-human`,
`cost-review-pending`. `next-ticket.sh` skips all three.

## Examples

### Walk a single ticket with the manager

```bash
# Create a ticket labeled auto-pipeline + type:chore. It lands on the
# project automatically via the auto-add workflow. Then:
scripts/manager.sh <ticket>   # new → tests-pending
scripts/manager.sh <ticket>   # tests-pending → dev-pending
scripts/manager.sh <ticket>   # dev-pending → validation-pending (branch + commit pushed)
scripts/manager.sh <ticket>   # validation-pending → pr-pending
scripts/manager.sh <ticket>   # pr-pending → pr-review-pending (PR opened)
scripts/manager.sh <ticket>   # pr-review-pending → merged-to-develop (squash merged)
```

Or loop until terminal:

```bash
for _ in $(seq 1 20); do
  S=$(scripts/get-field.sh "$TICKET" "Pipeline Status")
  case "$S" in merged-to-develop|needs-human|cost-review-pending) break ;; esac
  scripts/manager.sh "$TICKET"
  sleep 1
done
```

### Drive individual scripts manually

```bash
scripts/set-field.sh 42 "Pipeline Status" new
scripts/set-field.sh 42 "Agent" tester
scripts/set-field.sh 42 "Attempt" 1
scripts/set-field.sh 42 "Base SHA" "$(git rev-parse origin/develop)"

scripts/get-field.sh 42 "Pipeline Status"   # -> new
scripts/get-field.sh 42 "Base SHA"          # -> abc123...
```

### Phase 2 happy path (manual)

```bash
BRANCH=$(scripts/create-branch.sh 42 add-foo)
# developer work happens here
PR=$(scripts/open-pr.sh 42 "$BRANCH" "feat: add foo (#42)")
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
`raj-makhija/quadzero-scout`). If an issue isn't on the board, add manually:

```bash
gh project item-add <project-number> --owner raj-makhija \
  --url https://github.com/raj-makhija/quadzero-scout/issues/<N>
```

The project number is in `.pipeline-config.json` under `.project.number`.

## Environment overrides

| Variable | Default | Effect |
|---|---|---|
| `PIPELINE_OWNER` | `raj-makhija` | Project owner for discover-ids.sh / setup-pipeline.sh |
| `PIPELINE_PROJECT_TITLE` | `Quadzero Scout Pipeline` | Project title lookup/create |
| `PIPELINE_MAX_ATTEMPTS` | `3` | Rework attempts before manager.sh escalates to `needs-human` |
| `PL_STATE_FIELD` | `Pipeline Status` | Field name used for the pipeline state machine |

## Re-running `discover-ids.sh`

Any time you rename a field, add an option to a single-select, or otherwise
change the project schema, re-run:

```bash
scripts/discover-ids.sh $(jq -r .project.number .pipeline-config.json)
```

Commit the updated `.pipeline-config.json`.
