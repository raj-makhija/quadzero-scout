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
| `create-branch.sh` | `<ticket> <slug>` — branch from `develop` HEAD using `<type>/ticket-<N>-<slug>`. Pushes to origin. Records Base SHA on the ticket. |
| `check-staleness.sh` | `<pr> <base-sha>` — file-overlap check. Exit 0 clean, exit 1 stale. |
| `open-pr.sh` | `<ticket> <branch> <title>` — opens PR targeting `develop`, writes PR number to ticket. |
| `merge-pr.sh` | `<ticket> <pr>` — staleness check; clean → squash-merge + `merged-to-develop`; stale → close PR + `rework`. |

### Phase 3 — manager + dummy agents

| Script | Purpose |
|---|---|
| `manager.sh` | `[<ticket>]` — advance one ticket by one state transition. |
| `dummy-tester.sh` | `<ticket> write\|validate` — simulated tester. |
| `dummy-developer.sh` | `<ticket> implement\|open_pr\|rework` — simulated developer, does real git work. |
| `dummy-pr-reviewer.sh` | `<ticket>` — simulated reviewer; delegates to `merge-pr.sh`. |

### Phase 4 — QA + prod (human-invoked)

| Script | Purpose |
|---|---|
| `qa-deploy.sh` | `<sha>` — checkout qa, fast-forward merge SHA, push (Amplify), `serverless deploy --stage qa`. |
| `qa-approve.sh` | `<sha>` — advance the `frontier` tag to SHA (refuses to move backward unless `PIPELINE_FORCE=1`). |
| `qa-reject.sh` | `<sha> <reason> [ticket]` — reopen ticket, clear Base SHA + PR Number, set `rework`. Infers ticket from commit if not given. |
| `prod-release.sh` | `[<sha>]` — safety-check target is at-or-before `frontier`, merge to main, push, `serverless deploy --stage prod`. Defaults to `frontier` if no SHA. |

### Shared

| Script | Purpose |
|---|---|
| `_pipeline-lib.sh` | Shared helpers (config loader, field lookup, item-id resolution, label-type extraction, clean-tree check, slug-from-title). Not executed directly. |

## State machine (Belt 1 — agents to develop)

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
                                                       validation-pending  needs-human
```

Three terminal/blocked states: `merged-to-develop`, `needs-human`,
`cost-review-pending`. `next-ticket.sh` skips all three.

## Release model (Belts 2 + 3 — QA and prod)

```
develop HEAD moves forward as agents merge tickets.
   │
   ├──► qa-deploy.sh <sha>   ──►  qa branch   ──►  Amplify + serverless (stage=qa)
   │
   │    (human tests on QA)
   │         │
   │         ├─ approve ──► qa-approve.sh <sha>   ──►  `frontier` tag moves to sha
   │         │
   │         └─ reject  ──► qa-reject.sh <sha> <reason>
   │                          → ticket reopened, Pipeline Status = rework,
   │                            Base SHA + PR Number cleared, pipeline retries
   │
   └──► prod-release.sh [<sha>]  (default: frontier)
              safety: refuses if sha > frontier
              → main branch fast-forwards → Amplify + serverless (stage=prod)
```

- **Agents never idle waiting for humans.** They merge to `develop` as soon
  as the reviewer agent approves.
- **QA is decoupled from `develop`.** QA runs against a specific SHA the
  human points to, not against `develop` HEAD.
- **The `frontier` tag is a watermark.** Prod can only deploy at or before
  frontier. Agents pile work up on develop; human walks the frontier
  forward at their own pace.

## Examples

### Walk a single ticket with the manager (Phase 3 dummies)

```bash
scripts/manager.sh <ticket>   # new → tests-pending
scripts/manager.sh <ticket>   # tests-pending → dev-pending
scripts/manager.sh <ticket>   # dev-pending → validation-pending (branch + commit pushed)
scripts/manager.sh <ticket>   # validation-pending → pr-pending
scripts/manager.sh <ticket>   # pr-pending → pr-review-pending (PR opened)
scripts/manager.sh <ticket>   # pr-review-pending → merged-to-develop (squash merged)
```

### Walk a SHA from develop through QA to prod

```bash
# Pick a SHA you want to push to QA (e.g., the latest develop HEAD)
SHA=$(git rev-parse origin/develop)

# Deploy to QA (Amplify picks up the qa push; serverless deploys backend)
scripts/qa-deploy.sh "$SHA"

# Manually test the QA environment...

# Approve: advances the frontier tag
scripts/qa-approve.sh "$SHA"

# Release to prod (defaults to frontier)
scripts/prod-release.sh
```

### Reject a QA'd SHA

```bash
scripts/qa-reject.sh "$SHA" "Login redirect loops on Safari iOS"
# Ticket reopened, Pipeline Status = rework, Base SHA + PR Number cleared
# Next manager.sh pass will re-branch fresh from develop HEAD
```

### Dry-run a deploy (no AWS cost)

```bash
PIPELINE_SKIP_DEPLOY=1 scripts/qa-deploy.sh "$SHA"
```

The branch topology changes (qa is fast-forwarded + pushed, Amplify still
fires on the push), but the `serverless deploy` is skipped.

### Ask "what's next"

```bash
scripts/next-ticket.sh
# 42  tests-pending  tester  Fix login redirect loop
```

## Adding an issue to the project

Issues labeled `auto-pipeline` land on the project automatically via the
Projects v2 auto-add workflow. If an issue isn't on the board, add manually:

```bash
gh project item-add <project-number> --owner raj-makhija \
  --url https://github.com/raj-makhija/quadzero-scout/issues/<N>
