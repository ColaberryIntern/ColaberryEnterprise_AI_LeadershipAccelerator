# Student Build Pipeline — Concurrency & Correctness Audit

**Session:** CC-20260809-b7k2
**Date:** 2026-08-09
**Scope:** The "Projects → Start a new build" flow (idea → requirements → releases → stories → Claude Code prompt) as deployed at `enterprise.colaberry.ai`.
**Deployed commit audited:** `27b80cc9` (prod `HEAD` == `origin/main`, verified on 95.216.199.47)
**Question asked:** *Can this run 20+ times around the same time and still perform successfully?*

---

## Verdict

**The pipeline will not fall over under 20 concurrent builds — because it does almost nothing server-side. It will, however, produce 20 near-identical, low-value builds, and it silently fails to persist all but the first three tasks of every one of them.**

The capacity question is not the real risk. The correctness question is. Both are addressed in `BUILD_PIPELINE_REQUIREMENTS.md`.

| Dimension | Today | Target |
|---|---|---|
| Concurrent build starts survivable | ~unbounded (no server work) | 20 sustained / 50 peak, with real generation |
| Builds that persist correctly | **0 of 14 projects** (3 tasks total in prod DB) | 100% |
| Requirements document per build | **None on this path** (a working generator exists, unwired — F-2) | 1 versioned doc per build |
| Requirements that mention the project's own domain | **6%** (54 of 908, freight build) | majority |
| Requirements ever advanced past `UNMAPPED` | **0 of 3,587** | tracks real progress |
| Releases derived from requirements | **No** — 4 hardcoded lists; 8 projects hold requirements and **0 tasks** | Derived, walking-skeleton-first |
| Story prompt length (mean) | **~146 chars** (best case, sample fixture) | ≥1,200 chars, structured |
| Prompt references requirement docs | **No** | Yes — repo path + signed URL |

---

## F-1 · BLOCKER · Every real build stops persisting at task 4

**Severity:** Blocker · **Blast radius:** every student · **Reversible:** yes (index change + transaction)

### The defect

[projectWriteService.ts](../backend/src/services/projects/projectWriteService.ts) `importProject()` writes each task with `StudentTask.findOrCreate({ where: { project_id, story_id } })`. The row it creates carries `requirement_key`.

Production carries a **non-partial unique index**:

```
student_tasks_unique_req_key = UNIQUE (project_id, requirement_key)
```

The client's generated skeleton ([projectsStore.ts](../frontend/src/pages/portal/projects/projectsStore.ts) `generateSkeleton`) emits tasks in this order:

| # | Task | `requirement_key` |
|---|---|---|
| t1 | Lock the core requirements | R1 |
| t2 | Map the safety guardrail | R4 |
| t3 | Scaffold the MCP server | R2 |
| **t4** | **Implement the read tool** | **R2 ← collision** |
| t5 | Implement the core action | R3 |
| t6 | Connect the live preview | R2 |
| t7 | Retry + timeout | R5 |
| t8 | Empty/no-match cases | R3 |

Three tasks legitimately cite `R2`; two cite `R3`. That is correct product behaviour — a requirement is fulfilled by several stories. The index forbids it. `t4` raises a unique violation, `importProject` throws, the route 500s.

### Production evidence

The entire `student_tasks` table in `accelerator_prod`:

```
                  id                  |     story_id      | requirement_key |                        title                        |  status
--------------------------------------+-------------------+-----------------+-----------------------------------------------------+----------
 51e60991-6e80-4128-8091-d1cf7b084450 | p1786115158272-t1 | R1              | Lock the core requirements with acceptance criteria | complete
 8f260b8a-55ff-41fb-ad7f-0f970a425123 | p1786115158272-t2 | R4              | Map the safety guardrail (currently UNMAPPED)       | complete
 cc3121c6-6daf-49bc-bc64-40095f385436 | p1786115158272-t3 | R2              | Scaffold the MCP server over stdio                  | complete
(3 rows)
```

Three rows. `t1`, `t2`, `t3` — then nothing. It halts on exactly the first duplicate `requirement_key`, precisely as predicted. Across 14 `projects` rows, **1** has any tasks at all.

### Why nobody noticed

[projectSync.ts](../frontend/src/pages/portal/projects/projectSync.ts) `mirrorToBackend()`:

