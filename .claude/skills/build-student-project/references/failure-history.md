# Failure history — every rule in this skill, and the failure that bought it

Each entry: **what happened**, **the evidence**, **what changed**, and **what is still
only prevented by someone remembering**. Dates are the date the failure was *found*,
not the date it started. Nothing here is hypothetical.

---

## H-1 · Publish is a separate call, and nothing in the UI makes it

**Found:** 2026-08-13, by auditing `build_plans.status` for the cohort rather than by
reading a bug report.

**What happened.** Five students finished the wizard, watched it say their build was
ready, and ended class with nothing to work on. Their plans existed — `build_plans`
held a perfectly good gate-clean row for each of them — at `status='draft'`. A draft
materialises nothing: no `student_task_lists`, no `student_tasks`, no STORY-000, no
`enrollments.active_project_id`. The Projects page reads materialized tasks, so it had
nothing to render.

**The evidence, still true at `origin/main` 4078338f.** `publishBuild()` is exported
from `frontend/src/services/sbpApi.ts:141` and **imported by nothing**:

```
$ grep -rn "from '.*sbpApi'" frontend/src --include=*.tsx | grep -v __tests__
frontend/src/pages/portal/projects/ProjectsPage.tsx:9:import { resolveBackendProjectId, startBuild as startServerBuild, pollBuild } from '../../../services/sbpApi';
frontend/src/pages/portal/projects/ProjectWizard.tsx:4:import { fetchIntakeQuestions, IntakeQuestion } from '../../../services/sbpApi';
```

`resolveBackendProjectId`, `startBuild`, `pollBuild`. No `publishBuild`. The server
side is complete and correct — `POST /api/portal/sbp/builds/:projectId/publish` works,
and `publishBuild()` in `sbpOrchestrator.ts:290` does the whole downstream chain. It is
simply never called by a browser.

**Why it looked fine.** `runGeneration` sets the intake status to `drafted` on success
(`sbpOrchestrator.ts:187`), and `drafted` is a terminal state for the poller
(`isTerminal`). The wizard polls, sees a terminal non-failure state, and stops with a
success shape. Every log line says the build succeeded, because generation *did*.

**What changed:** nothing in code yet, as of this skill being written. This is the
open one.

**Still only prevented by remembering:** publish must be triggered by hand for every
student until a caller lands. See SKILL.md Phase 5.

---

## H-2 · The browser has its own fallback build, and it looks plausible

**Found:** originally documented 2026-08-09 in `docs/BUILD_PIPELINE_AUDIT.md` F-2;
still live as the deliberate fallback path.

**What happened.** Before the pipeline existed, `ProjectsPage.handleCreate` called
`createProjectFromAnswers(answers)` — entirely client-side:

```ts
window.setTimeout(() => { p.status = 'ready'; p.lists = skeleton.lists; ... }, 7000);
```

A 7-second timer flipping a status flag. `generateSkeleton()` is a fixed 4-list /
10-task template with the project name and the first data source string-substituted in.
Twenty students starting builds at the same time received twenty substantively
identical projects.

That generator was **kept on purpose** when the pipeline was wired in (2026-08-10):
"Any failure falls back to the local generator, and a banner tells the student which
path produced their plan. The fallback is deliberate rather than defensive: the local
path still produces something workable, so a pipeline problem degrades plan *quality*
instead of leaving a student with nothing."

**Why it matters now.** The fallback shape is diagnostic. Ten-ish tasks, four lists
named `Project DNA & Requirements` / `Core build` / `Reliability & polish` /
`Showcase & portfolio`, no due dates, no STORY-000, no release keys `r0..rN`, and the
cluster ids are localStorage release ids (UUIDs) rather than `r0`, `r1`, `prep`. If you
are looking at that, **the server pipeline never landed** — do not debug the plan, debug
the pipeline.

**Prevented in code:** the banner naming which path produced the plan.
**Still only prevented by remembering:** the banner is a banner. A student who does not
read it, or a staff member looking over their shoulder, cannot tell the difference from
the task list alone without checking the shape above.

---

## H-3 · STORY-000 is injected at materialize, not generated

**Found:** shipped 2026-08-13, PR #1423.

STORY-000 (`COMMAND_CENTER_STORY_ID`, `commandCenterStory.ts:26`) is written by
`materializeTasks.ts:114-141`, as the first task of the first release, **before** any of
the student's own stories. It is deliberately outside the plan and outside the
traceability gate: it fulfils no requirement of the student's system because it is not
part of that system — it is the window onto it. Its `fulfills` is `[]` and its
`acceptance` is the fixed `COMMAND_CENTER_ACCEPTANCE` constant.

