# Architect Mindset / The Architect Time Machine: Implementation & Approval Plan

> **Conforms to:** `00-canonical-decisions.md` (the single source of truth). Every identifier,
> config value, file path, API route, state, gate, dimension, and prompt stage below is taken from
> that file. If anything here appears to diverge, the canonical file wins and this document is
> corrected, never the reverse.
> **Status:** Phase 1 (Documentation + Design). No production code written.
> **DRI:** Ali Muwwakkil (ali@colaberry.com).

This plan governs how The Architect Time Machine is built. The core principle is that the build is
staged behind **four separate, explicit human approvals** so that no single decision commits the
program to more than it has proven. A gate never cascades. Design approval does not authorize the
Week 0 build. Week 0 approval does not authorize Week 1. Week 1 approval does not authorize Weeks
2 through 12.

---

## 1. The four hard approval gates

Each gate is a distinct human approval by the DRI (or a delegate the DRI names in writing). The agent
performs the work up to the gate, produces the exit deliverables, prints the exit line verbatim, and
then **STOPS**. Stopping means: no further build work, no speculative code for the next phase, no
partial scaffolding of the next phase. The agent may only answer questions and revise the current
phase deliverables until approval is granted.

### GATE A: Design approval (Documentation + the three visual surfaces)

- **Entry criteria:** Phase 1 opened. Canonical decisions locked in `00-canonical-decisions.md`. No
  production code exists.
- **Work performed:** Author the complete documentation set and build the three visual surface
  prototypes. No backend or runtime code ships in this phase; prototypes are visual and may be
  static or lightly interactive mockups, not the production renderer.
- **Exit deliverables:**
  - The seven documentation deliverables in `docs/architect-mindset/`: `00-canonical-decisions.md`
    (source of truth), the experience/design spec, the scenario and content model spec, the state
    machine and completion spec, the scoring, ledger and compression spec, the prompt pipeline spec,
    and this implementation and approval plan (`06-implementation-and-approval-plan.md`).
  - The decision log (`08-decision-log.md`), expanding the DL seeds in canonical §12.
  - The test plan (`07-test-plan.md`).
  - Three visual-surface prototypes (see canonical §11 and the build-curriculum-type all-perspectives
    rule): the **timeline tile/card**, the **right-side panel** (drawer), and the **full workspace**.
    Each shown in light theme, and the design language matches Design-E (canonical §11).
  - A design review (doc or session) that checks the three prototypes against Design-E tokens,
    WCAG 2.1 AA, reduced-motion behavior, and mobile/tablet/desktop layout.
- **Demonstration required:** Walk the DRI through the three prototypes across breakpoints, show the
  reduced-motion variant, and confirm no state is conveyed by color alone. Confirm the compression
  model wording (canonical §8) is labeled *illustrative*, not employment experience.
- **Exit line the agent must print, then STOP:**

  > DESIGN APPROVAL REQUIRED. The documentation set, the decision log, the test plan, and the three
  > visual-surface prototypes (timeline tile, right-side panel, full workspace) plus the design review
  > have been delivered. No production code has been written. Build order:
  > Docs+Design → [GATE] → Week 0 → [GATE] → Week 1 → [GATE] → Weeks 2-12 plan → [GATE] → Weeks 2-12.
  > Each gate is a separate, explicit human approval. A gate never cascades: design approval is not
  > Week 0 authorization; Week 0 is not Week 1; Week 1 is not Weeks 2-12. Approve the design to
  > authorize the Week 0 build only.

### GATE B: Week 0 approval (Week 0 built, tested, demonstrated; Week 1 NOT built)

- **Entry criteria:** GATE A approved in writing.
- **Work performed:** Build the entire Week 0 scope (section 2 below), run the Week 0 verification
  matrix (section 3), and produce the Week 0 demonstration report (section 4). Week 1 is not started.
  The reusable type, renderer, service, and state machine are built here; Week 0 is the first
  (hand-authored, null-blueprint) scenario instance riding on them.