```ts
try {
  await portalApi.post('/api/portal/projects/import', toImportPayload(project));
} catch {
  // API off (404) or transient — localStorage remains the working source.
}
```

A bare `catch {}` — a forbidden pattern under CLAUDE.md *Failure-First Design*. A 500 is indistinguishable from "flag off." The student sees a working build (localStorage is intact), so the bug is invisible from the UI and from support.

The seeded Hair Salon sample is excluded from the mirror (`.find(p => !p.sample)`), so QA against the demo build never exercises the broken path.

### Compounding: the write is not transactional

`importProject` loops `findOrCreate` with no transaction. The throw leaves a **partially written project** — 3 tasks, 2 lists, no rollback. Re-running does not repair it; it re-throws at the same point. This violates the *Idempotency & Replayability* contract ("Failed runs leave the system in a state safe to re-run. Partial commits are forbidden").

### Fix

1. Make the index partial and correct: `student_tasks_unique_req_key` should be dropped. `(project_id, story_id) WHERE story_id IS NOT NULL` (`student_tasks_unique_story`, already present) is the correct identity key. A requirement-to-task relationship is one-to-many by design.
2. Wrap `importProject` in `sequelize.transaction`.
3. Surface the failure: log structured, return the error to the caller, and show a non-blocking "couldn't save your build" state.

---

## F-2 · CRITICAL · The build is theatre — no requirements are generated

**Severity:** Critical · **Blast radius:** every student · **Reversible:** yes

`ProjectsPage.handleCreate` calls `createProjectFromAnswers(answers)`. That function is **entirely client-side**:

```ts
window.setTimeout(() => {
  p.status = 'ready';
  p.lists = skeleton.lists;
  ...
}, 7000);
```

A 7-second timer flips a status flag. No API call. No LLM. No requirements document.

`generateSkeleton()` is a fixed 4-list / 10-task template with the project name and the first data source string-substituted in. Consequences:

- **The student's brain-dump is discarded.** The wizard's step-1 copy explicitly asks them to "pour out" everything — "every capability and edge you can think of." Only `idea` (for the name/hash) and the first token of `dataSources` reach the output. `users`, `done`, and `weeks` touch only cosmetic strings.
- **The advertised build tiers do not exist.** The wizard offers "~5 min", "~13 min", "~21 min · deepest" and describes "a live preview as it builds." All three run the same 7-second timer and produce the same 10 tasks. `size` changes only whether the text says "workflow" or "MCP server."
- **Releases are not derived.** `L1..L4` are hardcoded ("Project DNA & Requirements", "Core build", "Reliability & polish", "Showcase & portfolio"). Nothing is walking-skeleton-first; nothing is gated (`blockedBy` is never set on generated builds — only on the salon sample).
- **20 students starting builds around the same time receive 20 substantively identical projects.** This is the real "does it work at 20×" answer.

### A working generator already exists — it is simply not wired to this page

This is the most important qualifier on F-2, and it materially reduces the work: **generation is not missing, it is disconnected.** Three server-side pieces exist and the Projects page reaches none of them:

- [architectProxyService.ts](../backend/src/services/architectProxyService.ts) — advisor.colaberry.ai, 8-phase, chapter-by-chapter
- [requirementsGenerationService.ts](../backend/src/services/requirementsGenerationService.ts) — OpenAI, two-pass, job-tracked
- [buildPlanIngestService.ts](../backend/src/services/buildPlanIngestService.ts) — transactional, idempotent ingest of releases + stories

The Architect path has produced real output in production. `ali+8@colaberry.com`'s project holds a genuine 251,027-character *"Autonomous Freight — Build Guide"* — 13 chapters, coherent domain prose. Eight activated projects carry documents between 19k and 255k characters and **3,587 requirements** between them.

**The approach question is already settled.** [REQUIREMENTS_GENERATOR_COMPARISON.html](REQUIREMENTS_GENERATOR_COMPARISON.html) (2026-05-21) ran a controlled comparison on the same idea:

| | Architect | Regular LLM (gpt-4o-mini) |
|---|---|---|
| Output | 13,742 words · 13 chapters | 1,450 words · 16 sections |
| Time | ~14–16 min | ~70–103 s |
| Method | per-chapter writes, ≥1,750-word gate, retry-if-short | one call, `max_tokens` 16,000 |
| Asked for ≥6,000 words | met | **delivered 24%** |

