---
name: build-student-project
description: Stand up one student's capstone build through the Student Build Pipeline end to end — intake interview, decompose, gate, repair, scope agents, persist the draft, PUBLISH, materialize tasks, render docs, commit to their repo — and then prove with queries that the student can actually see it. Invoke when Ali says "set up <student>'s build", "their Projects page is empty", "my tasks have no dates", "the Command Center is missing", when a cohort is about to start builds, or before any class where students are expected to open a plan. Also invoke to audit a whole cohort for builds that generated but never published. Code lives in backend/src/services/sbp/.
---

# build-student-project — the Student Build Pipeline runbook

The **Student Build Pipeline (SBP)** turns a student's one-paragraph idea into a
requirements-traced, release-gated, dated plan; materializes it into the tasks their
portal renders; and commits the document set into their workspace repo. The spine is
`backend/src/services/sbp/sbpOrchestrator.ts`; every other module in that folder is a
component it calls. Routes: `backend/src/routes/sbpRoutes.ts`. Everything here is
verified against `origin/main` `4078338f` (2026-08-13).

> **This skill was hardened from the night five real students ended class unable to see
> any work.** Nothing below is defensive theory — each rule is a failure that already
> happened, with the evidence in
> [references/failure-history.md](references/failure-history.md). Read "Read this
> first" before touching anything. The audit that found the top rule was worth more
> than any feature shipped that night.

---

## Read this first — the five that cost a real student

1. **PUBLISH IS NOT AUTOMATIC.** A generated plan sits at `build_plans.status='draft'`
   and materialises **nothing**: no task lists, no tasks, no STORY-000, no active-project
   pointer. Generation logs success, the poller reports the terminal state `drafted`, and
   the student's Projects page stays empty. Five students ended class this way. As of
   `origin/main`, `publishBuild()` is exported from `frontend/src/services/sbpApi.ts:141`
   and **imported by nothing** — `ProjectsPage.tsx` imports only
   `resolveBackendProjectId`, `startBuild`, `pollBuild`. Publish is a call **you** make.
   Verify published; never assume it.

2. **The browser has its own fallback build, and it looks plausible.**
   `handleCreate` (`ProjectsPage.tsx:185`) writes an optimistic localStorage build
   *unconditionally*, before any network call. Its shape: ~10 tasks, 4 lists named
   "Project DNA & Requirements / Core build / Reliability & polish / Showcase &
   portfolio", 5 canned requirements R1-R5, **no due dates, no STORY-000, no `STORY-nnn ·`
   title prefix**, project id `p<epoch>` rather than a UUID, ready after exactly 7
   seconds. If you see that shape, **the server pipeline never landed**. Do not debug the
   plan; debug the pipeline. The degradation banner will not tell you — it is rendered
   only in the wizard branch, and `handleCreate` switches to preview before the first
   `await`.

3. **STORY-000 is injected at materialize, not generated.** `materializeTasks.ts:114`
   writes "STORY-000 · Build your Command Center" as the first task of the first release.
   It is deliberately outside the plan and outside the traceability gate — it fulfils no
   requirement of the student's system because it is not part of that system, it is the
   window onto it. It cannot be renamed or merged away by the decomposer, and
   `materializePlanAsTasks` has no caller except `publishBuild`. Therefore: **no
   STORY-000 ⇒ publish did not run** — short of someone having deleted the row by hand,
   there is no other way for it to be absent.

4. **No cohort start date means no dates and no demo-prep tasks.** `scheduleFor()`
   returns `null` when `cohorts.start_date` is null, logs `sbp_schedule_skipped`, and the
   build **still publishes**. Every task materializes with `due_on = NULL` and the entire
   PREP-1..PREP-6 demo-prep list is silently absent. The degradation is deliberate — a
   missing cohort date must never cost a student their build — but nobody is alerted.
   Check `cohorts.start_date` before blaming the pipeline.

