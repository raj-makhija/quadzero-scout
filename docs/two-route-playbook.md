# Two-Route Playbook — Auto Pipeline vs. Cowork

How to decide which route a ticket should take, and how to keep the two
routes from stepping on each other. Companion to `CI-CD.md`; assumes
familiarity with the pipeline state machine, labels, and Project fields
described there.

---

## 1. Why two routes

The autonomous pipeline (described in `CI-CD.md`) drains routine tickets
unattended in 3-15 min: scoped acceptance criteria, well-bounded diffs,
clear test expectations. It is fastest for work where the *spec* is the
hard part and the *implementation* follows from it.

A second route — driving the work in Cowork (the desktop assistant)
collaboratively with a human — exists for tickets where the *thinking*
is the hard part: ambiguous acceptance criteria, architectural choices
that need a human-in-the-loop, cross-cutting refactors, anything where
"what should this even do?" has to be settled before code gets written.

Both routes converge on the same `develop` branch and the same QA →
prod promotion flow. This doc defines the contract that keeps them
compatible.

---

## 2. The contract: single ownership

At any moment, exactly one of the two routes "owns" a ticket. The
signal is the `auto-pipeline` label.

- **Has `auto-pipeline`** → autonomous pipeline owns it. `next-ticket.sh`
  picks it up; cron, `issues.labeled`, and `repository_dispatch` ticks
  all act on it.
- **Lacks `auto-pipeline`** → Cowork (or a human) owns it. The pipeline
  is blind to it: `next-ticket.sh` queries
  `repository.issues(labels:["auto-pipeline"])` and skips everything
  else.

The `auto-pipeline` label is therefore the *only* opt-in. Tickets
without it can use any other label combination (including `type:*` for
branch naming and commit hygiene) without triggering autonomous work.

A second, weaker stop signal — `pipeline:park` (which sets
`Pipeline Status=needs-human`) — is for cases where you want to keep
the `auto-pipeline` label on (e.g. for project-board hygiene) but pause
the autonomous run. The actionable queue excludes `needs-human` and
`cost-review-pending`, so cron will leave the ticket alone.

---

## 3. Decision: which route?

Default to **auto** unless one of these applies:

| Use Cowork when… | Why |
|---|---|
| Acceptance criteria can't be written without making a design decision first | Tester arbitration on real ambiguity is brittle; better to settle it with a human |
| The change spans architectural boundaries (data model, public API contract, auth/session, billing) | Cost gate would trip anyway; surface the trade-offs in conversation |
| The diff would touch >5 files or cross backend + frontend + infra | Real-feature drains do this autonomously, but only when the spec is unambiguous; if the spec needs negotiation, do it here |
| Investigation is required before code can be written (perf, root-cause, schema migration plan) | Pipeline has no "research" mode; the first agent it dispatches is the tester, which expects writeable acceptance criteria |
| The work is scaffolding/exploratory and may not ship | Don't burn pipeline strikes on tickets that may close as won't-fix |
| You want to author a non-obvious test plan yourself | Tester writes the plan first; if you've already written one, autonomous tester will replace it |

Default to **auto** for: documentation tickets, single-concern feature
adds with clear AC, bug fixes with a reproducible failing test, label
adjustments, prompt tweaks, version bumps.

**`type:docs` tickets with a docs-only diff** (all changed files are
`*.md` or under `docs/**`) get an additional short-circuit beyond the
normal auto path: the tester no-ops (no test plan), and after
pr-reviewer APPROVE, `scripts/docs-merge.sh` squash-merges the branch
straight to `develop` — no `pipeline:qa-deploy`, no QA single-tenant
lock, no human `pipeline:qa-approve` click. The ticket ships at the
next nightly `develop`→`main` mirror. A `type:docs` ticket whose diff
touches **any non-docs file** (code, config, scripts) falls through to
the full tester+QA lifecycle at both the validate and pr-reviewer
stages — the label alone is not a bypass.

---

## 4. Route A: full auto

