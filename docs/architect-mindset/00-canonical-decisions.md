# Architect Mindset / The Architect Time Machine — Canonical Decisions (Source of Truth)

> **Status:** Phase 1 (Documentation + Design). No production code written. Awaiting design approval.
> **Session:** CC-20260720-am01 · **Date:** 2026-07-20 · **DRI:** Ali Muwwakkil (ali@colaberry.com)
> This file is the single source of truth. Every other doc in `docs/architect-mindset/` and every
> future implementation must conform to the identifiers, config, and architecture pinned here. If a
> decision changes, change it **here first**, then propagate.

---

## 1. Naming & identity (LOCKED)

| Field | Value |
|---|---|
| Internal / admin name (`label`) | **Architect Mindset** |
| Student-facing name (`student_label`) | **Architect Time Machine** |
| Series name | Architect Mindset |
| Experience name | The Architect Time Machine |
| Tagline | *Gain the lessons experience usually teaches too late.* |
| Slug (`slug`, immutable FK) | `architect_mindset` |
| Render band (`render_band`, NEW) | `architect_mindset` |
| Description | A weekly interactive architectural simulation that exposes students to difficult system lessons traditionally learned through years of project experience. |

**Slug is an immutable foreign key** (`timeline_cards.type`, `component_versions.component_slug`,
analytics all key on it). Never rename it. `label` may diverge from slug over time; the slug stays.

---

## 2. Curriculum-type configuration (LOCKED, verified against the live registry contract)

Registry entry (`typeRegistry.ts` `CardTypeDef` via the `D({...})` factory):

```
slug:              'architect_mindset'
label:             'Architect Mindset'
student_label:     'Architect Time Machine'
bucket:            'reflect'
render_band:       'architect_mindset'          // NEW bespoke band
est_minutes:       28                            // Weeks 1–12 (Week 0 authored to ~13)
learning_xp:       100
builder_xp:        40
community_xp:      20
difficulty:        'stretch'
competencies:      ['systems_thinking','architecture','decision_making','tradeoffs','ai_governance']
evidence_required: true
github_required:   false
ai_evaluation:     true
instructor_review: false                         // AI-evaluated; optional instructor spot-check deferred (see DL-011)
portfolio_eligible:true
prompt_pairs:      ['concept','reflection']      // (registry PromptPair set)
home_surface:      'class'
feed_mode:         'anchored'
today_eligible:    true
```

Authoring entry (`seedComponentAuthoring.ts` `COMPONENT_AUTHORING['architect_mindset']`):

```
category:          'Architect Development'
icon:              'bi-hourglass-split'          // time-machine motif (Bootstrap Icons); see DL-004
badge_class:       'bg-dark'                      // cinematic; white text passes AA (see DL-004)
estimated_time:    28
capabilities:      ['evidence','artifacts','reflection','scoring','retry','comments','portfolio','mentor_review']
inputs:            []                             // no author textbox — week blueprint + card metadata provide context
variable_keys:     []
outputs: [
  { key:'interview_responses', type:'json', description:'Architect Interview answers (initial + revised, per question)' },
  { key:'architect_decision_record', type:'json', description:'Structured, student-owned ADR' },
  { key:'mindset_score', type:'json', description:'Dimension breakdown + total + stage + delta' },
  { key:'mindset_ledger_delta', type:'json', description:'Cumulative Mindset Ledger update' },
  { key:'project_transfer', type:'json', description:'Lesson applied to the student personalized project' },
  { key:'experience_receipt', type:'json', description:'Patterns/perspectives represented + illustrative estimate + qualification' }
]
completion_rules:  { on:'evaluate' }             // declarative; ENFORCED in the submit service (see §6)
evaluation_type:   'ai'
generation_prompt: ARCHITECT_MINDSET_GENERATION_PROMPT   // authored against WEEK CONTEXT; emits a structured scenario JSON
thumbnail_url:     thumbnailUrlFor('architect_mindset')  // /thumbnails/curriculum-types/architect_mindset.jpg
approved:          true            // set at approval gate; gates the Composer
status:            'ready'
```

> **Thumbnail spread-override gotcha (verified):** the full authored entry MUST re-declare
> `thumbnail_url: thumbnailUrlFor('architect_mindset')` AND `architect_mindset` must be in
> `THUMBNAIL_SLUGS`, or it ships with no banner. `seedComponentAuthoring.test.ts` catches it.

---

## 3. The 13-part series (LOCKED titles & principles)

