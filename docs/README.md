# Docs

**937 files.** Architecture references, subsystem audits, phase validation reports, sprint review documents, session logs, and 332 production screenshots.

This directory grew by accretion — most files were written to answer one question at one moment. That makes it valuable as a record and hard to navigate cold. This index fixes the second problem without destroying the first.

---

## Start here

| Document | What it gives you |
|---|---|
| [../README.md](../README.md) | The repo front door: what this is, architecture, repo map |
| [../SETUP.md](../SETUP.md) | Local dev in under 15 minutes |
| [DEV_GUIDE.md](DEV_GUIDE.md) | Conventions, gotchas, the CB System engine, deploy procedure |
| [../CLAUDE.md](../CLAUDE.md) | The binding operating contract for humans and AI agents |
| [../MERGE_WORKFLOW.md](../MERGE_WORKFLOW.md) | Getting a change from branch to production |
| [OPERATIONAL_VOCABULARY.md](OPERATIONAL_VOCABULARY.md) | Shared vocabulary. Read before an architecture discussion. |

---

## Architecture references

The durable documents — how the system is built, not what happened on a given day.

| Document | Scope |
|---|---|
| [ACCELERATOR_PORTAL_SYSTEM.md](ACCELERATOR_PORTAL_SYSTEM.md) | The portal, end to end |
| [ACCELERATOR_PORTAL_FULL_DETAIL.md](ACCELERATOR_PORTAL_FULL_DETAIL.md) | Exhaustive portal detail |
| [ACCELERATOR_PORTAL_PROCESS_DEEP_DIVE.md](ACCELERATOR_PORTAL_PROCESS_DEEP_DIVE.md) | Process-level walkthrough |
| [AI_OPERATIONS_ARCHITECTURE.md](AI_OPERATIONS_ARCHITECTURE.md) | The autonomous ops layer |
| [BPOS-Architecture.md](BPOS-Architecture.md) | Business Process Operating System |
| [AI_CAMPAIGN_ENGINE.md](AI_CAMPAIGN_ENGINE.md) | Campaign generation and lifecycle |
| [CORY_CAMPAIGN_SYSTEM_BLUEPRINT.md](CORY_CAMPAIGN_SYSTEM_BLUEPRINT.md) | Cory's campaign system |
| [CORY_PERSONA_SPEC.md](CORY_PERSONA_SPEC.md) | Cory's persona contract |
| [CLAUDE_CODE_ARCHITECTURE_AUDIT.md](CLAUDE_CODE_ARCHITECTURE_AUDIT.md) | How Claude Code is wired into this repo |
| [COMMAND_CENTER_DATA_CONTRACT.md](COMMAND_CENTER_DATA_CONTRACT.md) | Command center data contract |
| [BUILD_VERIFICATION_CONTRACT.md](BUILD_VERIFICATION_CONTRACT.md) | What counts as a verified build |
| [../INTELLIGENCE_OS_BLUEPRINT.md](../INTELLIGENCE_OS_BLUEPRINT.md) | Original intelligence OS blueprint |
| [../Colaberry_Enterprise_AI_Leadership_Accelerator_Build_Guide_v1.md](../Colaberry_Enterprise_AI_Leadership_Accelerator_Build_Guide_v1.md) | Original build guide |

### [architecture/](architecture/) — 73 files

Deeper architecture work, including the `career-portfolio/` sub-study (evidence maps, GitHub integration, implementation status) and [INTELLIGENCE_PIPELINE_CURRICULUM_TYPES.md](architecture/INTELLIGENCE_PIPELINE_CURRICULUM_TYPES.md), [CONTENT_GENERATION_STRATEGY.md](architecture/CONTENT_GENERATION_STRATEGY.md).

### [spec/](spec/) — 7 files

Focused specifications: [access-control-and-auth.md](spec/access-control-and-auth.md), [platform-intelligence-stack.md](spec/platform-intelligence-stack.md), [recommendations-and-adaptive-system.md](spec/recommendations-and-adaptive-system.md), [search-and-nlp.md](spec/search-and-nlp.md), [parser-noise-classifications.md](spec/parser-noise-classifications.md), [out-of-scope-nfrs.md](spec/out-of-scope-nfrs.md).

