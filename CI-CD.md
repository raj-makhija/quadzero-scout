# CI/CD Pipeline — Quadzero Scout

The autonomous CI/CD pipeline that takes a GitHub Issue from creation
through tested, reviewed, and merged code on `develop`, then provides
human-driven scripts to promote `develop` -> `qa` -> `main`.

This document is the canonical reference for operating, extending, and
debugging the pipeline. It assumes you've read `CLAUDE.md` and have
familiarity with the repo layout.

For the contract between this autonomous pipeline and the
human/Cowork-driven route — when to use which, how to hand a ticket
between them, and how both routes converge on the same QA → prod flow —
see `docs/two-route-playbook.md`.

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
- `scripts/qa-approve.sh <ticket>` -> human verdict after QA testing;
  marks the ticket `status:qa-approved`, queueing it for the next nightly
  cherry-pick onto `main`
- `scripts/qa-reject.sh <sha> <reason> [ticket]` -> bounces back; reopens issue, routes to rework. Ticket inferred from commit message if omitted
- `scripts/prod-release.sh` -> nightly batch: cherry-picks every
  `status:qa-approved` ticket from develop onto main in develop merge
  order. Per-ticket: clean cherry-pick → ships; conflict → marks
  `status:prod-release-blocked` and retries next nightly

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
| Tester | `scripts/dummy-tester.sh` | `PIPELINE_TESTER_AGENT=claude` | `write` mode: posts test plan. `validate` mode: two gates -- (1) hard gate runs `npm ci && npm test` in backend/ and frontend/ on the dev branch; (2) static review by claude against the test plan. Either gate's FAIL routes to rework |
| Developer | `scripts/dummy-developer.sh` | `PIPELINE_DEVELOPER_AGENT=claude` | `implement`/`rework` modes: writes code on a branch. `open_pr` mode: opens the PR (no LLM) |
| PR-Reviewer | `scripts/dummy-pr-reviewer.sh` | `PIPELINE_PR_REVIEWER_AGENT=claude` | Read-only review of the PR; emits VERDICT: APPROVE or REQUEST_CHANGES |

The headless wrapper is `scripts/_agent-claude.sh`. It runs
`claude --print --dangerously-skip-permissions` with a 600s timeout
and accepts either `ANTHROPIC_API_KEY` (API billing) or
`CLAUDE_CODE_OAUTH_TOKEN` (Pro/Max subscription, from `claude setup-token`).
If `PIPELINE_AGENT_MODEL` is set in the environment, the wrapper passes
it to claude as `--model <value>`; per-agent scripts set this for the
tiered model selection described in 2.1.1.

### 2.1.1 Model tiering

The four agents have very different workloads, so the pipeline picks a
different model per role rather than running everything on one default.
Each agent script computes its model and exports `PIPELINE_AGENT_MODEL`
before invoking `_agent-claude.sh`; the wrapper passes it to `claude
--model`.

| Agent | Default model | Override env var | Why |
|---|---|---|---|
| Tester (write + validate) | `claude-sonnet-4-6` | `PIPELINE_TESTER_MODEL` | Reasoning over acceptance criteria; Sonnet hits the price/quality knee. |
| Developer (`implement`, attempt 1) | `claude-sonnet-4-6` | `PIPELINE_DEVELOPER_MODEL` | The dominant cost driver; Sonnet handles most multi-file features. |
| Developer (`rework`, attempt >= 2) | `claude-opus-4-6` | `PIPELINE_DEVELOPER_REWORK_MODEL` | Conditional escalation on retry: buys a sharper model only when attempt 1 already failed, keeping cost tied to difficulty. |
| PR-Reviewer | `claude-haiku-4-5-20251001` | `PIPELINE_PR_REVIEWER_MODEL` | Tester has already validated correctness; reviewer checks scope, conventions, security, cost flags -- a classification-shaped task Haiku handles cheaply. |
| Scribe | `claude-haiku-4-5-20251001` | `PIPELINE_SCRIBE_MODEL` | YES/NO docs decision plus a templated follow-up body. Cheap, fast. |

