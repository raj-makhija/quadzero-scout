# CI/CD Pipeline — Quadzero Scout

The autonomous CI/CD pipeline that takes a GitHub Issue from creation
through tested, reviewed, and merged code on `develop`, then provides
human-driven scripts to promote `develop` -> `qa` -> `main`.

This document is the canonical reference for operating, extending, and
debugging the pipeline. It assumes you've read `CLAUDE.md` and have
familiarity with the repo layout.

---

## 1. Overview

A ticket labeled `auto-pipeline` gets driven autonomously through this
state machine by four Claude-powered agents:

```
new
  -> tests-pending      (tester writes a behavior test plan)
  -> dev-pending        (developer implements on a fresh branch)
  -> validation-pending (tester validates the diff vs the plan)
  -> pr-pending         (developer opens a PR)
  -> pr-review-pending  (pr-reviewer reviews the PR)
  -> merged-to-develop  TERMINAL: change is on develop
```

Branch points:

```
  validation-pending  --tester FAIL-->  rework  -> dev-pending  (Attempt+1)
  pr-review-pending   --reviewer REQUEST_CHANGES-->  rework  -> dev-pending
  pr-review-pending   --merge-pr.sh stale-->  rework  (overlap with develop)
  any-state           --3-strike (Attempt > MAX_ATTEMPTS)-->  needs-human
  developer agent     --AWS/LLM cost change-->  cost-review-pending
```

`needs-human` and `cost-review-pending` are terminal-blocked-on-human;
they're excluded from the actionable queue until a human resolves them.

Beyond `develop`, promotion is **human-driven** by design:

- `scripts/qa-deploy.sh <sha>` -> deploy a develop-reachable SHA to QA (frontend via Amplify auto-deploy from qa-branch push, backend via npx serverless deploy --stage qa)
- `scripts/qa-approve.sh <sha>` -> human verdict after QA testing;
  advances the `frontier` git tag
- `scripts/qa-reject.sh <sha> <reason> [ticket]` -> bounces back; reopens issue, routes to rework. Ticket inferred from commit message if omitted
- `scripts/prod-release.sh <SHA>` -> ships to prod (must be at or
  before the `frontier` tag)

---

## 2. Architecture

### 2.1 The four agents

Each agent is a bash script in `scripts/` that, when its env var is set
to `claude`, dispatches to the Claude Code CLI in headless mode. The
script names retain the `dummy-` prefix for stable manager.sh references
even though most are now real Claude.

| Agent | Script | Env var | Role |
|---|---|---|---|
| Manager | `scripts/manager.sh` | (always shell, no LLM) | Dumb router over Pipeline Status; dispatches to the right agent for the current state |
| Tester | `scripts/dummy-tester.sh` | `PIPELINE_TESTER_AGENT=claude` | `write` mode: posts test plan. `validate` mode: emits VERDICT: PASS/FAIL on the dev's diff |
| Developer | `scripts/dummy-developer.sh` | `PIPELINE_DEVELOPER_AGENT=claude` | `implement`/`rework` modes: writes code on a branch. `open_pr` mode: opens the PR (no LLM) |
| PR-Reviewer | `scripts/dummy-pr-reviewer.sh` | `PIPELINE_PR_REVIEWER_AGENT=claude` | Read-only review of the PR; emits VERDICT: APPROVE or REQUEST_CHANGES |

The headless wrapper is `scripts/_agent-claude.sh`. It runs
`claude --print --dangerously-skip-permissions` with a 600s timeout
and accepts either `ANTHROPIC_API_KEY` (API billing) or
`CLAUDE_CODE_OAUTH_TOKEN` (Pro/Max subscription, from `claude setup-token`).

### 2.2 GitHub Actions workflow

`.github/workflows/pipeline-manager.yml` is the single workflow.
It runs `manager.sh` in a drain loop bounded by 25 iterations and
30 minutes. One Actions run can take a fresh ticket from `new` to
`merged-to-develop`.

Triggers (in priority order):

1. `repository_dispatch` (event type `pipeline-tick`) -- fired by
   human-driven scripts after they make state changes
2. `workflow_dispatch` (manual `gh workflow run`) -- includes optional
   `ticket` input for single-step advancement
3. `issues.labeled` -- fires when a label is added to an issue (every
   add fires a separate event, so 2 labels = 2 events)
4. `schedule` (`*/5 * * * *`) -- safety net cron in case all event
   triggers missed