| Wk | Title | Principle (one line) |
|---|---|---|
| 0 | You Don't Become an Architect by Learning More Tools | An architect sees the entire system surrounding the requested feature. (Series intro + format demo; **baseline only, not a scored lesson**.) |
| 1 | The Request Is Not the Requirement | Stakeholders request an imagined solution; the architect discovers the underlying outcome, root causes, constraints, evidence. |
| 2 | Boundaries Create the Architecture | Divide responsibility by ownership, change, risk, data, authority, scaling, failure containment. |
| 3 | Design for Failure Before Success | A demo proves the happy path once; architecture governs partial failure, retries, duplication, timeout, recovery. |
| 4 | Every Convenience Creates Coupling | Shortcuts and direct integrations create dependencies whose cost appears during change, scale, migration, failure. |
| 5 | Data Has a Lifecycle, Not Just a Schema | Design creation, validation, classification, use, sharing, change, retention, audit, archival, deletion. |
| 6 | Security Is a System Property | Security emerges from identity, authz, trust boundaries, tool permissions, data movement, secrets, defaults, logs, ops. |
| 7 | Observability Is Part of the Product | If the org cannot tell what the system did, why, on what evidence, at what cost, and whether it worked, it is incomplete. |
| 8 | AI Confidence Is Not Business Confidence | Model confidence must combine with evidence quality, business impact, uncertainty, action authority, abstention, escalation. |
| 9 | Optimize the Decision, Not the Model | The strongest individual model is not necessarily the strongest business decision system. |
| 10 | Systems Live Longer Than Their Builders | Systems must stay understandable, reproducible, changeable, operable, governable after the builder leaves. |
| 11 | Architecture Is Organizational Leadership | Architecture succeeds through shared understanding, ownership, trust, sequencing, communication, adoption — not diagrams. |
| 12 | The Architect's Final Horizon | The mature architect weighs delivery, value, risk, reversibility, ops, ownership, future change, and the cost of being wrong — combining all 11 prior lessons. |

**Build order (approval gates):** Docs+Design → **[GATE]** → Week 0 → **[GATE]** → Week 1 → **[GATE]** →
Weeks 2–12 plan → **[GATE]** → Weeks 2–12. Each gate is a separate, explicit human approval. A gate
never cascades: design approval ≠ Week 0 authorization; Week 0 ≠ Week 1; Week 1 ≠ Weeks 2–12.

---

## 4. The experience state machine (LOCKED — 24 states)

Persisted as `student_progress.state` on the `timeline_card_progress` row. Backend rejects illegal transitions.

```
not_started → arrival → request_viewed → first_decision_draft → first_decision_submitted
→ zoom_out_in_progress → zoom_out_complete
→ interview_part_1_in_progress → interview_part_1_complete
→ architecture_selected
→ consequence_in_progress → consequence_complete
→ interview_part_2_in_progress → interview_part_2_complete
→ rearchitecture_draft → rearchitecture_submitted
→ receipt_unlocked → adr_generated
→ project_transfer_in_progress → project_transfer_complete
→ evaluation_pending → evaluation_complete → completion_eligible → completed
                    ↘ evaluation_failed_retryable → (retry) → evaluation_pending
```

Must support: resume, retry, refresh, duplicate requests, network interruption, evaluation
interruption, returning days later, reopening completed work (read-only), revising where allowed,
and **no retroactive corruption of a `completed` record**. Draft states autosave but never count as completion.

---

## 5. Completion gates (LOCKED — ALL required, backend-authoritative)

A card is complete only when ALL hold, verified server-side (frontend validation is insufficient):

1. Initial decision submitted.
2. All required scenario stages traversed (state reached `consequence_complete`).
3. Consequence reveal viewed.
4. Every required Architect Interview question answered (Part 1 + Part 2).
5. Any chosen custom-answer option contains a **meaningful** (non-whitespace, min-length) response.
6. Revised architectural decision submitted.
7. ≥1 tradeoff explained.
8. ≥1 assumption identified.
9. ≥1 consequence / failure risk identified.
10. Final reflection submitted.
11. Architect Decision Record generated.
12. Experience successfully evaluated (AI eval returns a result; degraded path = `evaluation_pending`, NOT complete).
13. All progress saved.
14. Backend confirms completion eligibility (`completion_eligible` → `completed`).

Bypass resistance (all already guaranteed by the platform + our submit gate): unique
`(card_id, enrollment_id)` on `timeline_card_progress` + `findOrCreate`; append-only XP/evidence
ledgers keyed on `idempotency_key`; server-side re-check on every open/complete; reopening a
`completed` card returns early with no re-award. All completion operations idempotent.