If none of these env vars are set, the defaults above apply. To pin
every agent to one model (e.g., to A/B test a new release across the
whole pipeline, or as a kill-switch), set the four per-agent overrides
to the same value in the workflow env -- the per-agent scripts always
set `PIPELINE_AGENT_MODEL` themselves before calling the wrapper, so a
bare `PIPELINE_AGENT_MODEL` at the workflow level is ignored.

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
scripts/qa-approve.sh <TICKET>
# This sets status:qa-approved on the ticket. The actual ship to
# main happens in the next nightly cherry-pick batch (01:00 IST).

# If QA finds issues:
scripts/qa-reject.sh <SHA> "describe what's wrong"
# This routes the ticket back to rework so the dev agent can fix.

# Run the nightly batch immediately (no args; finds approved tickets itself)
scripts/prod-release.sh
```

Each ticket's prod release is its own decision: the nightly batch
cherry-picks every `status:qa-approved` ticket from develop onto main
independently. Tickets that conflict get marked `status:prod-release-blocked`
and retry next nightly. See §5.7 for details.

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
| `pipeline:qa-approve` | Mark ticket `status:qa-approved`; queue for next nightly cherry-pick onto main | none |
| `pipeline:qa-reject` | Re-open ticket, route to rework with reason | reason — read from latest non-bracket comment |
| `pipeline:prod-release` | Breakglass: cherry-pick the ticket onto main immediately (bypasses nightly batch) | none |
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
gh label create "pipeline:qa-approve"    --color "0E8A16" --description "Trigger: mark ticket qa-approved; queue for next nightly cherry-pick"
gh label create "pipeline:qa-reject"     --color "B60205" --description "Trigger: reject; route to rework. Add a comment with reason first"
gh label create "pipeline:prod-release"  --color "5319E7" --description "Trigger: release merge SHA to main"
gh label create "pipeline:approve-cost"  --color "0E8A16" --description "Trigger: unblock cost-review-pending ticket"
gh label create "pipeline:reject-cost"   --color "B60205" --description "Trigger: reject cost change; park at needs-human. Add comment with reason"
gh label create "pipeline:retry"         --color "FBCA04" --description "Trigger: reset ticket to rework, Attempt=1"
gh label create "pipeline:park"          --color "C5DEF5" --description "Trigger: halt processing; set Pipeline Status=needs-human"
gh label create "pipeline:show-status"   --color "C5DEF5" --description "Trigger: bot replies with current ticket state"
gh label create "pipeline:awaiting-type" --color "EDEDED" --description "Validator-set: ticket needs a type:* label before pipeline can act on it (auto-cleared once added)"
gh label create "pipeline:struck-1"      --color "FBCA04" --description "Manager-set: 1 consecutive failure. Resets on next successful advancement"
gh label create "pipeline:struck-2"      --color "F59E0B" --description "Manager-set: 2 consecutive failures. One more strike = parked at needs-human"
gh label create "pipeline:struck-out"    --color "B60205" --description "Manager-set: hit PIPELINE_MAX_STRIKES; ticket parked at needs-human. Use pipeline:retry to reset"
```

**Concurrency**: the commands workflow has a per-ticket concurrency
group (`pipeline-commands-<N>`), so two labels added simultaneously
to the same ticket serialize. Different tickets run in parallel.

**Audit trail**: every command posts a result comment. `[/qa-deploy] OK`,
`[/approve-cost] OK`, etc. The comment thread is the durable record
of who triggered what, when, and with what outcome.

### 5.6 Status labels (where is each ticket in the lifecycle?)

In addition to the trigger labels above, the pipeline auto-applies one
of seven `status:*` labels to every ticket so you can see at-a-glance
where every ticket is. Filter the Issues page by `label:status:*` to
get a queue view for any state.