Concurrency: `group: pipeline-manager`, `cancel-in-progress: false`.
Concurrent triggers serialize rather than cancel, so adding 2 labels
to a new ticket produces 2 sequential runs (the first walks the ticket;
the second drains 0 iterations).

`issues.opened` was intentionally removed -- it fired before the
auto-add-to-project automation completed, producing a doomed 1-second
phantom run on every new ticket. `issues.labeled` covers the same
trigger window because the auto-pipeline label is added immediately
after open.

### 2.3 GitHub Project (Projects v2)

Project: "Quadzero Scout Pipeline" under `raj-makhija`. Custom fields:

| Field | Type | Purpose |
|---|---|---|
| Pipeline Status | single-select | The state-machine state. Drives the manager router. Named `Pipeline Status` (NOT `Status`) because Projects v2 reserves the bare name `Status` for its built-in field |
| Agent | single-select | Which agent should pick up the ticket next. Mostly cosmetic; manager dispatches based on Pipeline Status |
| Attempt | number | Rework counter. Manager increments on each rework dispatch; escalates to needs-human when > `PIPELINE_MAX_ATTEMPTS` (default 3) |
| Base SHA | text | Develop tip the dev branch was created from. Used for staleness detection in `merge-pr.sh` |
| PR Number | text | Set by `open-pr.sh`, cleared on rework |

Pipeline Status options:
- `new` (or unset; treated equivalently)
- `tests-pending`
- `dev-pending`
- `validation-pending`
- `pr-pending`
- `pr-review-pending`
- `rework`
- `merged-to-develop` (terminal)
- `needs-human` (terminal-blocked)
- `cost-review-pending` (terminal-blocked)

### 2.4 Labels

Required for pipeline pickup:
- `auto-pipeline` -- opt-in to autonomous processing
- exactly one `type:*` -- one of `type:feature`, `type:bugfix`,
  `type:chore`, `type:docs`, `type:refactor`. Branch naming
  derives from this (`<type>/ticket-<N>-attempt-<K>`)

Optional/orthogonal:
- `priority:critical` -- carried by the hotfix issue template; not
  consumed by the pipeline directly

Issue templates under `.github/ISSUE_TEMPLATE/` auto-apply
`auto-pipeline` and the right `type:*` so users don't have to remember.

### 2.5 Configuration file

`.pipeline-config.json` at the repo root. Holds opaque GraphQL IDs
discovered by `scripts/discover-ids.sh`:

```json
{
  "owner": "raj-makhija",
  "project": { "id": "PVT_..." },
  "fields": {
    "Pipeline Status": { "id": "...", "dataType": "SINGLE_SELECT", "options": {...} },
    ...
  }
}
```

`scripts/_pipeline-lib.sh::pl_load_config` reads it. Field IDs are
opaque base64 -- never edit by hand.

---

## 3. Authentication

### 3.1 PIPELINE_TOKEN (GitHub PAT)

A **classic** Personal Access Token with scopes `repo`, `workflow`,
`project`. Stored as a repo secret named `PIPELINE_TOKEN`.

Important: fine-grained PATs **don't work** for user-owned Projects v2.
They expose only `organization_projects`, not the user-level project
permission needed to mutate items. Use a classic PAT.

### 3.2 CLAUDE_CODE_OAUTH_TOKEN

OAuth token from `claude setup-token` on the user's laptop. Ties
agent invocations to the user's Claude.ai Pro/Max subscription. Stored
as a repo secret `CLAUDE_CODE_OAUTH_TOKEN`.

Alternative: `ANTHROPIC_API_KEY` for API billing. The wrapper
(`scripts/_agent-claude.sh`) accepts either.

### 3.3 Default branch

`develop` must be the GitHub default branch -- scheduled workflows
only fire from the default branch, and the auto-add-to-project
automation also keys off it. Set via:

```bash
gh api -X PATCH repos/raj-makhija/quadzero-scout -f default_branch=develop
```

(Note: omit the leading slash on Git Bash to avoid MSYS path mangling.)

---

## 4. Daily workflow — filing a ticket

The simplest path is via an issue template (web UI: New Issue ->
Bug Report / Feature Request / Hotfix). The templates auto-apply
labels.

CLI alternative:

```bash
gh issue create \
  --title "your title" \
  --body "Acceptance:
- criterion 1
- criterion 2
- ...
- Conventional commit." \
  --label "auto-pipeline,type:feature" \
  --project "Quadzero Scout Pipeline"
```

What happens next, autonomously:

