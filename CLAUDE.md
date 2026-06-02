# Claude Code Project Instructions

## Coding Principles

These four principles apply to every code change in this repo, alongside the workflow and cost rules below.

### 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what's confusing, and ask.

### 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Test: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that *your* changes orphaned. Leave pre-existing dead code alone unless asked.

Test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
Define success criteria. Loop until verified.
- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that reproduces it, then make it pass."
- "Refactor X" → "Ensure tests pass before and after."

For multi-step tasks, state a brief plan with verification checkpoints. See the Testing section for how this pairs with bugfix workflow.

## Pipeline Routes — Autonomous and Manual

The `quadzero-scout/` repo runs an autonomous pipeline: tickets labeled `auto-pipeline` are picked up by GitHub Actions and walked from new through merged-to-develop by four Claude-powered agents (tester, developer, pr-reviewer, scribe). See `quadzero-scout/CI-CD.md` for the full pipeline reference.

**You (working with the user in VS Code) are the manual route.** The two routes coexist by separating ownership via the `auto-pipeline` label. See `quadzero-scout/docs/two-route-playbook.md` for the full contract.

Four rules that must not be violated when working a ticket manually:

1. **Do not add the `auto-pipeline` label.** That label is the autonomous pipeline's opt-in. A ticket without it is invisible to the pipeline; a ticket with it (in a non-terminal Pipeline Status) will be picked up by cron within 5 min — racing whatever you're doing.
2. **Use a `-cowork` branch suffix.** Name branches `<type>/ticket-<N>-cowork` (e.g. `feature/ticket-87-cowork`). This prevents collision with autonomous attempt branches (`<type>/ticket-<N>-attempt-<K>`).
3. **Post a `[developer:rationale]` comment before `pipeline:qa-approve`.** The scribe agent reads this comment post-QA to decide whether to file a follow-up docs ticket. See the playbook §7 for the exact shape. If you skip it, scribe falls back to merge-diff-only analysis and may miss intent.
4. **Do NOT merge to develop; mark `status:ready-for-qa` with the branch intact.** In the branch-isolated model `develop` is approved-only — the branch is merged to develop later, at `pipeline:qa-approve`. After your PR is reviewed, run `scripts/set-status.sh <N> ready-for-qa` (and, if the ticket is on the project, `scripts/set-field.sh <N> "Pipeline Status" awaiting-qa`). Then `pipeline:qa-deploy`. QA is single-tenant — only one ticket can be in QA at a time.

### Working from a ticket number

When the user says "let's work on ticket #N":

1. Read the issue body via `gh issue view <N>`. Note acceptance criteria, design notes, open questions.
2. If acceptance criteria are ambiguous or the change is architecturally non-trivial, surface it before coding (per Coding Principle 1).
3. Confirm the ticket isn't in flight on the autonomous side. If it has `auto-pipeline` and a non-terminal Pipeline Status, ask whether to take over (label `pipeline:park` to halt the autonomous run) before proceeding.
4. Branch as `<type>/ticket-<N>-cowork` from `develop`.
5. Implement and test (per Coding Principle 4); commit with conventional commits.
6. Post `[developer:rationale]` on the issue.
7. Open the PR targeting `develop` with `Closes #<N>` in the body. Get it reviewed but **do not merge it** — the merge to develop happens at `pipeline:qa-approve`.
8. After review, run `scripts/set-status.sh <N> ready-for-qa` (branch + PR left intact), then `pipeline:qa-deploy` to put it on QA. `pipeline:qa-approve` squash-merges it to develop; `pipeline:qa-reject` resets QA and reworks it.

## Git Workflow

### Branching
- Create a feature or bugfix branch from `develop` before starting work.
- Branch naming: `feature/<description>`, `bugfix/<description>`, `hotfix/<description>`, `docs/<description>`, `refactor/<description>`.
- Use lowercase kebab-case for branch names.
- When work is complete, open a PR targeting `develop`.
- After PR merge, delete the source branch.
- Never push directly to `develop`, `qa`, or `main`.

### Hotfixes
- For urgent production issues, branch from `main` as `hotfix/<description>`.
- Open a PR to `main`. After squash-merging it, immediately run `scripts/back-merge-main.sh`, which merges `main` into `develop` **and** forces a re-QA of any ticket then in QA (a hotfix moves `develop`, which invalidates an in-flight QA ticket — it was tested against the pre-hotfix develop). Don't hand-merge `main`→`develop` without this guard.

### Commits
- Follow Conventional Commits. The full type list and when to use each is in `quadzero-scout/CONTRIBUTING.md` §Commit Types — that file is the single source of truth for commit conventions.
- Do not include "Co-Authored-By" lines in commit messages.
- Keep commit subjects under 100 characters.

