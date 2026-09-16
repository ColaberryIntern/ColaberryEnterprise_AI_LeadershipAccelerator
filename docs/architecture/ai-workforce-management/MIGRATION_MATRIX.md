# Migration Matrix (Program Phase 0)

**Session:** CC-20260915-a1x7 · **Date:** 2026-09-15 · **Status:** proposal; changes no runtime behaviour. Supersedes the per-checkpoint table in `MIGRATION_STRATEGY.md` (2026-08-27), whose principles still hold: additive only, no backfilled history, idempotent `ensure*Schema` migrations, one PR per table, last-known-good rollback.

## 1. The unit of migration is one employee

Nothing moves fleet-wide. For each employee, in order: Phase 1 discovers that domain's legacy rows; Phase 3 designs; Phase 4 builds in non-production; Phase 5 shadows; Phase 6 deploys; Phase 7 accepts. Only the rows classified to that domain in `LEGACY_AGENT_CLASSIFICATION.csv` move, and only after Ali approves the Phase 1 coverage contract that names them.

## 2. Registry fields the program needs, validated against `ai_agents` today

`backend/src/models/AiAgent.ts` has 36 columns. The mission's proposed concepts, checked one by one:

| Concept | Exists? | Proposal | Additive? |
|---|---|---|---|
| `record_kind` (employee / behavior / tool / duplicate / retire / unresolved) | **No** | New nullable column, default null; seed sets it from the classification CSV per employee, never fleet-wide. Null continues to mean "not yet classified" and every existing read path ignores it | yes |
| `parent_agent_id` (owned-by employee) | **No**; `agent_group` (super-agent grouping) and `reports_to_id` when `reports_to_type='agent'` are the nearest | New nullable UUID, FK `ai_agents.id`, distinct from `reports_to_id`: a behaviour is *owned by* its employee (kill switch, ledger, cost roll-up) while the employee *reports to* a human. Do not overload `reports_to` for ownership | yes |
| `migration_status` (`legacy` / `absorbed` / `retired` / `archived`) | **No** | New nullable string; set per row as its employee's release passes verification | yes |
| `legacy_alias_of` | **No**; `config.legacy_creator_ids` + `legacyCreatorAliases.ts` resolve aliases at read time for ticket creators | Reuse the existing alias mechanism rather than a new column; extend it if a merged duplicate (`Executive_Briefing_Agent` → `DailyExecutiveBriefing`, `AutonomousEngine` ↔ `cory-engine`) needs a read-time alias | reuse |
| `human_owner_id` | **No**; `reports_to_type='human'` + `reports_to_id` (`org_members.id`) already carries it | Reuse `reports_to`; do not add a second column that can disagree with the first | reuse |
| `risk_tier` on the employee | **No** on `ai_agents`; exists on tickets, work-ledger events, approval requests | Employee risk tier = the tier of its most consequential real tool (Section 6). Store on `ai_agents` as a new nullable column set from the tool map at Phase 3, or derive at read time from `tools_granted`; decide at employee #1's Phase 3 | yes / derive |

All of the above are `ensure*Schema`-style `ADD COLUMN IF NOT EXISTS`, nullable, with `REQUIRED_COLUMNS` guards and a test that parses every `INSERT` against the DDL (the discipline the 2026-09-13 `truth_revision` outage taught).

## 3. The eleven-point map every legacy item must reach

Per Section 7, before an item's `migration_status` can move to `absorbed`:

| # | Field | Where it will live | Today |
|---|---|---|---|
| 1 | Accountable employee | `parent_agent_id` | absent |
| 2 | Business capability | `TOOL_CAPABILITIES` entry (reads / produces) or the employee's charter responsibility | 37 entries documented; free-text names |
| 3 | Source implementation | `source_file` (already a registry field; 22 rows point at files that never existed) | present, partly wrong |
| 4 | Trigger or schedule | `trigger_type` + `schedule` (present; 2 rows registered as cron are only reachable on demand; 32 scheduler names differ from their row) | present, partly wrong |
| 5 | Input data and permissions | `tools_granted` + `AGENT_PERMISSIONS` tier | 28 rows have tools; 36 permission entries |
| 6 | Output and external effects | `TOOL_CAPABILITIES.produces` + risk tier | partial |
| 7 | Risk tier | Section 2 above | absent on rows |
| 8 | Authorization chokepoint | `authorizeTicketDispatch` call site in the behaviour's own code | 2 callers fleet-wide (ticket dispatcher, Reese outreach) |
| 9 | Activity / cost / ticket evidence | `logAgentActivity` (agentBlueprint), `getInstrumentedOpenAI({agent_id})`, `ensureAgentTicketForRoom` | opt-in per call site; roughly 50 LLM call sites pass no `agent_id` |
| 10 | Success metric | `AgentGoal` (two metric keys today: `monthly_cost_usd`, `open_ticket_count`) or `UNMEASURED` | mostly UNMEASURED, honestly |
| 11 | Kill switch and rollback | its own registry row → `instrumentCronJob` gate; rollback = last-known-good SHA | 33 crons have no row and therefore no switch |