1. `issues.labeled` fires the workflow (twice, once per label add;
   serialized by concurrency)
2. Manager primes ticket: Pipeline Status -> `tests-pending`,
   Agent -> `tester`, Attempt -> 1
3. Tester writes a `[tester:test-plan]` comment with acceptance items
   broken down + edge cases
4. Manager dispatches developer (`implement` mode): creates branch
   `<type>/ticket-N-attempt-1`, claude implements, commits, pushes
5. Manager dispatches tester (`validate` mode): checks out the branch,
   reads diff, posts `[tester:validation-report]` with per-item table
   ending in `VERDICT: PASS` or `VERDICT: FAIL`
6. **PASS path**: developer opens PR, reviewer reviews, `merge-pr.sh`
   squash-merges to develop. Issue auto-closes.
7. **FAIL path**: dev branch deleted, Pipeline Status -> `rework`,
   Attempt incremented. Developer rework mode runs on a fresh
   `attempt-K+1` branch, reads the FAIL feedback in comments, retries.
8. **3-strike**: after `PIPELINE_MAX_ATTEMPTS` failed reworks,
   manager comments and sets Pipeline Status to `needs-human`.

Empirical drain times:

| Ticket type | Drain time |
|---|---|
| Single-line README change | ~3-4 min |
| Multi-criterion documentation | ~4-5 min |
| Real multi-file feature (3+ files, backend + frontend) | ~14 min |
| FAIL + rework + PASS cycle on same ticket | ~7-8 min |

The 14-min real-feature drain is dominated by the developer agent's
implementation step (~5-8 min for multi-file code generation + tests).

---

## 5. CLI reference

### 5.1 Filing & monitoring

```bash
# Create an auto-pipeline ticket via CLI
gh issue create \
  --title "..." --body "..." \
  --label "auto-pipeline,type:chore" \
  --project "Quadzero Scout Pipeline"

# List actionable tickets the pipeline currently sees
scripts/next-ticket.sh

# Inspect a specific ticket's pipeline state
scripts/get-field.sh <N> "Pipeline Status"
scripts/get-field.sh <N> "Attempt"
scripts/get-field.sh <N> "Base SHA"
scripts/get-field.sh <N> "PR Number"

# Comment thread (the agents post here)
gh issue view <N> --comments

# Recent workflow runs
gh run list --workflow pipeline-manager.yml --limit 5

# Tail the latest run live
gh run watch

# Filter a specific run for the agent boundaries
gh run view <RUN_ID> --log | grep -E "manager:|==>|VERDICT:|merged|rework|FAIL|error" | head -100

# Manual kick (e.g. to drain after parking tickets)
gh workflow run pipeline-manager.yml

# Single-step a specific ticket without draining the rest of the queue
gh workflow run pipeline-manager.yml -f ticket=<N>
```

### 5.2 Manual state surgery

When the pipeline gets stuck and you need to push it manually.

```bash
# Set Pipeline Status (single-select)
scripts/set-field.sh <N> "Pipeline Status" rework
scripts/set-field.sh <N> "Pipeline Status" needs-human

# Set Attempt (number)
scripts/set-field.sh <N> "Attempt" 1

# Set Base SHA (text); pass empty string to clear
scripts/set-field.sh <N> "Base SHA" "$(git rev-parse origin/develop)"
scripts/set-field.sh <N> "Base SHA" ""

# Park stale tickets so they stop blocking the queue
for N in 25 35 37 40 41; do
  scripts/set-field.sh $N "Pipeline Status" needs-human
done
```

### 5.3 Promotion to QA / prod (human-in-the-loop)

```bash
# After a ticket merges to develop, deploy its merge SHA to QA
scripts/qa-deploy.sh <SHA>

# Human tests in QA. If acceptable:
scripts/qa-approve.sh <SHA>
# This advances the `frontier` git tag to the QA-approved SHA.

# If QA finds issues:
scripts/qa-reject.sh <SHA> "describe what's wrong"
# This routes the ticket back to rework so the dev agent can fix.

# Ship a frontier-or-earlier SHA to prod
scripts/prod-release.sh <SHA>
```

The `frontier` tag is the safety mechanism: prod can only release
SHAs at or before frontier. This prevents shipping un-QA'd code.

### 5.4 Diagnostics & recovery

