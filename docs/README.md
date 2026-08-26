# Docs

**577 files.** Architecture references, subsystem audits, phase validation reports, sprint review documents, and 249 production screenshots.

This directory grew by accretion — most files were written to answer one question at one moment. That makes it valuable as a record and hard to navigate cold. This index exists to fix the second problem without destroying the first.

---

## Start here

| Document | What it gives you |
|---|---|
| [../README.md](../README.md) | The repo front door: what this is, architecture, repo map |
| [../SETUP.md](../SETUP.md) | Local dev in under 15 minutes |
| [DEV_GUIDE.md](DEV_GUIDE.md) | Conventions, gotchas, the CB System engine, deploy procedure |
| [../CLAUDE.md](../CLAUDE.md) | The binding operating contract for humans and AI agents |
| [OPERATIONAL_VOCABULARY.md](OPERATIONAL_VOCABULARY.md) | Shared vocabulary. Read before an architecture discussion. |

---

## Architecture references

The durable documents. These describe how the system is built, not what happened on a given day.

| Document | Scope |
|---|---|
| [ACCELERATOR_PORTAL_SYSTEM.md](ACCELERATOR_PORTAL_SYSTEM.md) | The portal, end to end |
| [ACCELERATOR_PORTAL_FULL_DETAIL.md](ACCELERATOR_PORTAL_FULL_DETAIL.md) | Exhaustive portal detail |
| [ACCELERATOR_PORTAL_PROCESS_DEEP_DIVE.md](ACCELERATOR_PORTAL_PROCESS_DEEP_DIVE.md) | Process-level walkthrough |
| [AI_OPERATIONS_ARCHITECTURE.md](AI_OPERATIONS_ARCHITECTURE.md) | The autonomous ops layer |
| [BPOS-Architecture.md](BPOS-Architecture.md) | Business Process Operating System |
| [AI_CAMPAIGN_ENGINE.md](AI_CAMPAIGN_ENGINE.md) | Campaign generation and lifecycle |
| [CORY_CAMPAIGN_SYSTEM_BLUEPRINT.md](CORY_CAMPAIGN_SYSTEM_BLUEPRINT.md) | Cory's campaign system |
| [CLAUDE_CODE_ARCHITECTURE_AUDIT.md](CLAUDE_CODE_ARCHITECTURE_AUDIT.md) | How Claude Code is wired into this repo |
| [../INTELLIGENCE_OS_BLUEPRINT.md](../INTELLIGENCE_OS_BLUEPRINT.md) | Original intelligence OS blueprint (100 KB) |
| [../Colaberry_Enterprise_AI_Leadership_Accelerator_Build_Guide_v1.md](../Colaberry_Enterprise_AI_Leadership_Accelerator_Build_Guide_v1.md) | Original build guide (121 KB) |

### Specs — [spec/](spec/)

Focused specifications for cross-cutting concerns:

- [access-control-and-auth.md](spec/access-control-and-auth.md)
- [platform-intelligence-stack.md](spec/platform-intelligence-stack.md)
- [recommendations-and-adaptive-system.md](spec/recommendations-and-adaptive-system.md)
- [search-and-nlp.md](spec/search-and-nlp.md)
- [parser-noise-classifications.md](spec/parser-noise-classifications.md)
- [out-of-scope-nfrs.md](spec/out-of-scope-nfrs.md)

---

## Agent catalog — [agent-catalog/](agent-catalog/README.md)

**135 files** documenting all 134 agents across 9 categories and 18 departments. One markdown file per agent. The best single entry point for understanding the AI layer.

| Category | Count |
|---|---|
| [Intelligence](agent-catalog/intelligence/) | 16 |
| [Departments](agent-catalog/departments/) | 24 |
| [Admissions](agent-catalog/admissions/) | 24 |
| [Services](agent-catalog/services/) | 23 |
| [OpenClaw](agent-catalog/openclaw/) | 17 |
| [Reporting](agent-catalog/reporting/) | 11 |
| [Super Agents](agent-catalog/super-agents/) | 8 |
| [Security](agent-catalog/security/) | 8 |
| [Assistant](agent-catalog/assistant/) | 3 |

Implementations live in `backend/src/services/agents/` and `backend/src/intelligence/agents/`.

---

## Phase validation reports

**32 reports**, `PHASE_2` through `PHASE_32`, one per capability phase of the System State Engine build-out. Each documents what a phase added and what evidence proved it worked.