## 4. Fleet-level defects that are not any one employee's, in priority order

These are recorded here so they are scheduled deliberately rather than discovered mid-employee. None is done in Phase 0.

| # | Defect | Evidence | Proposed owner | When |
|---|---|---|---|---|
| A | **33 scheduler crons with no registry row** (no kill switch, no run count, invisible to `cronHealthAlertService`) | `FLEET_RECONCILIATION_2026-09-15.md` §5 | Platform Automation & Reliability | One registration PR; safe at any time; the `ReesePresenceHeartbeat` precedent (2026-09-04) is exactly this fix |
| B | **14 production rows with no registry entry** (13 enabled; 8 are the rows the Skool/WeeklyReport/WorkforceIntelligence crons actually run under) | §Production reconciliation | Marketing (Skool ×6), Executive (WeeklyReport, WorkforceIntelligence), unresolved (5 March-2026 governance rows), retire (CompanyStrategicCycle) | Register or retire per employee; the 5 March rows need a "does anything still run this" check first |
| C | **32 scheduler names that differ from their row** (governance key ≠ the row the enabled-gate reads) | §6 | Platform | Fix per employee as its behaviours are absorbed; do not rename fleet-wide |
| D | Presence heartbeat hard-coded to Reese | `reesePresenceHeartbeat.ts:2,22` | Employee #1 (Curriculum) builds the generic heartbeat; Reese is switched to it in her hardening | Phase 4 of employee #1 |
| E | No structured tool → implementation mapping (`tools_granted` free text; `agentToolRegistry` is 2 keys × 1 tool; only Reese has JSON-schema tools) | `PLATFORM_STATE_2026-09-15.md` §8 | Employee #1's Phase 3 designs the generic shape; must extend, not duplicate, the three existing registries | Phase 3 of employee #1 |
| F | No `/admin/agents` fleet list; `AdminAISettingsPage` orphaned; no employee-vs-behaviour marker in the UI | §7 | After `record_kind`/`parent_agent_id` exist | Employee #1 Phase 4, minimum reusable shell only (Section 13) |
| G | `abac_enforcement` defaults to `shadow`; `authorizeTicketDispatch` is advisory | §10 | Program decision (Ali): when to flip enforce, per employee or fleet-wide | Not before employee #1 passes Phase 6 in shadow |
| H | No CI gate over `AGENT_REGISTRY` (only tsc shape + per-agent tests; the ticket-standard validator is explicitly not a merge gate) | §13 | Platform | Completion criterion 14; can ship early as a test that iterates the registry |
| I | Reese's 8 open gaps (`REESE_STANDARD_AUDIT.md` §3) | | Reese hardening run | Before employee #2, or alongside employee #1 on Ali's call; #2477 first |

## 5. Retire and duplicate handling

- **Retire (62 rows)** is archive, not delete: `migration_status='archived'`, `enabled=false`, row and history kept (completion criterion 13). Grouped: 22 with no source file ever, 18 orchestrator wrappers with zero callers, 15 unwired reporting agents, 4 registered-as-cron-never-scheduled, 2 already retired/force-disabled, 1 production-only disabled row. Each group is retired when its domain's employee reaches Phase 7, not before, and only the rows the Phase 1 coverage contract names.
- **Duplicate (2 groups):** `Executive_Briefing_Agent` (ghost of `DailyExecutiveBriefing`, zero mentions) and `cory-engine` ↔ `AutonomousEngine` (same `autonomousEngine.ts`). Merge with a read-time alias; never both live.
- **The four identity-only "AI Leadership" rows** (`CoryBrain`, `InboxCaseEngine`, `workforce_intelligence_engine`, `bpos_orchestrator`): 17 agents report through them and tickets resolve their human via them. Proposal: each becomes a *behaviour* owned by the employee for its domain (CoryBrain family → Executive, InboxCaseEngine → Sales or Admissions, bpos_orchestrator → Platform, `workforce_intelligence_engine` → Platform), and the agents beneath them re-point `reports_to` to the employee. Not decided here; the first one is decided at the relevant employee's Phase 1.

## 6. Safety rules restated for this program

No batch migration; no auto-enabling outbound behaviour; no fabricated history; no destructive migration; no removal of a legacy behaviour until its replacement passes Phase 6; never both legacy and replacement producing the same external side effect; every behaviour keeps its own switch; every release records a last-known-good SHA in the run ledger; missing manager identity, missing activity/cost/ticket attribution, or a declared tool with no implementation each block release.
