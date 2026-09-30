# Handoff — Student Build Pipeline, steps 1–5

**Run:** `20260809-1915-sbp-steps-1-5` · **Session:** CC-20260809-b7k2
**Branch:** `workstream/sbp-pipeline-steps-1-5` → **PR #1315**
**Status:** 17 of 17 tasks complete. **Nothing deployed. Nothing merged to main.**

---

## What this fixes, in one paragraph

You found that the prompts students copy told Claude Code to read `./docs/REQUIREMENTS.md` — a file that existed for nobody. Behind that sat a bigger problem: the "build" was a 7-second timer, the plan it produced piled 8 of 12 stories into one release with three that weren't real stories, and the plan you reviewed wasn't the plan that got saved. This branch fixes all of it and proves the prompt paths resolve in a real GitHub clone.

---

## Before you can use it — two things I could not do

1. **`GITHUB_TOKEN` is missing from production's `.env`.** Repo provisioning returns 503 without it. Nothing else in this branch needs it, but students can't get a workspace repo until it's set.
2. **Two scratch repos need deleting** — my token lacks `delete_repo`:
   `ColaberryIntern/sbp-live-check-msnakjkt` and `ColaberryIntern/sbp-live-check-msnapysj`

---

## How to check it yourself

Everything below runs against **dev or local** — none of it touches production.

### 1. The gate rejects your actual pilot plan (2 min)

Your Sponsor Dashboard plan is checked in as a test fixture, so the rules are graded against real output rather than an invented example.

```bash
cd C:/Users/ali_m/sbp-r0-wt/backend
node ../node_modules/jest/bin/jest.js src/services/sbp/__tests__/planGateFixture.test.ts --verbose
```

**Expect:** the four stories you and I both judged fake — `STORY-008` (connects to Postgres), `STORY-009` (sends email via Mandrill), `STORY-011` (ensure compliance), `STORY-012` (establish trust spine) — are each rejected, and `STORY-004`/`STORY-010` are explicitly *not*. The 8-in-r0 skew is rejected too.

**Why it's worth watching:** two earlier versions of these rules passed their own tests and still let the bad plan through. The test now asserts the flagged set is *exactly* those three stories, so a rule that over-fires breaks the build.

### 2. The whole suite (5 min)

```bash
cd C:/Users/ali_m/sbp-r0-wt/backend
node ../node_modules/jest/bin/jest.js src/services/sbp src/services/__tests__/studentWorkspaceService.test.ts
```

**Expect:** 11 suites, ~218 tests, all passing.

### 3. The live GitHub run — the one that matters (3 min)

This is the only check that doesn't mock GitHub. It creates a scratch repo, commits the documents, builds a prompt, clones the repo, and opens every path the prompt names.

```bash
cd C:/Users/ali_m/sbp-r0-wt/backend
GITHUB_TOKEN="$(gh auth token)" TS_NODE_TRANSPILE_ONLY=true \
  node -r ../node_modules/ts-node/register src/scripts/sbpLiveEndToEnd.ts
```

**Expect:** `LIVE CHECK PASSED`, with all four prompt-cited paths resolving in the clone and `re-write makes NO commit`.

**It will leave a scratch repo behind** (`sbp-live-check-…`) because the token can't delete. Delete it after.

### 4. See a generated document set

```bash
GITHUB_TOKEN="$(gh auth token)" TS_NODE_TRANSPILE_ONLY=true \
  node -r ../node_modules/ts-node/register src/scripts/sbpLiveEndToEnd.ts --keep
```

Then open the repo it prints. Read `docs/stories/STORY-001.md` — that's what a student's Claude Code session opens. Judge whether you'd hand it to an intern.

---

## The production migration

**Not applied.** Two files, both rehearsed:

- `docs/migrations/2026-08-10-sbp-schema.sql`
- `docs/migrations/2026-08-10-sbp-schema.rollback.sql`

**Rehearsed on a scratch database, and the rollback proven to restore the catalog exactly:**

```
BEFORE   : new_tables=0  old_unique=1  new_unique=0  rows=1
AFTER    : new_tables=2  old_unique=0  new_unique=1  rows=1
RESTORED : new_tables=0  old_unique=1  new_unique=0  rows=1
```

`BEFORE` and `RESTORED` are identical, and the row survived both directions.

**The one precondition that matters.** Run this before migrating:

```sql
SELECT count(*) FROM github_connections
 WHERE repo_owner='ColaberryIntern' AND repo_name LIKE 'student-workspace-%';
```

**It must be 0.** It is today — which is why no `project_id` backfill is needed. If it isn't, stop: a real student repo exists and needs a project assigned first.

**You may not need to run it at all.** The app applies the same changes at boot, idempotently. Running it by hand first is for seeing the change land before the deploy rather than discovering it in a log.

**To roll back:** revert the code first, then run the rollback file. Otherwise the next boot re-applies the schema.

---

## What's deliberately not done

- **T11, the mandatory GitHub-username wizard step.** Making it mandatory is only honest once provisioning works end to end in production, and that needs `GITHUB_TOKEN` set. Shipping the requirement before the capability would block students behind a step that can't succeed.
- **Steps 6–11 of the architecture** (§12 of `BUILD_PIPELINE_GITHUB_SYNC.md`): conflict detection, webhook + projection, gated mark-done, the workspace page, dashboard panels, and the "builds"→"projects" rename.
- **Nothing regenerated your pilot project.** It still shows the old 8/1/1/1/1 plan. Re-running your Sponsor Dashboard brief through the fixed pipeline and comparing is the most informative next thing you could do.

---

## Known limitations

- **Progress is still self-reported.** Mark-done is not yet evidence-gated (that's step 8). A student can still tick a box for work they haven't done.
- **The invented-vendor check is a denylist** of things the pilot actually hallucinated (Stripe, PayPal, HIPAA…), not general novelty detection. It catches the observed failures, not every possible one.
- **The unfalsifiable-requirement check is pattern-based.** It catches "relevant regulations" and "user-friendly"; it won't catch every untestable statement.
- **Generation quality still depends on the brief.** Grounding in your own words eliminated every hallucination on re-run, but a vague brief still produces a vague plan.

---

## Three defects the tests caught that review didn't

Worth knowing, because it's the pattern of the whole session:

1. **The first F-1 fix did nothing.** `DROP INDEX` against a constraint-backed index; Postgres refused; a warn-only boot loop swallowed it. Shipped green through 4 CI checks. Found by running it against the real database.
2. **The JSON schema couldn't express a field its own gate rules read.** `blocked_by` was declared on the type but absent from the schema with `additionalProperties: false`, making two rules unreachable on real model output. Found by an independent verifier.
3. **The manifest made every sync look dirty.** 22 mocked tests passed; the live run committed on the second write. A manifest can't contain its own hash. Found only by the real GitHub run.

Each looked correct on the page. Each was wrong.