Read them when you need to know *why* a subsystem exists. Read them in order only if you want the full arc of how the engine grew from telemetry ingestion to federated governance.

Rough progression:

| Phases | Theme |
|---|---|
| 2-4 | Cutover, telemetry, self-synchronization |
| 5-8 | Operational UX, visual and multimodal cognition, realtime awareness |
| 9-12 | Distributed orchestration, self-learning, closed-loop UX, governed decision automation |
| 13-16 | Supervised autonomous governance, handoff verification, governed mutation, causality replay |
| 17-20 | Adaptive validators, operator-calibrated governance, federated intelligence, bounded federated learning |
| 21-24 | Distributed organizational cognition (runtime + topology), safe execution substrate, cognitive compression |
| 25-28 | Safe experimentation, live sandbox, delegated execution, execution resource governance |
| 29-32 | Stabilization playbooks, recovery foresight, governance memory, multi-operator continuity |

---

## Audits and health reports

Point-in-time assessments. Useful as evidence for a case study; **check the date before treating one as current.**

| Document | Date |
|---|---|
| [SYSTEM_HEALTH_AUDIT_2026-05-17.md](SYSTEM_HEALTH_AUDIT_2026-05-17.md) | 2026-05-17 |
| [SYSTEM_HEALTH_AUDIT_2026-05-17_post-fixes.md](SYSTEM_HEALTH_AUDIT_2026-05-17_post-fixes.md) | 2026-05-17, after remediation |
| [AI_AGENT_AUDIT.md](AI_AGENT_AUDIT.md) | Agent fleet audit |
| [AI_CAMPAIGN_SYSTEM_AUDIT.md](AI_CAMPAIGN_SYSTEM_AUDIT.md) | Campaign system audit |
| [INBOX_COS_AUDIT_REPORT.md](INBOX_COS_AUDIT_REPORT.md) | Inbox chief-of-staff audit |
| [FALSE_POSITIVE_ELIMINATION_PLAN.md](FALSE_POSITIVE_ELIMINATION_PLAN.md) | Verification false-positive remediation |
| [SMART_VERIFIER_BACKFILL_2026-05-18.md](SMART_VERIFIER_BACKFILL_2026-05-18.md) | Smart verifier backfill |
| [TOP_10_WALK_2026-05-20.md](TOP_10_WALK_2026-05-20.md) | Top-10 surface walkthrough |
| [../AUDIT.md](../AUDIT.md) | Repo-level audit |

---

## Sprint review documents (`*_REVIEW.html`)

~30 standalone HTML documents, each embedding real production screenshots for one sprint. Produced by the `/screenshot-review` skill; capture scripts live in [../scripts/](../scripts/README.md).

They are the visual record of how surfaces actually looked at a moment in time — the highest-value raw material in this directory for a case study.

Representative: `OPERATIONAL_TRUST_REVIEW.html`, `OPERATOR_ORIENTATION_REVIEW.html`, `SEMANTIC_COHERENCE_REVIEW.html`, `STRUCTURAL_CONFIDENCE_REVIEW.html`, `VISUAL_WORKSPACE_REVIEW.html`, `ONE_BRAIN_CONSOLIDATION_REVIEW.html`, `SYSTEM_VIEW_RESTRUCTURE_REVIEW.html`, `TELEMETRY_SYNC_REVIEW.html`, `AUTHORITY_COLLAPSE_REVIEW.html`, `CONTINUITY_RESUME_REVIEW.html`.