Its conclusion: *"the regular path's limit isn't really the token cap — it's that one prompt asking for 'a big document' yields a thin one. The Architect's value is the scaffolding (per-chapter generation + quality gates), not a smarter model."*

Any plan that proposes reaching a word floor by asking one model call to write more, or by adding an expansion pass, is re-running an experiment that has already been measured and lost. **r1 wires up the chapter-by-chapter scaffolding; it does not rebuild a generator.**

### But the pipeline stops dead at the requirements

All 8 activated projects have **0 `student_task_lists` and 0 `student_tasks`**. Requirements were generated and clustered into capabilities, and then nothing. Requirements → releases → stories was never built — which makes r2 the true missing link, with eight projects parked at exactly that boundary.

The pipeline is also dormant: the newest `requirements_generation_jobs` row is **2026-05-22** (~2.5 months before this audit), and all 8 activated projects belong to Ali's own test accounts. No real student has ever had an activated project with requirements.

---

## F-3 · CRITICAL · Prompts are one-liners with no path to the requirements

**Severity:** Critical · **Blast radius:** every student · **Reversible:** yes

Two prompt surfaces exist, and the weaker one is what the screenshot's button uses.

**The hero "Copy prompt" button** (`ProjectsPage.copyPrompt`) copies `primaryNext.task.prompt` — the bare string, nothing else:

> `Build a salon booking page with Cal.com where a client selects a service, stylist, and slot; on confirm, POST to a Supabase appointments row and return a confirmation screen. If the stylist has no slot, show the two nearest alternatives.`

Mean prompt length across the 19-story salon fixture: **146 characters**. Generated builds are comparable — e.g. `Implement the tool that reads Zendesk API and returns matching results as structured JSON. Add the schema, a happy-path test, and a malformed-input test.`

**The drawer prompt** ([projectWorkspacePrompt.ts](../frontend/src/pages/portal/projects/projectWorkspacePrompt.ts) `buildProjectTaskPrompt`) is better — build context, task, acceptance, delivery-mode block, repo pointer, notes. It is still missing the thing that matters most:

```ts
if (task.req) {
  const req = project.reqs.find((r) => r.id === task.req);
  taskLines.push(`Requirement: ${task.req}${req ? ` — ${req.name} (currently ${req.state.toUpperCase()})` : ''}`);
}
```

It emits `Requirement: R2 — Zendesk Api data source (read-only) (currently PLANNED)` — a **label**, not a location. There is no file path, no URL, no document. A student's Claude Code session has no way to read the requirement it is being asked to satisfy, because on this path no requirements document was ever produced (F-2).

This is the gap flagged directly: the prompt must be *built in a way where the student's Claude Code session can access the requirement documents*. Today it cannot, and there is nothing to access.

---

## F-4 · HIGH · Nothing survives a backend restart, and pollers can overlap

**Severity:** High · **Blast radius:** all in-flight builds during a deploy

These bite the moment real generation is switched on (Release r1), and already affect the Architect tier.

- **Fire-and-forget background work.** `startRequirementsGeneration` calls `executeJob(...).catch(...)` — an unawaited floating promise in the API process. `startArchitectBuild` does the same with `drivePhases(...)`, which holds ~40 s of hardcoded `sleep()` across five sequential HTTP calls. A deploy (`docker compose up -d --build backend`) kills every in-flight build. Jobs stay `running` forever; `PROGRESS.md` deploys happen after hours, but 20 students mid-build during any restart all strand. There is no worker process and no durable queue.
- **No concurrency bound on generation.** 20 simultaneous starts create 20 concurrent OpenAI calls at `max_tokens: 16000`, plus a second expansion pass each. Prod runs the backend container with **no memory limit** (`HostConfig.Memory: 0`) on a 15 GB host with ~7 GB available, shared with Postgres and 15+ other stacks. This is the exact shape of the known batch-generation OOM (~34 concurrent generations).
- **Cron overlap.** `cron.schedule('*/2 * * * *', () => pollArchitectBuilds())` in [server.ts](../backend/src/server.ts) has no in-flight guard and no advisory lock. `pollArchitectBuilds` iterates candidates **sequentially**, each doing untimed `fetch()` calls to advisor.colaberry.ai. One hung upstream request stalls the whole poller past the 2-minute tick and a second run starts on the same rows — double activation, double document retrieval.
- **Untimed external calls.** Every `fetch()` in `architectProxyService.ts` (chat, phase POSTs, status, document download) is unbounded. `studentWorkspaceService.ts` is the counter-example and the right pattern: explicit `AbortController` timeout, capped retries, 429/5xx-only retry, clear errors.