### Build pipeline

[BUILD_PIPELINE_REQUIREMENTS.md](BUILD_PIPELINE_REQUIREMENTS.md), [BUILD_PIPELINE_AUDIT.md](BUILD_PIPELINE_AUDIT.md), [BUILD_PIPELINE_GITHUB_SYNC.md](BUILD_PIPELINE_GITHUB_SYNC.md), [BUILD_PIPELINE_RELEASES_AND_STORIES.md](BUILD_PIPELINE_RELEASES_AND_STORIES.md), [BUILD_LOOP_PLAN.md](BUILD_LOOP_PLAN.md), [handoff/SBP_STEPS_1-5_HANDOFF.md](handoff/SBP_STEPS_1-5_HANDOFF.md).

Schema migrations for the Student Build Pipeline, with rollback: [migrations/](migrations/).

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

## Governance, trust, and compliance

| Path | Contents |
|---|---|
| [ai-governance/](ai-governance/README.md) | ABAC design, AI systems registry, consent capture, TBI compliance program |
| [trust-audit/](trust-audit/README.md) | Trust compliance report, AI inventory, event model, gap analysis, governance audit, dashboard design |

---

## Phase validation reports

**32 reports**, `PHASE_2` through `PHASE_32`, one per capability phase of the System State Engine build-out. Each documents what a phase added and what evidence proved it worked.

Read them when you need to know *why* a subsystem exists. Read them in order only for the full arc from telemetry ingestion to federated governance.

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

## Audits and reports

Point-in-time assessments. **Check the date before treating one as current.**

[AI_AGENT_AUDIT.md](AI_AGENT_AUDIT.md), [AI_CAMPAIGN_SYSTEM_AUDIT.md](AI_CAMPAIGN_SYSTEM_AUDIT.md), [INBOX_COS_AUDIT_REPORT.md](INBOX_COS_AUDIT_REPORT.md), [INTERNSHIP_ENROLLMENT_AUDIT.md](INTERNSHIP_ENROLLMENT_AUDIT.md), [FALSE_POSITIVE_ELIMINATION_PLAN.md](FALSE_POSITIVE_ELIMINATION_PLAN.md), [CB_SYSTEM_REPORT.md](CB_SYSTEM_REPORT.md), [EXPLORER_GOVERNOR_SHADOW_REVIEW.md](EXPLORER_GOVERNOR_SHADOW_REVIEW.md), [../AUDIT.md](../AUDIT.md).

PR review runs are archived in [pr-reviews/](pr-reviews/) with machine-readable `verdicts.json` alongside the rendered report.

---

## Product and growth

| Document | Covers |
|---|---|
| [EXPLORER_GROWTH_OS_PLAN.md](EXPLORER_GROWTH_OS_PLAN.md) | Explorer Growth OS |
| [AI_ROI_PILOT_GTM_STRATEGY.md](AI_ROI_PILOT_GTM_STRATEGY.md) | AI ROI pilot go-to-market |
| [AI_ROI_PILOT_EMAIL_SEQUENCE.md](AI_ROI_PILOT_EMAIL_SEQUENCE.md) | Pilot email sequence |
| [AI_INTERNSHIP_SPEC.md](AI_INTERNSHIP_SPEC.md) | Internship program spec |
| [PAYSIMPLE_PAYMENT_SYNC.md](PAYSIMPLE_PAYMENT_SYNC.md) | Payment sync |
| [FAMILY_COMMAND_CENTER_V2.md](FAMILY_COMMAND_CENTER_V2.md) | Family command center |
| [community/](community/) | Community build plan, current state, decision ledger |
| [case-study/](case-study/) | Case study schema and authoring template |
| [enterprise-site-v2/](enterprise-site-v2/), [admin-redesign/](admin-redesign/), [onboarding/](onboarding/), [inbox-resolution/](inbox-resolution/) | Focused initiative docs |

---

## Curriculum and program

