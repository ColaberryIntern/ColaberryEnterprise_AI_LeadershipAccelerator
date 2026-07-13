# Colaberry-Authored Content — Weeks 10–12 (Intensive 4: Design AI That Scales)

**Status:** Draft outline for authoring. **Session:** CC-20260712-q7m2 · **Date:** 2026-07-12
**Parent:** [CANONICAL_COURSE_STRUCTURE.md](./CANONICAL_COURSE_STRUCTURE.md)

Weeks 1–9 are anchored on an Anthropic Academy course. Weeks 10–12 have no 1:1 Academy course, so
Colaberry authors them. These outlines are encoded as typed data in
[`backend/src/data/canonicalCourse.ts`](../../backend/src/data/canonicalCourse.ts) (`colaberry_module`
on each of weeks 10–12) and fold automatically into each week's **section / lab / assessment** lessons via
`buildWeeklyLessons()` — so an authored week drops into the Curriculum Composer exactly like an
Academy-mapped one. This doc is the fuller human-facing spec behind that data.

Intensive 4 stand-alone value: **Reliability Framework + Governance Engine + Solution Architecture Package**.
It builds on the working system from Intensives 1–3 (foundation → AI team → real-world integration) and
lands the learner at the Claude Certified Architect — Foundations (CCA-F) gate.

Every week keeps the canonical 5-task shape: **①Section ②Lab ③Assessment ④Build Video ⑤Sign-off**.
Two live sessions/week: **Mon Architecture Day** (core) + **Thu Build Day** (lab).

---

## Week 10 — Governance + Governance Engine
*Skill area: governance · Mon 2026-09-14 · Thu 2026-09-17 · Build due (Intensive 4): 2026-10-01*

**Premise.** Wrap the Intensive-1–3 system in a **Governance Engine** — the trust layer that makes an
agentic system safe to run in production. Governance is enforced *before* side effects fire, not audited
after.

**Frameworks:** GOALS (Governance pillar) · INPACT (Permitted, Transparent) · 7-Layer Architecture (Layer 5) · Trust Band.

**Learning objectives**
1. Design a 5-factor ABAC policy (user, resource, action, context, risk) for an agentic system.
2. Define which action categories must escalate to a human, and the escalation path.
3. Instrument an audit trail that reconstructs any decision from a single correlation ID.
4. Score the system on INPACT Permitted & Transparent and the GOALS Governance pillar.

**Mon — Architecture Day**
- Governance-first vs. governance-after; fail-closed defaults (an ungoverned action is a denied action).
- 5-factor ABAC and the policy evaluation budget (<10ms); Layer 5 of the reference architecture.
- The eight high-risk categories that force HITL escalation; target <15% escalation rate.
- Audit trail design: correlation IDs on every action/tool-call/write; secret redaction.

**Thu — Build Day (Lab ②)**
- **Goal:** ship a working Governance Engine over your existing system.
- **Deliverable:** a governance module (policy config + ABAC evaluator + HITL gate + audit log) that
  demonstrably blocks a disallowed action and escalates a high-risk one.
- **Steps:** author ABAC policy → implement evaluator middleware / MCP tool → add HITL escalation path
  (queue + approve/deny + resume) → instrument correlation-ID audit log → prove it (one blocked, one
  escalated, one audit reconstruction).

**③ Assessment** (8 Q, 70%): ABAC design · HITL categories · audit/correlation IDs · INPACT Permitted &
Transparent · fail-closed defaults.
**④ Build Video:** demo the engine gating a real action. **⑤ Sign-off:** governance blueprint reviewed.

---

## Week 11 — Systems Architecture + Architecture Package
*Skill area: requirements · Mon 2026-09-21 · Thu 2026-09-24 · CCA-Foundations content*

**Premise.** Assemble the **Solution Architecture Package** — the CCA-Foundations deliverable set. Map the
system onto the 7-Layer reference architecture, document trust boundaries and data flow, capture ADRs, and
produce the INPACT / Trust Band scorecard. An architecture package is *diagrams + decisions + evidence*,
not slides.