5. **`story_id` is not unique across projects.** Every plan numbers its stories
   `STORY-001` upward. Matching on it let a stale browser tab overwrite **18 published
   tasks** (published 08:30:09, tab from before that loaded 08:35:25, all 18 rows
   rewritten with a different project's content), and made a new project invisible behind
   an older one. Import now refuses to write into a project with a published plan — but
   **your** queries are not protected. Match on `project_id`, or on containment. Never on
   `story_id` alone.

Then four more that will bite you specifically:

6. **Mocked tests do not prove DDL ran.** `ensureSbpSchema` runs its statements in a loop
   that swallows every failure into a `console.warn`, so it resolves identically on total
   success and total failure. `CREATE TABLE IF NOT EXISTS` is a no-op on an existing
   table, so the `ALTER … ADD COLUMN IF NOT EXISTS` statements are the only thing creating
   newer columns. A schema fix once shipped "green" and stayed broken in production for a
   day because the unit tests mock `sequelize.query` and cannot see a column name. Assert
   post-conditions against `information_schema` — [Q8](references/verification-queries.md).

7. **`complete` cannot be set by the client.** Client status writes are allowlisted to
   `not_started` / `in_progress` / `blocked`; `complete` is refused **409** before any
   I/O, and the import path demotes a client-authored `complete` to `in_progress`. The
   only path to `complete` is `markTaskVerifiedComplete()`, which is wired to no route.
   Points gate on `verified_at`, not on `status`. Expect a steady stream of
   `task_status_client_complete_refused` in the logs — the frontend still maps a ticked
   task to `complete` and eats the 409.

8. **Agent scoping is flagged per enrollment and fails soft.** `SBP_AGENT_SCOPING` is
   `off` (default), `all`, or a comma-separated list of enrollment ids. It runs after the
   gate; any failure returns the plan **unchanged**. With it off, `owner_agent` is
   whatever the decomposer invented — job titles, and "System" owning half the build.
   That is scoping being off, not a broken plan.

9. **Advisory gate violations on a published plan are normal.** Nine of the seventeen
   rules block; the rest ride along. `gate_ok = false` with `status = 'published'` is a
   valid, intended state. Do not "fix" it.

---

## The pipeline

| # | Phase | What runs | Where | Proof it happened |
|---|---|---|---|---|
| 0 | **CREATE** | A `projects` row exists and belongs to this enrollment | `POST /api/portal/projects` → `createNewProjectForEnrollment` | a UUID `projects.id`, `enrollment_id` matches |
| 1 | **INTERVIEW** | Adaptive questions generated from the student's own idea; 4-5 / 6-7 / 8-9 by tier | `POST /api/portal/sbp/intake/questions` → `intakeQuestionsService` | `generated: true`. `false` = the generic set was substituted |
| 2 | **GENERATE** | intake saved → decompose → gate → repair → scope agents → **draft** | `POST /api/portal/sbp/builds` (202) → bounded queue → `runGeneration` | `build_intake.status = 'drafted'`, a `build_plans` row at `status='draft'` |
| 3 | **VERIFY GATE** | Are the remaining violations advisory only? | `GET /api/portal/sbp/builds/:projectId` | `status='drafted'` (publishable) vs `gate_failed` (blocked) |
| 4 | **PUBLISH** | promote → render docs → commit repo → schedule → **materialize** → set active | `POST /api/portal/sbp/builds/:projectId/publish` | `200` with `status: published` \| `awaiting_repo` |
| 5 | **VERIFY MATERIALISATION** | Lists, tasks, STORY-000, dates, prep week | SQL — [Q5](references/verification-queries.md) | clusters `r0..rN` + `prep`, STORY-000 present, `due_on` non-null |
| 6 | **VERIFY VISIBILITY** | Does the student's own portal render it? | `GET /api/portal/projects/active` with their JWT | a tree with `lists`, not `{"project": null}` |

Phases 0-3 happen in the wizard today. **Phase 4 has no caller in the UI** — see rule 1.
Phases 5 and 6 are not optional; every failure in the history was invisible at phase 4
and only detectable at 5 or 6.

---

## Phase-by-phase

Prerequisites, checked once before you start:

```bash
ssh root@95.216.199.47
docker exec accelerator-backend printenv | grep -E 'SBP_PIPELINE_ENABLED|PROJECT_API_ENABLED|OPENAI_API_KEY|GITHUB_TOKEN|SBP_AGENT_SCOPING|SBP_PROVISION_CONCURRENCY'
```

`SBP_PIPELINE_ENABLED` absent ⇒ **all five SBP endpoints answer 404** and every student
silently gets the localStorage build. `GITHUB_TOKEN` absent is survivable: publish lands
`awaiting_repo`, tasks still materialize, prompts inline their context instead of citing
repo paths. `OPENAI_API_KEY` absent is not: decomposition throws `ConfigError`.

All SBP endpoints are participant-scoped. The enrollment comes from the verified JWT and
**never** from the body; a project that is not yours answers 404, not 403, so it cannot
be probed. There is **no admin endpoint** for any of this — publish is participant-auth
only.

### 0 · CREATE

Only create if there genuinely is none. `POST /api/portal/projects` calls
`createNewProjectForEnrollment`, which **always creates** and activates — a careless call
leaves an empty project behind and moves the student's portal to it.

```sql
SELECT id, name, enrollment_id, created_at FROM projects WHERE enrollment_id = :eid ORDER BY created_at DESC;
SELECT active_project_id FROM enrollments WHERE id = :eid;
```

### 1 · INTERVIEW

```bash
curl -s -X POST -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"idea":"<the student'\''s own words, 20+ chars>","size":"project"}' \
  https://enterprise.colaberry.ai/api/portal/sbp/intake/questions | jq '{generated, model, n: (.questions|length)}'
```

`generated: false` means the model failed and the generic set was substituted — the
student can still proceed, but the plan will be measurably worse. The 24-run isolation
study is the reason this phase exists: with no interview, a plan named the student's real
systems **0 times out of 14** and carried their stated guardrail **0 of 6**; generating a
17,000-word requirements document first recovered neither. With the interview: 14/14 and
6/6.

Tier selects real depth, not a duration: `workflow` 8-12 requirements / 3 releases ·
`project` 18-24 / 5 · `autonomous` 30-40 / 7. Anything unrecognised falls back to
`project`. Do not quote a time estimate — the wizard used to advertise "~5/13/21 min"
with no telemetry behind it, and those numbers were removed because they were invented.

### 2 · GENERATE

```bash
curl -s -X POST -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"project_id":"<uuid>","idea":"…","size":"project",
       "answers":[{"id":"q1","question":"…","answer":"…"}]}' \
  https://enterprise.colaberry.ai/api/portal/sbp/builds | jq
```

Answers `202` with `{projectId, correlationId, status:'generating'}` and returns
immediately; generation runs on a bounded queue (concurrency 3). Idempotent on
`project_id` — a build already generating is not started twice. Twenty students at once
means the last one waits about **237 seconds**; that is the memory ceiling working, not a
hang. `503` means the queue is full.

Then poll:

```bash
curl -s -H "Authorization: Bearer $JWT" \
  https://enterprise.colaberry.ai/api/portal/sbp/builds/$PROJECT_ID \
  | jq '{status, version: .plan.version, gate_ok: .gate.ok, violations: [.gate.violations[].rule]}'
```

**The poll returns the *latest* plan, not the published one.** A project with v1
published and v2 drafted reports the draft. Never infer published-ness from it.

### 3 · VERIFY GATE

| `status` | What to do |
|---|---|
| `drafted` | publishable — go to phase 4 |
| `gate_failed` | blocking violations remain after 3 repair attempts. Read them; they name the offending requirement or story. Usually the brief is too thin — re-run the interview with sharper answers rather than fighting the gate |
| `failed` | generation itself threw. Get the `error_class` by correlation id ([Q7](references/verification-queries.md)); the intake is replayable, so re-POST |
| `generating` > 10 min | a restart dropped the in-memory job. Re-POST; `saveIntake` is `ON CONFLICT DO UPDATE` |

Advisory violations here are expected and are **not** a reason to withhold publish.

### 4 · PUBLISH — the step that does not happen by itself

```bash
curl -s -X POST -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{}' \
  https://enterprise.colaberry.ai/api/portal/sbp/builds/$PROJECT_ID/publish | jq
```

Pass `{"expected_sha256":"<64 hex>"}` when a human reviewed a specific version — publish
then refuses with a hash mismatch if the row changed underneath them. This exists because
the pilot regenerated between review and commit, which is how a reviewed 6/3/1/1/1 plan
shipped as 8/1/1/1/1.

What publish does, in order: promote the draft (older published versions become
`superseded`) → render ~16-19 documents → one GitHub commit → resolve the cohort schedule
→ **materialize tasks in one transaction** → set `enrollments.active_project_id` → set
the status.

Read the response:

| `status` | Meaning |
|---|---|
| `published` | full path, documents committed |
| `awaiting_repo` | **success** — no repo configured, tasks materialized anyway, prompts inline their context |

`409` = blocking gate violations, and the message names them. `404` = no plan to publish.
Republishing is safe: materialize is `findOrCreate` on `(project_id, story_id)` and never
un-completes work a student has already done (`preservedComplete` in the log says how
many it protected).

### 5 · VERIFY MATERIALISATION

Run [Q5](references/verification-queries.md). Healthy shape: clusters `r0, r1, … rN` with
titles `Release N · <name>`, plus `prep` / "Demo prep · the dedicated week". STORY-000 is
task position 0 of the first release. **Cluster values that are UUIDs are localStorage
release ids** — that project has been written by the browser import path, not by publish.

### 6 · VERIFY VISIBILITY

The Projects page reads `GET /api/portal/projects/active`, which resolves
`enrollments.active_project_id`. Publishing once wrote 12 tasks correctly and left them
invisible because it never touched that pointer.

```bash
curl -s -H "Authorization: Bearer $STUDENT_JWT" \
  https://enterprise.colaberry.ai/api/portal/projects/active \
  | jq '{id, lists: [.lists[] | {cluster, title, n: (.tasks|length)}]}'
```

It returns `200 {"project": null}` — **not** a 404 — when there is no active project. A
`null` there with a published plan in the database means `makeActiveProject` failed; grep
for `sbp_active_project_failed`, which names the statement.

---

## VERIFICATION CHECKLIST

Do not tell anyone a student is ready until every line has evidence next to it.

- [ ] `SBP_PIPELINE_ENABLED=true` and `PROJECT_API_ENABLED=true` in the running container
- [ ] Schema post-condition clean — 5 columns present, 2 tables, 2 indexes ([Q8](references/verification-queries.md)); no `sbp_schema_incomplete` in the boot log
- [ ] `cohorts.start_date` is set for this student's cohort ([Q4](references/verification-queries.md))
- [ ] `build_intake.status` = `drafted`, `published` or `awaiting_repo` — never `generating`, `failed` or `captured`
- [ ] `build_plans` has a row at `status='published'`; note its `version`
- [ ] Remaining gate violations are advisory only (none of the nine blocking rules)
- [ ] Task lists exist with clusters `r0..rN` (+ `prep` when the cohort is dated) — no UUID clusters
- [ ] **STORY-000 · Build your Command Center** is present and is position 0 of the first release
- [ ] Every task has a `due_on`; `due_baseline_on` is set (the first due date the task ever had — written once, never updated, so a slipping plan still shows its original deadline)
- [ ] `enrollments.active_project_id` = this project
- [ ] `GET /api/portal/projects/active` with the **student's own** JWT returns the tree, not `{"project": null}`
- [ ] Story prompts are substantive — average `build` length over ~1,200 chars, ideally ~3,000
- [ ] With a repo: the commit exists, and every path a prompt cites resolves in a real clone
- [ ] No `complete` rows with `verified_at IS NULL` that you cannot account for

**The one query that proves all of it.** One row, one boolean:

```sql
SELECT
  p.id                                             AS project_id,
  bp.version                                            AS plan_version,
  COALESCE(bp.status = 'published', false)              AS plan_published,
  COALESCE(BOOL_OR(st.story_id = 'STORY-000'), false)   AS has_story_000,
  COUNT(st.id)                                          AS tasks,
  COUNT(st.id) FILTER (WHERE st.due_on IS NULL)         AS undated_tasks,
  COALESCE(e.active_project_id = p.id, false)           AS is_active_project,
  (
        COALESCE(bp.status = 'published', false)
    AND COALESCE(BOOL_OR(st.story_id = 'STORY-000'), false)
    AND COUNT(st.id) > 0
    AND COUNT(st.id) FILTER (WHERE st.due_on IS NULL) = 0
    AND COALESCE(e.active_project_id = p.id, false)
  )                                                     AS ready
FROM projects p
JOIN enrollments e         ON e.id = p.enrollment_id
LEFT JOIN build_plans bp   ON bp.project_id = p.id AND bp.status = 'published'
LEFT JOIN student_tasks st ON st.project_id = p.id
WHERE p.id = :project_id
GROUP BY p.id, e.id, bp.version, bp.status;
```

`ready = true` is the only acceptable answer. Every join is on `project_id` — never on
`story_id`, which is not unique across projects. The cohort-wide version, which is how
you find the students who never reported a problem, is
[Q1b](references/verification-queries.md).

---

## Troubleshooting — keyed on what a human actually says

| Symptom (their words) | Most likely cause | Fix |
|---|---|---|
| "I don't see my project" | Plan is at `status='draft'` — publish never ran (rule 1) | [Q2](references/verification-queries.md) to confirm; then `POST …/publish` |
| "I don't see my project" (plan **is** published) | `enrollments.active_project_id` points elsewhere, or `makeActiveProject` threw | Grep `sbp_active_project_failed`; `PUT /api/portal/projects/active` with `{project_id}` |
| "I don't see my project" (published **and** active) | Their browser is rendering a cached localStorage tree | Hard reload. The real plan only lands on reload — the post-create sync call is a no-op |
| "My tasks have no dates" | `cohorts.start_date` is null ⇒ `sbp_schedule_skipped` ⇒ every `due_on` null and no prep week (rule 4) | Set the cohort start date, then republish; materialize backfills |
| "My tasks have no dates" (DB **has** `due_on`) | The portal UI does not read `due_on` at all — `BackendTaskNode` in `projectHydrate.ts` has no such field, so no surface renders it | Not a pipeline bug. Frontend work; say so plainly rather than republishing |
| "My Command Center is missing" | No STORY-000 ⇒ publish did not run (rule 3) | Publish. If STORY-000 exists but no button, `command_center_url` is unset — `PATCH /api/portal/projects/:id/command-center` |
| "It only took a few seconds" | The 7-second localStorage timer. The server path takes minutes | Check for the fallback shape (rule 2); check `SBP_PIPELINE_ENABLED` |
| "I have two copies of my project" | The optimistic local build is never deleted; the reconciler prepends the real one | Expected today. The UUID-id card is the real one; the `p<epoch>` card is the template |
| "My plan looks generic / it's not my idea" | The interview degraded (`generated:false`), or the local template rendered | Re-run phase 1 and check `generated`; if the tasks are the 4 canned lists it is the template |
| "It says my build failed" | `gate_failed` (blocking violations) or `failed` (generation threw) | `gate_failed` → read the violations, sharpen the brief. `failed` → correlation id, [Q7](references/verification-queries.md), re-POST |
| "It's been spinning for ages" | Bounded queue during a class rush — ~237s for the 20th student | Wait. Over ~10 min in `generating` means a restart dropped the job; re-POST |
| "The build pipeline is not enabled for your account" | `SBP_PIPELINE_ENABLED` unset ⇒ 404 ⇒ hard local fallback | Set the flag; restart; re-run the build |
| "I ticked a task and it didn't stick" | Client `complete` refused 409 by design (rule 7) | Expected. Completion is granted on verification; `markTaskVerifiedComplete` is the only path and is not yet wired to a route |
| "My repo has no docs" | `GITHUB_TOKEN` absent ⇒ `awaiting_repo` | Set the token, republish. Tasks were fine all along |
| "The pipeline overwrote my CLAUDE.md" | Should be impossible since PR #1453 — we own only the delimited block | Verify the `COLABERRY:BEGIN/END` markers survived; if their content is gone, that is a regression in `managedBlock` and is a stop-everything bug |
| "My tasks changed to someone else's" | A stale tab imported over a published project (rule 5) | Should now be refused — look for `project_import_skipped_published`. If it happened anyway, republish from the intact stored plan |
| Tasks exist but no plan row | They came from the localStorage import path, not publish | Generate and publish properly; import will now refuse to clobber it |

---

## Hardening — what is prevented, and what is only remembered

### Prevented in code

| Failure | The guard |
|---|---|
| The reviewed plan is not the shipped plan | The plan is written **once** at generation; `publishPlan` promotes that row and re-checks `plan_sha256` against `expected_sha256` |
| A plan with an uncovered must-have reaches a student | Nine blocking gate rules; `publishBuild` throws 409 before any I/O |
| A gate gap dead-ends the student | `planRepair`, 3 attempts, monotone — an attempt that does not reduce the violation count is discarded |
| Repair makes the plan worse | Same monotonicity rule; `remove_story_ids` so a subsuming story can be deleted rather than added around |
| A partial materialization | One `sequelize.transaction` around all lists and tasks |
| Republish duplicates or regresses tasks | `findOrCreate` on `(project_id, story_id)`; `complete` preserved; `due_baseline_on` written once |
| A stale tab overwrites a published build | `importProject` refuses when the target has a published plan; logs `project_import_skipped_published` |
| The student's CLAUDE.md is destroyed | `managedBlock.spliceManagedBlock` — replace between markers, else append |
| The pipeline writes outside its lane | `PATH_ALLOWLIST` enforced at render **and** by throwing in `repoWriter` before any network call |
| A student self-awards completion | Status allowlist + 409 + import demotion; `markTaskVerifiedComplete` wired to no route |
| A missing cohort date kills the build | `scheduleFor` fail-soft returning null |
| Agent scoping failure kills the build | `scopeAgents` returns the plan unchanged on upstream/malformed/placeholder |
| A non-existent column reaches production | `ACTIVE_PROJECT_COLUMNS` asserted against the real `Enrollment` model, statically, with no database |
| Unbounded external calls | 240s decompose / 45s intake / 20s GitHub, all with capped retries; `boundedQueue` at concurrency 3 |
| One cohort rush OOMs the box | `SBP_PROVISION_CONCURRENCY` + `SBP_PROVISION_MAX_DEPTH`, `QueueFull` → 503 |

### Prevented only by someone remembering — the useful half

1. **Publish itself.** No UI calls it. Until a caller lands, every student's build must be
   published by hand, and phase 5-6 verification is the only thing that catches a miss.
   *This is the open one from the night that produced this skill.*
2. **The cohort start date.** Nothing alerts on a null. A cohort missing it produces
   undated, prep-less builds for every student in it, quietly and forever.
3. **`assertSbpSchema` only logs.** It does not throw and does not halt boot. Nobody sees
   `sbp_schema_incomplete` unless they look.
4. **Your own queries.** The `story_id` collision is guarded on the import path only. Any
   ad-hoc SQL, script or audit that matches on `story_id` alone reproduces the bug.
5. **The localStorage build is never deleted.** Two cards is the expected end state today.
   Only a human can tell the student which one is real.
6. **The degradation banner is unreachable after a create.** A student on the fallback
   path is told nothing. Only the shape table in rule 2 distinguishes them.
7. **`due_on` reaches the database and stops there.** No portal surface reads it, so
   "dated" is currently true in SQL and false on screen.
8. **Repo-write idempotency is defeated at the call site.** `publishBuild` passes `null`
   for the existing manifest with a `TODO(step 6)`, so `changedFiles` sees an empty
   baseline and **every** publish commits all ~16-19 files. Do not cite "unchanged ⇒ no
   commit" as current behaviour.
9. **`getBuildState` returns the latest plan, not the published one.** There is a
   `getPublishedPlan()` and the orchestrator does not use it.
10. **`markTaskVerifiedComplete` has no caller.** Verification is a designed door with
    nothing behind it yet; points gated on `verified_at` currently award nothing.
11. **Gate-rule changes need the corpus replay.** `gateReplay.manual.ts` is deliberately
    outside `testMatch`, so CI will never remind you.
12. **Never write source through a shell heredoc.** `\b` becomes a literal 0x08 byte,
    five gate regexes were dead for a week, and the suite stayed green.
13. **`npx tsc` in an SBP worktree** resolves the junctioned OneDrive TypeScript 4.9.5 and
    reports ~267 phantom errors. Invoke a 5.x binary explicitly.

---

## Definition of Done

- [ ] The one query returns `ready = true` for every student in scope
- [ ] Evidence captured per phase — status values, counts, log events, not impressions
- [ ] Anything that degraded (no repo, no cohort date, `generated:false`, scoping off) is
      stated explicitly rather than left to be discovered
- [ ] No secrets and no student PII in anything written down; refer to students by
      enrollment id in artefacts that leave the session
- [ ] `PROGRESS.md` updated with a Session ID and verification evidence, per `CLAUDE.md`'s
      hard gate — if code changed
- [ ] `tsc --noEmit` clean on both stacks if code changed
- [ ] If a new failure mode was found, it is added to
      [references/failure-history.md](references/failure-history.md) with its evidence.
      That file is the point of this skill

## Output — report back

Per student: `project_id` · `plan_version` · plan status · task count · lists (clusters) ·
STORY-000 present? · undated tasks · active project? · **`ready`** · repo commit or
`awaiting_repo` · any degradation. Then the cohort roll-up: how many `ready`, how many
sitting at draft, how many undated, and what you did about each.

State plainly what you verified with a query versus what you inferred. The whole history
in this folder is failures that were reported as fixed because someone inferred.

## References

- **[references/failure-history.md](references/failure-history.md)** — every rule above,
  with the incident, the evidence, what changed, and what is still only remembered.
- **[references/verification-queries.md](references/verification-queries.md)** — Q1 (the
  one query), Q1b (cohort sweep), Q2 (draft sweep), Q3-Q8, the log event table, curl
  recipes, publish response decoder.
- **[references/pipeline-internals.md](references/pipeline-internals.md)** — module map,
  call order inside publish, build statuses, gate rules and their severity split, the
  schedule model, the document set, every env var, the browser-side behaviour, the
  idempotency table, what the test suite cannot tell you.
- In-repo design docs: `docs/BUILD_PIPELINE_AUDIT.md` (why), `BUILD_PIPELINE_REQUIREMENTS.md`
  (SBP-REQ-v1), `BUILD_PIPELINE_GITHUB_SYNC.md` (SBP-GH-v1),
  `BUILD_PIPELINE_RELEASES_AND_STORIES.md`.