### [deep-dive/](deep-dive/) — 14 files

Per-week field guides and command centers, `wk0` through `wk12` — the SDLC command center, business analysis, solution architect, project manager, DevOps, governance lead, and AI solution architect guides.

### [architect-mindset/](architect-mindset/) — 15 files

A complete product package: canonical decisions, product/curriculum/experience specifications, technical architecture, visual design review, implementation and approval plan, test plan.

### [training-program-2026-q3/](training-program-2026-q3/) — 38 files

The Q3 2026 launch package:

- [CANONICAL_COURSE_STRUCTURE.md](training-program-2026-q3/CANONICAL_COURSE_STRUCTURE.md) — the authoritative course shape
- [TRAINING_INTEGRATION_PLAN.md](training-program-2026-q3/TRAINING_INTEGRATION_PLAN.md)
- [STUDENT_PLATFORM_STRATEGY.md](training-program-2026-q3/STUDENT_PLATFORM_STRATEGY.md)
- [TWC_INTENSIVE_OUTCOMES.md](training-program-2026-q3/TWC_INTENSIVE_OUTCOMES.md) — Texas Workforce Commission outcomes
- [ASSUMPTIONS_LOG.md](training-program-2026-q3/ASSUMPTIONS_LOG.md)
- [launch-briefs/](training-program-2026-q3/launch-briefs/) — 19 per-person and per-topic briefs

Also [INTERVIEW_PREP_PROCESS.md](INTERVIEW_PREP_PROCESS.md), [personas/](personas/), [3-track-build-plan/](3-track-build-plan/), [sms-voice-alerting/](sms-voice-alerting/), [task-worker/](task-worker/).

---

## Design

[design/](design/) holds the design tokens (`tokens/colors.css`, `tokens/fonts.css`, `tokens/base.css`), `styles.css`, and rendered wrapper explorations. [design-reference/](design-reference/) holds reference renders. Marketing imagery is in [img/](img/).

> The authoritative design system lives in the Claude Code skills (`/baseline-ui`, `/frontend-design`), not here, so it cannot drift.

---

## Sprint review documents (`*_REVIEW.html`)

**72 standalone HTML documents** in this directory's root, each embedding real production screenshots for one sprint. Produced by the `/screenshot-review` skill; capture scripts live in [../scripts/](../scripts/README.md).

They are the visual record of how surfaces actually looked at a moment in time — the highest-value raw material here for a case study.

Representative: `OPERATIONAL_TRUST_REVIEW.html`, `OPERATOR_ORIENTATION_REVIEW.html`, `SEMANTIC_COHERENCE_REVIEW.html`, `STRUCTURAL_CONFIDENCE_REVIEW.html`, `VISUAL_WORKSPACE_REVIEW.html`, `ONE_BRAIN_CONSOLIDATION_REVIEW.html`, `TELEMETRY_SYNC_REVIEW.html`.

### [screenshots/](screenshots/) — 332 images

Dated folders (`YYYY-MM-DD-<sprint-slug>/`). Captured at an 1800px safe-width ceiling via `scripts/captureHelpers.js` — wide screenshots have killed working sessions before, hence the ceiling.

---

## Session logs — [sessions/](sessions/)

**79 files.** Per-session HTML changelogs keyed on Session ID (`SESSION_CC-<YYYYMMDD>-<id>.html`), generated by:

```bash
node scripts/generateSessionChangelog.js <SessionID>
```

Concurrent sessions each get their own file, so they never overwrite each other.

---

## Conventions for adding a doc

- **Date anything point-in-time.** `NAME_YYYY-MM-DD.md`. An undated audit becomes a liability the moment it goes stale.
- **Sprint review docs** are `<SPRINT>_REVIEW.html` with screenshots under `screenshots/<YYYY-MM-DD>-<slug>/`.
- **Durable architecture docs** get a plain descriptive name and belong in the Architecture table above, or in [architecture/](architecture/).
- **Add new documents to this index.** A doc nobody can find was not worth writing.
- Docs describe the system; they are not the system. Procedures that must be executed belong in [../directives/](../directives/README.md).
