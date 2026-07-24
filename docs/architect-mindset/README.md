# Architect Mindset — The Architect Time Machine

A new **Curriculum Type** for the AI Systems Architect Accelerator. A 13-part weekly interactive
simulation (Week 0 intro/demo + Weeks 1-12) that exposes students to architectural lessons that
traditionally took years of projects, incidents, and organizational responsibility to learn.

- **Internal name:** Architect Mindset · **Student experience:** The Architect Time Machine
- **Tagline:** *Gain the lessons experience usually teaches too late.*
- **Slug:** `architect_mindset` · **Render band:** `architect_mindset` (new bespoke renderer)

---

## Current phase: Documentation + Design → **awaiting DESIGN APPROVAL (Gate A)**

No production code has been written. This folder is the complete Gate A deliverable: full
documentation of the curriculum type and the 13-week experience, plus three working visual
prototypes and a design review. The build is gated in four separate human approvals that never
cascade:

`Docs + Design` → **[Gate A]** → `Week 0` → **[Gate B]** → `Week 1` → **[Gate C]** → `Weeks 2-12 plan` → **[Gate D]** → `Weeks 2-12`

Design approval does not authorize Week 0. Week 0 approval does not authorize Week 1. Week 1 approval
does not authorize Weeks 2-12.

---

## How to review

Open **[`05-visual-design-review.html`](05-visual-design-review.html)** in a browser. It embeds the
three live prototypes and covers surfaces, journey, component hierarchy, state model, responsive,
accessibility, motion, data dependencies, open questions, and the recommendation. Each prototype is
interactive (state and viewport toggles inside).

---

## Contents

| File | What it is |
|---|---|
| [`00-canonical-decisions.md`](00-canonical-decisions.md) | **Source of truth.** Every locked identifier, config, architecture, state machine, scoring, and compression decision. Change here first. |
| [`01-product-specification.md`](01-product-specification.md) | Vision, student transformation, series structure, experience model, ethics of compression estimates, success criteria. |
| [`02-curriculum-specification.md`](02-curriculum-specification.md) | Weeks 0-12: principles, scenarios, hidden systems, stakeholders, signature reveals, artifacts, evaluation focus. Weeks 0 and 1 fully detailed. |
| [`03-experience-design-specification.md`](03-experience-design-specification.md) | The dream-like experience, the Architect Interview (MC + custom), the 16-step flow, completion rules, required visuals. |
| [`04-technical-architecture.md`](04-technical-architecture.md) | Components reused vs new, data model, API contracts, state machine, completion enforcement, idempotency, failure recovery, analytics, security, promotion. |
| [`05-visual-design-review.html`](05-visual-design-review.html) | **The design review.** Embeds the three prototypes; the Gate A document. |
| [`06-implementation-and-approval-plan.md`](06-implementation-and-approval-plan.md) | The four approval gates, Week 0/Week 1 scope, verification matrix, demonstration reports, promotion. |
| [`07-test-plan.md`](07-test-plan.md) | Unit / integration / failure-injection / accessibility / visual tests, the real repo gate commands, Definition of Done. |
| [`08-decision-log.md`](08-decision-log.md) | Decisions with why, alternatives, status, approver, date, related artifact; open questions for Gate A. |
| [`09-experience-compression-and-scoring.md`](09-experience-compression-and-scoring.md) | The (ethics-gated) experience-compression model and the transparent 8-dimension Architect Mindset Score. |
| [`prototypes/thumbnail.html`](prototypes/thumbnail.html) | Design 1 — the timeline tile poster (all sizes, themes, fallback, production scene prompt). |
| [`prototypes/panel.html`](prototypes/panel.html) | Design 2 — the right-side drawer (empty / in-progress / completed; desktop / tablet / mobile). |
| [`prototypes/workspace.html`](prototypes/workspace.html) | Design 3 — the full workspace (the whole experience; all four required states; reduced-motion + dark). |

---

## Design language

Design-E palette (`--berry #367895`, `--cherry #FB2832`, `--leaf #77BB4A`, `--amber #E8920C`,
Roboto / Roboto Mono), with a contained cinematic "time tunnel" motif. Light default, optional dark,
`prefers-reduced-motion` honored, WCAG 2.1 AA target, mobile/tablet/desktop.

## Architecture in one line

An additive extension: one new curriculum type + one new `render_band` + one self-styled bespoke
renderer wired into the existing drawer and workspace + one backend service modeled on
`assessmentService`, storing state in the existing `timeline_card_progress.student_progress` JSONB.
**No new database table and no schema migration for Week 0.**
