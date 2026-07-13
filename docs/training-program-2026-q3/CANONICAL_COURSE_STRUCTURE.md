# Canonical Course Structure — AI Systems Architect Accelerator (12 weeks)

**Status:** Locked. This document is the single source of truth for the one canonical course.
**Owner:** Ali Muwwakkil · **Session:** CC-20260712-q7m2 · **Date:** 2026-07-12

This is the "class" that the **Curriculum Composer**, the **Timeline** (Session Control), and the
**Experience Studio** (learner preview/portal) all read from. There is exactly **one** course today.
Additional courses are added later by cloning this shape into a new `ProgramBlueprint` + `Cohort`
(see [Adding future courses](#adding-future-courses)).

The canonical structure is encoded as typed data in
[`backend/src/data/canonicalCourse.ts`](../../backend/src/data/canonicalCourse.ts) and written to the
database by the idempotent seed
[`backend/src/seeds/seedCanonicalCourse.ts`](../../backend/src/seeds/seedCanonicalCourse.ts). The typed
object is what "passes into the curriculum types to speed creation" — the Composer consumes real
`CurriculumModule` / `CurriculumLesson` rows instead of authoring each week by hand.

---

## 1. Course identity (the "class")

| Layer | Entity | Value |
|---|---|---|
| Course / program | `ProgramBlueprint` | **AI Systems Architect Accelerator** (12-week, 4-intensive) |
| Run / instance | `Cohort` | **Cohort 1 — July 2026**, starts **2026-07-13** (Mon) |
| Schedule | `LiveSession` × 24 | Mon **Architecture Day** (core) + Thu **Build Day** (lab), per week |
| Content | `CurriculumModule` × 12 | one **week-module** per week, tagged `intensive_number` 1–4 |
| Content | `CurriculumLesson` × 60 | the weekly **5-task checklist** per week-module |

**Cadence:** 12 weeks · 2 sessions/week · Mon 1:00–3:00 PM ET (Architecture) + Thu 1:00–3:00 PM ET (Build).
**Structure rule (source: `TWC_INTENSIVE_OUTCOMES.md`):** 4 Intensives × 3 weeks = 12 weeks. Each
Intensive is a stand-alone, stackable seminar with its own shippable deliverable.

---

## 2. The 12 weeks × 4 intensives, mapped to Anthropic Academy

Every Anthropic URL is `https://anthropic.skilljar.com/<slug>`. `status` records fit confidence so the
Composer can flag weeks that are Colaberry-authored vs. a confirmed Academy course.

### Intensive 1 — Build Your AI Foundation  (Weeks 1–3)
*Stand-alone value: Working AI environment + Skills library + Workflow Assistant · Build due Thu 2026-07-30*

| Wk | Week theme | Anthropic course | Slug | Status |
|----|------------|------------------|------|--------|
| 1 | Claude Code Foundations + Workspace | Claude Code 101 | `claude-code-101` | confirmed |
| 2 | Agent Skills (build 3 skills) | Introduction to agent skills | `introduction-to-agent-skills` | confirmed |
| 3 | Claude API + Workflow Assistant | Building with the Claude API | `claude-with-the-anthropic-api` | confirmed |

### Intensive 2 — Create Your AI Team  (Weeks 4–6)
*Stand-alone value: Enterprise Prompt Library + Multi-agent system + Coordination patterns · Build due Thu 2026-08-20*

| Wk | Week theme | Anthropic course | Slug | Status |
|----|------------|------------------|------|--------|
| 4 | Prompt Engineering + Prompt Library | Claude Platform 101 *(no 1:1 course — closest fit; prompt eng also in Building with the Claude API)* | `claude-platform-101` | closest_fit |
| 5 | MCP Foundations + First MCP Server | Introduction to Model Context Protocol | `introduction-to-model-context-protocol` | confirmed |
| 6 | Advanced MCP + System Integration | Model Context Protocol: Advanced Topics | `model-context-protocol-advanced-topics` | confirmed |

### Intensive 3 — Connect AI To The Real World  (Weeks 7–9)
*Stand-alone value: Working MCP server + Business system integration · Build due Thu 2026-09-10*

| Wk | Week theme | Anthropic course | Slug | Status |
|----|------------|------------------|------|--------|
| 7 | Subagents + Multi-Agent Team | Introduction to subagents | `introduction-to-subagents` | confirmed |
| 8 | Claude Code Workflows + Automation | Claude Code in Action | `claude-code-in-action` | confirmed |
| 9 | Reliability Engineering + Quality Layer | AI Capabilities and Limitations *(loose fit; else Colaberry-authored)* | `ai-capabilities-and-limitations` | loose_fit |

### Intensive 4 — Design AI That Scales  (Weeks 10–12)
*Stand-alone value: Reliability Framework + Governance Engine + Solution Architecture Package · Build due Thu 2026-10-01*

| Wk | Week theme | Anthropic course | Slug | Status |
|----|------------|------------------|------|--------|
| 10 | Governance + Governance Engine | *(no Academy course — Colaberry-authored)* | — | colaberry_authored |
| 11 | Systems Architecture + Arch Package | *(no Academy course — maps to CCA-Foundations content)* | — | colaberry_authored |
| 12 | Capstone + Architect Expo | *external gate: CCA-F exam* — `https://claudecertifications.com/claude-certified-architect/exam-guide` | — | external_gate |

---

## 3. Per-week lesson template (the 5-task checklist)

Every week-module carries the same 5 lessons, using the existing `lesson_type` enum so the Composer,
gating engine, and skill-genome all keep working unchanged:

| # | Lesson | `lesson_type` | Purpose |
|---|--------|---------------|---------|
| 1 | Anthropic Academy: *{course}* | `section` | Complete the mapped Academy course (or Colaberry-authored module for Wk 10–12). Carries the course link. |
| 2 | Lab: *{week deliverable}* | `lab` | Hands-on build that produces the week's artifact. |
| 3 | Assessment: *{week}* | `assessment` | Knowledge check, 70% pass. |
| 4 | Build Video / Demo | `reflection` | Record a short demo of the week's build. |
| 5 | Weekly Sign-off | `reflection` | Self/instructor sign-off gating the next week. |

60 lessons total (12 × 5). Weeks 10–12 keep the same 5-task shape; task 1 points at the Colaberry-authored
module or CCA-F prep instead of an Academy course.

---

## 4. Session schedule (Timeline)

24 `LiveSession` rows, `module_id`-linked to the week-module. `session_number` 1–24 (odd = Mon
Architecture core, even = Thu Build lab). Dates derived from the 2026-07-13 Monday start:

| Wk | Mon (Architecture, core) | Thu (Build, lab) |
|----|--------------------------|------------------|
| 1 | 2026-07-13 | 2026-07-16 |
| 2 | 2026-07-20 | 2026-07-23 |
| 3 | 2026-07-27 | 2026-07-30 |
| 4 | 2026-08-03 | 2026-08-06 |
| 5 | 2026-08-10 | 2026-08-13 |
| 6 | 2026-08-17 | 2026-08-20 |
| 7 | 2026-08-24 | 2026-08-27 |
| 8 | 2026-08-31 | 2026-09-03 |
| 9 | 2026-09-07 | 2026-09-10 |
| 10 | 2026-09-14 | 2026-09-17 |
| 11 | 2026-09-21 | 2026-09-24 |
| 12 | 2026-09-28 | 2026-10-01 |

---

## 5. Data-model mapping

The canonical structure reuses existing tables. The only schema change is **additive, nullable columns**
on `curriculum_modules` (no redesign, low blast radius, reversible):

| New column (`curriculum_modules`) | Type | Meaning |
|---|---|---|
| `intensive_number` | INT (1–4) | Which of the 4 intensives this week belongs to |
| `intensive_title` | STRING | e.g. "Build Your AI Foundation" |
| `intensive_standalone_value` | TEXT | The intensive's shippable stand-alone deliverable |
| `intensive_build_due` | DATEONLY | Build-due date at the end of the intensive |
| `week_number` | INT (1–12) | Week index (equals `module_number` for this course) |
| `anthropic_course_title` | STRING (nullable) | Mapped Academy course title |
| `anthropic_course_slug` | STRING (nullable) | Academy slug (URL = base + slug) |
| `anthropic_course_url` | STRING (nullable) | Full resolved link (Academy or external gate) |
| `anthropic_course_status` | STRING | `confirmed` \| `closest_fit` \| `loose_fit` \| `colaberry_authored` \| `external_gate` |

`module_number` = `week_number` = 1–12. `skill_area` (legacy 5-value enum) is still set per week for
backward compatibility; **`intensive_number` is the real grouping** going forward.

---

## 6. How the three surfaces consume this

- **Curriculum Composer** (`admin/orchestration/*`, `builder/`): reads `CurriculumModule` /
  `CurriculumLesson` rows for the cohort. `getModulesForCohort()` returns `mod.toJSON()`, so the new
  intensive/week/Anthropic fields flow through automatically — the Composer sees a pre-built 12-week
  skeleton to refine instead of a blank canvas.
- **Timeline** (`SessionControlTab` + `LiveSession`): reads the 24 `module_id`-linked sessions for the
  cohort, already dated Mon/Thu across 12 weeks.
- **Experience Studio** (portal `PortalCurriculumPage` + preview/simulation): `getParticipantCurriculum()`
  now returns `intensive_number`, `intensive_title`, `week_number`, and the Anthropic link per module, so
  the learner view groups weeks under their intensive and links each week to its Academy course.

---

## 7. How to apply

```bash
# from repo root, on a box with backend deps installed
cd backend
npx ts-node src/seeds/seedCanonicalCourse.ts
```

The seed is idempotent (findOrCreate + update; adds only missing columns via describeTable guard). Safe to
re-run. It creates a **new** ProgramBlueprint + **new** July cohort, so it does not disturb the existing
March-cohort demo curriculum seeded by `seedProgramCurriculum()` on startup.

**Verification:** `npx tsc --noEmit` (backend + frontend) and `npm test -- canonicalCourse` must pass on a
deps-enabled box.

---

## Adding future courses

The model already supports many programs (`Cohort.program_id → ProgramBlueprint`). To add another course:
1. Add a new typed course object alongside `CANONICAL_COURSE` (or parameterize the seed).
2. The seed creates its own `ProgramBlueprint` + `Cohort` + modules/lessons/sessions.
3. No existing course is affected — each course is isolated by its program + cohort.