## Library Selection
- Before adding a new dependency, evaluate candidate libraries for known issues, compatibility problems (especially with bundlers like esbuild and Lambda/serverless environments), and maintenance status.
- Prefer libraries with fewer open issues, active maintenance, and proven compatibility with the project's runtime (Node.js ESM, esbuild, AWS Lambda).
- If multiple libraries solve the same problem, select the one with the least reported issues and best ecosystem support.

## Branch Aliases
- develop = dev
- qa = quality
- production = prod = main

## Deployment

The project is a monorepo at `quadzero-scout/` with `backend/`, `frontend/`, and `infra/` directories.

### Branch-to-Stage Mapping
| Git Branch | Stage | Environment |
|------------|-------|-------------|
| `develop`  | dev   | Development |
| `qa`       | qa    | QA / Staging |
| `main`     | prod  | Production |

### Front-end (AWS Amplify)
- Amplify auto-deploys when branches are pushed to origin. No manual deployment step needed.
- Pushing to `develop`, `qa`, or `main` triggers the corresponding Amplify environment automatically.

### Back-end (Serverless Framework)
- Requires manual deployment from the `quadzero-scout/infra/` directory.
- Deploy command: `npx serverless deploy --stage <stage>`
  - `npx serverless deploy --stage dev` — deploy to dev
  - `npx serverless deploy --stage qa` — deploy to qa
  - `npx serverless deploy --stage prod` — deploy to prod
- Region: `ap-south-1` (default)

### Pushing Features to an Environment

Promotion is now ticket-driven, not branch-driven. See `quadzero-scout/CI-CD.md` §5.5.

**Per-ticket, branch-isolated** (QA validates one ticket at a time; `develop` is approved-only). Use the label-driven path on the ticket itself. See `quadzero-scout/CI-CD.md` §5.7.

- `pipeline:qa-deploy` → single-tenant hard stop (refused if another ticket holds `status:in-qa`); merges `develop` into the ticket's branch, runs the regression suite, then points `qa` at it (frontend via Amplify; backend via `serverless deploy --stage qa`). A conflict or red suite leaves QA untouched and reworks the ticket.
- `pipeline:qa-approve` → squash-merges the ticket's branch to `develop`, marks `status:qa-approved`, releases the QA lock. Ships at the next nightly mirror.
- `pipeline:prod-release` → break-glass: runs the `develop`→`main` mirror immediately rather than waiting for the nightly window.

This path tracks ticket lifecycle via `status:*` labels and feeds the scribe agent and release notes correctly. **Prefer it.**

**Do not push develop straight to qa.** QA is a single ticket's branch at a time, not the integrated `develop`. Pushing all of `develop` to `qa` is exactly the leak this model removed — promote one ticket via `pipeline:qa-deploy`.

**Do not bulk-promote to prod.** Prod ships only via the nightly `develop`→`main` mirror (`scripts/prod-release.sh`) or the break-glass `pipeline:prod-release`, both of which ship whatever is qa-approved on `develop`. For an urgent direct-to-prod fix, follow Git Workflow → Hotfixes below (branch `hotfix/<description>` from `main`, PR to `main`, then `scripts/back-merge-main.sh`).

## Context Loading at Conversation Start
- At the beginning of every new conversation or discussion, **always read the `/docs` folder** before doing any work.
- Specifically, scan the documentation files to understand the current state of the project — architecture, data models, API contracts, feature specifications, and any recent changes.
- This ensures decisions and code changes are grounded in the latest project context, avoiding contradictions with existing designs or duplicating solved problems.
- Do NOT skip this step even if the user's request seems simple or self-contained; the docs may contain constraints or conventions that affect the approach.

## Cloud Cost Impact Assessment
- Before making any code change, assess whether the change affects AWS cloud services (e.g., Lambda, DynamoDB, S3, Amplify, API Gateway, CloudWatch, SQS, SNS, etc.).
- If a change introduces, modifies, or removes cloud resources — or alters usage patterns that could affect cost (e.g., increased invocations, larger payloads, new tables, additional storage, higher throughput, new scheduled triggers) — **present a cost impact assessment to the user before proceeding**.
- The assessment should include:
  - Which AWS services are affected.
  - The nature of the cost change (increase, decrease, or neutral).
  - A rough estimate of the cost delta where possible (e.g., "adding a DynamoDB GSI on a table with ~10K items will add ~$0.25/month").
  - Any free-tier considerations.
- If the change is purely application logic with no cloud service impact, note that briefly and proceed.
- This applies to changes in `backend/`, `infra/` (Serverless config), and any infrastructure-as-code files. Frontend-only changes typically have no direct cost impact unless they affect Amplify build minutes or hosting bandwidth.