Standard pipeline flow. File via issue template (or
`gh issue create --label "auto-pipeline,type:<type>"` plus
`--project "Quadzero Scout Pipeline"`), walk away. See `CI-CD.md` §4
for the autonomous walk-through.

Nothing in this playbook changes that path.

---

## 5. Route B: full Cowork

For tickets the autonomous pipeline should never touch.

### 5.1 File the ticket

```bash
gh issue create \
  --title "your title" \
  --body "<context, links, acceptance criteria, design notes>" \
  --label "type:<type>" \
  --project "Quadzero Scout Pipeline"
```

**Omit `auto-pipeline`.** Do include `type:*` so commitlint recognizes
the branch and so the validator is satisfied. Project membership is
optional but recommended — the ticket still appears on the board, it
just sits at unset Pipeline Status forever (the actionable queue
ignores it because of the missing label, not the unset state).

### 5.2 Branch + commits

Branch naming is free for purely-manual tickets. If you want the diff
to be visually consistent with autonomous PRs, use
`<type>/ticket-<N>-cowork` (the `-cowork` suffix prevents accidental
overlap with autonomous attempt branches like
`<type>/ticket-<N>-attempt-1`).

Commits must follow Conventional Commits (commitlint runs on every
commit from Windows). Husky is not bypassed for human commits — only
the runner skips hooks. Do not include `Co-Authored-By` lines.

### 5.3 PR — open for review, do NOT merge

Open the PR against `develop` with `Closes #<N>` in the body, and get it
reviewed. **Do not merge it.** In the branch-isolated model the branch is
*not* merged to `develop` during the dev phase — `develop` is approved-only.
The merge happens later, at `pipeline:qa-approve`.

Once the PR is reviewed and you're ready for QA, leave the branch + PR
intact and mark the ticket ready-for-QA:

```bash
scripts/set-status.sh <N> ready-for-qa
# If the ticket is on the pipeline project, also set the field:
scripts/set-field.sh <N> "Pipeline Status" awaiting-qa
```

