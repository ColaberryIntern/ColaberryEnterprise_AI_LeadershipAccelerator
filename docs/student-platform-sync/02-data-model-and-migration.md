# Data model + migration spec — student Task/Sprint layer + Requirements 4-state

**Loop-item 2 of the sync-plan execution. In-bounds: this repo, additive & reversible, no prod run.**
This is the schema the adapter (item 1) writes into. It is purely **additive** — no existing column is dropped or repurposed, so it is safe to build behind a feature flag and reversible via a down-migration.

---

## 1. What already exists (do not rebuild)

- **`Project`** — per-student, shipped. Reuse as-is (link plans to it).
- **`Capability`** — atomic work grouping; `user_status` in `in_progress|verified|archived`. Reuse as the **cluster** target.
- **`RequirementsMap`** — `requirement_key`, `requirement_text`, `status` (only ever `"unmatched"` today), `verification_status`, `capability_id`. **Extend** (below).

## 2. NEW model — `Sprint` (release grouping)

`backend/src/models/Sprint.ts` (Sequelize). Maps engine `releases[]`.

| column | type | notes |
|---|---|---|
| `id` | UUID pk | |
| `project_id` | UUID fk → Project | |
| `key` | STRING | engine `release.key` (`r0`…). **Unique `(project_id, key)`** |
| `name` | STRING | |
| `goal` | TEXT | |
| `demo` | TEXT | what the student demos at sprint end |
| `week_start` | INTEGER | from `release.weeks[0]` |
| `week_end` | INTEGER | from `release.weeks[1]` |
| `is_active` | BOOLEAN default true | |
| timestamps | | |

## 3. NEW model — `Task` (the story = the student's unit of work)

`backend/src/models/Task.ts`. Maps engine `stories[]`. This is the Basecamp-replacement task.

| column | type | notes |
|---|---|---|
| `id` | UUID pk | |
| `project_id` | UUID fk → Project | |
| `sprint_id` | UUID fk → Sprint (nullable) | resolved from `story.release` |
| `story_id` | STRING | engine `STORY-###`. **Unique `(project_id, story_id)`** (idempotency) |
| `title` | STRING | |
| `narrative` | TEXT | "As a … I want … so that …" |
| `fulfills` | JSONB (string[]) | `REQ-###` ids this task fulfills |
| `owner_agent` | STRING | from the agent map |
| `acceptance` | JSONB | Gherkin `[{scenario,trust,given,when,then}]` = **demo script + loop stop** |
| `build` | TEXT | concrete steps |
| `vibe` | TEXT | paste-ready Claude Code prompt (what an AI executor consumes) |
| `trust` | TEXT | trust controls for this slice |
| `execution_mode` | ENUM `human` \| `ai_with_approval` \| `ai_autonomous` | default `ai_with_approval` |
| `status` | ENUM `todo` \| `in_progress` \| `done` \| `skipped` | default `todo` |
| `due_on` | DATEONLY (nullable) | back-scheduled from sprint weeks |
| `assignee` | STRING (nullable) | student, or an agent handle |
| `verifier_score` | INTEGER (nullable) | last verifier grade (maker/checker) |
| `completed_at` | DATE (nullable) | |
| timestamps | | |

## 4. EXTEND `RequirementsMap` — the 4-state lifecycle

Add (additive, nullable-safe with a default):

| column | type | notes |
|---|---|---|
| `state` | ENUM `unmapped` \| `planned` \| `built` \| `verified` | default `unmapped`. **This is the BPOS 4-state** the design calls for; the existing `status` column is untouched. |

Transitions (owned by the write-back service, not the model):
`unmapped` → `planned` (a Task fulfills it) → `built` (all fulfilling Tasks `done`) → `verified` (verification evidence, e.g. GitHub, present).

## 5. Schema creation — using THIS repo's real pattern (no Umzug/queryInterface)

This repo has **no migration runner**. Schema is created two ways (see `server.ts`): (a) Sequelize models registered in the `sequelize.sync({ alter: true })` graph, and (b) for anything `sync` can't safely do on the large model graph, an **idempotent raw-SQL `ensureXxxSchema()`** function run at boot (canonical examples: `ensureOpsCommandCenterSchema`, `ensureIngestionSchema`). Use pattern (b):

Add `ensureStudentTaskSchema()` (invoked at boot next to the others):
- `CREATE TABLE IF NOT EXISTS sprints (…)` — unique `(project_id, key)`
- `CREATE TABLE IF NOT EXISTS tasks (…)` — unique `(project_id, story_id)`, index `(project_id, sprint_id)`, index `(project_id, status)`
- `ALTER TABLE requirements_maps ADD COLUMN IF NOT EXISTS state VARCHAR NOT NULL DEFAULT 'unmapped'`
  - ⚠️ table is **`requirements_maps`** (plural — `RequirementsMap.tableName`), **not** `requirements_map`.
- Register the new `Task` and `Sprint` Sequelize models in the model graph so `sync({alter})` keeps them aligned.

**Teardown (reversible):** guarded `DROP TABLE IF EXISTS tasks; DROP TABLE IF EXISTS sprints; ALTER TABLE requirements_maps DROP COLUMN IF EXISTS state;`. Additive-only at boot; no existing column touched or repurposed. **Running any of this against prod = deploy gate.**

## 6. Contracts (per CLAUDE.md)

- Zod schemas at the ingestion route boundary for the `plan` body (reject malformed → 400).
- Sequelize models are the DB contract; typed at call sites.
- Idempotency is enforced at the DB layer (unique constraints), not just app logic — re-ingest cannot duplicate.

## 7. Build/verify gate (before this ships)

- `tsc --noEmit` clean.
- Unit tests: model creation, the unique-constraint idempotency (insert twice ⇒ one row), the 4-state transition function (happy + boundary).
- Migration runs clean on a **dev** DB and rolls back clean. **Prod run = deploy gate (yours).**

## 8. Declared gates (loop stops here)

- Actually **writing these model/migration/route files as shipped code** and running tests = the next loop iteration, and is gated on your Phase-0 go (engine canonical + build the task layer).
- Any **prod migration/deploy** = deploy gate.
- The **advisor-repo publisher** that pushes into the new endpoint = cross-repo gate.