## LLM Cost Impact Assessment
- Before making any code change that affects LLM usage, **present a cost impact assessment to the user before proceeding**.
- The project uses a pluggable LLM provider architecture (Claude, OpenAI, Gemini, OpenRouter) configured via `LLM_PROVIDER` env var. Changes may affect costs differently per provider.
- Cost-impacting changes include but are not limited to:
  - Modifying or adding system/user prompts (larger prompts = more input tokens).
  - Changing the response format or expected output structure (affects output token count).
  - Adding new LLM-powered features or call sites (e.g., a new parsing/analysis step).
  - Switching models (e.g., from `claude-sonnet` to `claude-opus`, or from `gemini-flash` to `gemini-pro`).
  - Changing retry logic or adding fallback calls to a secondary provider.
  - Altering caching behaviour (prompt cache TTL, cache hit/miss patterns) that could increase redundant LLM calls.
  - Modifying batch sizes or introducing loops that call the LLM per-item instead of in bulk (or vice versa).
- The assessment should include:
  - Which LLM call sites are affected (e.g., `parseResume`, `parseJobDescription`, `formatResume`, `compareRequirements`).
  - Estimated change in input/output token counts per invocation.
  - Per-call cost delta using the current provider's pricing (reference the active `LLM_PROVIDER`).
  - Projected monthly cost impact if usage volume is known or can be estimated.
  - Whether the change affects all providers uniformly or is provider-specific.
- If a change touches LLM-adjacent code (e.g., handler logic around an LLM call) but does not alter prompts, models, or call frequency, note that briefly and proceed.

## Testing
- For bugfixes: write a failing test that reproduces the bug *first*, then make it pass (per Coding Principle 4).
- For new features: add tests covering the happy path and the main edge cases alongside the implementation.
- For changes to existing features: update affected tests to reflect new behavior; add tests for any new branches.
- A change is not "done" until its relevant tests are green locally.

## QA & Hotfix Guardrails

The branch-isolated model (CI-CD.md §5.7) serializes QA — one ticket at a time — and makes `develop` an approved-only trunk mirrored to `main`. That removes the cherry-pick dependency failures of the old model, but introduces its own rules.

### QA is single-tenant
Only one ticket can hold `status:in-qa`. `pipeline:qa-deploy` on a second ticket is refused until the first is approved or rejected. Don't expect to validate two tickets in QA simultaneously; drain one before deploying the next.

### qa-approve is a one-way door to prod
Approving a ticket squash-merges it to `develop`, and the next nightly mirror ships everything on `develop` to `main`. There is no "approved for dev but held from prod" state. To hold work back, keep it in QA (don't approve). To roll back a shipped change, revert it on `develop` (it ships out at the next mirror).

### Back-merge after hotfix via the guard
After squash-merging a hotfix PR to `main`, run `scripts/back-merge-main.sh` (not a hand-merge). It merges `main`→`develop` and, if a ticket is in QA, resets `qa` to develop and sends that ticket back to `awaiting-qa` so the human re-runs `pipeline:qa-deploy` (re-merging the hotfixed develop into the branch and re-testing).

### Test mock completeness
When `dynamodb.ts` (or any heavily-mocked module) gains a new export, add a matching mock entry in `recruiter.test.ts` (and any other test files that mock that module). Vitest's auto-mock won't cover new exports, and the error (`No "X" export is defined on the mock`) only surfaces at test runtime, not at type-check time.

### In-memory state and test isolation
Module-level state (caches, Maps, singletons) persists across vitest tests. `vi.clearAllMocks()` only resets mock call counts and return values — it does not touch application state. If a module has in-memory state that affects test behavior, export a `_clear*` helper (prefixed with underscore to signal test-only use) and call it in `beforeEach`.

## Documentation

Two patterns depending on the work:

- **If the ticket IS itself a docs ticket** (`type:docs`): update `/docs/` (or `README.md`, `CI-CD.md`, etc., as applicable) in the same PR. The diff IS the deliverable.
- **For any other ticket** that affects user-visible behavior or architecture: do NOT update `/docs/` in the same PR. Instead, populate the **Doc updates needed** section of your `[developer:rationale]` comment on the ticket. The scribe agent reads it post-QA and files a follow-up `auto-pipeline,type:docs` ticket if needed (see `quadzero-scout/CI-CD.md` §5.9).

This split exists so docs PRs are reviewed as docs and code PRs are reviewed as code. If your change is purely internal (refactor, internal helper, bug fix that restores intended behavior), put "None — internal change with no user-visible impact" in the "Doc updates needed" section so scribe doesn't file a spurious ticket.