---

## F-5 · HIGH · `activateProject` destroys requirement state

**Severity:** High · **Blast radius:** any project run through activation twice

[projectSetupService.ts](../backend/src/services/projectSetupService.ts):

```ts
await RequirementsMap.destroy({ where: { project_id: project.id } });
for (const req of parsed) { await RequirementsMap.create({ ... status: 'unmatched' ... }); }
```

Destroy-then-recreate, outside a transaction. Two callers can reach it concurrently for the same project — the `*/2` poller and the browser's `GET /architect-status` poll — with no lock. Between the `destroy` and the last `create`, the project has **zero requirements**; a concurrent read sees an empty map. The 4-state progression (`UNMAPPED → PLANNED → BUILT → VERIFIED`) is reset to `unmatched` on every activation, discarding student progress.

Correct shape is the one already written in `buildPlanIngestService.ts`: a single `sequelize.transaction` with upserts keyed on `(project_id, requirement_key)` that preserve `state`.

---

## F-7 · HIGH · Extraction loses the document's domain, and the 4-state has never moved

**Severity:** High · **Blast radius:** every generated build · **Reversible:** yes

Generation produces a good document (F-2). Extraction then turns it into a requirement set that has largely lost the project. Measured across the 3,587 requirements in `accelerator_prod`:

**1. The parser emits markdown scaffolding as requirements.**

| Occurrences | `requirement_text` |
|---|---|
| 24 | `**Response**:` |
| 22 | `**Output**:` |

Those are formatting fragments from the source document, not requirements. `parseRequirements` is matching on structure that also catches non-requirement lines.

**2. Domain signal is heavily diluted.** Of the **908** requirements extracted from the *Autonomous Freight* build guide, only **54 (6%)** mention freight, broker, or load. A 251k-character domain-specific document is being flattened into mostly generic platform requirements. Note the calibration: 3,067 of 3,587 texts are *distinct*, so this is not wholesale boilerplate — the failure is dilution and imprecision, not duplication. But a student reading their own requirements should not find 94% of them domain-neutral.

**3. Some generic requirements repeat heavily** — the same telemetry templates (`ACTION-TRAIL`, `DECISION-AUDIT-LOG`, `PATTERN-DETECTION`, `SESSION-ANALYTICS`, `USER-EVENT-TRACKING`) recur 18–46 times under different `AUTO-<hash>` key prefixes, across a corpus that only ever uses **3** key prefixes total.

**4. `status` and `state` contradict each other, everywhere.** Every one of the 3,587 rows reads `status='verified'` and `state='unmapped'` simultaneously:

```
  state   | count
----------+-------
 unmapped |  3587
(1 row)
```

`state` is the 4-state the student's progress display reads (`UNMAPPED → PLANNED → BUILT → VERIFIED`). **It has never advanced once in production.** `status` is a separate legacy column written by the `/decide` path. The code acknowledges the split — *"the /decide path mutates RequirementsMap, a different layer — reconciling the two is a P2 concern"* — but as long as both exist and disagree, no requirement-progress figure shown to a student is trustworthy.

---

## F-6 · MEDIUM · Structural and governance issues

| Issue | Detail |
|---|---|
| **`projectRoutes.ts` is 11,633 lines** | 23× the 500-line hard ceiling in CLAUDE.md *Modular Composition*. Any change to it must split it first. |
| **No load or concurrency test exists** | The 20× question cannot currently be answered by a test. Nothing in `/tests` exercises concurrent build creation. |
| **Silent catches** | `projectSync.ts` (×3), `projectsStore.ts` (×4), `architectProxyService.ts` fallback chain. All forbidden by *Failure-First Design*. |
| **Prompt injection surface** | The student's free-text idea flows into an LLM prompt (`buildRequirementsPrompt`) and later into a prompt the student pastes into Claude Code, with no delimiting or instruction-hierarchy framing. Low severity today (self-targeted), but it becomes real once builds are shared or reviewed by staff. |
| **`localStorage` is the source of truth** | `te_projects_v1`. Clearing site data destroys a student's build. The backend copy is the 3-row stub from F-1. |
| **No admin visibility** | There is no funnel view of builds started / generated / persisted / worked. F-1 has been live and invisible. |