**Frameworks:** 7-Layer Architecture (full stack) · INPACT composite · Trust Band · GOALS (all five pillars).

**Learning objectives**
1. Map a real agentic system onto the 7-Layer reference architecture.
2. Document trust boundaries, data flow, and failure/recovery paths per layer.
3. Write ADRs that justify the key design choices.
4. Produce an INPACT composite + Trust Band scorecard for the finished system.

**Mon — Architecture Day**
- The 7 layers: Storage → Data Fabric → Semantic → Intelligence → Governance → Observability → Orchestration.
- Trust boundaries: where untrusted input crosses in, and what validates it.
- Reliability (wk 9) and governance (wk 10) as layers *in* the package, not add-ons.
- How to document architecture: system + data-flow diagrams, ADRs, scorecards.

**Thu — Build Day (Lab ②)**
- **Goal:** produce the Solution Architecture Package for your system.
- **Deliverable:** system + data-flow diagrams (trust boundaries marked), a 7-layer mapping table, 5+ ADRs,
  and an INPACT/Trust Band scorecard, packaged into one reviewable artifact (PDF/site) for the Expo.
- **Steps:** draw diagrams → fill 7-layer mapping table → write ADRs for the 5 highest-stakes decisions
  (model choice, MCP boundaries, governance, storage, orchestration) → compute INPACT composite + Trust
  Band (note top-3 gaps) → package.

**③ Assessment** (8 Q, 70%): 7-layer mapping · trust boundaries · ADR quality · INPACT/Trust Band scoring ·
architecture documentation.
**④ Build Video:** walk the panel through the package. **⑤ Sign-off:** architecture package accepted.

---

## Week 12 — Capstone + Architect Expo (CCA-F external gate)
*Skill area: executive_authority · Mon 2026-09-28 · Thu 2026-10-01 (the Expo) · External gate: CCA-F exam*

**Premise.** Integrate the whole 12-week arc into a **capstone**, present it at the **Architect Expo**, and
sit the **Claude Certified Architect — Foundations** exam. This is the external gate: pass the exam, present
the system, submit the architecture package.
Exam guide: <https://claudecertifications.com/claude-certified-architect/exam-guide>

**Frameworks:** CCA-Foundations exam blueprint · INPACT composite · Trust Band · 7-Layer Architecture.

**Learning objectives**
1. Integrate foundation, AI team, integration, reliability, governance, and architecture into one capstone.
2. Present the system and architecture package to a panel at the Expo.
3. Prepare for and pass the CCA-Foundations exam.
4. Position the system with executive authority: problem → architecture → evidence → roadmap.

**Mon — Architecture Day**
- Capstone review + freeze criteria (end-to-end run with governance + observability on).
- CCA-F exam-guide walkthrough; close prep gaps; practice assessment.
- Presentation structure: problem → architecture → live demo → trust/evidence → roadmap.

**Thu — Build Day = the Architect Expo** (`presentation_phase_flag` on)
- **Goal:** finalize the capstone and present at the Expo.
- **Deliverable:** live capstone demo + finalized architecture package + recorded Expo presentation +
  CCA-F exam attempt.
- **Steps:** freeze capstone → complete CCA-F prep + practice exam → build Expo presentation → present &
  record → sit CCA-F and submit the architecture package.

**③ Assessment** (12 Q, 70%, CCA-F practice): blueprint domains · end-to-end integration · architecture
defense · trust evidence · executive positioning.
**④ Build Video:** the recorded Expo talk. **⑤ Sign-off:** certification submitted / graduation.

---

## Authoring checklist (to turn these outlines into shipped content)
- [ ] Write the section narrative for each week (task ①) from the `key_points` + `learning_objectives`.
- [ ] Build the lab handout + starter scaffold for each `lab_spec`.
- [ ] Write the assessment items to the `assessment_blueprint` (count + covers).
- [ ] Record/author the Colaberry reference resources listed per week.
- [ ] Confirm the CCA-F exam-guide link and any version-specific blueprint changes before Cohort 1 start (2026-07-13).