```bash
# Find issue numbers across states
gh issue list --label auto-pipeline --state all --limit 10

# Cross-check: which project items exist for a given issue?
gh issue view <N> --json projectItems \
  -q '.projectItems[] | {project: .title, status: .status}'

# Project enumeration (note: can be empty due to GitHub API quirk;
# see Section 7. Use next-ticket.sh as the authoritative source.)
gh project item-list 1 --owner raj-makhija --format json | \
  jq '.items | length'

# Branch hygiene
git branch -r | grep ticket-<N>
git fetch --prune

# Force-delete a stuck remote branch
git push origin --delete <branch>
```

---

### 5.5 Web-only operation via labels (no CLI)

Every human-in-the-loop operation can be triggered by adding a
`pipeline:*` label to a ticket. The `pipeline-commands.yml` workflow
fires on `issues.labeled`, dispatches the appropriate action, posts a
result comment to the ticket, and removes the label so the action
can be re-fired later.

**Available labels:**

| Label | What happens | Param needed |
|---|---|---|
| `pipeline:qa-deploy` | Deploy ticket's merge SHA to QA (Amplify auto-deploys frontend; serverless deploys backend) | none — SHA inferred |
| `pipeline:qa-approve` | Advance `frontier` git tag to merge SHA | none |
| `pipeline:qa-reject` | Re-open ticket, route to rework with reason | reason — read from latest non-bracket comment |
| `pipeline:prod-release` | Ship merge SHA to `main` (must be at or before frontier) | none |
| `pipeline:approve-cost` | Unblock cost-review-pending ticket; post `[cost-approved]` marker; route back to dev-pending | none |
| `pipeline:reject-cost` | Reject cost change; park at needs-human | reason — from latest comment |
| `pipeline:retry` | Reset to rework, Attempt=1, clear Base SHA + PR Number | none |
| `pipeline:park` | Halt processing; set Pipeline Status=needs-human | none |
| `pipeline:show-status` | Bot replies with current Pipeline Status / Agent / Attempt / Base SHA / PR Number | none |

**Why labels rather than slash commands**: GitHub's label picker is a
dropdown with predefined options — no typo risk on the command name.
Labels also live visibly on the ticket while the action runs.

**For the two commands that need a reason** (`pipeline:qa-reject`,
`pipeline:reject-cost`):