---

## What actually happens at 20 concurrent students today

Walked end to end, 20 students clicking "Confirm & build" within the same minute:

1. 20 browsers run `generateSkeleton` locally. Server load: **zero**. No queue, no LLM, no contention.
2. 20 × 7-second timers fire. 20 builds flip to `ready`. All 20 look successful.
3. On next page load, each browser calls `GET /api/portal/projects/active` then `POST /api/portal/projects/import`.
4. **All 20 imports 500** at task 4 (F-1). Each leaves 3 orphan tasks and 2 lists behind.
5. All 20 errors are swallowed (F-1). No log line the operator would look for, no alert, no UI state.
6. 20 students hold 20 near-identical 10-task templates (F-2) with ~146-character prompts (F-3) that cannot reach any requirements document (F-3), stored only in `localStorage` (F-6).

Nothing crashes. Nothing scales badly. It just doesn't do the job — and the part that was supposed to make it durable has been failing 100% of the time since it shipped.

---

## Recommended sequence

Detailed requirements are in `BUILD_PIPELINE_REQUIREMENTS.md`; the release/story breakdown and the Claude Code prompts are in `BUILD_PIPELINE_RELEASES_AND_STORIES.md`.

| Release | Theme | Why here |
|---|---|---|
| **r0** | Stop the bleeding — F-1, transaction, surfaced errors | One index + one transaction recovers 100% of build persistence. Highest value per line changed. |
| **r1** | **Wire** the existing Architect generation to the Projects page, on a durable bounded queue | Generation is not missing, it is disconnected (F-2). Do not rebuild it — the single-call approach was measured and lost in May. Queue must land *with* the wiring, never after. |
| **r2** | Requirements → releases → stories, with extraction fidelity and a traceability gate | The true missing link: 8 projects hold requirements and **zero** tasks (F-2). Also closes F-7's extraction defects. Reuses `buildPlanIngestService`'s proven transactional ingest. |
| **r3** | Extensive prompts + requirement docs materialized into the workspace repo | Closes F-3 — the specific ask. |
| **r4** | Concurrency hardening, 20/50 load proof, observability | Turns "we think it holds" into evidence. |

---

## Evidence trail

| Claim | How verified |
|---|---|
| Prod runs `27b80cc9` == `origin/main` | `git rev-parse` on 95.216.199.47:/opt/colaberry-accelerator |
| `PROJECT_API_ENABLED=true` in prod | prod `.env` |
| 3 tasks / 2 lists / 1 project with tasks / 14 projects | `psql accelerator_prod`, direct count |
| Import halts at first duplicate `requirement_key` | Row dump matches `generateSkeleton` order t1,t2,t3 exactly |
| `student_tasks_unique_req_key` is non-partial UNIQUE | `pg_indexes` on `student_tasks` |
| Backend container has no memory limit | `docker inspect accelerator-backend --format '{{.HostConfig.Memory}}'` → `0` |
| Host: 8 cores, 15 GB, ~7 GB available, 20+ containers | `nproc`, `free -g`, `docker ps` |
| Mean salon prompt 146 chars | computed over the 19 stories in `salonData.json` |
| Build creation makes zero server calls | `ProjectsPage.handleCreate` → `createProjectFromAnswers` (pure, `setTimeout` only) |
| 3,587 requirements across 8 activated projects; 3,067 distinct texts | `psql accelerator_prod`, `requirements_maps` |
| All 3,587 rows `state='unmapped'`, `status='verified'` | `GROUP BY state` returned a single row |
| 0 lists / 0 tasks on all 8 activated projects | correlated subquery over `student_task_lists`, `student_tasks` |
| `**Response**:` ×24, `**Output**:` ×22 stored as requirements | `GROUP BY requirement_text ORDER BY count DESC` |
| 54 of 908 freight-project requirements mention its domain | `count(*) FILTER (WHERE text ILIKE '%freight%' OR '%broker%' OR '%load%')` |
| Newest generation job 2026-05-22 | `max(created_at)` on `requirements_generation_jobs` |
| Architect vs single-call comparison already settled | `docs/REQUIREMENTS_GENERATOR_COMPARISON.html`, dated 2026-05-21 |
