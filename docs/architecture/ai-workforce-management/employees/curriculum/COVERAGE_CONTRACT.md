# Curriculum, Learning & Certification — Coverage Contract (Phase 1)

**Session:** CC-20260915-a1x7 · **Date:** 2026-09-15 · **Status:** proposed for Ali's Phase 1 approval. Nothing here is built.

Evidence: `DISCOVERY_2026-09-15.md` (file:line for every claim), `BASELINE_2026-09-15.md` (production reads). The domain's eight classified rows plus the cross-domain items the discovery surfaced.

## 1. What this employee absorbs in its first release

| Item | Kind today | Decision | What "absorb" means concretely | Why |
|---|---|---|---|---|
| `WorkforceCurriculumDirector` | daily cron, R1, deterministic | **absorb now** as an owned behaviour | `parent_agent_id` = employee; `reports_to` set so its ticket mirror stops throwing (F1); wrapped in `instrumentCronJob` so it records runs; keeps its own row and kill switch; **not** renamed and its name is never reused for the employee | Cleanest legacy item: real gate (`workforceAgentRuntime.ts:66-73`), real permission row, no LLM, no side effects |
| `WorkforceCertificationDirector` | daily cron, R1, deterministic | **absorb now** as an owned behaviour | Same as above | The only live certification behaviour in the fleet |
| `CurriculumQAAgent` | work-graph tool, R0 read (R1 only because it opens tickets) | **absorb now** as a tool, read-only | Registry row corrected (`trigger_type: on_demand`, fictional cron removed so health alerting stops treating it as permanently missed); exposed as an employee tool that **returns findings** instead of opening `bug` tickets at PlatformFixAgent | A read-only integrity scan of modules → lessons → artifacts is exactly the kind of tool a curriculum employee should have; the ticket side effect was misrouted |
| `CurriculumVideoLinkHealth` | untracked cron, R0 read + R1 alert rows, env-gated off | **absorb now** by registering it | One `AGENT_REGISTRY` row (the `ReesePresenceHeartbeat` precedent), `parent_agent_id` = employee; stays env-gated; no behaviour change | Pure curriculum behaviour, six test files, no row → no kill switch today |

## 2. What is deferred (owned by this employee, absorbed in a later release)

| Item | Decision | Precondition |
|---|---|---|
| `LearningInnovationArchitect` | **defer** (stays disabled) | The employee has a charter and an approval path for "propose an initiative"; the shared `assistant` LLM attribution is fixed (F3); the strategy-architect template's 175-planned / 175-cancelled history is judged worth continuing at all |
| `CurriculumArchitectAgent` | **defer**, as a tool | Partial-write hazard on F1 fixed; `agent_id` on its LLM call; a real dispatcher or an explicit employee tool call replacing the dead ticket loop (F2) |
| `ArtifactGenerationAgent` | **defer**, as a tool | Same as above; its only feeder is the Architect |
| `AnthropicCurriculumImpactAgent` (+ 3 Anthropic crons) | **defer** | Registered; the nightly digest email (R3) put behind the employee's authorization chokepoint; LLM attribution fixed |
| Experience Studio / composer / card generation | **defer**, as tools | `ensureFreshContent` (a student view triggering an LLM write with no identity or switch) given an identity and a kill switch first |
| Certification prep question-bank stewardship | **defer**, as a capability | Charter names it; the three operator scripts become employee tools with attribution |

## 3. What is retired in this release (archive, not delete)

| Item | Evidence |
|---|---|
| `CurriculumOptimizerAgent` | Zero importers; no scheduler entry; fictional cron row alarms health alerting |
| `EducationReportingAgent` | Module never loaded; no scheduler entry; already `enabled:false` |

Retire = `migration_status='archived'`, `enabled=false`, row and history kept.

## 4. Out of scope for this employee (stays elsewhere)

`ArchitectEvaluationAgent` and `LearnerMemoryDistill` (Learner Success; student-keyed), `BuildLogDraftGenerator` (Marketing or Internship), SBP generation (Learner Success / Internship; flagged to Platform as a cost-attribution defect: four raw OpenAI clients with zero `ai_events`), `Intel_*` / `AiNewsRefresh` (Marketing, with a Curriculum subscription because they write student timeline cards), `WorkforceResearchDirector` (Executive; the employee subscribes to its `workforce_messages`).

## 5. Baseline and regression contract

**Baseline (production, 2026-09-15):** every item in section 1 is dormant. The two Directors produced zero `ai_events` and zero `workforce_tasks` in 30 days; the QA tool has zero `agent_runs` ever; the video-health cron is env-gated off. No student, staff member or external system receives anything from this set today.

**Regression contract:** because nothing in the absorbed set sends anything, the contract is *nothing that is silent today may start speaking without the employee's authorization chokepoint*. Concretely, at release: the two Directors' observable output (`workforce_tasks` rows, `ai_events` `agent.action`) must be identical in kind to today's, only now attributed under the employee; `CurriculumQAAgent` must open zero tickets; `CurriculumVideoLinkHealth` stays off unless its env flag is set. Shadow comparison in Phase 5 is therefore a check that nothing new appeared, not a diff of two outputs.

**Duplicate-action prevention:** the Directors are idempotent on `source_rec_key` (`directorActions.ts:24-27`); the employee does not gain a second scheduler entry for either; `parent_agent_id` is set on the existing rows rather than cloning them, so there is never a legacy row and an employee row both running.

## 6. Manager access

Per `MANAGER_ACCESS_PLAN.md`: one `admin_users` row for Swati (`role: admin`, `mgmt_role: curriculum`) and one `PATH_SECTION` mapping for `/api/admin/agents`. Both in Phase 4 of this employee; Ali approves the row.