**Why this is a load-bearing diagnostic.** It cannot be generated, renamed, or merged
away by the decomposer, and it cannot be present without `materializePlanAsTasks` having
run. `materializePlanAsTasks` is only called from `publishBuild`. Therefore:

> **No STORY-000 ⇒ publish did not run.** There is no other way for it to be absent.

Its due date is `ctx.schedule?.buildStart ?? null` — day one of the build window. So a
STORY-000 with a null `due_on` is H-4, not H-3.

---

## H-4 · No cohort start date means no dates and no demo-prep tasks

**Found:** designed in 2026-08-12 with `buildSchedule.ts`; the degradation is intentional.

`scheduleFor()` (`sbpOrchestrator.ts:382`) runs:

```sql
SELECT c.start_date FROM enrollments e
  JOIN cohorts c ON c.id = e.cohort_id
 WHERE e.id = $eid AND c.start_date IS NOT NULL LIMIT 1
```

No row ⇒ it logs `sbp_schedule_skipped` with `reason: 'cohort has no start_date'` and
returns `null`. The build still publishes. `materializePlanAsTasks` then writes every
task with `due_on: null`, and `ctx.schedule?.prep ?? []` is empty, so **the entire demo
prep list is silently absent** — no PREP-1..PREP-6, no Demo Day task.

This is deliberate: "A missing cohort date must never cost a student their build." But
it means a schedule failure and a schedule *skip* look identical from the task list. The
log line is the only distinguishing evidence, so check `cohorts.start_date` before
blaming the pipeline.

**Prevented in code:** the fail-soft, and the structured log with the reason.
**Still only prevented by remembering:** nobody is alerted. A cohort with a null
`start_date` produces undated builds for every student in it, forever, quietly.

---

## H-5 · The student's CLAUDE.md is theirs

**Found:** 2026-08-13, PR #1453 ("Stop overwriting the student's CLAUDE.md").

The pipeline writes `CLAUDE.md` into every student repo. Students already have a
CLAUDE.md with their own conventions in it, and the writer **replaced the whole file**,
so a republish silently deleted work they had written. It also compared against our own
manifest rather than the file's real contents, so an edit made by hand was not even
noticed before being overwritten.

`managedBlock.ts` is the fix. We own a delimited block and nothing else:

```
<!-- COLABERRY:BEGIN — managed by the build pipeline. Edits inside this block are overwritten. -->
…
<!-- COLABERRY:END -->
```

- no existing file → the block alone
- existing file with our markers → the block replaces what is between them
- existing file without our markers → the block is **appended**, their content untouched

Applied at `repoWriter.ts:255-259`, and only for a `CLAUDE.md` we are already
committing, so the no-op path stays silent. A failed read splices against `null`, which
appends rather than clobbering a file we could not see.

**Prevented in code:** the splice, plus `withoutManagedBlock()` so a test can prove a
splice did not disturb the student's own lines.
**Still only prevented by remembering:** the allowlist is `CLAUDE.md`, `docs/**`,
`.colaberry/**` (`renderDocs.ts:41`). Any *new* file the pipeline ever writes into a
path a student also authors needs the same treatment. Only CLAUDE.md has it today.

---

## H-6 · `story_id` is not unique across projects

**Found:** 2026-08-13, PR #1419. The most expensive one.

Every plan numbers its stories `STORY-001` upward. `story_id` was being used as the
identity key. Two separate real failures came out of that:

**(a) A stale browser tab overwrote 18 published tasks.** The portal mirrors the
browser's localStorage into the backend on load, and `importProject` resolved its target
with `createProjectForEnrollment()`, which returns the **active** project — not the
project the client state came from. Timeline from the live account:

```
08:30:09  publish makes a new project active, 18 tasks materialized
08:35:25  a tab opened before 08:30 loads, mirrors its localStorage
          → all 18 published tasks rewritten with a different project's content
```

Every row matched, because both plans number their stories `STORY-001` upward.

**(b) A new project was invisible behind an older one.** Same root cause seen from the
other side — the "duplicate release lists with UUID clusters" that had been written off
the day before as legacy data were localStorage release ids from the other project.

**Prevented in code:** import now refuses to write when the target has a published plan,
returns the tree so the portal still renders, and logs `project_import_skipped_published`.
`materializePlanAsTasks` keys `findOrCreate` on `{ project_id, story_id }` — the pair,
never `story_id` alone.