Reference pattern for building a new one: [OPERATIONAL_TRUST_REVIEW.html](OPERATIONAL_TRUST_REVIEW.html). (`CLAUDE.md` names `POST_DEPLOY_WALKTHROUGH.html` as the canonical pattern, but that file was never committed — it exists only on Ali's machine.)

### Screenshots — [screenshots/](screenshots/)

**249 images** in 29 dated folders (`YYYY-MM-DD-<sprint-slug>/`), spanning 2026-05-15 to 2026-06-02. Captured at a 1800px safe-width ceiling via `scripts/captureHelpers.js` — wide screenshots have killed sessions before, hence the ceiling.

---

## Program and business documents

### Training program — [training-program-2026-q3/](training-program-2026-q3/)

The Q3 2026 program launch package, 28 files:

- [CANONICAL_COURSE_STRUCTURE.md](training-program-2026-q3/CANONICAL_COURSE_STRUCTURE.md) — the authoritative course shape
- [TRAINING_INTEGRATION_PLAN.md](training-program-2026-q3/TRAINING_INTEGRATION_PLAN.md)
- [STUDENT_PLATFORM_STRATEGY.md](training-program-2026-q3/STUDENT_PLATFORM_STRATEGY.md)
- [TWC_INTENSIVE_OUTCOMES.md](training-program-2026-q3/TWC_INTENSIVE_OUTCOMES.md) — Texas Workforce Commission outcomes
- [TEAM_LEAD_JOB_DESCRIPTIONS.md](training-program-2026-q3/TEAM_LEAD_JOB_DESCRIPTIONS.md)
- [ASSUMPTIONS_LOG.md](training-program-2026-q3/ASSUMPTIONS_LOG.md)
- [launch-briefs/](training-program-2026-q3/launch-briefs/) — 19 per-person and per-topic briefs covering program overview, pricing, the 41-day launch timeline, roster, locked decisions, and the CB PMO contract

### Other program docs

- [INTERVIEW_PREP_PROCESS.md](INTERVIEW_PREP_PROCESS.md)
- [user-engagement-triage.md](user-engagement-triage.md)
- [personas/example-personas.md](personas/example-personas.md)
- [3-track-build-plan/BUILD_PLAN.md](3-track-build-plan/BUILD_PLAN.md)
- [student-platform-sync/](student-platform-sync/) — adapter contract and data-model migration
- [sms-voice-alerting/PLAN.md](sms-voice-alerting/PLAN.md)
- [task-worker/PROMPT_PACK.md](task-worker/PROMPT_PACK.md)

### Marketing — [marketing/](marketing/)

- [FREE_CLASS_VIRAL_15S.md](marketing/FREE_CLASS_VIRAL_15S.md) — the reference build for the `/short-form-video` pipeline
- [REEL4_PERFORMANCE_REVIEW.md](marketing/REEL4_PERFORMANCE_REVIEW.md)
- Two rendered `.mp4` outputs

Marketing imagery lives in [img/](img/) (14 files). Print-ready collateral is the `m4-v*.pdf` / `coop-ad-mockups-*` family in this directory's root.

---

## Session logs — [sessions/](sessions/)

Per-session HTML changelogs, one per Claude Code session, keyed on Session ID (`SESSION_CC-<YYYYMMDD>-<id>.html`). Generated by:

```bash
node scripts/generateSessionChangelog.js <SessionID>
```

Concurrent sessions each get their own file, so they never overwrite each other.

> **Note on progress tracking:** `PROGRESS.md` at the repo root is the historical log. It exceeds 1.5 MB and is treated as sealed — grep it by session ID or date, never read it whole. Current sessions log to `docs/sessions/<SessionID>.md`. Some older instructions in `CLAUDE.md` still describe `PROGRESS.md` as the live target; that guidance is stale.

---

## Comparison and experiment artifacts

- [doc-comparison/](doc-comparison/) — architect vs. regular generator output, with `metrics.json`
- [REQUIREMENTS_GENERATOR_COMPARISON.html](REQUIREMENTS_GENERATOR_COMPARISON.html)
- [REQUIREMENTS_ARCHITECT_E2E_REPORT.html](REQUIREMENTS_ARCHITECT_E2E_REPORT.html), [REQUIREMENTS_BUILDER_E2E_REPORT.html](REQUIREMENTS_BUILDER_E2E_REPORT.html), [REQUIREMENTS_BUILD_OUT_E2E_REPORT.html](REQUIREMENTS_BUILD_OUT_E2E_REPORT.html)
- [BUILD_PATH_TIMING_REPORT.html](BUILD_PATH_TIMING_REPORT.html)
- [ai-ops-overnight-plan-2026-06-02.md](ai-ops-overnight-plan-2026-06-02.md) and its walkthrough

---

## Conventions for adding a doc here

- **Date anything point-in-time.** `NAME_YYYY-MM-DD.md`. An undated audit becomes a liability the moment it goes stale.
- **Sprint review docs** are `<SPRINT>_REVIEW.html` with screenshots under `screenshots/<YYYY-MM-DD>-<slug>/`.
- **Durable architecture docs** get a plain descriptive name and belong in the Architecture table above.
- **Add new documents to this index.** A doc nobody can find was not worth writing.
- Docs describe the system; they are not the system. Procedures that must be executed belong in [../directives/](../directives/README.md), not here.