| Label | Meaning | Set by |
|---|---|---|
| `status:in-progress` | Autonomous pipeline is working on this ticket (any state from tests-pending through pr-review-pending or rework) | `manager.sh` priming, `merge-pr.sh` stale rework, `qa-reject.sh`, `pipeline:approve-cost`, `pipeline:retry` |
| `status:ready-for-qa` | Merged to develop, waiting for `pipeline:qa-deploy` | `merge-pr.sh` clean merge |
| `status:in-qa` | Deployed to QA, waiting on a human verdict (qa-approve or qa-reject) | `pipeline:qa-deploy` success |
| `status:qa-approved` | QA passed, queued for the next nightly cherry-pick onto main at 01:00 IST | `pipeline:qa-approve` success |
| `status:prod-release-blocked` | QA approved, but the most recent nightly cherry-pick onto main failed due to conflicts. Retries automatically each nightly until either it cherry-picks clean or the dependency is resolved | `prod-release.sh` on cherry-pick conflict |
| `status:released` | Successfully cherry-picked onto main and shipped to prod | `prod-release.sh` after successful cherry-pick |
| `status:needs-human` | Blocked: 3-strike rework escalation, cost-rejected, or manually parked | `manager.sh` 3-strike, `pipeline:park`, `pipeline:reject-cost` |

A ticket carries exactly one `status:*` label at a time; the helper
`scripts/set-status.sh <ticket> <new-status>` removes the previous one
when adding the new one. The mutex behavior is what lets
`status:prod-release-blocked` cleanly transition back to
`status:released` on a subsequent successful cherry-pick.

**One-time label setup** (seven labels — run once when bootstrapping):

```bash
gh label create "status:in-progress"           --color "1D76DB" --description "Autonomous pipeline is working on this ticket"
gh label create "status:ready-for-qa"          --color "FBCA04" --description "Merged to develop; awaiting pipeline:qa-deploy"
gh label create "status:in-qa"                 --color "FBCA04" --description "Deployed to QA; awaiting human verdict"
gh label create "status:qa-approved"           --color "0E8A16" --description "QA passed; queued for nightly cherry-pick at 01:00 IST"
gh label create "status:prod-release-blocked"  --color "B60205" --description "QA approved but cherry-pick onto main is blocked by conflicts; retries nightly"
gh label create "status:released"              --color "5319E7" --description "Released to prod"
gh label create "status:needs-human"           --color "B60205" --description "Blocked; needs human attention"
```

### 5.7 Nightly batched prod release (cherry-pick model)

A scheduled workflow (`.github/workflows/pipeline-nightly-release.yml`)
runs every day at **01:00 IST** (`30 19 * * *` UTC). It calls
`scripts/prod-release.sh` with no arguments. The script:

1. Lists all tickets labeled `status:qa-approved` or
   `status:prod-release-blocked` (and not yet `status:released`).
2. Resolves each ticket to the merge SHA of its PR on develop.
3. Sorts that set in **develop merge order, oldest first**, so
   independent commits get applied in the same sequence they entered
   the integration branch (minimizes conflicts).
4. Checks out a fresh `release/YYYY-MM-DD-HHMM` branch off current main.
5. For each ticket, runs `git cherry-pick <merge-sha>`:
   - **Clean** → applied to release branch; ticket recorded as released.
   - **Empty** (commit's diff is already in main, e.g. previously
     cherry-picked) → skipped via `git cherry-pick --skip`; ticket
     recorded as released.
   - **Conflict** → `git cherry-pick --abort`; conflict files
     captured; ticket recorded as blocked. The script keeps going
     and tries the next ticket (other tickets may apply clean).
6. If at least one ticket cherry-picked successfully:
   fast-forward main → release branch → push → deploy backend → create
   GitHub Release → comment release URL on every released ticket and
   set their status to `status:released`.
7. For every blocked ticket: post an explanatory comment naming the
   conflict files and set status to `status:prod-release-blocked`.
8. If nothing cherry-picked, exit cleanly with no main-side change.

**Why cherry-pick instead of fast-forward?** With a linear "advance
frontier" model, approving a later ticket implicitly approved every
unapproved ticket sitting underneath it on develop. Cherry-pick decouples
tickets so each ships only when explicitly approved.