---

## 6. Technical architecture (LOCKED — additive extension, minimal blast radius)

**Guiding rule:** extend the existing platform; do NOT invent a competing architecture.

### 6.1 Zero new DB tables for Week 0 (governance-minimal)
- **Per-card experience state** → existing `timeline_card_progress.student_progress` JSONB
  (unique `(card_id, enrollment_id)`). Holds `state`, `interview` (initial+revised per question),
  `decisions`, `assumptions`, `stakeholders`, `failure_modes`, `tradeoffs`, `evidence`, drafts,
  `evaluation`, timestamps, `scenario_version`, `prompt_version`. **No migration.**
- **Analytics / timing** → `timeline_card_progress.analytics` JSONB (stage dwell, retries).
- **Evidence pointers** → `timeline_card_progress.evidence` JSONB.
- **Architect Decision Record (ADR)** → `PortfolioArtifact` (`runtime_portfolio_artifacts`), new
  `kind: 'architecture_decision'`. Dedup one-per-card in the caller (like `runtimeService.ts:143`).
- **Mindset Ledger** → **derived projection**, computed on read by aggregating the enrollment's
  `architect_mindset` progress rows. **No new table.** (Materialized cache deferred; see DL-006.)
- **XP / evidence** → existing `XpEvent` + `EvidenceRecord` via `onCardCompleted` (idempotency_key).

### 6.2 The scenario is structured content, not free HTML
- The renderer consumes an `architect_scenario` JSON object (stages, request, zoom-out layers,
  interview questions w/ MC options + custom control, consequence branches, receipt, principle).
- Stored in `timeline_cards.metadata.architect_scenario` (mirrors how `assessmentService` caches
  questions in `card.metadata.assessment`).
- **Week 0:** hand-authored in the seed (Week 0 is null-blueprint — the free-preview tier).
- **Weeks 1–12:** generated by `ARCHITECT_MINDSET_GENERATION_PROMPT` against the injected WEEK
  CONTEXT, emitting the same structured JSON (validated on write). This proves reusability.
- This uses the platform's supported path (metadata/additive contract) — it does not fight the
  fixed 9-key runtime schema.

### 6.3 New code (the additive extension)
Backend:
- `services/timeline/typeRegistry.ts` — add the `architect_mindset` `D({...})` entry.
- `services/runtime/architectMindsetService.ts` (NEW) — modeled on `assessmentService.ts`:
  pure evaluation/scoring core (unit-testable) + I/O at edges; validates state transitions;
  runs AI evaluation; gates completion via `onCardCompleted`; emits the ADR artifact + evidence.
- `controllers/runtimeController.ts` (+ `routes/participantRoutes.ts`) — new endpoints (§7).
- `seeds/seedComponentAuthoring.ts` — add `THUMBNAIL_SLUGS` entry + full authored entry + Week 0 scenario.
- `seeds/seedWeekBlueprints.ts` / `data/weekBlueprints.ts` — Week 0 blueprint already exists ("Free AI Preview"); weeks 1–12 exist. No change required for Week 0.

Frontend (the bespoke renderer, wired into BOTH renderers + the tile):
- `components/timeline/TimelineCard.tsx` — add `architect_mindset` to the `BAND` map (+ a new
  `Kind`/gradient/icon if we want a distinct tile visual — proposed `kind: 'timemachine'`).
- `components/timeline/CardDetailBody.tsx` — `isArchitectMindset` flag + full-bleed dispatch arm +
  suppression guards + footer complete-gate.
- `pages/portal/runtime/RuntimeWorkspace.tsx` — the parallel wiring (flag + arm + complete gate);
  the full cinematic experience lives here (the drawer is orientation/entry/resume/summary only).
- `components/timeline/ArchitectTimeMachine.tsx` (NEW) — the bespoke renderer (drawer + workspace
  variants), fully self-styled (own `<style>` + own `--am-*` CSS vars, survey pattern), reduced-motion aware.
- `pages/portal/runtime/runtimeApi.ts` — typed client methods + hook for the new endpoints.

Tests:
- `typeRegistry.test.ts` — bump `CARD_TYPES.length` (51→52) + add `architect_mindset` to `SUPPORTED_RENDER_BANDS`.
- `curriculumFormatContract.test.ts` — auto-covers once `BAND` has the key.
- `seedComponentAuthoring.test.ts` — requires the `.jpg` on disk + `thumbnail_url` set.
- NEW: `architectMindsetScoring.test.ts` (pure scorer), `architectMindsetState.test.ts` (transitions),
  `architectMindsetCompletion.test.ts` (gate), plus an acceptance test modeled on `intelCurriculumTypes.test.ts`.