```

The project number is in `.pipeline-config.json` under `.project.number`.

## Environment overrides

| Variable | Default | Effect |
|---|---|---|
| `PIPELINE_OWNER` | `raj-makhija` | Project owner for discover-ids.sh / setup-pipeline.sh. |
| `PIPELINE_PROJECT_TITLE` | `Quadzero Scout Pipeline` | Project title for setup-pipeline.sh lookup/create. |
| `PIPELINE_MAX_ATTEMPTS` | `3` | Rework attempts before manager.sh escalates to `needs-human`. |
| `PIPELINE_SKIP_DEPLOY` | unset | If `1`, qa-deploy.sh / prod-release.sh skip the `serverless deploy` step. |
| `PIPELINE_FORCE` | unset | If `1`, qa-approve.sh allows moving the frontier tag backward. |
| `PL_STATE_FIELD` | `Pipeline Status` | Field name used for the pipeline state machine. |

## Re-running `discover-ids.sh`

Any time you rename a field, add an option to a single-select, or otherwise
change the project schema, re-run:

```bash
scripts/discover-ids.sh $(jq -r .project.number .pipeline-config.json)
```

Commit the updated `.pipeline-config.json`.

## Phase 5 — Actions scheduler

The workflow at `.github/workflows/pipeline-manager.yml` runs `manager.sh`
in a drain-queue loop. One Actions run takes any actionable ticket from
its current state through every transition until it hits a terminal state
or the queue empties.

### Triggers

| Source | When it fires |
|---|---|
| `cron: '*/5 * * * *'` | Every 5 minutes — safety net for missed events |
| `issues: [labeled, opened]` | New ticket gets `auto-pipeline` label, or new ticket created |
| `pull_request: [opened, closed]` | Developer agent's PR is created or merged/closed |
| `repository_dispatch: [pipeline-tick]` | Anyone fires a `pipeline-tick` dispatch |
| `workflow_dispatch` | Manual trigger from Actions UI or `gh workflow run`, optional ticket override |

### Loop behaviour

When the workflow runs without a specific ticket arg, it loops:

```
while next-ticket.sh has output:
  manager.sh    # advance one transition
  sleep 3       # let GraphQL state propagate
```

Bounded by 25 iterations or `timeout-minutes: 10`. With a `ticket` input
provided via `workflow_dispatch`, only ONE transition happens — useful for
debugging stuck tickets without the loop racing past your inspection point.

### Human-script kicks

Each Phase 4 script ends with a workflow kick so pipeline-relevant state
changes get picked up immediately rather than waiting for the next cron:

- `qa-deploy.sh` — defensive kick (pipeline usually idle; keeps model consistent)
- `qa-approve.sh` — defensive kick
- `qa-reject.sh` — **important** — pipeline must pick up the new `rework` state
- `prod-release.sh` — defensive kick

The kick is non-fatal: if it fails (auth issue, network), the cron will
catch up within ~5 min.

### Setup

1. Create the `PIPELINE_TOKEN` classic PAT (scopes: `repo`, `workflow`,
   `project`) — fine-grained PATs don't expose user-level Projects v2
   permission. Store as a repo secret:
   ```bash
   gh secret set PIPELINE_TOKEN
   ```
2. Confirm the default branch is `develop` (otherwise scheduled runs and
   `gh workflow run` won't find the workflow file):
   ```bash
   gh api repos/raj-makhija/quadzero-scout | jq .default_branch
   # expect: "develop"
   ```

### Manual trigger

```bash
gh workflow run pipeline-manager.yml                  # auto-pick + drain
gh workflow run pipeline-manager.yml -f ticket=42     # single transition on #42
```

### Kill-switch

Actions tab → **Pipeline Manager** → **...** → **Disable workflow**.

### Concurrency

`concurrency: pipeline-manager` serializes runs. If a kick fires while the
previous run is still draining, the second run queues and starts after.

## Environment overrides

| Variable | Default | Effect |
|---|---|---|
| `PIPELINE_OWNER` | `raj-makhija` | Project owner for setup-pipeline.sh / discover-ids.sh. |
| `PIPELINE_PROJECT_TITLE` | `Quadzero Scout Pipeline` | Project title for setup-pipeline.sh lookup/create. |
| `PIPELINE_MAX_ATTEMPTS` | `3` | Rework attempts before manager.sh escalates to `needs-human`. |
| `PIPELINE_SKIP_DEPLOY` | unset | If `1`, qa-deploy.sh / prod-release.sh skip the `serverless deploy` step. |
| `PIPELINE_FORCE` | unset | If `1`, qa-approve.sh allows moving the frontier tag backward. |
| `PL_STATE_FIELD` | `Pipeline Status` | Field name used for the pipeline state machine. |

## Re-running `discover-ids.sh`

Any time you rename a field, add an option to a single-select, or otherwise
change the project schema, re-run:

```bash
scripts/discover-ids.sh $(jq -r .project.number .pipeline-config.json)
```

Commit the updated `.pipeline-config.json`.
