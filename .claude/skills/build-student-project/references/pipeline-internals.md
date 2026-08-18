# Pipeline internals — the module map, the contracts, the flags

Verified against `origin/main` `4078338f` (2026-08-13). Everything in
`backend/src/services/sbp/` is pure or has a pure core; the I/O shells are named for it.

## Module map

| File | Pure? | What it owns |
|---|---|---|
| `sbpOrchestrator.ts` | I/O | **The spine.** `startBuild`, `getBuildState`, `publishBuild`, `scheduleFor`, `makeActiveProject`. Nothing else calls the chain. |
| `intakeQuestionsPrompt.ts` | pure | The interview: per-tier question targets, the ten designed angles, the fallback set |
| `intakeQuestionsService.ts` | I/O | The interview model call. **Never throws** — degrades to the generic set with `generated:false` |
| `decomposePrompt.ts` | pure | The decomposition system + user prompt |
| `decomposeService.ts` | I/O | The decomposition model call. 240s timeout, 1 SDK retry, 1 reshape attempt, then fails with an `error_class` |
| `planContract.ts` | pure | `BuildPlan` types + `BUILD_PLAN_JSON_SCHEMA` for structured output. The contract between the model and everything downstream |
| `buildTiers.ts` | pure | What `workflow` / `project` / `autonomous` actually mean |
| `planGate.ts` | pure | The traceability gate. 17 rules, 9 of them blocking |
| `planRepair.ts` | I/O | Targeted repair from the violations, max 3 attempts, monotone |
| `scopeAgents.ts` | I/O | The AI roster. Flagged, fail-soft |
| `planHash.ts` | pure | `hashPlan` — the sha the reviewer is shown |
| `planStore.ts` | I/O | `build_intake` + `build_plans`. Raw SQL; those tables have no Sequelize model |
| `buildSchedule.ts` | pure | Release weeks → real calendar dates, capacity, demo release, prep tasks |
| `commandCenterStory.ts` | pure | STORY-000: its id, title, acceptance, and prompt built from the student's own plan |
| `materializeTasks.ts` | I/O | Plan → `student_task_lists` + `student_tasks`, one transaction |
| `buildStoryPrompt.ts` | pure | The Claude Code prompt stored on each task's `build` column |
| `renderDocs.ts` | pure | The ~16-19 file document set + the path allowlist |
| `repoWriter.ts` | I/O | One GitHub commit, content-hash idempotent, allowlist enforced by throwing. Two co-owned files are merged rather than replaced: `CLAUDE.md` via `spliceManagedBlock`, `.colaberry/progress.json` via `mergeProgressFile` (#1463) |
| `managedBlock.ts` | pure | The delimited block inside the student's CLAUDE.md |
| `verification/progressContract.ts` | pure | `.colaberry/progress.json` — Zod schema, render, parse, and the merge that keeps the agent's `passed` flags across a republish |
| `verification/repoProgressReader.ts` | I/O | The read half: the progress file and the pushed commits, out of GitHub |
| `verification/verifyDecision.ts` | pure | Per story: verified / submitted / in_progress / not_started, plus why not |
| `verification/buildVerificationService.ts` | I/O | The loop end to end — writes `verification_json`, calls `markTaskVerifiedComplete`. Called from `POST /api/portal/workspace/repo/sync` |
| `boundedQueue.ts` | I/O | Concurrency ceiling for generation |
| `workspaceRepo.ts` | I/O | `repoForProject(projectId)` — the single repo lookup shared by the HTTP publish route and auto-publish, extracted in #1462 so the two paths cannot drift. Returns null (never throws) when unprovisioned, which is currently **always** |

Schema: `backend/src/db/ensureSbpSchema.ts`, called once at boot from `server.ts:2422`,
**after** `ensureStudentTaskMergeSchema()` (2406) because it ALTERs `student_tasks`.

Routes: `backend/src/routes/sbpRoutes.ts`, mounted path-less at
`participantRoutes.ts:422`, itself mounted path-less at `server.ts:106`. The paths in
that file are already absolute.

Frontend: `frontend/src/services/sbpApi.ts` (typed-result client, never throws),
`frontend/src/pages/portal/projects/ProjectsPage.tsx` (`handleCreate`),
`ProjectWizard.tsx` (the interview), `projectsStore.ts` (localStorage),
`projectSync.ts` (mirror), `projectHydrate.ts` (reconcile).

---

## The chain, with the exact call order inside publish

```
startBuild ──► saveIntake(status='generating') ──► 202 to the caller
                              │
              (bounded queue, concurrency 3)
                              ▼
                        decomposeBuild ──► gateAndRepair ──► scopeAgents?
                              │
                     savePlanDraft(status='draft')
                              │
                setStatus('drafted' | 'gate_failed')
                              │
              if publishable: autoPublish(expectedSha)    ◄── PR #1462; cannot throw
```

Before PR #1462 the chain stopped at `setStatus`, with a `[review]` step in the comment
that had no UI on either end. `autoPublish` calls the same `publishBuild` below, passing
the draft's `plan_sha256` so a concurrent generation cannot substitute a plan this run
never graded, and swallowing every failure into `sbp_autopublish_failed` so a publish
problem is never reported as a generation failure.

```
publishBuild
  ├─ getPlan(projectId)                    latest version, any status
  ├─ blockingViolations(...) → 409 if any
  ├─ publishPlan(version, expectedSha?)    draft → published; older published → superseded
  ├─ WITH a repo:  renderDocs → writeDocsToRepo   (docs first, so prompts can cite paths)
  ├─ scheduleFor(enrollmentId)             cohorts.start_date, or null
  ├─ materializePlanAsTasks                lists + tasks + STORY-000 + prep, one transaction
  ├─ makeActiveProject                     enrollments.active_project_id
  └─ setStatus('published' | 'awaiting_repo')
```

`materializePlanAsTasks` has **no caller anywhere except these two branches of
`publishBuild`.** That is the whole reason STORY-000's absence is proof publish did not
run. `publishBuild` now has two callers: the HTTP route, and `autoPublish`.

**The repo branch has never executed in production.** `repoForProject()`
(`services/sbp/workspaceRepo.ts`, extracted in #1462 so the route and the auto path
cannot drift) queries `github_connections WHERE project_id = :projectId`.
`enrollment_id` on that table is `NOT NULL`; `project_id` was added later by the FR-037
re-key and is nullable. All 11 rows in production are legacy enrollment-keyed with a null
`project_id`, so the lookup returns null for all 31 projects and every publish takes the
`awaiting_repo` branch.

---

## Build statuses (`build_intake.status`)

| Status | Meaning | Terminal for the poller? |
|---|---|---|
| `captured` | intake saved, nothing generated | no |
| `generating` | a model call is in flight | no |
| `gate_failed` | generated, but has **blocking** violations — not publishable | yes |
| `drafted` | gate-clean and stored but not promoted. **Since PR #1462 this is a failure state, not a resting one** | yes |
| `published` | promoted, documents written | yes |
| `awaiting_repo` | promoted, tasks materialized, no repo to write into | yes |
| `failed` | generation itself threw; the intake is replayable | yes |

`DELIVERED_STATUSES` = `{published, awaiting_repo}` — exported from the orchestrator and
surfaced as `delivered` on the poll response. That boolean is the single honest answer to
"did the plan reach the student".

`drafted` and `awaiting_repo` are the two that get misread, in opposite directions.
`drafted` looks like success on the wire and means generated-but-not-promoted.
`awaiting_repo` looks like a failure and **is** finished as far as the student's task
list is concerned — and since no project has ever had a provisioned repo, it is the
normal terminal state of every successful build in production.

Plan statuses (`build_plans.status`) are separate: `draft` | `published` | `superseded`.

### The poll response (`BuildStateResponse`)

Declared as a type at the route boundary in #1462 and mirrored in
`frontend/src/services/sbpApi.ts` — changing either side without the other is a breaking
contract change.

```ts
{
  project_id, status, correlation_id,
  gate: { ok, violations, blocking, advisory } | null,
  delivered: boolean,        // DELIVERED_STATUSES.has(status)
  plan:  { version, sha256, status, requirements, releases[], stories[] } | null
}
```

Read `delivered` and `gate.blocking`. Do **not** read `gate.ok` as health (it is
`violations.length === 0`), and remember the `plan` block describes the **latest** plan,
which may be a newer draft than the published one.

---

## The gate

Pure, deterministic, no I/O, graded on untrusted model output so malformed input is a
violation rather than a crash. 17 rules; these nine **block**:

```
must_uncovered · dangling_requirement · dangling_release · dangling_blocked_by
malformed_requirement · malformed_story · r0_missing · r0_not_ungated · invented_vendor
```

The line is: *would this mislead the student about what they are building, or write
broken data?* Everything else is advisory and rides along on a published plan —
`acceptance_too_few`, `acceptance_no_trust_line`, `r0_no_trust_spine`, `story_is_layer`,
`story_redundant_scaffold`, `requirement_unfalsifiable`, `release_unbalanced`,
`release_empty`. A published plan with `gate_ok = false` is normal.

The split exists because it was once all-or-nothing: a single `story_redundant_scaffold`
— one story overlapping two others — left a student staring at an empty Projects page,
which is strictly worse than a plan with a slightly redundant story in it.

Rules worth understanding before you touch them:

- **`CONSTRAINT` requirements are exempt from coverage.** A named technology, vendor,
  datastore or protocol is context on the stories that use it, not a work item. Typing
  them `FUNC/must` is what manufactured the pilot's layer stories ("System connects to
  Postgres for data access").
- **`invented_vendor`** is a denylist of *observed* hallucinations (Stripe, PayPal,
  Salesforce, HIPAA, Okta, …) flagged only when they appear in the plan and in neither
  the brief nor the document. Deliberately not an attempt to detect novelty in general.
- **`release_unbalanced`** is `max > 2 × mean`, not `>50%`, because the pilot's 6-of-12
  skew would have passed a 50% rule.
- **`UNFALSIFIABLE_PATTERNS` are exported so a test can assert each one still matches
  the phrase it was written for.** Five of the seven were dead for a week: the file was
  first written through a shell heredoc that interpreted `\b`, leaving a literal 0x08
  byte in the source, so `/\bhigh[- ]quality\b/` demanded a control character. It
  rendered as correct source in every editor and diff. Never write source through a
  shell heredoc.

Repair (`planRepair.ts`) takes the violations verbatim and returns **edits** — stories to
add/replace/remove and requirements to rewrite — merged by id. Max 3 attempts. An attempt
that does not strictly reduce the violation count is **discarded** and the previous plan
kept, so repair can never hand back something worse than it received.

Before changing any gate rule, replay the corpus:
`backend/src/services/sbp/__tests__/gateReplay.manual.ts` runs every plan production has
stored through the current gate and prints the delta. Jest ignores it (`testMatch` is
`*.test.ts`) because it is a measurement tool, not a test.

---

## The schedule

Pure. The cohort shape is a constant, not a student choice:

```
week 1        cohort starts
week 4        capstone build starts        DEFAULT_START_WEEK
week 11       demo prep, one dedicated week DEFAULT_PREP_WEEK
week 12       presentations                 DEFAULT_DEMO_WEEK
```

Capacity is 1-2 tasks/week (`TASKS_PER_WEEK_LOW/HIGH`). Three fits, not two:

- `total <= low` — comfortable, no cut line
- `low < total <= high` — tight, no cut line, but the verdict says so
- `total > high` — the release that fits at the **conservative** estimate becomes the
  demo release; everything after is the post-class roadmap

Scope bends, the deadline does not. The plan is never cut — "your ambition is too big" is
a worse message than "here is where you'll be on stage, and here is what comes next".
There is a test asserting the verdict text never contains "too big", "cut" or "reduce".

Due dates land at the end of each release's proportional slice of the build window,
spread so tasks in one release do not all land the same day. `due_baseline_on` is written
**once** at first publish and never updated — a plan that silently rewrites its own
original deadlines hides exactly the lesson a slipping project should teach.

`prepTasks()` emits PREP-1..PREP-6, fixed not generated, ending on Demo Day. They
materialize into a `prep` cluster list. **No schedule ⇒ no prep list at all.**

---

## Documents written to the repo

Allowlist (`renderDocs.ts:41`), enforced twice — once at render, once by throwing in
`repoWriter` before any network call:

```
/^CLAUDE\.md$/    /^docs\/.+/    /^\.colaberry\/.+/
```

The set: `docs/REQUIREMENTS.md`, `docs/STORIES.md`, `docs/TRACEABILITY.md`, `CLAUDE.md`,
one `docs/stories/STORY-nnn.md` per story, `docs/stories/STORY-000.md`,
`.colaberry/plan.json`, `.colaberry/progress.json`, `.colaberry/manifest.json`,
`.colaberry/profile.json`.

`docs/stories/STORY-000.md` is listed separately on purpose: STORY-000 is
deliberately NOT in `plan.stories` (the traceability gate, the XP divisor and
materialize ordering all read that array), so it is appended at the RENDER layer
and the "one per story" clause above does not cover it.

The commit is authored by `Colaberry Build Bot <build-bot@colaberry.ai>` with the
message prefix `chore(colaberry):` so the push webhook can recognise its own writes and
skip them — otherwise our write triggers a sync that triggers a write. The ref update is
never forced: a concurrent human push must win, not be erased.

**Three of these paths are NOT ours to overwrite.** Count them by the table below, never
by position in the list above — the list grows. There are three distinct ownership rules,
which is exactly why there are three separate files rather than one.

| Path | Who owns what | Mechanism |
|---|---|---|
| `CLAUDE.md` | we own the delimited block, the student owns the rest of the file | `managedBlock.spliceManagedBlock` — see H-5 |
| `.colaberry/progress.json` | CO-OWNED, merged field by field. We own the story list, the exact criterion text, and the platform-owned `verification` / `totals` blocks; the agent owns `passed`, `files_touched`, `tests_added`, notes | `progressContract.mergeProgressFile` — see H-5's #1463 update |
| `.colaberry/profile.json` | SEED-ONCE. The STUDENT owns it outright. We write it exactly once, into a repo that does not have it, and never touch it again | `repoWriter` re-reads the repo and drops the file from the change set if it already exists |

`.colaberry/plan.json` and `.colaberry/manifest.json` are the ONLY files in `.colaberry/**`
that are platform bookkeeping and replaced wholesale. If you are about to describe
`.colaberry/**` as "overwritten on every sync", that sentence was true before #1463 and is
now wrong for three files in it — and overwriting `profile.json` destroys the student's
portfolio layer, which is the one surface they control and can redact.

---

## Environment

| Variable | Default | Effect |
|---|---|---|
| `SBP_PIPELINE_ENABLED` | off | **All five SBP endpoints 404 without it.** Deliberately its own flag, not `PROJECT_API_ENABLED`, so it can be turned off without breaking the projects API. Unsetting it is an instant rollback |
| `SBP_AUTO_PUBLISH` | **on** | The one default-ON flag in this subsystem, on purpose: a second default-OFF flag in front of the auto-publish fix would have shipped it and left production in the exact state it exists to end. `off` restores manual publish, and the build is then visibly `drafted` rather than silently stuck |
| `PROJECT_API_ENABLED` | — | `/api/portal/projects/active` and the task PATCHes 404 without it |
| `OPENAI_API_KEY` | — | absent ⇒ decomposition throws `ConfigError`; the interview degrades to the generic set |
| `GITHUB_TOKEN` | — | absent ⇒ no repo write; publish lands `awaiting_repo`, prompts inline their context instead of citing paths (FR-031). Tasks still materialize |
| `SBP_AGENT_SCOPING` | `off` | `off` \| `all` \| comma-separated enrollment ids |
| `SBP_PROVISION_CONCURRENCY` | 3 | Generation concurrency. 20 simultaneous students ⇒ the last waits ~237s |
| `SBP_PROVISION_MAX_DEPTH` | 100 | Queue depth; over it, `QueueFull` ⇒ HTTP 503 |
| `SBP_DECOMPOSE_MODEL` | `gpt-4o` | |
| `SBP_INTAKE_MODEL` | `gpt-4o` | |
| `SBP_AGENT_MODEL` | `gpt-4o` | |
| `CONTENT_PAGE_GATE_ENABLED` | off | when on, non-entitled participants get 402 on the projects surface |
| `BUILD_PAID_GATE_ENABLED` | off | same, for `/api/portal/project/*` |

---

## The browser side, and why it is confusing

`handleCreate` (`ProjectsPage.tsx:185-239`) writes an optimistic localStorage build
**unconditionally**, before any network call, and switches the view to `preview`
synchronously. Everything after that is best-effort:

```
createProjectFromAnswers(a)          ← always, ~10 tasks, 4 lists, ready after a 7s timer
resolveBackendProjectId()            ← !ok (including a 404 from the flag being off) ⇒ local, return
startServerBuild()                   ← !ok ⇒ local, return
pollBuild()                          ← !ok, incl. its own 25-min deadline ⇒ local, return
status === 'gate_failed'             ⇒ show the first 3 violations
otherwise                            ⇒ 'ready'
```

Three consequences a newcomer will not guess. All three were the reason nobody noticed
the H-1 incident for a whole evening; **PR #1462 fixes the first two:**

1. ~~**The degradation banner is effectively unreachable after a create.**~~ It was
   rendered only inside the `view.kind === 'wizard'` branch while `handleCreate` switches
   to `preview` before the first `await`, so every failure path set banner state on an
   unmounted component. **Fixed:** it renders on every Projects view, with real copy per
   outcome including the `drafted` case.
2. ~~**The local build is never deleted.**~~ **Fixed:** the placeholder claims its backend
   project via `pipelineProjectId` (persisted to localStorage so it survives a reload
   mid-generation), and `reconcileProjects` gained a `supersede` mode that replaces it in
   place. Guarded by `hasCompletedWork` — a placeholder the student has ticked work off is
   kept alongside rather than discarded, and both carry their `origin` chip. The
   reconciler's modes are now `overlay | hydrate | supersede | noop`.
3. **The real plan still appears only on reload.** `handleCreate` ends with
   `void syncProjectsWithBackend()`, but that function is one-shot per page session and
   the mount effect already ran it, so that call remains a no-op.

`origin: 'local' | 'pipeline'` is stamped at birth — `createProjectFromAnswers` sets
`local`, `backendTreeToProject` sets `pipeline` — and is the field to read when asking
which build a student is looking at.

The localStorage key is `te_projects_v1`. Reading it re-seeds the `sample-salon` demo
build, so the key is mutated even on a pure page load.

---

## Idempotency and replay, per CLAUDE.md

| Operation | Mechanism | Where |
|---|---|---|
| Intake | `ON CONFLICT (project_id) DO UPDATE` | `planStore.saveIntake` |
| Start a build already generating | returns immediately without re-queuing | `sbpOrchestrator.ts:104` |
| Plan versions | immutable; a regeneration is a new version, never an overwrite | unique index `(project_id, version)` |
| Publish | early-returns if already `published` | `planStore.publishPlan` |
| Materialize | `findOrCreate` on `(project_id, story_id)`; `complete` preserved; `due_baseline_on` written once | `materializeTasks.ts` |
| Repo write | content-hash comparison against the committed manifest | `repoWriter.changedFiles` — **but see H-10(a), the call site passes `null`** |
| Repo write over a co-owned file | merge, not replace, so a republish cannot discard what the student or their agent wrote | `spliceManagedBlock` (CLAUDE.md), `mergeProgressFile` (`.colaberry/progress.json`) |
| Active project | `WHERE active_project_id IS NULL OR <> $pid` | `makeActiveProject` |
| Verification | `verified_at = existing ?? now()` — a replay does not move the timestamp | `markTaskVerifiedComplete` |
| Re-verification | `verification_json` is deliberately **not** first-write-wins — it is the live verdict and is rewritten on every sync, while `verified_at` beside it never moves | `buildVerificationService` |

---

## Tests

23 suites in `backend/src/services/sbp/__tests__/`, 395 tests as of PR #1462, which adds
`sbpOrchestrator.autoPublish.test.ts` (a gate-clean plan reaches the student
automatically; a `must_uncovered` plan does not promote, materialize or commit; a publish
failure rests at `drafted` and never `failed`) and `materializeTasks.idempotency.test.ts`
(publishing twice creates nothing the second time; one Command Center across three runs;
`due_baseline_on` survives a cohort date slip while `due_on` moves) — proven against an
in-memory model layer rather than call counts. The
fixture `fixtures/pilot-dryrun-plan.json` is the real plan the pilot produced; the gate
rules are asserted against it, and asserted **not** to catch the genuine slices
alongside the four layer stories.

What the suite cannot tell you, in its own words:

- mocked `sequelize.query` accepts any SQL string, including one Postgres would reject —
  it cannot see a column name (H-7)
- `ensureSbpSchema.test.ts:147` deliberately proves the function **resolves when the
  ALTER fails**
- mocked GitHub passed 22 repoWriter tests while the manifest-churn bug was live; the
  live check found it in one run

The two live harnesses, neither of which touches production data:

```bash
cd backend
GITHUB_TOKEN=… npx ts-node src/scripts/sbpLiveEndToEnd.ts [--keep]
OPENAI_API_KEY=… npx ts-node src/scripts/sbpCompareToPilot.ts <brief.txt> <document.md>
```

`sbpLiveEndToEnd` creates a scratch repo under `GITHUB_WORKSPACE_ORG`, renders, commits,
clones, and opens every path the prompt cites — the only check that can prove the
prompt's paths resolve. It deletes the repo unless `--keep`; note the `gh` token has
historically lacked `delete_repo`, so check for orphaned `sbp-live-check-*` repos after.