**Manual `pipeline:prod-release` is kept as breakglass** for hotfixes —
adding the label to a ticket releases it immediately rather than waiting
for the nightly window.

**Hold a ticket out of nightly batches**: don't `pipeline:qa-approve` it.
A `status:in-qa` ticket sits there indefinitely without being touched by
the nightly job.

**The trade-off** of the cherry-pick model: if ticket A's code genuinely
depends on ticket B's code (B introduces a function, A calls it), and
you approve A but not B, A's cherry-pick onto main will conflict.
The pipeline detects this and marks A as `prod-release-blocked` rather
than silently shipping B. To unblock: approve B too, revert B from
develop, or refactor A. See §8.8.

### 5.8 Release notes (built per-ticket)

Every prod release that ships at least one ticket creates a GitHub
Release in the **Releases** tab. Notes are built **manually from the
ticket list** rather than via `gh release create --generate-notes`,
because the cherry-pick model breaks the "PRs in commit range" mapping
that auto-generated notes rely on.

- **Tag**: `release-YYYY-MM-DD-HHMM` UTC (always unique, supports
  multiple releases per day)
- **Title**: `Production release YYYY-MM-DD HH:MM UTC`
- **Notes**: built by iterating the released-ticket list. Blocked
  tickets are also listed (so you see what's stuck this cycle):

  ```
  ## What's Changed

  * Add Last Working Day field to candidate screening (#73, PR #74)
  * Internal Rate -- Look and feel alignment (#78, PR #79)

  ## Blocked tickets (retrying next nightly)

  * Pricing config refactor (#82) -- conflicts: backend/src/lib/pricing.ts

  **Compare**: `<old-main-sha>`...`<new-main-sha>`
  ```

Each released ticket also gets a per-ticket comment linking to the release:

```
[/prod-release] Released to prod 2026-04-29 19:30 UTC.
Release: https://github.com/raj-makhija/quadzero-scout/releases/tag/release-2026-04-29-1930
```

Each blocked ticket gets a per-ticket comment naming the conflict
files plus suggested unblock steps (a fresh comment is posted each
nightly that re-blocks, so the thread shows the history of attempts).

The previous `release-bootstrap` tag (used by `--generate-notes`) is
no longer required. Existing tag is harmless if you keep it.

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

### 5.9 Documentation drift prevention (rationale + scribe)

The pipeline ships features autonomously, which means design and
implementation decisions get made *without* a human review pass. Two
mechanisms keep `/docs/`, `README.md`, `CLAUDE.md`, and `CI-CD.md` from
silently drifting away from the code that's actually running in prod:

1. **Developer rationale comment** (every dev/rework cycle).
   Before the developer agent hands off to the tester, it posts a
   structured `[developer:rationale]` comment on the source ticket:

   ```
   [developer:rationale]

   ## Approach
   <1-3 sentences on what was done and why>

   ## Alternatives considered
   - <approach A>: rejected because ...
   - <approach B>: rejected because ...

   ## Assumptions
   - <assumption that couldn't be verified but the agent proceeded with>
   - <assumption about data shape, concurrency, etc.>

   ## Doc updates needed
   - `<filepath>`: <what should change>
   - or "None -- internal change with no user-visible impact"
   ```

   The "Doc updates needed" section is the load-bearing part. The
   developer agent is responsible for assessing its own change's doc
   impact at the moment it has the most context. The comment is also
   archival: future engineers and audits can see WHY a thing was done,
   not just what.

2. **Scribe agent** (runs at `pipeline:qa-approve`).
   When you approve a ticket at QA, `pipeline-commands.yml` runs
   `scripts/scribe.sh <ticket>` after the ticket is marked
   `status:qa-approved`. The scribe:

   - Reads the ticket's full thread (including the `[developer:rationale]`
     comment).
   - Reads the merge-commit diff (`git show <merge-sha>`).
   - Reads the current state of likely-affected docs.
   - Decides: are doc updates needed?

   **If no** (refactor, internal bug fix, the ticket IS itself a docs
   update): posts `[scribe] No doc updates needed for this change.`
   and exits.

   **If yes**: files a follow-up issue with labels
   `auto-pipeline,type:docs` containing a structured doc-update spec
   (which docs to change, what content to add/remove, acceptance
   criteria). The follow-up walks through the normal pipeline like any
   other ticket — the developer agent picks it up, edits markdown, opens
   a PR. A comment goes back on the source ticket: `[scribe] Filed #N
   for follow-up doc updates.`

   The scribe is **best-effort**: any failure (claude timeout, parse
   error, ticket-create failure) is logged on the source ticket but
   does NOT block QA approval — the frontier has already advanced by
   the time scribe runs.

