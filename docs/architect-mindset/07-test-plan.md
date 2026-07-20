# Architect Mindset / The Architect Time Machine: Test Plan

> **Conforms to:** `00-canonical-decisions.md` (source of truth) and
> `06-implementation-and-approval-plan.md`. Every state, gate, dimension, route, and file named below
> is taken from those documents. Test investment is proportional to risk. This plan references real
> repo test files so new tests mirror existing, proven patterns.
> **DRI:** Ali Muwwakkil (ali@colaberry.com).

---

## 1. Test pyramid target and risk tier

Target distribution (CLAUDE.md Test Strategy Framework):

| Tier | Target share | What lives here for this feature |
|---|---|---|
| Unit | ~70% | State transitions, completion eligibility, required-question validation, custom-answer validation, experience-estimate math, the eight-dimension score, receipt/ADR builders, idempotency and normalization. Pure functions, no I/O. |
| Integration | ~20% | Curriculum-type create/update, seed idempotency, renderer backfill, Runtime Preview, week-blueprint injection (Week 0 null-blueprint path), progress save/resume, interview submission, evaluation, artifact creation, completion, timeline and workspace rendering. |
| End-to-end | ~10% | A real student run through Week 0 (and later Week 1) across surfaces and breakpoints, captured for the demonstration report. |

**Risk tier: medium-high.** This feature performs AI evaluation (non-deterministic external boundary),
enforces completion (gates XP, evidence, and progression), and produces a portfolio artifact
(the ADR). Per CLAUDE.md risk-based prioritization, medium-high blast radius warrants unit +
integration + failure-injection + accessibility + visual coverage. The pyramid must not invert; push
assertions down to unit tests wherever the logic is pure (scoring, state, completion, estimation).

---

## 2. UNIT tests (~70%)

Pure logic, no I/O, fast and deterministic. **Model on**
`backend/src/services/runtime/__tests__/assessmentScoring.test.ts` (pure functions, no I/O).

**New test files:**

- **`architectMindsetScoring.test.ts`**
  - Score calculation: the eight weighted dimensions (System scope recognition 20%, Assumption
    discovery 15%, Stakeholder awareness 10%, Tradeoff quality 15%, Failure anticipation 15%, Evidence
    & observability 10%, Governance & ownership 10%, Decision communication 5%, canonical §9) combine
    to a total, and the total maps to the correct stage (0-29 Feature Thinker, 30-49 System Explorer,
    50-69 Tradeoff Thinker, 70-84 Architecture Thinker, 85-94 Architecture Leader, 95-100 Systems
    Steward). Test each stage boundary (off-by-one at 29/30, 49/50, 69/70, 84/85, 94/95).
  - Weights sum to 100%; a missing dimension does not silently zero the total without flagging.
  - Delta from initial to revised response is computed and surfaced per dimension.
  - Experience-estimate calculation: patterns-represented hours to compression ratio (canonical §8;
    for example 3,200 hrs / (25/60) hr to ~7,680:1), and the estimate always carries the illustrative
    qualification string, never a bare number.
  - Experience Receipt creation: the receipt output object is built with patterns/perspectives
    represented, the illustrative estimate, and the qualification (canonical §2 outputs, §8).
- **`architectMindsetState.test.ts`**
  - State transitions: every legal edge in the 24-state graph (canonical §4) is accepted; every
    illegal transition is rejected.
  - Draft states autosave but never satisfy completion.
  - Retry path: `evaluation_failed_retryable` to `evaluation_pending` is legal; a `completed` record
    cannot transition backward (no retroactive corruption).
  - Answer normalization: whitespace-trimmed, canonicalized answers; empty-response rejection.
- **`architectMindsetCompletion.test.ts`**
  - Completion eligibility: the card is `completion_eligible` only when all 14 gates hold (canonical
    §5); removing any single gate must fail eligibility.
  - Required-questions validation: every required interview question (Part 1 + Part 2) answered.
  - Custom-response validation: reject empty and whitespace-only; enforce minimum length (canonical
    §5.5); accept a meaningful response.
  - Prompt-version association: the `prompt_version` and `scenario_version` are recorded on the
    completed experience (canonical §10).
  - Idempotency: computing eligibility or building the ADR twice yields the same result and never
    doubles an artifact, XP, or progress record (idempotency key).
  - ADR creation: a well-formed `architecture_decision` record is produced once per card.