`pipeline:qa-deploy` resolves your branch from the open PR (no `PR Number`
field needed — it falls back to the issue's open linked PR), so the
`-cowork` branch name works as-is.

### 5.4 Post a rationale comment (optional but recommended)

If you want the scribe to keep `/docs/` and `CI-CD.md` from drifting
because of this change, post a `[developer:rationale]` comment on the
ticket *before* you label `pipeline:qa-approve` (see §7 below for the
shape).

Without the rationale comment, scribe still runs at qa-approve, but
its analysis is limited to the merge diff — it loses the
"alternatives considered / assumptions made" context that only existed
mid-flight.

### 5.5 Re-enter the post-merge flow

The QA → prod half of the pipeline is route-agnostic, and **QA is
single-tenant** — only one ticket (auto or cowork) can be in QA at a time.
Once `status:ready-for-qa` is on the ticket:

```
pipeline:qa-deploy   →  refused if another ticket holds status:in-qa;
                        else merges develop into your branch, runs the
                        regression suite, and deploys it to QA
pipeline:qa-approve  →  squash-merges your branch to develop, sets
                        status:qa-approved, runs scribe, releases the lock
pipeline:qa-reject   →  resets qa to develop and routes the ticket to
                        rework (auto tickets re-run the developer agent;
                        for pure Cowork tickets, re-open and iterate)
```

Nightly `prod-release.sh` mirrors `develop` onto `main` (develop is
approved-only, so it ships every approved ticket regardless of route).
The release notes builder iterates the qa-approved ticket list, so manual
tickets show up correctly.

---

## 6. Handoffs mid-flight

### 6.1 Auto → Cowork (pipeline started, but you want to take over)

The ticket already has `auto-pipeline`. To stop the pipeline cleanly:

```bash
# Web: add the pipeline:park label.
# CLI:
gh issue edit <N> --add-label "pipeline:park"
```

This sets `Pipeline Status=needs-human` and `status:needs-human`. The
actionable queue excludes `needs-human`, so cron will leave the ticket
alone. Any in-flight branch (`<type>/ticket-<N>-attempt-<K>`) stays on
the remote — adopt it locally if useful, or delete it and start fresh
with your own branch name.

When you finish the work and merge:
- If the ticket is still labeled `auto-pipeline`, **remove that label**
  before adding `status:ready-for-qa`. Otherwise the next cron tick
  will see it in `auto-pipeline` + non-terminal state and may try to
  resume — `pipeline:retry` (or any state reset) would land it back
  in the queue.
- Then proceed exactly as in §5.5.

### 6.2 Cowork → Auto (you started, want the pipeline to finish)

Three sub-cases by how far you've got:

**(a) Just specs.** You've negotiated acceptance criteria but written
no code. Add `auto-pipeline` to the ticket. The pipeline picks it up
at the next tick (`gh workflow run pipeline-manager.yml` to skip the
≤5 min cron wait) and runs the full autonomous walk: tester writes a
plan, developer implements on `<type>/ticket-<N>-attempt-1`, etc.

**(b) Test plan written, no code.** Post your test plan as a
`[tester:test-plan]` comment on the ticket. Add `auto-pipeline`. Set
`Pipeline Status=dev-pending`, `Agent=developer`, `Attempt=1`. The
manager will skip the tester-write step and dispatch the developer
agent directly.

```bash
scripts/set-field.sh <N> "Pipeline Status" dev-pending
scripts/set-field.sh <N> "Attempt" 1
```

**(c) Code written, want pipeline to validate + open PR + merge.** Push
to a branch named exactly `<type>/ticket-<N>-attempt-1` from
`origin/develop` HEAD. Then:

```bash
gh issue edit <N> --add-label "auto-pipeline"
scripts/set-field.sh <N> "Pipeline Status" validation-pending
scripts/set-field.sh <N> "Attempt" 1
scripts/set-field.sh <N> "Base SHA" "$(git rev-parse origin/develop)"
gh workflow run pipeline-manager.yml
```

Manager will pick up at validation: tester runs the npm-test gate +
static review on your diff. If PASS, developer opens the PR, reviewer
reviews, manager merges. If FAIL, the branch is dropped and the
developer agent reworks on attempt-2 — at that point you've
effectively handed full ownership over.

This is the riskiest handoff. If the diff doesn't match a plausible
spec the tester can derive from the ticket body, expect FAIL on
validate. Use sparingly; full Cowork (§5) is usually cleaner.

---

## 7. Rationale comment shape

For Cowork tickets you want scribe to track. Post on the ticket before
labeling `pipeline:qa-approve`:

```
[developer:rationale]

## Approach
<1-3 sentences on what was done and why>

## Alternatives considered
- <approach A>: rejected because ...
- <approach B>: rejected because ...

## Assumptions
- <assumption you couldn't verify but proceeded with>
- <assumption about data shape, concurrency, etc.>

## Doc updates needed
- `<filepath>`: <what should change>
- or "None -- internal change with no user-visible impact"
```

The exact `[developer:rationale]` marker is what scribe greps for. Any
deviation in the marker (square-bracket prefix, lower-case, no spaces)
and scribe falls back to merge-diff-only analysis.

The "Doc updates needed" section is the load-bearing part. If non-empty,
scribe files a follow-up `auto-pipeline,type:docs` ticket against the
listed paths. If "None", scribe exits cleanly with no follow-up.

---

## 8. Re-entering the post-merge flow (cheat sheet)

**Standard path** — code tickets, and `type:docs` tickets whose diff
touches any non-docs file — once a change is built + reviewed (branch
intact, NOT yet merged to `develop`):

```
status:ready-for-qa     ← set by pr-reviewer APPROVE (auto) or manually (Cowork §5.3)
   │ pipeline:qa-deploy  (single-tenant: refused if another ticket is in-qa;
   ▼                      merges develop into the branch + runs regression tests)
status:in-qa            ← Amplify + serverless deploy completed (QA lock held)
   │
   ├── pipeline:qa-approve   →  squash-merge to develop  →  status:qa-approved
   │                            →  nightly develop→main mirror  →  status:released
   │
   └── pipeline:qa-reject    →  resets qa to develop; routes to rework
                                (Cowork tickets: just reopen and iterate manually)
```

**Docs-only fast-path** — `type:docs` ticket + diff confined to `*.md`
/ `docs/**`: `pipeline:qa-deploy` is skipped entirely. After
pr-reviewer APPROVE, `scripts/docs-merge.sh` squash-merges straight to
`develop` (`Pipeline Status=merged-to-develop`, `status:qa-approved`).
The QA single-tenant lock is never held, so parallel code tickets can
proceed through `pipeline:qa-deploy` unblocked. The ticket ships at the
next nightly `develop`→`main` mirror.

Scribe runs at the `pipeline:qa-approve` step (or the docs-merge
equivalent) regardless of route. It reads the merge diff + ticket
thread; it doesn't care who wrote the code.

---

## 9. Sharp edges

**Conventional commits are enforced everywhere.** Husky runs on every
local commit; commitlint rejects non-conforming subjects and any
`Co-Authored-By` lines. The runner skips hooks (`core.hooksPath=/dev/null`)
because the agents commit unattended; humans do not get that bypass.
For chore/scaffolding commits where this is annoying, use
`git -c core.hooksPath=/dev/null commit ...`.

**Strike system applies only to `auto-pipeline` tickets.** A Cowork
ticket without that label cannot accumulate strikes. A Cowork ticket
*with* `auto-pipeline` parked at `needs-human` is excluded from the
actionable queue but `validate-ticket-types.sh` still scans it
(harmless; it just no-ops if the type label is present).

**Don't run git operations from the bash sandbox** when working on the
Windows-mounted clone. `.git` corrupts visibly
(`error: bad signature 0x00000000`). Do all git work from Git Bash on
Windows (`D:\projects\scout\quadzero-scout`); use the bash sandbox only
for read-only inspection (`grep`, `cat`, `find`).

**Stale local tracking after autonomous branch deletes.** When the
runner deletes a remote branch via `gh pr close --delete-branch`,
local `git branch -r` doesn't prune automatically. Run
`git fetch --prune` before assuming a branch is gone.

**Auto-add-to-project automation runs on label change.** A ticket
filed without `auto-pipeline` and later given the label gets auto-added
to the project at that moment. Custom field values (Pipeline Status,
Attempt, Base SHA) are unset until manager primes them, so plan
state-changes only after the project-add settles (~1-2s — usually a
non-issue, but a `gh workflow run` triggered too fast can race).

---

## 10. Quick reference

| Scenario | Action |
|---|---|
| Routine ticket, autonomous | File with `auto-pipeline,type:*` |
| Ticket needs design discussion | File with `type:*` only (no `auto-pipeline`) |
| Pause autonomous mid-flight | `pipeline:park` |
| Resume after pause | `pipeline:retry` |
| Cowork dev done → enter QA flow | Open PR (don't merge), `scripts/set-status.sh <N> ready-for-qa`, then `pipeline:qa-deploy` |
| Hand off Cowork-written code to autonomous validate/PR/merge | Push to `<type>/ticket-N-attempt-1`, set `Pipeline Status=validation-pending`, add `auto-pipeline`, run workflow |
| Want scribe to track docs drift | Post `[developer:rationale]` on ticket before `pipeline:qa-approve` |
| Skip scribe entirely | Don't `pipeline:qa-approve`; merge to main via manual cherry-pick (rare) |

---

## 11. When to update this doc

- A new pipeline route or label is introduced → update §3 and §10.
- The auto/cowork contract changes (e.g. label semantics shift) → §2.
- A new sharp edge surfaces in the wild → §9.
- Scribe input shape changes → §7.

This doc is the source of truth for "which route should this ticket
take?" and "how do I move a ticket between routes?". `CI-CD.md` remains
the source of truth for "how does the autonomous pipeline work."
