# Curriculum, Learning & Certification (Dara) — Schema Design & Implementation Plan (Phase 3, draft v1)

**Session:** CC-20260915-q9k4 (continuing CC-20260915-a1x7) · **Date:** 2026-09-15 · **Status:** proposed for Ali's Phase 3 approval. Design only — statements below are proposed, not executed; `\d ai_agents` confirmed live against `accelerator_prod` on this date that none of the three proposed columns exist yet. Covers plan.md B3.5 (schema design) and B3.6 (implementation plan with acceptance tests, plan audit).

## B3.5 — Additive schema: `record_kind`, `parent_agent_id`, `migration_status`

Program-wide fields (`MIGRATION_MATRIX.md`'s 11-point map), needed starting with Dara because her build is the first to actually set `parent_agent_id` on real rows (the two Directors, the QA tool, the video-health cron).

**Confirmed against production (2026-09-15):** `\d ai_agents` shows 35 real columns, none named `record_kind`, `parent_agent_id`, or `migration_status`. `reports_to_id`/`reports_to_type` already exist and are the precedent to mirror (`character varying(10)` for a type discriminator, `uuid` for the target id, no DB-level `REFERENCES` constraint since the target can be either `ai_agents.id` or `org_members.id`).

**Proposed DDL** (mirrors `ensureAiAgentAutonomySourceSchema.ts`'s exact real shape — one file, one exported statement array, `ADD COLUMN IF NOT EXISTS` only, every statement in its own try/catch so a partial DB self-heals):

```sql
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS record_kind VARCHAR(20);
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS parent_agent_id UUID;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS migration_status VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_ai_agents_parent_agent_id ON ai_agents(parent_agent_id);
```

- `record_kind`: nullable, no default. Honest values going forward: `'employee' | 'behavior' | 'tool'` (matches the mission's Section 7 taxonomy exactly — `duplicate`/`retire`/`unresolved` are classification-time-only states from `LEGACY_AGENT_CLASSIFICATION.csv`, not meant to persist on the live row once resolved). Every existing row stays `NULL` until touched — never backfilled to a guess here, same posture as `autonomy_level_source`'s own migration.
- `parent_agent_id`: nullable UUID, no FK constraint. The precedent is `reports_to_id`, not `ensureCaseStudySchema.ts`'s boot-order reasoning (that reasoning is about FK'ing to a table that has no `CREATE TABLE` statement anywhere in this repo — `ai_agents` obviously already exists by the time this `ALTER` runs, so that specific hazard doesn't apply to a self-reference here). The real reason to skip the constraint is `reports_to_id`'s own established convention (`ensureAiAgentHierarchySchema.ts:17-19`, confirmed no FK): this table's actor-reference columns are deliberately left unconstrained, and adding one only to `parent_agent_id` while `reports_to_id` stays unconstrained would be an inconsistent, one-off exception. Indexed, since Dara's own Agent Detail page will query "all rows where `parent_agent_id` = my id" to render owned behaviors (reusing the exact pattern `related_tasks` already uses via `module`, `agentDetailService.ts:392-394` — `parent_agent_id` becomes a stronger version of that same relationship, real ownership rather than same-module inference).
- `migration_status`: nullable, no default. Honest values: `'legacy' | 'absorbed' | 'archived'`. `NULL` for any row Phase 0's classification never reached a firm decision on.

**Test plan (matches the `REQUIRED_COLUMNS` guard convention, `ensureCaseStudySchema.ts:446` — derived from the statements themselves via `parseCreatedColumns`, never hand-duplicated, so the test can't drift from the real DDL):**
- `REQUIRED_COLUMNS` derived from the statement array, asserted present via `information_schema.columns` after running the ensure function against a test DB.
- Idempotency: running the ensure function twice makes zero additional writes the second time (`ADD COLUMN IF NOT EXISTS` is naturally idempotent; the test proves it, doesn't assume it).
- INSERT-vs-DDL test: after the ensure function runs, a raw `INSERT INTO ai_agents (...) VALUES (...)` omitting all three new columns still succeeds (proves every column is genuinely nullable, not silently `NOT NULL` by a typo) — the exact guard plan.md's acceptance criterion names.

**Rollback:** the migration adds columns only; rollback is dropping them (safe, since Phase 4 is the first thing that ever writes to them) or, more conservatively per this program's own posture, simply leaving them unused — no data loss either way.

## B3.6 — Implementation plan for Phase 4, with acceptance tests

Ordered by real dependency (schema before identity before tools before UI), matching plan.md's own Phase 4 task shape (B4.1-B4.9):

| # | Task | Depends on | Acceptance test | Real file(s) touched |
|---|---|---|---|---|
| 1 | Schema: the 3 columns above | — | `REQUIRED_COLUMNS` guard test; idempotency test; INSERT-vs-DDL test (all specified above) | New `backend/src/db/ensureAiAgentConsolidationSchema.ts` — checked `ensureAiAgentHierarchySchema.ts` (read in full): that file is scoped specifically to `reports_to_type`/`reports_to_id` (already shipped), a different concern from this program's `record_kind`/`parent_agent_id`/`migration_status`. A new file is correct, not an extension. |
| 2 | Registry entry + identity seed | 1 | `previewAgentIdentity()` dry run shows `aiAgent.exists: false` before, real row after; idempotency test: second seed run makes zero additional writes (mirrors `agentIdentitySeed.test.ts`'s own convention) | `agentRegistrySeed.ts` (one entry), new `daraIdentitySeed.ts` thin wrapper (mirrors `reeseIdentitySeed.ts`'s pattern per `build-platform-agent/SKILL.md` step E) |
| 3 | Persona/system prompt | 2 | Prompt assembly test: charter + AI-disclosure + neutral-pronoun lines present when a real `agentId` is passed (mirrors `reeseSystemPrompt.test.ts`) | New `daraSystemPrompt.ts`, persona block transplanted from `PERSONALITY_PROFILE_v1.md` (approved), following `docs/CORY_PERSONA_SPEC.md`'s locked VOICE PRINCIPLES / GUARDRAILS section shape |
| 4 | `scan_curriculum_integrity` tool | 3 | Happy/failure/boundary tests per B3.3 item 14; regression test asserting `createTicket` is never called | `agents/curriculumQAAgent.ts` (return-contract change), `TOOL_CAPABILITIES` entry in `agentToolCapabilities.ts` |
| 5 | Re-point the 2 Directors + video-health cron | 2 | Each absorbed row: `parent_agent_id` set to Dara's id, `reports_to` resolves (Risk R1 fix verified via `resolveReportsToHuman()`), wrapped in `instrumentCronJob` so `run_count`/`error_count` finally record (Risk R6 fix) | `agentRegistrySeed.ts` (3 rows updated), `aiOpsScheduler.ts` (Director wrapping), `schedulerService.ts` (video-health registration) |
| 6 | Charter seeded | 3 | `upsertRoleCharter()` called at build time with the approved content from `ROLE_CHARTER_v1.md`, not left to seed as `null` (per `build-platform-agent/SKILL.md`'s own recommendation to fill this one out at build time when the purpose is already well understood) | One seed call, `agentRoleCharterService.ts`'s existing `upsertRoleCharter()` |
| 7 | Manager access (M1 + M2) | — (independent) | Swati's real login reaches `/api/admin/workforce`; a `curriculum`-scoped token reaches Dara's own Agent Detail route and is 403'd for an agent outside her chain (mirrors `caseStudyAdminRoutes.access.test.ts`'s precedent, per `MANAGER_ACCESS_PLAN.md`) | New `admin_users` row (Ali approves, per his Q2=A), one line in `mgmtSectionGate.ts:59` |
| 8 | Frontend: employee vs. behavior distinction | 5 | Frontend typecheck + unit tests green; screenshot at 1440 and 390 widths | `/admin/workforce` cards, Agent Detail "Capabilities & Automations" area — generic, not hardcoded to Dara (per mission Section 13) |
| 9 | Task-verifier loop over 1-8 | each | `loop-task-verifier` PASS ≥ 11/12 per task, max 3 attempts | n/a (process, not code) |

**Full Mandatory Test Types coverage (CLAUDE.md, per feature):** happy path (tasks 2-6 above each have one); failure path (schema INSERT failure, tool DB-error path, identity-seed-on-missing-registry-entry per `agentIdentitySeed.ts`'s own fail-loud guard); boundary (zero findings, zero absorbed behaviors edge case); idempotency (schema, identity seed, both explicitly tested above).

## Independent plan audit

Per plan.md B3.6's own requirement ("Run the independent plan audit required by `/loop-architect`"), this document plus `TOOL_CAPABILITY_DESIGN_v1.md` were submitted to the `loop-plan-auditor` subagent for a real, independent grading pass (never self-graded).

**Result: 20/20, PASS, cycle 1.** The auditor independently re-verified 12+ file:line citations against the real source (including the non-obvious ones — that the two Directors genuinely run bare/uninstrumented, that `flag_`/`scan_`/`monitor_` really land in the tiers claimed, that `record_kind`/`parent_agent_id`/`migration_status` have zero existing references anywhere in the repo, and that `ensureAiAgentHierarchySchema.ts` really is scoped to `reports_to_*` only). Confirmed neither document proposes any code, migration, or registry write — both stay design-only per the mission's Phase 3 STOP requirement. Two cosmetic issues found and fixed before this packet: a loose line-range citation in `TOOL_CAPABILITY_DESIGN_v1.md` B3.3 item 5 (now `:27-37` load / `:41-95` walk, verified by direct read), and an imprecise FK-reasoning analogy in this document's `parent_agent_id` justification (now grounded in `reports_to_id`'s real precedent only, not the unrelated `ensureCaseStudySchema.ts` boot-order case). Neither issue affected the score or blocked approval.

## Explicitly out of scope for Phase 3

No code is written against this plan in this phase — Phase 4 is where task 1-9 above actually execute, only after Ali approves this design.