These are pure-function tests with no database, no HTTP, and no AI call (evaluation output is a fixture).

---

## 3. INTEGRATION tests (~20%)

Service-level tests against the dev sandbox DB and mocked AI. **Extend or mirror these existing
contract tests** rather than writing parallel ones:

- **`typeRegistry.test.ts`**: bump `CARD_TYPES.length` from **51 to 52** and add `architect_mindset`
  to `SUPPORTED_RENDER_BANDS`. This is the registry contract for the new type and band.
- **`curriculumFormatContract.test.ts`**: **auto-covers** the new type once the `BAND` map has the
  `architect_mindset` key; run it to confirm the format contract holds with no extra assertions needed.
- **`seedComponentAuthoring.test.ts`**: requires the thumbnail `.jpg` present on disk at
  `/thumbnails/curriculum-types/architect_mindset.jpg` and `thumbnail_url` set on the authored entry
  (the spread-override gotcha in canonical §2). This test catches a type that ships with no banner.
- **`intelCurriculumTypes.test.ts`**: the **template** for a reusable-generator acceptance test:
  model a Week 1 acceptance test on it that generates the scenario JSON against the injected Week 1
  blueprint and validates the emitted structure (scenario, MC options with custom support, consequence
  branches, reflection questions, receipt).

**Additional integration coverage (new, mirroring the above patterns):**

- Curriculum-type creation/update by slug is idempotent (create-or-update, no duplicate row).
- Seed re-execution idempotency: running `seedComponentAuthoring` twice produces the same end state
  (boot re-applies on deploy, so this must be safe).
- Renderer backfill: existing cards pick up the new band without corruption.
- Runtime Preview renders Week 0 through the same renderer as production.
- Week-blueprint injection: the Week 0 **null-blueprint** path (free-preview tier, canonical §6.2)
  loads the hand-authored scenario; the Week 1 path loads the generated scenario.
- Progress save (`POST /architect/advance`, `/interview`) persists to `student_progress` JSONB.
- Resume (`GET /architect/state`) restores the saved state exactly.
- Interview submission validates required and custom answers server-side.
- Evaluation (`POST /architect/evaluate`) returns dimension scores and sets the correct state.
- Artifact creation: `POST /architect/complete` emits exactly one ADR `PortfolioArtifact`.
- Completion funnels through `onCardCompleted` (XP + evidence, idempotent).
- Timeline rendering (tile) and workspace rendering (full experience) load without error.

---

## 4. FAILURE-injection tests (Failure-First)

Per CLAUDE.md Build-Break-Harden and Failure-First Design, each failure below is injected and the
graceful behavior is asserted. The common invariant: **work is preserved, the card does not falsely
complete, retries are safe, and idempotency keys prevent any duplicate artifact, progress row, or XP
award.**