**Recursion safety**: when the scribe runs on a docs follow-up ticket
itself, the diff is markdown-only and claude returns `NO_DOCS_NEEDED`
— so no infinite chain of "docs about the docs about the docs" tickets.

**One-time bootstrap**: file a single manual `auto-pipeline,type:docs`
ticket to bring docs current with everything that shipped before the
scribe was wired in. After that, scribe handles drift incrementally as
each new ticket clears QA.

**Why both?** Either alone leaks: rationale-only requires a human to
read every comment; scribe-only loses the developer's mid-flight
context (alternatives weighed, assumptions made) by the time QA
finishes. Together: developer captures intent at peak context, scribe
synthesizes after observing the actual shipped diff.

**Cost**: ~1 extra agent call per ticket, only at the qa-approve
moment (not per dev attempt). Roughly +$0.02-0.10/ticket depending on
diff size.

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

### 6.7 Frontier tag retirement (one-time migration)

The legacy fast-forward release model used a `frontier` git tag as
a QA-approved watermark. The cherry-pick model (§5.7) uses per-ticket
labels instead, so the tag is no longer load-bearing. After the
migration commit lands, retire the tag once:

```bash
git fetch origin --tags
git tag -d frontier 2>/dev/null
git push origin :refs/tags/frontier
```

Tickets currently in `status:qa-approved` or
`status:prod-release-blocked` get processed by the next nightly under
the new model — no manual replay needed. The legacy `release-bootstrap`
tag (used by the deprecated `--generate-notes` path) is harmless if
left in place.

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

### 8.8 Cherry-pick conflict at nightly batch

Symptom: a ticket has `status:prod-release-blocked` and a comment from
`[/prod-release] BLOCKED at nightly batch ...` listing conflict files.