**No `ensure*Schema()` and no `sequelize.sync` needed for Week 0** (render_band is a free STRING(60);
`renderers` is JSONB; both columns exist). A dedicated table is only introduced later if the derived
ledger's query cost demands materialization — an additive follow-up, not a Week 0 dependency.

---

## 7. API surface (LOCKED — new participant routes, all `requireParticipant`)

All under `/api/portal/runtime/cards/:cardId/architect/*`, keyed on `req.participant.sub` = enrollment_id.

| Method | Path | Purpose |
|---|---|---|
| GET | `/architect/state` | Load scenario + saved `student_progress` (resume). |
| POST | `/architect/advance` | Validated state transition (autosave a stage: decision draft/submit, zoom-out seen, consequence seen). Idempotent. |
| POST | `/architect/interview` | Save interview answers (part 1 / part 2), initial + revised. Validates custom-answer non-empty. |
| POST | `/architect/evaluate` | Run AI evaluation → dimension scores + narrative; sets `evaluation_complete` or `evaluation_failed_retryable`. Idempotent per (card, enrollment, attempt). |
| POST | `/architect/complete` | Final gate: verifies all 14 gates → `onCardCompleted` → emit ADR + evidence + XP. Idempotent. |
| GET | `/architect/ledger` | Derived Mindset Ledger for the enrollment (cumulative). |

Completion still funnels through the platform's authoritative `onCardCompleted()`.

---

## 8. Experience Compression Model (LOCKED — ETHICS-GATED)

**Never claim a 25-minute experience gives thousands of hours of real employment experience.**
Every estimate is labeled: *Illustrative · Scenario-based · An estimate of patterns represented ·
Not employment experience earned · Not a guarantee of competence or job readiness.*

Curriculum estimation rubric (a communication device, **not** presented as scientific fact):

| Dimension | Represented hours |
|---|---|
| Major project cycle | 600 |
| Major incident | 120 |
| Distinct role perspective | 80 |
| Significant architectural tradeoff | 50 |
| Lifecycle stage | 100 |
| Major redesign | 400 |

**Experience Compression Ratio = patterns-represented hours ÷ lesson duration (hours).**
Example: 3,200 hrs ÷ (25/60) hr ≈ **7,680 : 1**. Always paired with: *"This represents patterns
studied, not employment experience earned."*

> **Reconciliation (DL-015):** the registered `est_minutes` is 28 (Weeks 1-12) / ~13 (Week 0). The
> 7,680:1 figure is an *illustrative example for a 25-minute lesson*; any ratio the UI displays is
> computed from the actual lesson duration. The ratio is a communication device, not a fixed constant.
> The Week 0 ~450h receipt is a curated illustrative figure, not a strict sum of the rubric constants
> (which reinforces the "illustrative, not scientific" stance).

- **Week 0 receipt:** 1 request · 8 roles · 10 info classes · 6 decision categories · 7 architectural
  concerns · 4 strategies · 12 hidden assumptions · 5 perspectives · 2 phases · **~450 collective
  project hours represented** · ~12–15 min in-experience.
- **Week 1 receipt:** discovery 700 · stakeholder 480 · failed-solution exposure 900 · workflow
  redesign 600 · operational measurement 520 · **~3,200 collective project hours represented.**

---

## 9. Architect Mindset Score (LOCKED — transparent, multi-dimensional)

Never a single opaque AI number. Dimensions (weights):

| Dimension | Weight |
|---|---|
| System scope recognition | 20% |
| Assumption discovery | 15% |
| Stakeholder awareness | 10% |
| Tradeoff quality | 15% |
| Failure anticipation | 15% |
| Evidence & observability | 10% |
| Governance & ownership | 10% |
| Decision communication | 5% |

Stages: 0–29 Feature Thinker · 30–49 System Explorer · 50–69 Tradeoff Thinker · 70–84 Architecture
Thinker · 85–94 Architecture Leader · 95–100 Systems Steward.

For every score show: dimension · evidence used · strength · gap · suggested improvement · change
from initial response · evaluation limitation/confidence. **Week 0 = baseline (unscored);
Week 1 = first formally scored lesson.**

