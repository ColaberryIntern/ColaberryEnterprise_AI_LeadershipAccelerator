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
verified against `origin/main` `4078338f`, plus **PR #1463** (the build-verification loop,
**merged into main 2026-08-14**), **PR #1462** (auto-publish, **merged 2026-08-14**) and
**PR #1461** (the cohort audit script). **Merged is not deployed** — that distinction is
load-bearing throughout this runbook, and the status box below records both separately.

> **This skill was hardened from the night five real students ended class unable to see
> any work.** Nothing below is defensive theory — each rule is a failure that already
> happened, with the evidence in
> [references/failure-history.md](references/failure-history.md). Read "Read this
> first" before touching anything. The audit that found the top rule was worth more
> than any feature shipped that night.
>
> **Read the status box below first.** Three PRs changed this subsystem after the first
> draft of this skill: one fixed its headline rule, one gave its longest-standing dead end
> a caller.

## Status — what is true right now

| | State | Effect on this runbook |
|---|---|---|
| **PR #1463** build-verification loop | **merged into main 2026-08-14** | `markTaskVerifiedComplete` finally has a caller. New column `student_tasks.verification_json`, new `sbp/verification/` subtree, and `.colaberry/progress.json` is now **co-owned and merged**, not overwritten — see "What #1463 changed" below |
| **PR #1462** auto-publish | **merged into main 2026-08-14. NOT deployed** | A gate-clean plan publishes itself — *in main*. Production has not taken it yet, so rule 1 still applies there exactly as originally written. See "What is actually running in production" below |
| **PR #1461** audit script | **approved, merging immediately after #1462. NOT deployed** | `auditStudentBuilds.js` replaces the hand-written cohort sweep. Its verdict ladder and this skill's readiness query are deliberately the same definition, and #1463 did **not** change that definition — the script reports verification as a note and deliberately does not gate readiness on it. Not in the running image: to run it before the next deploy, copy it under `/app` in the container so `pg` resolves (node walks up from the script's path, so `/tmp` cannot see `/app/node_modules`) |
| Repo provisioning | **has never run in production** | Every publish takes the `awaiting_repo` branch. No student repo has ever received the document set — see Phase 4. This also means the #1463 verification loop has **nothing to read from** until repos exist |
| Task verification | **wired, but never yet run against a real repo** | The loop exists and is triggered by workspace sync (#1463). It reads `.colaberry/progress.json` out of the student's repo — and there are no student repos, so 0 tasks still carry `verified_at`. Wired ≠ run |
| The 2026-08-13 backlog | **cleared** | 18 students published by hand; `plan_unpublished` 10 → 0. Latest sweep: READY 14, `tasks_undated` 4 (preserved completed work), `no_project` 35 |

### What is actually running in production

**Measured 2026-08-14, not inferred.** Production `/opt/colaberry-accelerator` is at
`4078338f` — the commit *before* #1463. So of the four PRs named above, **none of them is
running on the live box.** Concretely, all verified by query rather than by reading a
merge log:

| Check | Result |
|---|---|
| Prod `git rev-parse HEAD` | `4078338f`, i.e. pre-#1463 |
| `dist/services/sbp/verification` in the running image | does not exist |
| `student_tasks.verification_json` in `information_schema` | **absent** — 4 of the 5 SBP columns present (`due_on`, `due_baseline_on`, `verified_at`, `verified_by`) |
| Boot log | `SBP schema ensured`, and **no** `sbp_schema_incomplete`, **no** `SchemaInvariantViolation` |

That last row is the trap, and it is worth understanding before the next deploy. The boot
log is clean **because** the running code predates the column: its `REQUIRED_COLUMNS` list
does not mention `verification_json`, so the assertion it passes is not the assertion you
care about. A green boot log today says nothing about whether #1463's `ALTER` will land
tomorrow. After the deploy that carries #1463, **re-run [Q8](references/verification-queries.md)
against `information_schema` and confirm six columns** — do not accept the boot log as the
answer, because `ensureSbpSchema` swallows statement failures into a `console.warn` and
resolves identically on total success and total failure (rule 6, H-7).

Until that deploy happens: publish is manual, verification cannot run, and the counts
below are the live numbers.

### What #1463 changed, in the terms this runbook uses

**The completion loop has a caller.** `POST /api/portal/workspace/repo/sync` — the button
that pulls the student's repo — now also runs `verifyBuildFromRepo()`
(`backend/src/services/sbp/verification/buildVerificationService.ts`). It reads
`.colaberry/progress.json` plus the pushed commits, decides per story, writes
`student_tasks.verification_json`, and calls `markTaskVerifiedComplete` for stories that
pass. Verification **never fails the sync**: every expected state (no plan, no repo, rate
limit, malformed file) comes back as a classified result, and an unexpected throw is logged
`workspace_verification_failed` while the pull still succeeds. There is deliberately **no
webhook** — the reasoning is in `docs/BUILD_VERIFICATION_CONTRACT.md`.

**`.colaberry/progress.json` is no longer platform-only bookkeeping.** It is now the
two-way contract, and it is co-owned exactly the way `CLAUDE.md` is (H-5):

- `renderDocs` seeds it with every story and the **exact text** of every acceptance
  criterion, all `passed: false`. Seeding the text is what lets the reader be strict
  without being hostile — the agent flips a boolean instead of retyping a sentence, so an
  honest claim matches the plan and an invented criterion matches nothing and is discarded.
- `repoWriter` then **merges** that render over whatever is already in the repo
  (`mergeProgressFile`, right beside the CLAUDE.md splice): our side — the story list and
  criterion text — replaces; their side — the `passed` flags, `files_touched`,
  `tests_added`, notes — is carried across by story id and normalised criterion text.

So the old sentence "`.colaberry/` is platform bookkeeping and is overwritten on every
sync" is **no longer true**, and repeating it is now actively wrong: a republish that
blindly replaced this file would reset every story sitting at "3 of 4" back to "not
started", which reads to a student as the platform losing their work.
`.colaberry/plan.json` and `.colaberry/manifest.json` are still overwritten wholesale.

**One new column.** `student_tasks.verification_json` (JSONB, nullable) holds the live
verdict — state, which criteria are outstanding, the evidence commit, and why it is not
verified yet. It is in `REQUIRED_COLUMNS`, so [Q8](references/verification-queries.md) now
expects **six** columns, not five. Distinct from `verified_at`, which is written once and
never moves; `verification_json` is allowed to change on every sync.

The rest of this document is written for the merged world, with the pre-merge behaviour
called out wherever it differs. **Nothing here stops being verified because it became
automatic.** A check that gets dropped for "it is automatic now" is precisely how this
comes back.

---

## Read this first — the five that cost a real student

1. **PUBLISH IS THE STEP THAT MAKES A PLAN REAL — VERIFY IT, NEVER ASSUME IT.**
   Publishing is what materialises STORY-000, the cohort due dates and the 3-4k-character
   prompts into `student_tasks` (the table the Projects page actually renders) and sets
   `enrollments.active_project_id`. A plan that is not published sits at
   `build_plans.status='draft'` and materialises **nothing**.

   *The incident.* On 2026-08-12/13 students finished the wizard, the server generated a
   plan for each, the gate passed them — and they spent the evening looking at the
   browser's ten-task fallback template. Their real plans existed the whole time,
   correct, at `status='draft'`. `runGeneration` ended one line short of publishing, and
   `publishBuild` had exactly one caller: an HTTP route no screen in the product ever
   called. The chain comment described a `[review]` step with no UI on either end of it,
   so `drafted` was not a waiting room, it was a dead end.

   *How many students? The answer moved four times, and that is the lesson.*

   | Count | Who measured | Lens |
   |---|---|---|
   | **5** | the first audit, and the number in PR #1462 | projects created in the last 16 hours |
   | **9** | the fix agent, while fixing those five | found 4 more in the same state whose projects predated the window |
   | **11** | PR #1461's cohort tool, snapshot at 03:06Z | everyone at "plan drafted but never published", cumulative |
   | **18** | the same tool, sweeping after all writes | 17 fixed, **plus one student who appeared on no list at all** |

   **Every time someone widened the lens, the population grew.** A time-boxed query, a
   hand-written list and a cohort sweep gave three different answers, and only the sweep
   was right. Final state after the fixes: `plan_unpublished` went **10 → 0**; READY 14,
   `tasks_undated` 4 (all preserved completed work, not defects), `no_project` 35.

   *What changed.* **PR #1462 makes publish automatic.** `runGeneration` now ends by
   calling `autoPublish()` in the same queued job whenever `isPublishable(gate.violations)`,
   passing the just-written draft's `plan_sha256` as `expectedSha` so a concurrent
   generation cannot slip in a plan that run never graded. Kill switch
   `SBP_AUTO_PUBLISH=off`, **defaulting on**. Auto-publish **cannot throw**: a failure is
   logged as `sbp_autopublish_failed` with an `error_class` and leaves the build at
   `drafted`, deliberately not `failed`, because `failed` means "regenerate" and the plan
   is fine. `POST .../publish` survives as the retry.

   *What this means for you.* Publish is no longer a call you have to remember to make —
   it is a call you have to **confirm landed**. `drafted` has flipped meaning: it used to
   be the normal resting state of a healthy plan, and it is now a **failure state**
   meaning "the plan is good and something downstream refused". Phase 4 and the
   verification checklist are unchanged in substance for exactly this reason. **#1462 is
   merged, and that is not the same as running.** Until it *deploys*, publish is still
   entirely manual in production and rule 1 holds there in full — a plan generated on the
   live box today still sits at `drafted` forever with nobody to promote it.

> ### Audit before you believe a list
>
> Any list of affected students handed to you — including one in this file — is a lens,
> not a population. Sweep the whole cohort first (`auditStudentBuilds.js`, or
> [Q1b](references/verification-queries.md)), then work the list the sweep gives you. The
> eighteenth student was on nobody's list and was found only because the tool looked at
> everyone. Report what the sweep says, not what the list said.

2. **The browser has its own fallback build, and it looks plausible.**
   `handleCreate` writes an optimistic localStorage build *unconditionally*, before any
   network call. Its shape: ~10 tasks, 4 lists named "Project DNA & Requirements / Core
   build / Reliability & polish / Showcase & portfolio", 5 canned requirements R1-R5,
   **no due dates, no STORY-000, no `STORY-nnn ·` title prefix**, project id `p<epoch>`
   rather than a UUID, ready after exactly 7 seconds. If you see that shape, **the server
   pipeline never landed**. Do not debug the plan; debug the pipeline.

   PR #1462 makes this far easier to spot, and you should still know the shape because
   the shape is what you check in the database. Three fixes: a new
   `origin: 'local' | 'pipeline'` on `StudentProject`, stamped at birth and rendered as a
   chip ("starter template" vs "your tailored plan"); the degradation banner now renders
   on **every** Projects view rather than only the wizard, which is why nobody was told
   anything for a whole evening (`handleCreate` calls `setView({kind:'preview'})` on its
   first line, before the first `await`, so every failure path was setting banner state
   on an unmounted component); and the placeholder now **claims** its backend project via
   `pipelineProjectId` in localStorage and is **superseded in place** when the real plan
   lands, so the student ends up with one build rather than two lookalikes. The supersede
   is guarded: a placeholder the student has actually ticked work off is kept alongside
   and both are labelled, rather than discarded.

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
   only path to `complete` is `markTaskVerifiedComplete()`, which is still wired to no
   *client* route — since #1463 its one caller is the verification loop, reached through
   `POST /api/portal/workspace/repo/sync`, which writes down a conclusion it reached from
   the repo rather than accepting a claim from a body.
   Points gate on `verified_at`, not on `status`. Expect a steady stream of
   `task_status_client_complete_refused` in the logs — the frontend still maps a ticked
   task to `complete` and eats the 409.

8. **Agent scoping is flagged per enrollment and fails soft.** `SBP_AGENT_SCOPING` is
   `off` (default), `all`, or a comma-separated list of enrollment ids. It runs after the
   gate; any failure returns the plan **unchanged**. With it off, `owner_agent` is
   whatever the decomposer invented — job titles, and "System" owning half the build.
   That is scoping being off, not a broken plan.

9. **`gate_ok = false` does NOT mean the gate failed.** It is literally
   `violations.length === 0`, so a healthy published plan routinely carries
   `gate_ok = false` alongside advisory style warnings. Only the **nine `BLOCKING_RULES`**
   decide publishability. Reading `gate_ok` as "the gate failed" would report most of a
   working cohort as broken — it nearly caused a tool to condemn a live cohort on
   2026-08-13. Judge on `blockingViolations(violations)`, which the poll endpoint now
   splits out server-side as `gate.blocking` (a reason) versus `gate.advisory` (a warning
   riding along). The client used to take the first three of the whole `violations` array
   as the refusal reason, so a student blocked on an uncovered must-have was told about a
   stylistically redundant story.

---

## The pipeline

| # | Phase | What runs | Where | Proof it happened |
|---|---|---|---|---|
| 0 | **CREATE** | A `projects` row exists and belongs to this enrollment | `POST /api/portal/projects` → `createNewProjectForEnrollment` | a UUID `projects.id`, `enrollment_id` matches |
| 1 | **INTERVIEW** | Adaptive questions generated from the student's own idea; 4-5 / 6-7 / 8-9 by tier | `POST /api/portal/sbp/intake/questions` → `intakeQuestionsService` | `generated: true`. `false` = the generic set was substituted |
| 2 | **GENERATE** | intake saved → decompose → gate → repair → scope agents → draft → **auto-publish** | `POST /api/portal/sbp/builds` (202) → bounded queue → `runGeneration` | a `build_plans` row; status reaches `published`/`awaiting_repo` on its own |
| 3 | **VERIFY GATE** | Are the remaining violations advisory only? | `GET /api/portal/sbp/builds/:projectId` | `gate.blocking` empty ⇒ publishable. Judge on that, **never** on `gate_ok` |
| 4 | **PUBLISH** | promote → render docs → commit repo → schedule → **materialize** → set active | Automatic since PR #1462; `POST /api/portal/sbp/builds/:projectId/publish` is now the **retry** | `status: published` \| `awaiting_repo`, and `delivered: true` on the poll |
| 5 | **VERIFY MATERIALISATION** | Lists, tasks, STORY-000, dates, prep week | SQL — [Q5](references/verification-queries.md) | clusters `r0..rN` + `prep`, STORY-000 present, `due_on` non-null |
| 6 | **VERIFY VISIBILITY** | Does the student's own portal render it? | `GET /api/portal/projects/active` with their JWT | a tree with `lists`, not `{"project": null}` |

Phases 0-4 now run end to end inside the queued job. **Phases 5 and 6 remain mandatory**:
every failure in this skill's history was invisible at phase 4 and only detectable at 5
or 6, and auto-publish adds a new way to stop at 4 quietly — it cannot throw, so a
failure surfaces as a build resting at `drafted` and a single `sbp_autopublish_failed`
log line. `delivered: false` on the poll response is the one-field version of the same
question.

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

> **Never "clean up" a duplicate project.** A dedupe was proposed on 2026-08-13 and
> refused, correctly: **no real student has more than one project.** The only
> multi-project account is Ali's, and one of those — `fcce50ef` — is **the platform's own
> project record**: roughly 144,000 rows across 15+ tables, including the BuildManifest
> telemetry target named in `CLAUDE.md`. A project id can be infrastructure. If a
> deduplication ever looks warranted, count the dependent rows first and assume the
> outlier is load-bearing until proven otherwise.

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
| `drafted` | **A failure state since PR #1462**, not a resting one: the plan is gate-clean and something downstream of it refused. Find `sbp_autopublish_failed` for the `error_class`, then retry with `POST …/publish`. Before #1462 deploys, this is simply "not published yet" |
| `gate_failed` | blocking violations remain after 3 repair attempts. Read them; they name the offending requirement or story. Usually the brief is too thin — re-run the interview with sharper answers rather than fighting the gate |
| `failed` | generation itself threw. Get the `error_class` by correlation id ([Q7](references/verification-queries.md)); the intake is replayable, so re-POST |
| `generating` > 10 min | a restart dropped the in-memory job. Re-POST; `saveIntake` is `ON CONFLICT DO UPDATE` |

Advisory violations here are expected and are **not** a reason to withhold publish.

### 4 · PUBLISH — automatic since PR #1462, and still verified

Nothing to run on the happy path: `runGeneration` calls `autoPublish()` itself. Use the
route below to **retry** a build resting at `drafted`, or when `SBP_AUTO_PUBLISH=off`.

> **The repo half of this phase has never run.** Audited in production 2026-08-13: **0 of
> 31 projects have a provisioned repo**, all 11 `github_connections` rows are legacy
> **enrollment**-keyed, and no repo has synced since 2026-05-22. The mechanism is visible
> in the model — `github_connections.enrollment_id` is `NOT NULL` while `project_id` was
> added later and is nullable, and `repoForProject()` queries `where: { project_id }`, so
> a legacy row can never match. Consequence: **every published plan takes the
> `awaiting_repo` branch and no student repo has ever received the document set.**
> `renderDocs` / `repoWriter` / `managedBlock` are correct, tested, and have never run
> against a real student repo. Treat `awaiting_repo` as the normal outcome today, and do
> not report document delivery as working.

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
- [ ] Schema post-condition clean — **6** columns present (the sixth is `student_tasks.verification_json`, added by #1463), 2 tables, 2 indexes ([Q8](references/verification-queries.md)); no `sbp_schema_incomplete` / `SchemaInvariantViolation` in the boot log
- [ ] `cohorts.start_date` is set for this student's cohort ([Q4](references/verification-queries.md))
- [ ] `build_intake.status` = `drafted`, `published` or `awaiting_repo` — never `generating`, `failed` or `captured`
- [ ] `build_plans` has a row at `status='published'`; note its `version`
- [ ] Remaining gate violations are advisory only (none of the nine blocking rules)
- [ ] The poll response reports `delivered: true` and `gate.blocking` is empty
- [ ] Task lists exist with clusters `r0..rN` (+ `prep` when the cohort is dated) — no UUID clusters
- [ ] **STORY-000 · Build your Command Center** is present and is position 0 of the first release
- [ ] Every task has a `due_on`; `due_baseline_on` is set (the first due date the task ever had — written once, never updated, so a slipping plan still shows its original deadline). **This is a SQL truth, not a visible one**: no portal surface renders `due_on` yet, so "every task dated" means the schedule ran, not that the student can see a date
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
`story_id`, which is not unique across projects.

**For a whole cohort, run the script rather than the SQL.** PR #1461 adds
`backend/src/scripts/auditStudentBuilds.js`, which is one row per active enrollment with
a READY / NOT_READY verdict naming the **first** stage that did not complete:

```bash
docker exec accelerator-backend node /app/dist/scripts/auditStudentBuilds.js --cohort <id>
docker exec accelerator-backend node /app/dist/scripts/auditStudentBuilds.js --json > audit.json
```

Its verdict ladder is this checklist in code — including `undated_tasks = 0`, which it
adopts explicitly so the script and this runbook cannot disagree about what "ready"
means. Its verdicts map one-to-one onto the troubleshooting table below:
`no build intake - never reached the server` · `gate_failed: <rules>` ·
`plan drafted but never published` · `tasks present but undated - cohort has no start
date` · `build is complete but it is not the enrollment active project`.

First production run (2026-08-13): **337 active enrollments, 18 with a project, 5 READY**
— 319 no project, **11 plan drafted but never published**, 1 no intake, 1 gate_failed.
Those 11 are the population PR #1462 exists to prevent, and they still need a manual
publish because auto-publish only fires on new generations.

Second run (2026-08-14, read-only against production, still pre-deploy):
**339 active enrollments, 20 with a project, READY 14 / NOT_READY 325** —
`no_project` 319, `ready` 14, `tasks_undated` 4, `no_intake` 2. Read that against the
first run rather than on its own: **`plan_unpublished` is now 0**, which is the 2026-08-13
backlog staying cleared, and `gate_failed` is 0, which is the stale-label student from
H-12(a) staying fixed. The population barely moved (337 → 339) and `no_project` did not
move at all, so the cohort's real gap is still that **319 active enrollments have never
started a build** — a funnel problem, not a pipeline one. Do not read a NOT_READY count of
325 as 325 broken builds.

Zero rows carried a "verified complete" note, which is the same finding as H-10(b) arriving
from a different direction: nothing in production has ever been verified. One row carried
**10 tasks marked `complete` with no `verified_at`** alongside 4 browser-imported task
lists — that pairing is the localStorage import path (rule 5), and those 10 tasks earn no
points.

[Q1b](references/verification-queries.md) remains the raw SQL for when the script is not
deployed.

---

## Troubleshooting — keyed on what a human actually says

| Symptom (their words) | Most likely cause | Fix |
|---|---|---|
| "I don't see my project" | Plan is at `status='draft'`. Pre-#1462: publish has no caller. Post-#1462: auto-publish ran and **failed** (rule 1) | [Q2](references/verification-queries.md) to confirm; grep `sbp_autopublish_failed` for the `error_class`; then `POST …/publish` |
| A tool reports most of the cohort as broken | It read `gate_ok` as "the gate failed". It is `violations.length === 0`, so healthy published plans carry `false` (rule 9) | Judge on `gate.blocking` / the nine `BLOCKING_RULES`, never on `gate_ok` |
| "My build says it failed the gate" — but the violations look harmless | **A stale `gate_failed` label.** The status was written at generation time; a plan generated before the advisory/blocking split can carry `gate_failed` on violations that do not block. One student sat stranded for three days on `requirement_unfalsifiable`, which is **not** in `BLOCKING_RULES` — her real blocking count was zero and publishing simply worked | Re-grade rather than believe the label: count blocking violations ([Q9](references/verification-queries.md)). Zero ⇒ publish. **Nothing sweeps for this**, so old `gate_failed` rows need checking by hand |
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
| "I ticked a task and it didn't stick" | Client `complete` refused 409 by design (rule 7) | Expected. Completion is granted on verification, not on ticking. Since #1463 the path is: update `.colaberry/progress.json` in the repo, commit naming the story, push, then **Sync** — that is what calls `markTaskVerifiedComplete`. Read `student_tasks.verification_json` for which criteria are still outstanding |
| "I did the work and Sync says it is still not verified" | The verdict is in `verification_json` and it names the missing half — criteria not all `passed`, or no commit naming the story | Read `verification_json.reason` rather than guessing. Both halves are required: every criterion passing **and** a pushed commit that names the story |
| "My repo has no docs" | No project has ever had a provisioned repo — all `github_connections` rows are legacy enrollment-keyed, so `repoForProject` returns null every time and publish takes `awaiting_repo` | Not a per-student fix. Repo provisioning has to be run at all before any student repo can receive documents. Tasks were fine all along |
| "I have two copies of my project" (post-#1462) | The placeholder was kept deliberately because the student had ticked work off it — the supersede guard | Expected. Both are labelled with their `origin` chip; the `pipeline` one is real |
| "The pipeline overwrote my CLAUDE.md" | Should be impossible since PR #1453 — we own only the delimited block | Verify the `COLABERRY:BEGIN/END` markers survived; if their content is gone, that is a regression in `managedBlock` and is a stop-everything bug |
| "My tasks changed to someone else's" | A stale tab imported over a published project (rule 5) | Should now be refused — look for `project_import_skipped_published`. If it happened anyway, republish from the intact stored plan |
| Tasks exist but no plan row | They came from the localStorage import path, not publish | Generate and publish properly; import will now refuse to clobber it |
| "Claude Code refused to run the connect commands" | Pre-#1484 the block assumed a clone: no `git init`, no remote, and a bare `git push`. An agent in a plain folder correctly stopped rather than guess the URL or commit an unexplained 32-hex string | Fixed in `connectCommands`. If you see the old five-line block, the backend is behind — the current one opens with `git init` and names the remote |
| "git keeps corrupting / index.lock errors / the repo went weird" | **The folder is inside OneDrive, Dropbox or iCloud.** The sync client and git both write `.git`, and they fight over locks and half-synced objects. Deliberately *not* warned about in the panel — it is rare enough that a line for every student would be noise | Move the project folder out of the synced tree (e.g. `C:\Users\<name>\projects\<folder>`), then re-run the connect commands. Nothing is lost: the remote already has whatever was pushed |

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
| A gate-clean plan never reaching the student | **PR #1462**: `runGeneration` auto-publishes on `isPublishable`, with the draft's `plan_sha256` as `expectedSha`, and cannot throw — a failure leaves `drafted` + `sbp_autopublish_failed`, never `failed` |
| A concurrent generation substituting a plan this run never graded | The `expectedSha` handoff; `publishPlan` refuses on mismatch |
| A student being told the wrong reason their build was refused | The poll endpoint splits `gate.blocking` from `gate.advisory` server-side, instead of the client showing the first three of a mostly-advisory array |
| The two build shapes being indistinguishable | `origin: 'local' \| 'pipeline'` on `StudentProject`, chipped on the card and in the build |
| The student never being told they were degraded | The banner renders on **every** Projects view, not only the wizard it was unmounting from |
| Two lookalike builds after a create | The placeholder claims its backend project via `pipelineProjectId` and is superseded in place — guarded so completed work is kept and labelled, not discarded |
| A student self-awards completion | Status allowlist + 409 + import demotion; `markTaskVerifiedComplete` is reachable only from the verification loop, never from a request body |
| A republish resetting the student's ticked criteria | **PR #1463**: `repoWriter` merges `.colaberry/progress.json` (`mergeProgressFile`) instead of replacing it — our story/criterion list replaces, their `passed` flags and notes are carried across by story id and criterion text |
| An agent inventing acceptance criteria to award itself credit | `renderDocs` seeds the exact criterion text; the reader matches claims back to the plan by normalised text, so an invented criterion matches nothing and is discarded rather than counted |
| A verification failure breaking the student's repo sync | Every expected state comes back classified; an unexpected throw logs `workspace_verification_failed` and the sync still returns the pull it succeeded at |
| A missing cohort date kills the build | `scheduleFor` fail-soft returning null |
| Agent scoping failure kills the build | `scopeAgents` returns the plan unchanged on upstream/malformed/placeholder |
| A non-existent column reaches production | `ACTIVE_PROJECT_COLUMNS` asserted against the real `Enrollment` model, statically, with no database |
| Unbounded external calls | 240s decompose / 45s intake / 20s GitHub, all with capped retries; `boundedQueue` at concurrency 3 |
| One cohort rush OOMs the box | `SBP_PROVISION_CONCURRENCY` + `SBP_PROVISION_MAX_DEPTH`, `QueueFull` → 503 |

### Prevented only by someone remembering — the useful half

> Three items that were on this list — publish having no caller, the unreachable
> degradation banner, and the two indistinguishable builds — moved up into the table
> above when PR #1462 landed. That is what progress looks like here. What follows is
> what is left.

1. **That auto-publish actually landed.** It cannot throw by design, so a failure is one
   `sbp_autopublish_failed` line and a build resting at `drafted` — no exception, no
   alert, no red anywhere. Nothing sweeps for it. The daily draft sweep
   ([Q2](references/verification-queries.md)) or `auditStudentBuilds.js` is still the only
   thing that finds them, and the 11 students already in that state predate the fix and
   will not be rescued by it — **auto-publish only fires on new generations.**
2. **The cohort start date.** Nothing alerts on a null. A cohort missing it produces
   undated, prep-less builds for every student in it, quietly and forever.
3. **`assertSbpSchema` only logs.** It does not throw and does not halt boot. Nobody sees
   `sbp_schema_incomplete` unless they look.
4. **Your own queries.** The `story_id` collision is guarded on the import path only. Any
   ad-hoc SQL, script or audit that matches on `story_id` alone reproduces the bug.
5. **Repo provisioning has never run.** 0 of 31 projects have a repo; all 11
   `github_connections` rows are legacy enrollment-keyed and `repoForProject` matches on
   `project_id`, so it returns null every time. `awaiting_repo` is therefore not an
   exception path, it is *the* path — and `renderDocs`, `repoWriter` and `managedBlock`
   are correct, tested, and have never run against a real student repo. Do not report
   document delivery as a working feature.
6. **`due_on` reaches the database and stops there.** No portal surface reads it, so
   "dated" is true in SQL and false on screen. Keep verifying it — the schedule running
   is the precondition for it ever being rendered — but do not tell a student their
   dates are visible.
7. **Repo-write idempotency is defeated at the call site.** `publishBuild` passes `null`
   for the existing manifest with a `TODO(step 6)`, so `changedFiles` sees an empty
   baseline and **every** publish commits all ~16-19 files. #1462 makes this worse rather
   than better — publish now fires on every regeneration instead of being a rare manual
   act — and its author flagged it as knowingly deferred. Repo churn, not a correctness
   bug, and moot until repos exist at all.
8. **`getBuildState` returns the latest plan, not the published one.** There is a
   `getPublishedPlan()` and the orchestrator does not use it. The new `delivered` field
   on the poll response is derived from the intake status, so it is trustworthy; the
   `plan` block on the same response may still be describing a newer draft.
9. **Verification is now wired, and still has never run.** #1463 gave
   `markTaskVerifiedComplete` its caller and the loop is triggered by workspace sync — but
   the loop reads `.colaberry/progress.json` **out of the student's repo**, and item 5
   above says there are no student repos. So **0 tasks still carry `verified_at`** and 0
   `evidence_records` carry source `github_commit`, for a different reason than before.
   Do not read "the verification loop shipped" as "verification works": it is blocked
   behind repo provisioning, and the first real proof will be a `verified_at` that is not
   null. Points gated on `verified_at` still award nothing today.
10. **`SET TRANSACTION READ ONLY` is a no-op through node-postgres**, which sends each
    query as its own implicit transaction — it guards the statement carrying it and
    nothing after, while looking identical in the source. Use
    `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`. Proven by attempting a write
    after each.
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
