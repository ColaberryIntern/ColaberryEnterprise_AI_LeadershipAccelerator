# AI Employee Roster (Program Phase 0)

**Session:** CC-20260915-a1x7 · **Date:** 2026-09-15 · **Status:** proposed for Ali's approval; nothing here exists in production yet except Reese.

Companion documents: `HUMAN_OWNERSHIP_MAP.md` (who is accountable, resolved to exact rows), `LEGACY_AGENT_CLASSIFICATION.csv` (every one of the 246 fleet rows classified), `FLEET_RECONCILIATION_2026-09-15.md` (how the counts were derived), `REESE_STANDARD_AUDIT.md` (the reference employee against Standard 2.0), `PLATFORM_STATE_2026-09-15.md` (what the next employee gets for free), `MIGRATION_MATRIX.md` (how legacy items move).

## The fleet, reconciled from source and production

| Measure | Value | Derived from |
|---|---|---|
| `AGENT_REGISTRY` entries (source) | **232** | TypeScript AST walk and an indent-anchored regex, both 232; the "252" in `onboard-ai-agent/SKILL.md` counts nested `config.agent_name` keys, the "129" in the seed's own docstring is stale |
| `ai_agents` rows (production) | **246** | read-only query 2026-09-15; every registry name exists; 14 rows come from older seed paths no longer in the registry |
| Enabled in production | 166 | |
| With a real `system_prompt` and `persona_version` | **1** (Reese) | |
| With a `reports_to` | 23 (6 → human, 17 → agent); **223 have none, 160 of them enabled** | |
| Autonomy-classified | 1 (Reese, `communicate`, source `auto`) | classification now runs at boot (#2540 merged 2026-09-15) |
| Crons calling `instrumentCronJob` with **no registry row** | **33** | all in `schedulerService.ts`; no kill switch, no run count, invisible to health alerting |
| Scheduler names that differ from their `ai_agents` row | 32 (24 map to a differently-named row; 8 run only because of production-only rows) | `aiOpsScheduler.ts` vs registry |
| Classification of all 246 | employee 1 · behaviour 163 · tool 9 · duplicate 2 · retire 62 · unresolved 9 | draft, for review |

The mission's premise holds and is now measured: the fleet is 246 records of which exactly one is an employee.

## Roster

Names are domains, not employee names. Employee names, voices and personalities are Phase 2 work per employee; naming here would pre-empt that. "Legacy items" are the draft classification's rows for the domain (behaviour / tool / retire / unresolved).

| # | Employee domain | Accountable human (exact record) | Owner status | Legacy items | Notes for the roster decision |
|---|---|---|---|---|---|
| 1 | Learner Success (Reese) | Kes Delele, via disabled `workforce_intelligence_engine` | **decide** | 11 (7 behaviours, 3 retire, Reese) | Exists. Fails Standard 2.0 on 8 open gaps (`REESE_STANDARD_AUDIT.md`); those are fixed before any pattern is copied |
| 2 | Marketing Intelligence & Brand | Sohail Syed (`sohail@colaberry.com`) | resolved; has admin login | 40 (35 behaviours incl. the 6 Skool rows, 2 tools, 3 retire) | Largest live behaviour set after Executive; Skool cluster runs from production-only rows |
| 3 | Product Experience & UI/UX | Mohammed Abdul Aleem (`aleem@colaberry.com`) | resolved; **no admin login** | **0** | Greenfield: no legacy behaviour exists for this domain; the one `UX_Optimization_Agent` row has no source file (retire) |
| 4 | Curriculum, Learning & Certification | Swati Raman (`swati@colaberry.com`) if "Swait" = Swati | **ask** (name); no admin login | 8 (3 crons: `LearningInnovationArchitect`, `WorkforceCurriculumDirector`, `WorkforceCertificationDirector`; 3 work-graph tools: `CurriculumArchitectAgent`, `ArtifactGenerationAgent`, `CurriculumQAAgent`; 2 retire) | **Recommended first employee** (below) |
| 5 | Admissions & Applicant Experience | Taiwo Oludimimu (`taiwooludimimu@gmail.com`) | resolved; already manages 4 agents; no admin login | 28 (15 behaviours, 13 retire) | Highest external-side-effect risk after Sales: email, SMS, Synthflow call wrappers among the retire candidates |
| 6 | Sales, Enrollment & Subscriptions | Roselyn | **absent from every identity table** | 16 (15 behaviours, 1 retire) | Cannot start without an owner record |
| 7 | Internship & Career Readiness | Dhee (`dhee@colaberry.com`, admin) | **needs an `org_members` row** | 1 (`WorkforceCareerDirector`) | Near-greenfield |
| 8 | Website Portfolio & Conversion | Sai Tejesh Kowtharapu (`saitejesh@colaberry.com`) | resolved; has admin login | 8, **all retire candidates** (Website orchestrator wrappers, zero callers) | Effectively greenfield: the existing website agents were never wired |
| 9 | Platform Automation & Reliability | Kes Delele (`kesetebirhan@gmail.com`) | resolved; no admin login | 38 (28 behaviours, 1 tool, 6 retire, 3 unresolved) | Also the natural owner of the 33 untracked scheduler crons |
| 10 | Executive Intelligence & Governance | *unresolved; Ali is the only `manager` in `org_members`* | **decide** | **75** (51 behaviours, 3 tools, 18 retire, 2 duplicates, 1 unresolved) | The largest bucket by far: reporting, dept-strategy architects, CoryBrain family, strategic cycles |
| — | Unassigned | | | 21 (behavioural scoring, alumni, partnerships) | No target domain in the mission; needs a home or a new decision |

Total across rows: 246.

### Identity collisions checked

- No `ai_agents` row is named after any of the ten domains, so a new employee name cannot collide with a legacy row **unless** it reuses a cron name: `WorkforceCurriculumDirector`, `WorkforceCertificationDirector`, `WorkforceCareerDirector`, `WorkforceStudentSuccessDirector` etc. are existing behaviour rows and must not be reused as employee names.
- The synthetic `/admin/workforce` roster (`orgRegistry.ts`: "Ada Sterling", "Miles Chen", ten fictional Directors) is not `ai_agents`-keyed and stays out of scope, but employee display names must not reuse those fictional names either, or the two surfaces will look like one.
- Four "AI Leadership" identity rows (`CoryBrain`, `InboxCaseEngine`, `workforce_intelligence_engine`, `bpos_orchestrator`) sit above 17 agents in the org chart with tools and reports_to but no prompt or persona. They are neither employees nor behaviours under Section 7; the migration matrix proposes how they are absorbed.

## Recommended first employee: Curriculum, Learning & Certification

The mission's default, confirmed by evidence rather than assumed:

1. **Bounded, legible legacy surface.** Eight items, all read: three aiOps crons that are real code with wired schedules, three tools dispatched through the work graph, two retire candidates with zero importers. No email, SMS, phone or payment side effects anywhere in the set.
2. **A named owner exists as a real row** (Swati Raman) pending one confirmation of the spelling "Swait". The admin-login gap applies to her as to three other owners and is a program prerequisite, not a Curriculum-specific blocker.
3. **The lowest external risk of any domain with real behaviours.** Admissions and Sales carry outbound communications; Marketing carries social publishing; Platform carries deploy and infra; Executive is the largest and has no owner.
4. **It exercises every Standard 2.0 obligation without touching students directly**, so the generic infrastructure (charter, directives, memory, Talk, goals, reports, presence, tools) is proven on a second employee before an employee that talks to applicants or customers.

Alternatives, if Ali prefers: **Website Portfolio & Conversion** (owner resolved with login; all 8 legacy items are dead, so it is a clean greenfield build with a real owner) or **Product Experience & UI/UX** (owner resolved; zero legacy; but no admin login). **Executive** should not go first: no owner and 75 items.

## What must be true before Phase 1 of the first employee

1. The five identity questions in `HUMAN_OWNERSHIP_MAP.md` answered (Swait, Roselyn, Dhee, Reese's owner, Executive owner). Only the first affects Curriculum.
2. Reese's open gaps that the next employee would otherwise copy are fixed or explicitly compensated (Section 11 of the mission): the reply-path chokepoint (#2477 open), follow-up and welcome sends with no authorization or logging, the assessment LLM call with no `agent_id`, escalation that reaches no human, the Reese-only presence heartbeat. The migration matrix schedules these as "Reese hardening" before or alongside employee #2, on Ali's call.
3. A decision on how managers without an admin login reach their employee.