| Injected failure | Expected graceful behavior |
|---|---|
| AI evaluation timeout | Explicit timeout fires; state to `evaluation_failed_retryable`; card NOT complete; work preserved; safe retry available. |
| Malformed AI output (wrong shape / not valid JSON) | Rejected at the contract boundary; treated as a retryable evaluation failure; no partial score persisted; no completion. |
| Duplicate request (same op twice within 1s) | Idempotent; unique `(card_id, enrollment_id)` + idempotency key; no duplicate progress/artifact/XP. |
| Out-of-order request (advance skipping a required stage) | Illegal transition rejected by the state machine; state unchanged; clear error. |
| Lost connection mid-submit | Autosaved draft survives; on reconnect, `GET /architect/state` restores the last legal state; no data loss. |
| Stale client (client state behind server) | Server is authoritative; the stale write is rejected or reconciled; no corruption of a `completed` record. |
| Partial artifact creation (ADR write fails after progress write) | No orphaned or duplicate artifact; the operation is safe to re-run; dedup one-per-card holds. |
| Evaluation failure (degraded AI path) | `evaluation_pending`, NOT `completed`; the student can retry; canonical §5 gate 12 enforced. |
| Database retry (transient DB error) | Operation retried within a capped bound; final state consistent; no double side effect. |
| Refresh during consequence simulation | State restored to the furthest legal stage; consequence reveal replays; no skipped gate. |
| Expired authentication mid-experience | Request rejected (auth boundary); work already autosaved is preserved; re-auth resumes cleanly. |
| Unauthorized enrollment access (another enrollment's card) | Rejected by `requireParticipant` keyed on `req.participant.sub`; no data leak, no cross-enrollment write. |

---

## 5. ACCESSIBILITY tests (WCAG 2.1 AA)

Per CLAUDE.md and canonical §11 (state never conveyed by color alone, motion never blocks reading).
Use the fixing-accessibility skill for the audit.

- Keyboard navigation: the entire experience (arrival, decision, interview, custom answer, consequence,
  receipt, complete) is operable without a mouse.
- Focus order: logical, following reading order across the drawer and the workspace.
- Screen-reader labeling: every control, MC option, and custom-answer field has an accessible name.
- Modal/drawer focus trap and restore: focus is trapped inside the drawer while open and restored to
  the invoking element on close.
- Reduced motion: `prefers-reduced-motion` disables the cinematic motion; all content remains available.
- Color contrast: Design-E palette meets AA for text and UI (including `bg-dark` badge white text and
  both light and dark themes).
- Error messages: validation errors (required question, empty custom answer) are announced, not just
  colored.
- Required-state announcements: `aria-live` announces required and error states.
- Chart text equivalents: the before-vs-after comparison and any score chart have a text/table
  equivalent.
- Never state-by-color-only: completion, lock, error, and progress states carry a text or icon signal
  in addition to color.

---

## 6. VISUAL tests (capture + inspect)

Use the repo **screenshot-review** pattern (safe-width capture, per-stop review doc). Capture real
rendered surfaces (not CSS mockups) and inspect each:

- Thumbnail (`/thumbnails/curriculum-types/architect_mindset.jpg`).
- Timeline card (tile, proposed `kind:'timemachine'` visual).
- Right-side panel (drawer variant: orientation/entry/resume/summary).
- Workspace (full cinematic experience).
- Initial decision stage.
- MC question stage.
- Custom answer control.
- Validation error state.
- Consequence reveal.
- Before-vs-after chart (Week 1 onward).
- Experience Receipt (with the illustrative qualification visible).
- Completed state (read-only reopen, no re-award).
- Mobile, tablet, desktop breakpoints.

Capture the reduced-motion and dark-theme variants as part of the accessibility evidence in the
demonstration report (`06`, section 4).

---

## 7. Commands to run (the repo's real gates)

- **Backend type check:** `tsc --noEmit` in `/backend` must pass.
- **Frontend type check:** the frontend typecheck is **authoritative per CI** (the Frontend typecheck
  check on `main`). It must pass.
- **Jest:** run the unit and contract tests. **Note:** the component/blueprint tests are NOT in the CI
  allowlist, so run them **locally or via dev-exec** (`ssh root@95.216.199.47 "docker exec
  accelerator-dev-backend <jest command>"`). Do not assume CI ran them.
- **Dev-exec generate/preview:** validate the type end to end on the dev instance
  (`docker exec accelerator-dev-backend <generate/preview command>`) before any prod deploy; prod
  deploys after hours.

**Rule:** do not claim a test passed unless it was actually run and its output observed. A test named
in a report but not executed is not evidence.

---

## 8. Definition of Done per phase

A phase (Design, Week 0, Week 1, each of Weeks 2-12) is done only when ALL hold:

- Tests exist and pass at the layer minimum for the risk tier (unit + integration + failure-injection
  for this medium-high feature; happy + failure + boundary + idempotency per feature).
- `tsc --noEmit` clean (backend) and frontend typecheck clean (authoritative).
- **PROGRESS.md updated** with the entry format, verification evidence on the same line, and the
  **Session ID** stamped; the per-session HTML changelog regenerated.
- No secrets introduced (no tokens/keys in source, logs, or errors).
- Idempotency proven (the same operation twice yields the same end state, demonstrated by a test).
- Accessibility verified (WCAG 2.1 AA checklist in section 5 satisfied and captured).
- No unresolved governance boundary crossed; if one is, it is escalated per CLAUDE.md, not silently
  passed.

A feature with only happy-path coverage does not satisfy Definition of Done.