> **Reconciliation (DL-012):** the **Architect Radar** is a 10-axis *comprehension* visual (big
> picture, boundaries, reliability, data, security, observability, AI governance, business, ownership,
> communication) that projects these 8 graded dimensions plus scenario-coverage signals. The 8-dimension
> weighted model above stays authoritative for the score; any radar axis not among the graded 8 is
> labeled illustrative. The registry `competencies` list (§2) is a third, separate taxonomy by design.

---

## 10. Prompt pipeline (LOCKED — 7 stages, all versioned)

Every prompt is versioned; the version used is stored on every completed experience
(`student_progress.prompt_version` + `scenario_version`).

1. **Design prompt** — defines the dream-like simulation, weekly scenario structure, professional tone, a11y/usability.
2. **Renderer prompt** — how content appears on all surfaces + responsive/state variants.
3. **Generation prompt** — against injected WEEK CONTEXT; emits the structured scenario JSON
   (scenario, non-trivial MC options + custom support, consequence branches, reflection questions, receipt).
4. **Evaluation prompt** — scores system-level reasoning; no jargon reward; assumes no single correct
   architecture; weighs evidence, assumptions, tradeoffs, failure anticipation, governance, communication.
5. **Reflection prompt** — drives the dream-like Architect Interview; plausible MC + custom; compares
   initial vs revised; non-manipulative, non-clinical.
6. **Improvement prompt** — improves future scenarios from aggregated, non-sensitive signals; never
   silently changes published behavior without versioning + approval.
7. **GitHub prompt** — only if a week later needs GitHub evidence; OFF by default (Week 0 `github_required: false`).

**Privacy:** store submitted explanations + structured decision evidence only. **Do NOT store
sensitive chain-of-thought.**

---

## 11. Design language (LOCKED)

- **Palette = Design-E** (`.tl-de`): `--berry #367895`, `--cherry #FB2832`, `--leaf #77BB4A`,
  `--amber #E8920C`; surfaces `#FFF / #F8F8F7 / #F1F1F0`; text `#1A1A1A / #2B2B2B / #6B6B6B`;
  Roboto / Roboto Mono; radii `8/12/16/24/pill`; `--ease cubic-bezier(.22,1,.36,1)`.
- The bespoke panel is **fully self-styled** (own `<style>` + `--am-*` vars) so it renders
  identically in the drawer (`.tl-de`) and workspace (`.rt`) — the survey pattern; do NOT borrow
  `--rt-*`/`--tld-*` tokens (the AssessmentPanel drawer-styling gap proves why).
- Cinematic dream layer: slow time-tunnel, faint moving blueprints, time dial (Before / After /
  Future Consequence), shifting interview room — but **motion never blocks reading**, honors
  `prefers-reduced-motion`, no excessive flashing, full keyboard access, mobile/tablet support,
  state never conveyed by color alone. Default light theme; support the optional dark theme.
- Reuse the unscoped `.ss-complete-btn` for the complete CTA (renders identically in both scopes).

---

## 12. Decision log seeds (expanded in `08-decision-log.md`)

- **DL-001** New `render_band 'architect_mindset'` + bespoke renderer (not a generic body): the
  cinematic interview needs JS/state the sandboxed `body_html` iframe cannot host. *Alt:* fake it in
  `body_html` — rejected (no JS; would substantially weaken the design, which the brief forbids).
- **DL-002** Per-card state in `timeline_card_progress.student_progress` (no new table for Week 0).
  *Alt:* dedicated `architect_mindset_sessions` table — deferred; adds schema + ensureSchema for no
  Week 0 benefit.
- **DL-003** Mindset Ledger = derived projection. *Alt:* materialized table — deferred (XpEvent
  "sum-the-log" philosophy; avoids a counter to keep in sync).
- **DL-004** Icon `bi-hourglass-split`, badge `bg-dark`. *Alt:* `bi-diagram-3` / `bi-compass`;
  `bg-info`. Chosen for the time motif + cinematic identity; white-on-dark passes AA.
- **DL-005** ADR = `PortfolioArtifact kind:'architecture_decision'`. *Alt:* the heavier
  `Artifact`/`ArtifactRelationship` graph — deferred; overkill for a per-card record.
- **DL-006** completion_rules `{on:'evaluate'}` declarative + enforced in `architectMindsetService`
  (platform does not generically dispatch on `on`, verified).
- **DL-011** `instructor_review: false` for Week 0/1 (AI-evaluated). Instructor spot-check is a later,
  additive option; decide during the Weeks 2–12 plan.