1. Write the reason as a normal issue comment first (e.g. "the LWD
   field doesn't pre-fill on re-open").
2. Add the label.

The workflow reads the most recent comment that does NOT start with
`[` (i.e. not a bot or marker comment) and uses that as the reason.
If no human comment exists, the workflow posts a friendly error and
asks you to write one first.

**One-time label setup** (only run when bootstrapping a fresh repo;
labels persist forever once created):

```bash
gh label create "pipeline:qa-deploy"     --color "0E8A16" --description "Trigger: deploy ticket's merge SHA to QA"
gh label create "pipeline:qa-approve"    --color "0E8A16" --description "Trigger: advance frontier to merge SHA"
gh label create "pipeline:qa-reject"     --color "B60205" --description "Trigger: reject; route to rework. Add a comment with reason first"
gh label create "pipeline:prod-release"  --color "5319E7" --description "Trigger: release merge SHA to main"
gh label create "pipeline:approve-cost"  --color "0E8A16" --description "Trigger: unblock cost-review-pending ticket"
gh label create "pipeline:reject-cost"   --color "B60205" --description "Trigger: reject cost change; park at needs-human. Add comment with reason"
gh label create "pipeline:retry"         --color "FBCA04" --description "Trigger: reset ticket to rework, Attempt=1"
gh label create "pipeline:park"          --color "C5DEF5" --description "Trigger: halt processing; set Pipeline Status=needs-human"
gh label create "pipeline:show-status"   --color "C5DEF5" --description "Trigger: bot replies with current ticket state"
```

**Concurrency**: the commands workflow has a per-ticket concurrency
group (`pipeline-commands-<N>`), so two labels added simultaneously
to the same ticket serialize. Different tickets run in parallel.

**Audit trail**: every command posts a result comment. `[/qa-deploy] OK`,
`[/approve-cost] OK`, etc. The comment thread is the durable record
of who triggered what, when, and with what outcome.

### 5.6 Status labels (where is each ticket in the lifecycle?)

In addition to the trigger labels above, the pipeline auto-applies one
of six `status:*` labels to every ticket so you can see at-a-glance
where every ticket is. Filter the Issues page by `label:status:*` to
get a queue view for any state.

| Label | Meaning | Set by |
|---|---|---|
| `status:in-progress` | Autonomous pipeline is working on this ticket (any state from tests-pending through pr-review-pending or rework) | `manager.sh` priming, `merge-pr.sh` stale rework, `qa-reject.sh`, `pipeline:approve-cost`, `pipeline:retry` |
| `status:ready-for-qa` | Merged to develop, waiting for `pipeline:qa-deploy` | `merge-pr.sh` clean merge |
| `status:in-qa` | Deployed to QA, waiting on a human verdict (qa-approve or qa-reject) | `pipeline:qa-deploy` success |
| `status:qa-approved` | QA passed, queued for the next nightly prod release at 01:00 IST | `pipeline:qa-approve` success |
| `status:released` | Released to prod | `prod-release.sh` (per-ticket bookkeeping) |
| `status:needs-human` | Blocked: 3-strike rework escalation, cost-rejected, or manually parked | `manager.sh` 3-strike, `pipeline:park`, `pipeline:reject-cost` |

A ticket carries exactly one `status:*` label at a time; the helper
`scripts/set-status.sh <ticket> <new-status>` removes the previous one
when adding the new one.

**One-time label setup** (six labels — run once when bootstrapping):

```bash
gh label create "status:in-progress"  --color "1D76DB" --description "Autonomous pipeline is working on this ticket"
gh label create "status:ready-for-qa" --color "FBCA04" --description "Merged to develop; awaiting pipeline:qa-deploy"
gh label create "status:in-qa"        --color "FBCA04" --description "Deployed to QA; awaiting human verdict"
gh label create "status:qa-approved"  --color "0E8A16" --description "QA passed; queued for nightly prod release at 01:00 IST"
gh label create "status:released"     --color "5319E7" --description "Released to prod"
gh label create "status:needs-human"  --color "B60205" --description "Blocked; needs human attention"
```

### 5.7 Nightly batched prod release

A scheduled workflow (`.github/workflows/pipeline-nightly-release.yml`)
runs every day at **01:00 IST** (`30 19 * * *` UTC). It checks the
`frontier` git tag against the current `main` HEAD:

- `frontier == main` → nothing was QA-approved since yesterday's batch; no-op.
- `frontier > main` → there's QA-approved code waiting; runs
  `prod-release.sh frontier`. The fast-forward of `main` picks up
  every commit in one shot. Per-ticket bookkeeping (status:released +
  comment with release link) happens inside `prod-release.sh`.

**Manual `pipeline:prod-release` is kept as breakglass** for hotfixes —
adding the label to a ticket releases it immediately rather than waiting
for the nightly window.

**Hold a ticket out of the nightly batch**: don't `pipeline:qa-approve`
it. The `frontier` tag only moves on explicit approval. A `status:in-qa`
ticket can sit there indefinitely without being released.

**Atomicity**: each batch is "all-or-nothing." The frontier model is
monotonic, so if you approve A then B, releasing later means *both* go
out (B's commit includes everything before it). You can't release A but
not B if both are QA-approved.

### 5.8 Release notes (auto-generated)

Every successful prod release — nightly OR manual — creates a GitHub
Release in the **Releases** tab with auto-generated notes:

- **Tag**: `release-YYYY-MM-DD-HHMM` UTC (always unique, supports
  multiple releases per day)
- **Title**: `Production release YYYY-MM-DD HH:MM UTC`
- **Notes**: pulled by `gh release create --generate-notes`, which lists
  every PR title between the previous release and this one. Format:

  ```
  ## What's Changed
  * feat: add Last Working Day field to candidate screening by @raj-makhija in #74
  * fix: pricing config null handling in #76
  * chore: bump zod by ... in #78
  
  **Full Changelog**: https://github.com/.../compare/release-...-1900...release-...-1930
  ```

Each affected ticket also gets a comment linking to the release:

```
[/prod-release] Released to prod 2026-04-29 19:30 UTC.
Release: https://github.com/raj-makhija/quadzero-scout/releases/tag/release-2026-04-29-1930
```

**One-time bootstrap**: before the first nightly run, create a
baseline tag so the first auto-generated notes don't span all of
git history:

```bash
gh release create release-bootstrap main \
  --title "Pre-pipeline baseline" \
  --notes "Initial baseline. Release notes start tracking after this point."
```

Find all releases at `https://github.com/raj-makhija/quadzero-scout/releases`.

**Required repo secrets for deploy commands** (`qa-deploy`,
`prod-release`):

| Secret | Purpose |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user access key with permissions to run `serverless deploy` (Lambda, IAM PassRole, CloudFormation, S3, DynamoDB, API Gateway, CloudWatch Logs) |
| `AWS_SECRET_ACCESS_KEY` | Paired secret key |
| `AWS_REGION` | Optional; defaults to `ap-south-1` |

Add via GitHub UI: Settings → Secrets and variables → Actions → New
repository secret. Or via CLI: `gh secret set <NAME>`.

**Optional repo variable**:

| Variable | Effect |
|---|---|
| `PIPELINE_SKIP_DEPLOY` | If set to `1`, `qa-deploy` pushes the qa branch (Amplify auto-deploys frontend) but skips `npx serverless deploy`. Useful for frontend-only iteration or while AWS creds are being set up. Set in Settings → Secrets and variables → Actions → Variables tab. |

If you trigger `pipeline:qa-deploy` without the AWS secrets in place,
the workflow will fail at the serverless step. The result comment
will tell you. Add the secrets and re-add the label to retry; no
state corruption.

---

## 6. Setup (bootstrapping)

For a fresh repo. Most of this is one-time.

### 6.1 Project & labels

```bash
# Create the project
gh project create --owner raj-makhija --title "Pipeline Project Name"

# Create labels
gh label create auto-pipeline --color "0E8A16" --description "Pickup by autonomous pipeline"
for t in feature bugfix chore docs refactor; do
  gh label create "type:$t" --color "1D76DB"
done
```

### 6.2 Custom fields

Use the GitHub UI to add the 5 custom fields listed in section 2.3.
Or via GraphQL (verbose; not scripted because it's one-time).

### 6.3 Discover IDs

```bash
scripts/discover-ids.sh > .pipeline-config.json
git add .pipeline-config.json
git commit -m "chore: initial pipeline config"
```

### 6.4 Tokens

1. Create a classic PAT with scopes `repo`, `workflow`, `project`.
   Save as repo secret `PIPELINE_TOKEN`.
2. Run `claude setup-token` on your laptop. Save the resulting OAuth
   token as repo secret `CLAUDE_CODE_OAUTH_TOKEN`.

### 6.5 Default branch

```bash
gh api -X PATCH repos/<owner>/<repo> -f default_branch=develop
```

### 6.6 Issue templates

The templates under `.github/ISSUE_TEMPLATE/` should set
`labels: ["type:<type>", "auto-pipeline"]` so users get the right
labels by default.

---

## 7. Known quirks & workarounds

### 7.1 GitHub `Project.items` API can return empty

Symptom: `node(id: PROJECT_ID).items.totalCount` returns 0 (and
`gh project item-list` returns 0) even though specific item IDs
resolve, `set-field.sh` mutates them, and the issue->project edge
shows valid items with `isArchived: false`.

Hit during Apr 27 2026. Cause unknown; appears to be a project-side
aggregate cache issue.

Workaround: `next-ticket.sh` queries from the **issue side**
(`repository.issues(labels: ["auto-pipeline"])` + projectItems edge),
not the project side. The issue-side query has been reliable across
the same window.

If this returns to bite you, **do not trust `gh project item-list`
or the project's UI item count.** Use `next-ticket.sh` as the source
of truth for actionable tickets.

### 7.2 MSYS path mangling on Git Bash (Windows)

Git Bash's MSYS layer rewrites things that look like Unix paths in
arguments. Two patterns to know:

- `gh api ... /repos/owner/name` -> the leading slash gets converted.
  Drop the leading slash: `gh api -X PATCH repos/owner/name -f ...`.
- `git show origin/develop:path/to/file` -> the colon gets converted to
  a semicolon, breaking the syntax. Use `git show <commit>:<path>`
  with `<commit>` as a SHA, or `git diff origin/develop -- <path>`.

### 7.3 `Edit` tool truncates YAML/scripts at this mount path

Symptom: editing `.github/workflows/pipeline-manager.yml` or some
scripts via the Edit tool produces a file that ends mid-statement
with NUL bytes after.

Workaround: rewrite the full file via bash heredoc:

```bash
cat > "/path/to/file" <<'EOF'
... full file content ...
EOF
```

Quoted heredoc delimiter (`'EOF'`) prevents shell expansion of `$`
and backticks in the content.

### 7.4 `issues.labeled` fires per label

Each label add is a separate event. A `gh issue create --label "a,b"`
produces two `issues.labeled` events. The concurrency group serializes
the resulting runs, so the second drains 0 iterations -- harmless but
visible in the run list.

To eliminate: add a step-level `if:` guard to short-circuit non-
auto-pipeline label triggers:

```yaml
- name: Skip non-auto-pipeline label events
  if: github.event_name == 'issues' && github.event.label.name != 'auto-pipeline'
  run: |
    echo "Skipping: triggered by label '${{ github.event.label.name }}'"
    exit 0
```

Not currently implemented.

### 7.5 Husky hooks on Windows

The repo uses husky with commitlint enforcing conventional commits and
forbidding `Co-Authored-By` lines. Husky runs on `git commit` from
Windows. The Actions runner explicitly disables hooks via:

```bash
git config core.hooksPath /dev/null
```

When committing manually from Windows, use
`git -c core.hooksPath=/dev/null commit ...` for chore/scaffolding
work that doesn't need linting.

### 7.6 Race: `issues.opened` fires before project-add automation

This is why `issues.opened` was removed from the workflow's triggers.
The label-add events fire after project-add settles, so they cover
the same trigger window without the race.

### 7.7 `frontend/tsconfig.tsbuildinfo` flicker

Next.js incremental build cache regenerates on every dev build,
constantly showing the file as modified. Now `.gitignore`d (and
untracked).

### 7.8 Stale local tracking after runner deletes remote branches

When the runner deletes a branch via `gh pr close --delete-branch`,
local `git branch -r` may still show the branch in `origin/...`
because local fetch caches haven't pruned. Run `git fetch --prune`.

---

## 8. Failure modes & recovery

### 8.1 Doomed 1-second runs

Symptom: workflow run with `X` status, ~1s elapsed, drain step
errored immediately.

Causes:
- Race with project-add automation (mitigated -- `issues.opened`
  removed from triggers)
- Ticket missing required `type:*` label -- `pl_type_from_labels`
  exits 1

Recovery: fix the ticket's labels, then `gh workflow run pipeline-manager.yml`.

### 8.2 Stuck ticket at `dev-pending`/`validation-pending`

Most often because the agent script returned non-zero. Check:

```bash
gh run view <RUN> --log | tail -100
scripts/get-field.sh <N> "Pipeline Status"
```

To unstick:
- If branch was created but no commits, the new idempotent
  `create-branch.sh` will adopt it on retry.
- If branch has bad commits, manually delete and reset:
  ```bash
  git push origin --delete <type>/ticket-<N>-attempt-<K>
  scripts/set-field.sh <N> "Pipeline Status" rework
  scripts/set-field.sh <N> "Base SHA" ""
  gh workflow run pipeline-manager.yml
  ```

### 8.3 Agent timed out (600s)

`_agent-claude.sh` uses `timeout 600s`. If the developer agent runs
out of time on a large feature, manager will see no commits and
escalate the ticket to `cost-review-pending`. To extend:

```yaml
# In workflow env block
PIPELINE_AGENT_TIMEOUT_SEC: '1200'
```

### 8.4 Stale base merge

`merge-pr.sh` checks if any files in the PR diff also changed on
develop since Base SHA. If yes, it closes the PR and routes to
rework so the developer rebranches from current develop. Automatic;
no human intervention needed.

### 8.5 3-strike escalation

When Attempt > `PIPELINE_MAX_ATTEMPTS` (default 3), manager comments
and sets Pipeline Status to `needs-human`. The ticket sits there
until you either:

- Fix the issue manually, then `scripts/set-field.sh <N> "Pipeline Status" rework`
  to retry
- Close the ticket as won't-fix

### 8.6 Cost gate

Developer agent self-escalates to `cost-review-pending` when its
diff touches AWS resources (Lambda config, DynamoDB, etc.) or LLM
call sites/prompts. Resolve by:

- Reviewing the proposed change
- Approving via `scripts/approve-cost.sh <N>` (if implemented; check
  scripts dir) or manually setting Pipeline Status back to
  `validation-pending`

### 8.7 Local index corruption (Linux mount)

The bash sandbox's view of the Windows-mounted `.git` can corrupt:
`error: bad signature 0x00000000`. **Don't run git operations from
the bash sandbox.** Do all git work from Git Bash on Windows where
the .git state is healthy.

---

## 9. Empirical performance & cost

Sourced from real smoke tests Apr 27-28, 2026.

| Stage | Time |
|---|---|
| Tester `write` (test plan generation) | 30-90s |
| Developer `implement` (single-line README) | 30-50s |
| Developer `implement` (real multi-file feature) | 5-8 min |
| Tester `validate` (small diff) | 30-60s |
| Tester `validate` (multi-file feature) | 1-3 min |
| PR-Reviewer | 30-90s |
| Total drain (docs ticket, attempt 1 -> merge) | 3-5 min |
| Total drain (real feature, attempt 1 -> merge) | 10-15 min |
| Total drain (FAIL on attempt 1 -> PASS on attempt 2 -> merge) | 7-9 min |

LLM tokens: bounded by Claude.ai Pro/Max plan limits (no per-token
billing). Real-feature drains burn substantially more tokens; budget
accordingly if running many tickets in parallel.

---

## 10. Tickets shipped autonomously (reference)

A non-exhaustive list of tickets the system has merged unattended
since real agents went live, demonstrating the range of work it
handles. See `git log origin/develop --oneline` for the full list.

| # | Title | What was tested |
|---|---|---|
| 53 | Add header comment to README.md | First real developer agent walk |
| 59 | Add italicised tagline below README title | First real pr-reviewer agent walk |
| 61 | Add Commit Messages section to CONTRIBUTING.md | First real tester agent walk; full real-3-agent E2E |
| 65 | Add Status section to README | Tight constraint ticket; agents nailed it |
| 67 | Add Status section (contradictory criteria) | Demonstrated tester spec-arbitration emergence |
| 69 | Add TODO marker (FAIL-path injection) | Verified FAIL -> rework -> attempt-2 -> merge |
| 71 | Pipeline housekeeping smoke line | Verified `issues.opened` race fix |
| 73 | **Add Last Working Day to candidate screening** | **First real production feature: 3 files, backend + frontend + DynamoDB schema** |

---

## 11. Open follow-ups

Tracked but not blocking. Pick up when convenient.

- **Label-filter step guard**: short-circuit non-auto-pipeline label
  triggers to eliminate the duplicate-run pattern on multi-label
  ticket creates.
- **`next-ticket.sh` pagination**: currently `first: 100`. Active
  project, plenty of headroom; revisit if it ever caps out.
- **Strip `Co-Authored-By` post-merge**: squash-merges sometimes pull
  in CoAuth from the dev's commits despite agent-prompt instructions
  to omit. Could add a `merge-pr.sh` post-step to filter.
- **Pre-fill UX gap noted on #73**: re-opening the screening modal
  after saving "still on the job" doesn't pre-tick the checkbox
  because DynamoDB REMOVE makes the attribute `undefined`, not `null`.
  Tester flagged it as a non-blocking concern; file as a follow-up
  ticket for the dev agent to address in a future iteration.
- **3-strike escalation organic test**: every contradictory-spec
  ticket ends up resolved by tester arbitration, so we've never
  organically forced 3 strikes. The escalation code is small and
  shares primitives with tested code; low risk.

---

## 12. Files quick reference

```
.github/
  workflows/
    pipeline-manager.yml      # the workflow
  ISSUE_TEMPLATE/
    bug.yml feature.yml hotfix.yml   # auto-applied label sets
scripts/
  _pipeline-lib.sh            # shared bash helpers; sourced
  _agent-claude.sh            # claude headless wrapper
  manager.sh                  # state-machine router
  next-ticket.sh              # actionable-queue producer
  get-field.sh / set-field.sh # project field accessors
  discover-ids.sh             # bootstrap helper
  create-branch.sh            # branch + Base SHA write (idempotent)
  check-staleness.sh          # PR staleness detector
  open-pr.sh                  # PR opener
  merge-pr.sh                 # squash-merge or rework on overlap
  dummy-tester.sh             # tester agent (dummy-prefix is legacy)
  dummy-developer.sh          # developer agent
  dummy-pr-reviewer.sh        # pr-reviewer agent
  qa-deploy.sh                # human: deploy develop tip to QA
  qa-approve.sh               # human: advance frontier
  qa-reject.sh                # human: bounce back to rework
  prod-release.sh             # human: release SHA <= frontier to prod
  setup-pipeline.sh           # bootstrap orchestrator
.pipeline-config.json         # opaque GraphQL IDs
CLAUDE.md                     # project-wide standards (auto-loaded by claude)
CI-CD.md                      # this document
```

---

## 13. When to update this doc

- A new failure mode shows up in the wild -> add to Section 8.
- A new GitHub API quirk hits -> add to Section 7.
- Empirical timing changes (faster or slower agents) -> Section 9.
- A new agent or workflow trigger gets added -> sections 2 and 3.
- The state machine grows a new state -> section 1 and the
  state-options list in 2.3.

This doc is the source of truth for "how does the pipeline work."
Code comments cover local mechanics; this covers the system.