- **Exit deliverables:** working Week 0 experience end to end (tile, drawer, workspace, interview,
  consequence reveal, receipt, baseline ledger, completion), passing tests, and the demonstration
  report with screenshots, test results, a runtime result, a cost estimate, and the approval checklist.
- **Demonstration required:** a real student run through Week 0 from `not_started` to `completed`,
  including a resume, a required-question rejection, an empty custom-answer rejection, and a completed
  reopen (read-only, no re-award). Show the derived baseline Mindset Ledger.
- **Exit line the agent must print, then STOP:**

  > WEEK 0 APPROVAL REQUIRED. Week 0 has been implemented, tested, and demonstrated. Week 1 has not
  > been built. Approve Week 0 to authorize the Week 1 build.

### GATE C: Week 1 approval (Week 1 built as a NEW scenario instance on the same reusable type)

- **Entry criteria:** GATE B approved in writing.
- **Work performed:** Build Week 1 (section 5 below) as a **new scenario instance on the same
  reusable type**, not a new type. Week 1 is the first formally scored lesson (canonical §9). It
  reuses the `architect_mindset` render band, the `ArchitectTimeMachine` renderer, the
  `architectMindsetService`, and the 24-state machine unchanged. Any genuinely new reusable behavior
  Week 1 needs is added to the shared framework (not forked per week) and covered by tests. Weeks 2
  through 12 are not started.
- **Exit deliverables:** working Week 1 experience, the formal Architect Mindset Score (eight
  weighted dimensions), ADR-001 as a `PortfolioArtifact kind:'architecture_decision'`, project
  transfer, before-vs-after comparison, passing tests, and a demonstration report.
- **Demonstration required:** a real student run through Week 1 producing a transparent multi-
  dimensional score with per-dimension evidence, strength, gap, and change-from-initial, plus the
  before-vs-after comparison and the transferred lesson on the student's personalized project.
- **Exit line the agent must print, then STOP:**

  > WEEK 1 APPROVAL REQUIRED. Week 1 has been implemented, tested, and demonstrated. Weeks 2-12 have
  > not been built. Approve Week 1 and the reusable framework before authorizing Weeks 2-12.

### GATE D: Weeks 2-12 plan approval, then build only after explicit approval

- **Entry criteria:** GATE C approved in writing.
- **Work performed (plan first, build second):** Produce the Weeks 2-12 production plan (section 6
  below). Do **not** build any of Weeks 2 through 12 until the plan itself is explicitly approved.
  After plan approval, build the weeks in sequence, each as a new scenario instance on the same
  reusable framework, each with its own tests and visual verification.
- **Exit deliverables (plan phase):** the complete per-week production plan for all eleven weeks
  (titles and principles are already locked in canonical §3), plus an identification of any week that
  needs genuinely new reusable behavior and how that behavior stays additive.
- **Demonstration required (plan phase):** a walkthrough of the plan showing that every week maps to
  the existing reusable framework and that no week silently reintroduces a new type or a competing
  architecture.
- **STOP behavior:** After presenting the Weeks 2-12 plan, STOP and request plan approval. Only after
  the plan is approved does the build proceed, and each shipped week still lands with its own tests,
  visual verification, and PROGRESS.md entry before the next week starts.

---

## 2. Week 0 build scope, mapped to files and routes

Every Week 0 scope item below is mapped to the specific files in canonical §6.3 and the API routes in
canonical §7. Files that do not yet exist on the working branch are created; existing platform files
are extended additively.

