# Adapter Contract — `deep_plan.json` → Accelerator student platform

**Purpose:** let the canonical Story-Driven Build engine (in the AI Project Architect repo) publish a generated plan into the Accelerator student platform as native Projects / Sprints / Tasks / Requirements — the same way it publishes to Basecamp for employees. This is the "back half" adapter; the "front half" (the engine) stays canonical and shared.

**Loop-item 1 of the sync-plan execution. In-bounds: this repo, additive, no deploy.**

---

## 1. The seam we build on (already exists)

The engine is **store-first**: `myday_build_orchestrator.run_build()` calls `deep_plan.store_deep_plan(slug, plan)` which writes `output/{slug}/deep_plan.json` **before** it publishes to Basecamp. That JSON is the target-agnostic hand-off. The Accelerator adapter consumes that artifact — it never re-runs or forks the engine.

## 2. Source contract (`deep_plan.json`, verbatim field names)

```
plan = {
  project: str,
  reqs:     [ { id:"REQ-001", priority:"must|should|could", statement, acceptance:[str], cluster } ],
  agents:   [ { name, context, owns:[REQ-id], commands, reacts, autonomy, gate } ],
  stories:  [ { id:"STORY-001", title, fulfills:[REQ-id], owner_agent, slice,
                narrative, acceptance:[{scenario,trust,given,when,then}], build, vibe, trust, release:"r0" } ],
  releases: [ { key:"r0", name, goal, stories:[STORY-id], demo, weeks:[start,end] } ],
  rtm:  str(md),  trace: { ok, must_orphans, thin_releases, below_floor, rtm:{REQ-id:[STORY-id]} , ... },
  build_guide: str(md), tbi_primer: str(md), story_count:int, ticket_count:int
}
```

## 3. Target mapping (engine object → Accelerator model)

| Engine object | Accelerator model | Notes |
|---|---|---|
| `plan.project` + student `enrollment_id` | **`Project`** (exists) | link the plan to the student's existing Project row; don't create a duplicate |
| `reqs[]` (`REQ-###`) | **`RequirementsMap`** (exists, extend) | `requirement_key = REQ-id`, `requirement_text = statement`. Add a **NEW `state` column** (`unmapped\|planned\|built\|verified`) **alongside** the untouched existing `status` (default `unmatched`) and `verification_status`. Seed `planned` when a story fulfills it, else `unmapped`. Unique index `(project_id, requirement_key)` already exists. |
| `reqs[].cluster` | **`Capability`** (exists) | one Capability per distinct cluster; `RequirementsMap.capability_id` links to it (reuses shipped readiness scoring) |
| `stories[]` (`STORY-###`) | **`Task`** (NEW — item 2) | carries `fulfills`, Gherkin `acceptance` (= demo script), `owner_agent`, `build`, `vibe` (the Claude Code prompt), `trust`, `execution_mode` |
| `releases[]` (`r0…`) | **`Sprint`/`BuildList`** (NEW — item 2) | `key`, `name`, `goal`, `demo`, `week_start/week_end` from `weeks` |
| `trace.rtm` | coverage input → existing **readiness score** | drives the 4-state → VERIFIED roll-up |
| `agents[]` | stored on the Project (JSON) | reference for owner_agent resolution + the trust spine |

## 4. Endpoint

```
POST /api/portal/project/build-plan
Auth:  requireParticipant   (the SAME guard every /api/portal/project/* route uses)
Project: resolved SERVER-SIDE from the session via getProjectByEnrollment(req.participant!.sub).
         NOT passed in the body (matches the existing router convention).
Body:  { plan }                        # plan = the deep_plan.json object
```

> **Engine-initiated push** (engine writing into a student's project without a student session) needs a **service-auth path that does not exist in `projectRoutes.ts` today** — a declared Phase-1 dependency/gate, bundled with the cross-repo publisher work. **v1:** the student triggers ingest from their own session after the engine stores the plan.

**Behavior:**
1. **Validate the body with Zod at the route boundary** (reject malformed → `400`). `projectRoutes.ts` uses no Zod today; this route ADDS it, closing the gap per CLAUDE.md's contract-enforcement rule.
2. **Validate the trace gate server-side.** Reject with `422` if `plan.trace.ok === false` (fail-closed — the same invariant the engine enforces). No partial publish of an untraceable plan.
3. **Upsert, idempotent, keyed on stable ids** (never duplicate on re-push):
   - Capability per `cluster` (match on `project_id + cluster name`)
   - `RequirementsMap` per `REQ-id` (unique `project_id + requirement_key`)
   - `Sprint` per `release.key` (unique `project_id + key`)
   - `Task` per `STORY-id` (unique `project_id + story_id`)
4. **Derive `execution_mode`** per task from the engine's ai/human signal (`scorer.task_kind()` → `ai` ⇒ `ai_with_approval`, `human` ⇒ `human`). Default `ai_with_approval`.
5. **Seed the new `state` column:** each `REQ` fulfilled by ≥1 story → `planned`; unfulfilled → `unmapped`. (Existing `status`/`verification_status` untouched.)
6. Return `{ created, updated, tasks, requirements, sprints, traceOk:true }`.

## 5. Write-back loop (keeping it in sync while students work)

```
task.status = done
   → story fulfilled
   → each fulfilled REQ recomputed: all tasks done ⇒ built; verification evidence (GitHub) ⇒ verified
   → readiness score recomputes (existing unifiedProjectStateBuilder)
```
The Accelerator is the **system of record** for student task state (not Basecamp). Employees keep Basecamp; students keep this. Same engine feeds both.

## 6. Idempotency & failure

- Re-pushing the same `deep_plan.json` is a no-op (all upserts keyed on stable ids). Safe to retry.
- If `trace.ok` is false → reject whole payload, change nothing (transactional).
- Partial network failure mid-ingest → wrap in a DB transaction; roll back on error (no half-published plan).

## 7. Out of scope for this item (declared gates)

- The engine-side **publisher refactor** (adding this as a second target) is a **cross-repo change** in AI Project Architect → governance gate.
- Running the migration against **prod** → deploy gate.
- Whether the engine is **canonical / retire bespoke clustering** → Phase-0 decision (yours).