**Still only prevented by remembering:** *your* queries. Any ad-hoc SQL, any script, any
audit that matches on `story_id` alone is reproducing the bug. Always constrain by
`project_id`, or by containment (`WHERE project_id IN (…)`).

---

## H-7 · Mocked tests do not prove DDL ran

**Found:** twice. First on a schema fix earlier in the program, then again on
`makeActiveProject` (2026-08-12), which is what made it a rule.

`ensureSbpSchema()` runs its statements in a loop that swallows every failure:

```ts
for (const sql of statements) {
  try { await sequelize.query(sql); }
  catch (err: any) { console.warn('[DB] sbp schema stmt skipped:', err?.message); }
}
```

`ensureSbpSchema` therefore **always resolves**. "Nothing threw" is not evidence the
ALTER landed. And `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table, so on
any database that already had these tables the `ALTER … ADD COLUMN IF NOT EXISTS`
statements are the only thing creating the newer columns.

The companion failure: `makeActiveProject` originally wrote `SET active_project_id = …,
updated_at = NOW()`. `enrollments` has no `updated_at` column in production. The
statement threw on every publish, the catch swallowed it, and **the invisibility bug it
was written to fix stayed live while PROGRESS.md said it was closed** — because the unit
tests mock `sequelize.query` and so never see a column name at all.

**Prevented in code:** `assertSbpSchema()` checks `information_schema.tables`,
`information_schema.columns` and `pg_indexes` after the loop and logs a
`SchemaInvariantViolation` naming each missing object. `ACTIVE_PROJECT_COLUMNS`
(`sbpOrchestrator.ts:469`) is asserted against the real `Enrollment` model by
`sbpOrchestrator.activeProject.test.ts`, so a non-existent column is caught statically.

**Still only prevented by remembering:** `assertSbpSchema` *logs*; it does not throw and
does not halt boot. Nobody reads it unless they look. After any schema change, assert
the post-condition yourself against `information_schema` — see
`references/verification-queries.md`.

---

## H-8 · `complete` cannot be set by the client

**Found:** 2026-08-13, PR #1459.

`setTaskStatus` and `setTaskStatusByStory` took `status` straight from the request body
behind nothing but an ownership check, and `complete` was a legal value in the route's
Zod enum. A student owns every task in their own project, so **ownership authorised
nothing**: any participant could open devtools and PATCH their entire plan to `complete`
on either `PATCH /api/portal/projects/tasks/:taskId` or
`PATCH /api/portal/projects/tasks/by-story/:storyId`. Points are gated on completion,
which would have made the verification chain theatre.

Now:

- client status writes are allowlisted to `not_started` / `in_progress` / `blocked` —
  the student's own planning, which asserts nothing and earns nothing
- `complete` is refused with **409** and a message explaining how completion actually
  happens; the refusal throws before any I/O, so a refused write cannot have touched
  the row. Zod deliberately keeps `complete` in the enum so the answer is a 409 that
  explains, not a generic 400 "invalid enum value" that reads like a client bug
- `markTaskVerifiedComplete(projectId, storyId, evidence)` is the only path to
  `complete`. It is wired to **no route** and takes no `enrollmentId`, because it is not
  a request — it is the verification pipeline writing down a conclusion it already
  reached. It stamps `student_tasks.verified_at` / `verified_by` (PR #1456) and is
  replay-safe: the first verification is the one that counts
- same hole, second door: the **import payload** is client-authored too, so a `complete`
  in it is a claim as well, and is demoted to `in_progress` on the way in

**Prevented in code:** 25 adversarial tests in `projectTaskStatusGuard.test.ts`, proven
non-vacuous by mutation (remove the guard, 10 fail).
**Still only prevented by remembering:** points gate on `verified_at`, not on `status`.
A task showing `complete` with `verified_at IS NULL` earns nothing, and no surface says
so out loud yet.

---

## H-9 · Agent scoping is flagged per enrollment and fails soft

**Found:** designed that way; the fail-soft fired for real on a live build.

`SBP_AGENT_SCOPING` is `'off'` (default), `'all'`, or a **comma-separated list of
enrollment ids** (`agentScopingEnabledFor`, `scopeAgents.ts:212`). A list rather than a
boolean because the first audience is a single account being tested while a cohort is
mid-class on the same deployment.

Scoping runs **after** the gate, on a plan that is already publishable. If the call
fails, times out, returns malformed JSON, or returns a roster with a placeholder name
(`System`, `Team`, `Developer`, `User`, `Admin`, `Staff`, `Unassigned`), the plan is
returned **unchanged** with its original `owner_agent` values. Reasons logged:
`upstream`, `malformed`, `placeholder_name`, `disabled`.

It silently failed on a live build for a real reason worth knowing: the request body
carried a `timeout` key. It reads like a per-call option and the mocked unit tests
accepted it happily, but the real API answers `400 Unrecognized request argument
supplied: timeout`. The timeout belongs on the client.

**Prevented in code:** two rules enforced rather than asked for — an agent touching a
`SAFE` requirement is capped at `acts_with_approval` with that requirement recorded as
its approval gate; and every story keeps an owner, so a roster that misses a story
leaves it with the owner it had.
**Still only prevented by remembering:** `owner_agent` on a plan with scoping off is
whatever the decomposer invented — job titles like "Contract Manager", and "System"
owning half the build. That is not a bug in the plan; it is scoping being off.

---

## H-10 · Things a newcomer gets wrong that cost nothing yet

Found by reading the code for this skill. No production incident behind these, which is
exactly why they are worth writing down before there is one.

**(a) The repo-write idempotency guarantee is currently defeated at the call site.**
`writeDocsToRepo` is built so an unchanged plan makes zero network calls and produces no
commit — `changedFiles()` compares rendered content against the manifest already in the
repo. But `publishBuild` passes `null` for that manifest:

```ts
const write = await writeDocsToRepo(
  { owner: opts.repo.owner, repo: opts.repo.repo },
  files,
  null,   // TODO(step 6): read the existing manifest so conflict detection can run
  ...
```

`parseManifestHashes(null)` returns `{}`, so **every** file looks changed and every
publish commits all ~16-19 files. The guarantee exists in the function and is not yet
reachable in production. Do not cite "unchanged ⇒ no commit" as current behaviour.

**(b) `getBuildState` returns the *latest* plan, not the published one.** `getPlan()`
with no version is `ORDER BY version DESC LIMIT 1`. There is a separate
`getPublishedPlan()` that filters `status='published'`, and the orchestrator does not
use it. So a project with v1 published and v2 drafted reports the draft. Never infer
published-ness from the poll response; query `build_plans.status`.

**(c) `publishPlan` is idempotent but `publishBuild` is not free.** `publishPlan`
returns early if the row is already `published`, but `publishBuild` still re-renders,
re-writes the repo, re-materializes, and re-sets the active project. That is safe —
materialize is `findOrCreate` keyed on `(project_id, story_id)` and preserves any
`complete` — but it is not a no-op, and it will produce a repo commit every time (see
(a)).

**(d) Advisory violations are expected on published plans.** Nine rules block
(`BLOCKING_RULES`, `planGate.ts:79`); everything else rides along as a warning.
`story_is_layer` or `story_redundant_scaffold` on a published plan is **normal**, not a
symptom. `gate_ok=false` with `status='published'` is a valid, intended state.

**(e) The tier is not a duration.** `size` is `workflow` | `project` | `autonomous` and
selects generation depth (`buildTiers.ts`): 8-12 / 18-24 / 30-40 requirements, 3 / 5 / 7
releases. Anything unrecognised silently falls back to `project`. The wizard used to
advertise "~5 / ~13 / ~21 min" with no telemetry behind it; those numbers were removed
because they were invented. Do not reintroduce a time estimate.

**(f) The timeline is a cohort constant, not a student choice.** `buildSchedule.ts` fixes
build start at cohort week 4, prep at week 11, demo at week 12, and capacity at 1-2
tasks/week. A plan bigger than capacity is **not cut** — the release that fits is marked
the demo release and the rest becomes the post-class roadmap. `targetWeeks` from the
intake is scheduling *context* for the decomposer only; it deliberately does not become
a requirement, because the first live run turned "TIMELINE: 6 weeks" into REQ-016 "The
system must be deployed within 6 weeks", which no story can fulfil and which the
coverage rule then flagged as an uncovered must-have.

**(g) The provisioning queue is bounded, and that is a wait, not a hang.**
`SBP_PROVISION_CONCURRENCY` defaults to 3, `SBP_PROVISION_MAX_DEPTH` to 100. Measured:
the twentieth student in a synchronised rush waits about **237 seconds**. That is inside
the frontend's poll deadline. A build sitting in `generating` for four minutes during a
class rush is the design working.

**(h) Local `npx tsc` in an SBP worktree is a trap.** It resolves the junctioned OneDrive
`node_modules` (TypeScript 4.9.5), which misparses zod v4 and reports ~267 phantom errors
inside `node_modules`. Invoke a 5.x binary explicitly. CI has its own and is unaffected.