| Scope item | Where it is built (canonical §6.3) | Route (canonical §7) |
|---|---|---|
| Durable curriculum-type component definition | `services/timeline/typeRegistry.ts` `D({...})` entry for `architect_mindset`; `seeds/seedComponentAuthoring.ts` `COMPONENT_AUTHORING['architect_mindset']` full authored entry | n/a (registry + seed) |
| Week 0 scenario (hand-authored, null-blueprint) | `seeds/seedComponentAuthoring.ts` writes the hand-authored `architect_scenario` JSON to `timeline_cards.metadata.architect_scenario` (canonical §6.2, Week 0 is the free-preview tier) | `GET /architect/state` |
| Thumbnail | `/thumbnails/curriculum-types/architect_mindset.jpg` on disk + `architect_mindset` in `THUMBNAIL_SLUGS` + re-declared `thumbnail_url` (canonical §2 gotcha) | n/a |
| Right-side panel (drawer) | `components/timeline/ArchitectTimeMachine.tsx` (drawer variant) dispatched by `components/timeline/CardDetailBody.tsx` (`isArchitectMindset` arm) | `GET /architect/state` |
| Full workspace | `pages/portal/runtime/RuntimeWorkspace.tsx` wiring + `ArchitectTimeMachine.tsx` (workspace variant); the full cinematic experience lives in the workspace | `GET /architect/state` |
| Dream-like Architect Interview | `ArchitectTimeMachine.tsx` renders the interview stages from the scenario JSON | `POST /architect/interview` |
| Required MC questions | scenario JSON interview questions; server-side required-question check in `services/runtime/architectMindsetService.ts` | `POST /architect/interview` |
| Custom answers | renderer custom-answer control; non-empty, min-length validation in `architectMindsetService` | `POST /architect/interview` |
| Autosave | `architectMindsetService` persists to `timeline_card_progress.student_progress` JSONB (canonical §6.1); no migration | `POST /architect/advance`, `POST /architect/interview` |
| Backend validation | `architectMindsetService` validates every state transition and rejects illegal ones and empty custom answers | `POST /architect/advance`, `POST /architect/interview` |
| State machine (24 states) | `architectMindsetService` enforces the canonical §4 transition graph; `state` persisted on `student_progress` | all `/architect/*` |
| Consequence reveal | scenario JSON consequence branches rendered by `ArchitectTimeMachine.tsx`; state advances to `consequence_complete` | `POST /architect/advance` |
| Experience Receipt | `experience_receipt` output (canonical §2, §8) built by `architectMindsetService`, rendered on the receipt surface | `POST /architect/complete` |
| Architect Commitment | commitment step captured in the receipt/reflection stage of the renderer and persisted in `student_progress` | `POST /architect/interview` |
| Baseline Mindset Ledger | derived projection (canonical §6.1, DL-003) aggregating the enrollment's `architect_mindset` rows; Week 0 is baseline/unscored (canonical §9) | `GET /architect/ledger` |
| Completion enforcement | `architectMindsetService` verifies all 14 gates (canonical §5) then funnels through `onCardCompleted` (XP + evidence, idempotent) | `POST /architect/complete` |
| Runtime integration | `controllers/runtimeController.ts` + `routes/participantRoutes.ts` new endpoints; `pages/portal/runtime/runtimeApi.ts` typed client + hook | all `/architect/*` |
| Timeline integration | `components/timeline/TimelineCard.tsx` adds `architect_mindset` to the `BAND` map (+ proposed `kind:'timemachine'` tile visual) | n/a |
| Experience Studio preview | authored entry `approved:true`, `status:'ready'`; Runtime Preview renders Week 0 via the same renderer | `GET /architect/state` |
| Curriculum Composer compatibility | `approved:true` gates the Composer; the `typeRegistry` entry makes the type selectable | n/a |
| Renderer configuration | `architect_mindset` in `SUPPORTED_RENDER_BANDS` + `BAND` map; `render_band` is a free `STRING(60)`, `renderers` is JSONB, so no `ensure*Schema()`/`sequelize.sync` (canonical §6.3) | n/a |
| Responsive | `ArchitectTimeMachine.tsx` self-styled with `--am-*` vars (survey pattern), mobile/tablet/desktop | n/a |
| Accessibility | `ArchitectTimeMachine.tsx` reduced-motion aware, keyboard-navigable, aria-labeled, never color-only state (canonical §11) | n/a |
| Tests | `architectMindsetScoring.test.ts`, `architectMindsetState.test.ts`, `architectMindsetCompletion.test.ts`, plus `typeRegistry.test.ts` (51 to 52 + band), `curriculumFormatContract.test.ts`, `seedComponentAuthoring.test.ts`, and an acceptance test modeled on `intelCurriculumTypes.test.ts` | n/a |
| Visual verification | screenshot-review capture of the three surfaces (canonical §11, build-curriculum-type all-perspectives rule) | n/a |