What happened: at the most recent nightly run, `prod-release.sh` tried
to cherry-pick this ticket's merge commit onto main, and `git
cherry-pick` reported a conflict in one or more files. The script
aborted that pick (no main-side change), recorded the ticket as blocked,
and moved on to the next candidate. The ticket will be retried
automatically each nightly until it succeeds or you intervene.

Diagnose: open the ticket. The comment lists conflict files. The
likely cause is one of:

- An earlier ticket sitting underneath this one on develop hasn't been
  approved yet and isn't in main. This ticket's diff was written on
  top of that earlier change, so applying it cleanly to main requires
  the earlier change too.
- A change was merged directly to main (e.g. a hotfix) that touches
  the same files this ticket modifies.
- This ticket genuinely conflicts with another approved ticket
  in the same batch (rare; both typically apply, but conflicting line
  edits in the same hunks won't).

Unblock options:

| Option | When | How |
|---|---|---|
| Approve the dependency | The blocking ticket is in `status:in-qa` and you'd ship it anyway | Test it, label `pipeline:qa-approve`. Both ship together at next nightly. |
| Revert the dependency from develop | The blocking ticket needs more work and shouldn't ship yet | `git revert <merge-sha-of-dependency>`, push to develop, set the dependency back to `status:in-progress`. The blocked ticket will then cherry-pick clean. |
| Refactor this ticket | The dependency is structural and can be removed | Add `pipeline:retry` label to send the ticket back through dev. The agent gets the conflict context in its prompt and can refactor. |
| Manual cherry-pick + push to main | Edge case; you understand the conflict and resolve it locally | `git checkout main; git cherry-pick <sha>; <resolve>; git cherry-pick --continue; git push`. Then manually set `status:released` on the ticket. |

Edge case: a ticket that was successfully cherry-picked then later
qa-rejected. The cherry-pick is on main; reverting requires a manual
`git revert` on main and a follow-up redeploy. There's no automatic
flow for this — qa-reject is intended for tickets still in QA, not
already-shipped ones.

### 8.9 Ticket missing a `type:*` label

Symptom: a ticket has `pipeline:awaiting-type` and a `[manager]`
comment asking for a type label. No further pipeline action happens
until the label is added.

What happened: at the top of every drain, `scripts/validate-ticket-types.sh`
walks every open `auto-pipeline` ticket. Tickets without any `type:*`
label get the `pipeline:awaiting-type` flag (so they're visible on
the project board) and a comment listing the valid types. They're
also excluded from `next-ticket.sh`'s actionable queue, so the
pipeline doesn't keep crashing on them every cron tick.

Fix: add one of `type:feature`, `type:bug`, `type:bugfix`,
`type:chore`, `type:docs`, `type:refactor`, `type:hotfix` to the
ticket. The next manager run sees the type label, removes
`pipeline:awaiting-type`, and the ticket re-enters the actionable
queue. No further intervention.

Why the validator: before this fix, a label-less ticket caused
`manager.sh` to exit non-zero because branch / PR derivation needed
a type. Cron retried every 5 min, hit the same ticket, failed the
same way, starving every other ticket in the queue. Validator
pre-flights the failure with a friendly comment instead of a wedge.

### 8.10 Strike system: per-ticket failure isolation

The drain loop wraps each `manager.sh` call in an exit-code check.
On non-zero exit, `scripts/strike-ticket.sh` records a strike on the
ticket via labels: `pipeline:struck-1` → `pipeline:struck-2` →
`pipeline:struck-out`. After `PIPELINE_MAX_STRIKES` (default 3) the
ticket is parked at `needs-human` with `pipeline:struck-out` and a
summary comment.

**Why**: before the strike system, any single failed ticket would
wedge the whole queue -- `next-ticket.sh` returns the same ticket
each cron tick, `manager.sh` keeps failing, no other tickets advance.
Real cases hit: agent timeout (#103), missing branch state (#98),
missing type label (#99). The strike system isolates per-ticket
failures so the rest of the pipeline keeps moving.

**Within-drain behavior**: when a ticket strikes during a drain, it's
excluded from the rest of that drain's iterations. `next-ticket.sh`
on the next iter skips the struck ticket and returns the next
candidate. So a single drain produces at most ONE strike per ticket
-- the strike count tracks consecutive cron ticks, not consecutive
manager retries within a tick.

**Auto-recovery**: `scripts/clear-strikes.sh` runs after every
successful `manager.sh` advancement. Removes any `pipeline:struck-*`
labels on the ticket so transient failures don't accumulate across a
ticket's lifetime. Cheap and idempotent (single label-existence
check first; only does the removes if needed).

**Manual recovery**: add `pipeline:retry` to a `pipeline:struck-out`
ticket. The route resets Attempt/Pipeline Status/Base SHA/PR Number
AND calls `clear-strikes.sh`, so the ticket re-enters the actionable
queue with a fresh count.

**Configurable threshold**: set `PIPELINE_MAX_STRIKES` in
`pipeline-manager.yml`'s drain step env. Default 3.

**Audit trail**: every strike posts a `[manager:strike] strike N/M`
comment with timestamp, reason, and a link to the workflow run that
produced the strike. The thread shows the full failure history even
after labels are cleared by recovery.

### 8.11 Tester real-test gate (validate mode)

The tester's `validate` mode runs the project test suite as a hard
gate BEFORE invoking claude for static review. The order is:

1. Check out the dev branch (`<type>/ticket-<N>-attempt-<K>`)
2. For each of `backend/` and `frontend/`: if it has a `package.json`
   with a `test` script, run `npm ci && npm test`. Fail-fast: first
   directory that fails ends the gate.
3. If both pass (or no project tests exist): invoke claude for the
   static review against the test plan
4. Either gate's FAIL routes the same way: comment with output
   excerpt + drop branch + clear Base SHA + Pipeline Status=rework

**Why both gates**:
- npm test catches what static review can't see — regressions in
  tests outside the agent's diff (mock drift, type errors in
  unrelated handlers, removed exports). Caught the dynamodb mock
  drift that previously shipped multiple times.
- Static review catches what npm test can't see — acceptance gaps,
  edge cases without coverage, behavior that compiles + passes tests
  but doesn't satisfy the spec.

**Cost added**: ~60-120s per validate (npm ci on cold runner +
test execution). Negligible against the agent-call cost saved when
tests fail clean before the LLM gets invoked.

**Disable for debugging**: set `PIPELINE_TESTER_RUN_NPM_TEST=false`
in `pipeline-manager.yml`'s drain step env. Use sparingly — this
re-opens the gap that broken merged code falls through.

**Developer prompt note**: the developer agent's prompt now
instructs it to run `npm test` locally before pushing. So in steady
state, the tester gate should be a cheap re-confirmation rather
than a failure path. If the gate is failing routinely, check
whether the dev agent is actually following step 5a in its prompt.

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

LLM tokens: when authenticated via `CLAUDE_CODE_OAUTH_TOKEN`, bounded
by Claude.ai Pro/Max plan limits (no per-token billing). Under
`ANTHROPIC_API_KEY`, costs are per-token and the model tiering in
section 2.1.1 matters: Haiku for reviewer + scribe and conditional
Opus only on developer rework keep the cost floor low while still
having a sharper model available when attempt 1 fails. Real-feature
drains burn substantially more tokens than docs tickets; budget
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
- **Switch bot identity from PAT to GitHub App**: today every
  pipeline action (comments, label edits, status changes, PR opens
  + merges, releases) is attributed to `raj-makhija` because the
  workflows authenticate with `secrets.PIPELINE_TOKEN` (a personal
  classic PAT). Switching to a dedicated GitHub App would attribute
  all bot actions to `<app-name>[bot]` while keeping the
  workflow-triggers-workflow chain intact (unlike `GITHUB_TOKEN`,
  which would break `gh issue create --label auto-pipeline` and
  `gh workflow run` triggers).
  - Manual setup (one-time): create GitHub App with repo
    permissions Contents/Issues/PRs/Workflows/Actions (R/W) +
    Metadata (R); install on `quadzero-scout`; add the App as Admin
    on the Project "Quadzero Scout Pipeline" (Projects v2 doesn't
    inherit App grants from the repo); store App ID + private key
    as repo secrets `PIPELINE_APP_ID` + `PIPELINE_APP_PRIVATE_KEY`.
  - Code change: each workflow's job adds an `actions/create-github-app-token@v1`
    step at the top, then replaces every `secrets.PIPELINE_TOKEN`
    with `steps.app-token.outputs.token` (~10 lines per file across
    `pipeline-manager.yml` and `pipeline-commands.yml`).
  - Side effects: App has its own rate limit (PAT no longer eats
    your budget); the "Allow GitHub Actions to create and approve
    pull requests" repo setting becomes irrelevant (App tokens have
    their own perms); when YOU label a ticket, the labeling event
    is still attributed to you, but everything the workflow does
    inside is attributed to the App — clean separation.

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
  qa-approve.sh               # human: mark ticket qa-approved (queues for nightly)
  qa-reject.sh                # human: bounce back to rework
  prod-release.sh             # nightly: cherry-pick all qa-approved tickets to main
  setup-pipeline.sh           # bootstrap orchestrator
.pipeline-config.json         # opaque GraphQL IDs
CLAUDE.md                     # project-wide standards (auto-loaded by claude)
CI-CD.md                      # this document
docs/two-route-playbook.md    # auto vs Cowork: when, how, handoffs
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