**Governance note for Week 0:** zero new DB tables (canonical §6.1). The bespoke `render_band` is new
runtime behavior but additive; it introduces no schema change. This keeps the Week 0 blast radius local.

---

## 3. Week 0 verification matrix (states to test)

Every state below is exercised against the running Week 0 experience before the demonstration report
is written. See `07-test-plan.md` for the test-tier breakdown; this matrix is the acceptance checklist.

| # | State to verify | Expected behavior |
|---|---|---|
| 1 | New student (`not_started`) | Scenario loads; arrival stage; no prior progress; state begins at `not_started` then `arrival`. |
| 2 | Partial completion | Progress autosaves at each stage; state reflects the furthest legal stage; nothing marked complete. |
| 3 | Resume | Returning student re-enters at the saved state via `GET /architect/state`; no data loss. |
| 4 | Required unanswered question | Submit rejected with a clear, non-color-only error; state does not advance past the required stage. |
| 5 | Custom answer selected but empty | Rejected (non-whitespace, min-length rule, canonical §5.5); work preserved; user re-prompted. |
| 6 | Custom answer completed | Accepted; persisted to `student_progress.interview`; state advances. |
| 7 | Refresh | Client reload restores state from server; no duplicate progress, no lost drafts. |
| 8 | Duplicate submit | Idempotent; unique `(card_id, enrollment_id)` + idempotency key means no duplicate progress/XP/artifact. |
| 9 | Evaluation failure | Degraded AI path yields `evaluation_failed_retryable`; state is NOT `completed`; work preserved. |
| 10 | Evaluation retry | Retry funnels back to `evaluation_pending` then `evaluation_complete`; no duplicate side effects. |
| 11 | Completed experience reopening | Read-only; no re-award; `onCardCompleted` returns early; `completed` record uncorrupted (canonical §4, §5). |
| 12 | Mobile | Full experience usable; layout intact; keyboard/touch accessible. |
| 13 | Tablet | Full experience usable; layout intact. |
| 14 | Desktop | Full cinematic experience in the workspace. |
| 15 | Reduced motion | `prefers-reduced-motion` honored; motion never blocks reading; content fully available. |
| 16 | Light theme | Default; Design-E palette; AA contrast. |
| 17 | Dark theme | Optional dark theme supported; AA contrast preserved. |

---

## 4. Week 0 demonstration report contents

The demonstration report is the GATE B exit artifact. It must contain, in order:

1. **Component configuration**: the `typeRegistry` and `seedComponentAuthoring` values as shipped
   (slug, label, student_label, render_band, capabilities, outputs, thumbnail_url), confirming they
   match canonical §2.
2. **Prompt stages**: which of the seven versioned prompts (canonical §10) are active for Week 0 and
   the exact `prompt_version` + `scenario_version` recorded on the completed experience.
3. **Renderer surfaces**: the three surfaces (tile, drawer, workspace) and the receipt surface, with
   notes on the drawer being orientation/entry/resume/summary and the workspace hosting the full
   cinematic experience.
4. **Screenshots**: real captures (screenshot-review) of every surface across mobile, tablet, and
   desktop, plus reduced-motion and dark-theme variants.
5. **Test results**: the actual pass/fail output of the unit, integration, and contract tests, with
   the command used. No test is claimed as passing unless it was actually run.
6. **Runtime result**: a real end-to-end run from `not_started` to `completed`, including the
   evaluation result and the baseline (unscored) ledger.
7. **Cost estimate**: the per-completion AI evaluation cost estimate (model, token estimate, dollars).
8. **Completion verification**: evidence that all 14 completion gates (canonical §5) were enforced
   server-side, including a rejected bypass attempt.
9. **Accessibility verification**: WCAG 2.1 AA results: keyboard path, focus order, aria-live
   announcements, contrast, reduced motion, no color-only state.
10. **Known limitations**: anything deferred (for example the materialized ledger cache, DL-006) and
    any evaluation confidence caveats.
11. **Approval checklist**: a signed-off list mirroring the completion gates and the verification
    matrix, ending with the GATE B exit line.

---

## 5. Week 1 build scope and how it proves reusability

Week 1 is built as a **new scenario instance on the same reusable type**, not a new type. It reuses,
unchanged: the `architect_mindset` render band, `ArchitectTimeMachine.tsx`, `architectMindsetService`,
and the 24-state machine. The only Week-1-specific content is the scenario JSON (generated by
`ARCHITECT_MINDSET_GENERATION_PROMPT` against the injected Week 1 blueprint, then validated on write,
canonical §6.2). This is the reusability proof: a new lesson requires content, not a new architecture.

Week 1 scope (principle: *The Request Is Not the Requirement*, canonical §3):

- Initial chatbot request (the deceptively simple ask).
- Initial architecture response (the student's first, feature-level decision draft).
- 30-day outcome dashboard (the consequence surface showing what the naive solution produced).
- Stakeholder interview choices (MC + custom, dream-like interview, canonical §10 stage 5).
- Seven-problem reveal (the hidden system the request did not mention).
- Architecture options (plausible, non-trivial MC options).
- Custom architecture option (student-authored, validated non-empty, min-length).
- AI interviewer challenge (probes assumptions and tradeoffs; no jargon reward, canonical §10 stage 4).
- Six-week delivery challenge (a constraint that forces sequencing and reversibility thinking).
- Outcome Architecture (the revised, system-level decision).
- Before-vs-after comparison (initial vs revised, surfaced to the student).
- Formal Architect Mindset Score (the eight weighted dimensions to total to stage, canonical §9;
  Week 1 is the first formally scored lesson).
- Experience Receipt (canonical §8 Week 1 receipt: ~3,200 collective project hours represented,
  labeled illustrative).
- ADR-001 (a `PortfolioArtifact kind:'architecture_decision'`, deduped one-per-card, canonical §6.1,
  DL-005).
- Project transfer (the lesson applied to the student's personalized project, output `project_transfer`).
- Completion enforcement (all 14 gates, server-authoritative, funneled through `onCardCompleted`).
- Tests (extend the scoring/state/completion suites for the scored path; add a Week 1 acceptance test).
- Visual verification (all three surfaces, plus the score and before-vs-after chart).

**Reusability acceptance criterion:** if Week 1 required changing the render band, the renderer's
core, the service's core, or the state machine, that is a signal the framework is not yet reusable and
must be corrected before GATE C. New reusable behavior, if any, is added to the shared framework
(covered by tests), never forked per week.

---

## 6. Weeks 2-12 production plan requirements (produced at GATE D, not before)

The Weeks 2-12 plan is produced only after GATE C is approved, and the weeks are built only after the
plan itself is approved. Titles and principles are already locked (canonical §3). For **each** of
Weeks 2 through 12, the plan must specify:

- Per-week title and principle (from canonical §3).
- Scenario (the world the student enters).
- Deceptively-simple request (the surface ask).
- Hidden system (what the request did not mention).
- Stakeholders (the roles whose perspectives the interview surfaces).
- MC interview questions (plausible, non-trivial, canonical §10 stage 5).
- Custom-answer paths (validated non-empty, min-length).
- Architecture choices (the options the student weighs).
- Consequence simulation (the branch outcomes the reveal shows).
- Memorable statistic (the compression/receipt figure, labeled illustrative, canonical §8).
- Experience estimate (patterns-represented hours to the compression ratio, canonical §8).
- ADR (the `architecture_decision` artifact the week produces).
- Project-transfer exercise (how the lesson maps to the student's project).
- Evaluation criteria (which of the eight dimensions the week most exercises, canonical §9).
- Required evidence (what the student must submit).
- Estimated duration (against the 28-minute type default, canonical §2).
- Test cases (happy, failure, boundary, idempotency per week).

The plan must also state, for each week, **how the reusable Week 0-1 framework supports it** (same
band, renderer, service, state machine, generation prompt) and must **flag any week that needs
genuinely new reusable behavior**, with a note on how that behavior stays additive and shared rather
than forked per week.

---

## 7. Promotion & durability

Shipping this curriculum type means **committing** the following, after which prod boot re-applies the
seed on deploy (canonical §6.3 and the build-curriculum-type skill):

- `services/timeline/typeRegistry.ts` (the `architect_mindset` `D({...})` entry).
- `seeds/seedComponentAuthoring.ts` (the `COMPONENT_AUTHORING` entry, `THUMBNAIL_SLUGS` entry, and the
  Week 0 hand-authored scenario).
- The two frontend renderer files (`components/timeline/ArchitectTimeMachine.tsx` plus the wiring in
  `TimelineCard.tsx`/`CardDetailBody.tsx`/`RuntimeWorkspace.tsx`, and `runtimeApi.ts`).
- The thumbnail `.jpg` at `/thumbnails/curriculum-types/architect_mindset.jpg`.

Durability rules:

- Boot re-applies the seed on every prod deploy under `TIMELINE_ENGINE_ENABLED`; the type is durable
  because it is code and seed, not a one-off DB row.
- **Prod deploys after hours** (dev anytime); follow the prod deploy command sequence (push
  origin/main first, verify the tree is clean and `HEAD == origin/main`, then
  `docker compose -f docker-compose.production.yml up -d --build backend`).
- Validate on the dev instance with the dev-exec pattern:
  `ssh root@95.216.199.47 "docker exec accelerator-dev-backend <command>"` for generate/preview and
  test runs, before any prod deploy.
- **No manual production DB changes.** Week 0 needs none (zero new tables, canonical §6.1). The type is
  installed by the seed at boot, not by hand-editing prod tables.

---

## 8. Governance & risk register

**CLAUDE.md governance boundaries this feature touches:**

- **New `render_band 'architect_mindset'` = new runtime behavior, additive** (DL-001). It adds a
  bespoke renderer band because the cinematic interview needs JS/state the sandboxed `body_html`
  iframe cannot host. This is additive and reversible (the band is a free `STRING(60)`), so it is an
  implementation decision, not a schema redesign. No escalation required for the band itself.
- **No schema change for Week 0.** Per-card state rides `timeline_card_progress.student_progress`
  JSONB; the ADR is a `PortfolioArtifact`; the ledger is a derived projection (canonical §6.1). Zero
  new tables means no `ensure*Schema()` and no `sequelize.sync`. A materialized ledger table is a
  deferred, additive follow-up (DL-006), and introducing it later would be its own governed change.
- **Large, multi-week feature gated by human approvals.** The full 13-part series is a large feature,
  which is precisely why it is decomposed behind the four hard gates in section 1. No single approval
  authorizes more than one phase. This satisfies the CLAUDE.md rule that large multi-week work is
  staged and human-approved rather than built in one autonomous sweep.

**Idempotency obligations (CLAUDE.md non-negotiable):**

- `POST /architect/advance`, `/interview`, `/evaluate`, and `/complete` are all idempotent. Progress
  is keyed by unique `(card_id, enrollment_id)` on `timeline_card_progress` with `findOrCreate`;
  XP/evidence ledgers are append-only, keyed on `idempotency_key`; the ADR is deduped one-per-card in
  the caller. Reopening a `completed` card returns early with no re-award. Running any operation twice
  produces the same end state.

**Failure-first obligations (CLAUDE.md):**

- Every external boundary (the AI evaluation call) has an explicit timeout, a capped retry, and a
  documented degraded path: evaluation failure yields `evaluation_failed_retryable` and the card
  stays not-complete (`evaluation_pending` on the degraded read), never a silent completion. The
  failure path is designed before the happy path, and each break found in the BREAK phase lands with a
  test in the HARDEN phase.

**PROGRESS.md hard gate (CLAUDE.md, enforced now):**

- Every change that touches `/backend`, `/frontend`, or `/scripts` also updates `PROGRESS.md` with the
  entry format (task, Date, Session ID, What changed, Verification evidence, Notes) and regenerates the
  per-session HTML changelog. No change is "done" without a PROGRESS.md entry carrying verification
  evidence and the session's ID. This applies per change, at every gate, not once at the end.
