# Technical Architecture — The Architect Time Machine (`architect_mindset`)

> Conforms to `00-canonical-decisions.md`. Verified against `origin/main` (worktree inspection,
> 2026-07-20, commit `badf491e`). Every file reference below is to `main`, not the current feature
> branch. **Build prerequisite:** the Curriculum Type subsystem (`typeRegistry.ts`,
> `services/runtime/*`, `seedComponentAuthoring.ts`, `CardDetailBody.tsx`, `RuntimeWorkspace.tsx`)
> lives on `main`. All build phases (Gate B onward) must run on a branch cut from `main`, or the
> "extend existing file" mappings will not resolve.

Governing principle (from the brief and CLAUDE.md): **extend the existing platform, do not invent a
competing architecture.** This is an additive extension: one new curriculum type, one new
`render_band`, one bespoke renderer wired into the two existing renderers, one new backend service
modeled on an existing one, and reuse of the existing progress/completion/artifact/XP machinery.
**No new database table and no schema migration are required for Week 0.**

---

## 1. Existing components reused (nothing is rebuilt)

| Concern | Reused asset (on `main`) | How |
|---|---|---|
| Per-student per-card state | `TimelineCardProgress` (`timeline_card_progress`), unique `(card_id, enrollment_id)`, JSONB `student_progress`/`evidence`/`analytics` | Store the entire experience state machine + interview answers + decisions in `student_progress`. Zero schema change. `models/TimelineCardProgress.ts` |
| Card definition | `TimelineCard` (`timeline_cards`), freeform `metadata` JSONB | Cache the structured `architect_scenario` in `metadata.architect_scenario` (mirrors `assessmentService` caching questions in `metadata.assessment`) |
| Type registry | `services/timeline/typeRegistry.ts` (`CardTypeDef`, `D({...})`, 51 types) | Add one `D({slug:'architect_mindset', render_band:'architect_mindset', ...})` entry |
| Boot seeding | `typeSeeder.seedCurriculumTypeDefinitions()` + `seeds/seedComponentAuthoring.ts` (gated `TIMELINE_ENGINE_ENABLED`) | Registry metadata + authored prompt/thumbnail/contracts re-asserted idempotently every boot |
| Backend-authoritative completion | `onCardCompleted()` `services/progression/progressionService.ts:65` | Our submit service calls it after gate checks; it re-checks locks, writes `completed`, awards idempotent XP/evidence |
| Scored-experience reference | `services/runtime/assessmentService.ts` | Template for: cache questions on card, pure scorer, gate completion on evaluation, answer-leak control |
| AI content generation | `services/timeline/cardContentService.ts` + `blueprintContext.getBlueprintContext()` | Weeks 1-12 scenario generation against injected WEEK CONTEXT (Week 0 is null-blueprint) |
| Portfolio artifact (ADR) | `PortfolioArtifact` (`runtime_portfolio_artifacts`), `portfolioService.generateArtifact()` | New `kind:'architecture_decision'`; dedup one-per-card in the caller (`runtimeService.ts:143`) |
| Idempotent XP / evidence | `XpEvent` + `EvidenceRecord` (both unique `idempotency_key`) via the progression engine | Awarded once through `onCardCompleted`; re-completion awards zero |
| Runtime open + readiness | `services/runtime/runtimeService.ts`, `runtimeApi.ts`, `RuntimeWorkspace.tsx` | Open endpoint returns the card + progress; workspace hosts the experience |
| Drawer + Studio preview | `components/timeline/CardDetailBody.tsx`, `studio/StudentPreview.tsx` | The drawer surface; Studio preview renders it for free once the band branch exists |
| Tile | `components/timeline/TimelineCard.tsx` (`BAND` map) | The classroom tile visual for the new band |

---

## 2. New components (the additive extension)

### Backend
- **`services/timeline/typeRegistry.ts`** — new `architect_mindset` entry (config in canonical §2).
- **`services/runtime/architectMindsetService.ts`** (NEW) — the experience engine. Modeled on
  `assessmentService.ts`. Responsibilities:
  - `getState(enrollmentId, cardId)` — resolve/create the `TimelineCardProgress` row
    (`findOrCreate`, like `runtimeService.openCard:80`), load `metadata.architect_scenario`, return
    scenario + saved `student_progress` for resume.
  - `advance(enrollmentId, cardId, {to, payload})` — validate the state transition against the LOCKED
    24-state graph (pure function `nextState(from,event)`), autosave `payload` into `student_progress`.
    Idempotent (re-sending the same transition is a no-op).
  - `saveInterview(...)` — persist Part 1 / Part 2 answers; validate custom-answer non-empty.
  - `evaluate(...)` — run the AI evaluation prompt, parse to dimension scores, apply the **pure**
    `scoreMindset(evidence)` core (unit-testable, no I/O), persist to `student_progress.evaluation`;
    set `evaluation_complete` or `evaluation_failed_retryable` on failure.
  - `complete(...)` — verify all 14 gates server-side, then call `onCardCompleted`, emit the ADR
    `PortfolioArtifact`, and (for `evidence_required`) the evidence record via the progression engine.
- **`controllers/runtimeController.ts`** (+ `routes/participantRoutes.ts`) — 6 new handlers (canonical §7).
- **`seeds/seedComponentAuthoring.ts`** — `THUMBNAIL_SLUGS` entry + full `COMPONENT_AUTHORING`
  entry + the hand-authored Week 0 `architect_scenario`.

### Frontend
- **`components/timeline/TimelineCard.tsx`** — add `architect_mindset` to the `BAND` map (proposed
  `kind:'timemachine'`, plus a `Kind`/gradient/icon extension for a distinct tile; the `Kind` union
  is defined in `CardDetailBody.tsx:47`).
- **`components/timeline/ArchitectTimeMachine.tsx`** (NEW) — the bespoke renderer, `variant:'drawer'|'workspace'`.
  Fully self-styled (own `<style>` + `--am-*` CSS vars, the `CardSurveyExperience` pattern) so it
  renders identically in `.tl-de` (drawer) and `.rt` (workspace). Reduced-motion aware.
- **`components/timeline/CardDetailBody.tsx`** — `isArchitectMindset` flag (near `:194`) + a
  full-bleed dispatch arm (after `:267`, `variant="drawer"`) + suppression guards on the generic
  About/Lesson blocks + the footer complete-gate.
- **`pages/portal/runtime/RuntimeWorkspace.tsx`** — the parallel wiring: `isArchitectMindset` flag,
  the `<main>` render arm (`variant="workspace"`, the full experience), the complete gate. **This is
  the most easily forgotten step** (a band wired only in the drawer renders blank in the workspace).
- **`pages/portal/runtime/runtimeApi.ts`** — typed client methods + a hook for the 6 endpoints.

### Tests (see `07-test-plan.md`)
- Extend: `typeRegistry.test.ts` (`CARD_TYPES.length` 51 → 52; add `architect_mindset` to
  `SUPPORTED_RENDER_BANDS`), `curriculumFormatContract.test.ts` (auto-covers once `BAND` has the key),
  `seedComponentAuthoring.test.ts` (requires the `.jpg` on disk + `thumbnail_url`).
- New: `architectMindsetScoring.test.ts`, `architectMindsetState.test.ts`,
  `architectMindsetCompletion.test.ts` (pure functions, no I/O, modeled on `assessmentScoring.test.ts`),
  plus a `intelCurriculumTypes.test.ts`-style acceptance test for the authored entry.

---

## 3. Data model

### 3.1 The state object (in `timeline_card_progress.student_progress`, JSONB)
No migration. One row per `(card_id, enrollment_id)`.

```jsonc
{
  "state": "consequence_complete",          // one of the 24 LOCKED states
  "scenario_version": "wk0.v1",
  "prompt_version": { "generation":"g.v1","evaluation":"e.v1","reflection":"r.v1" },
  "first_decision": { "choice_id":"ask_more", "custom":null, "reasoning":"...", "at":"ISO" },
  "revised_decision": { "choice_id":"redesign", "custom":null, "at":"ISO" },
  "interview": {
    "q1": { "week":0, "initial_choice":"tools", "initial_custom":null,
            "revised_choice":"outcome", "revised_custom":null, "explanation":"...",
            "answered_at":"ISO", "revised_at":"ISO", "scenario_state":"interview_part_1_complete",
            "decision_ids":["d1"], "eval":{...}, "valid":true }
    // ... one per required question
  },
  "assumptions": ["single trusted source", "..."],
  "stakeholders": ["HR","Legal","..."],
  "failure_modes": ["confident wrong answer, no abstention"],
  "tradeoffs": ["slower demo for a governable system"],
  "evidence": ["which doc version an answer came from"],
  "project_transfer": { "assumed_solution":"...", "outcome":"..." },
  "commitment": "Before I build, I will always ...",
  "evaluation": { "dimensions":{...}, "total":47, "stage":"System Explorer",
                  "delta_from_initial":{...}, "limitation":"...", "at":"ISO" },
  "receipt": { "roles":8, "info_classes":10, "hidden_assumptions":12, "represented_hours":450 },
  "timestamps": { "started_at":"ISO", "last_saved_at":"ISO", "completed_at":null },
  "retry_count": 0
}
```
**Privacy (canonical §10):** store the submitted `explanation` + structured decision evidence only.
**Never** store sensitive chain-of-thought. `analytics` (separate JSONB) holds per-stage dwell +
retries; `evidence` (separate JSONB) holds evidence pointers.

### 3.2 The scenario object (in `timeline_cards.metadata.architect_scenario`, JSONB)
The renderer's data contract. Week 0 hand-authored in the seed; Weeks 1-12 generated (§5).

```jsonc
{
  "version":"wk0.v1", "week":0, "principle":"An architect sees the entire system...",
  "request": { "from":"sponsor", "text":"Build an AI assistant that answers..." },
  "initial_system": ["employee","AI assistant","company documents"],
  "first_decision_options": [ {"id":"model","label":"Choose the AI model"}, ... , {"id":"else","label":"I would do something else","custom":true} ],
  "zoom_out": { "people":[...8], "information":[...10], "decisions":[...6], "operations":[...] },
  "signature_reveals": ["The request contained one user...", ...],
  "interview_part_1": [ { "id":"q1", "text":"What did you focus on...", "mode":"single",
      "options":[ {"id":"tools","label":"..."}, ... {"id":"custom","label":"I see it differently","custom":true} ] }, ... ],
  "architecture_options": [ ... , {"id":"custom","label":"Propose my own","custom":true} ],
  "consequence": { "horizon":[{"point":"First audit","risk":86,"note":"..."}], "reveal":"..." },
  "interview_part_2": [ ... ],
  "receipt": { "counts":{...}, "represented_hours":450, "qualification":"Illustrative and scenario-based..." },
  "adr_template": { "fields":["context","decision","assumption","consequence","tradeoff","owner"] },
  "project_transfer": { "questions":["What solution have you already assumed?", ...] }
}
```
Validated on write (a Zod/`assert` schema in `architectMindsetService`), so a malformed generated
scenario never reaches a student (fail loud in dev, log + fall back in prod, per CLAUDE.md).

### 3.3 The ADR — `PortfolioArtifact`
`kind:'architecture_decision'`, `content` = the structured record from `student_progress`. Dedup
one-per-card in the caller (`findOne` before insert, `runtimeService.ts:143`). No new table.

### 3.4 The Mindset Ledger — derived, no table
Computed on read by aggregating the enrollment's `architect_mindset` progress rows
(`GET /architect/ledger`): lessons completed, decisions recorded, assumptions discovered, failure
modes examined, perspectives encountered, cumulative represented exposure, and per-dimension growth.
Follows the `XpEvent` "sum the log, do not keep a counter" philosophy — nothing to keep in sync, and
idempotent by construction. A materialized cache table is an explicit later option (DL-003) only if
query cost demands it; it is **not** a Week 0 dependency.

---

## 4. API contracts (new participant routes)

All under `/api/portal/runtime/cards/:cardId/architect/*`, `requireParticipant`
(`req.participant.sub` = `enrollment_id`). Typed request/response shapes live in `runtimeApi.ts`.

| Method · path | Request | Response | Notes |
|---|---|---|---|
| `GET /architect/state` | — | `{ scenario, progress, ledger_snapshot }` | Resume. Creates the progress row on first open. |
| `POST /architect/advance` | `{ from, to, payload }` | `{ state, saved:true }` | Validated transition; autosave; idempotent (same `to` twice = no-op). Illegal transition → `422 invalid_transition`. |
| `POST /architect/interview` | `{ part, answers[] }` | `{ saved:true, validation }` | Rejects custom-selected-but-empty → `422 custom_answer_required`. |
| `POST /architect/evaluate` | `{ attempt }` | `{ dimensions, total, stage, delta, limitation }` or `{ status:'pending' }` | AI eval; on failure sets `evaluation_failed_retryable`, returns pending, preserves work. Idempotent per `(card,enrollment,attempt)`. |
| `POST /architect/complete` | — | `{ outcome, artifact, readiness }` | Verifies all 14 gates, then `onCardCompleted`, emit ADR + evidence. `423 card_locked` / `422 gate_unmet` on failure. Idempotent. |
| `GET /architect/ledger` | — | derived ledger | Cumulative across the enrollment's architect_mindset cards. |

Errors follow the platform's typed-HTTP-error convention (`Object.assign(new Error,{status,code})`
consumed by the shared `fail()` in `runtimeController.ts:21`).

---

## 5. Generation pipeline (Weeks 1-12) — proves reusability

`architectMindsetService.ensureScenario(cardId)` (modeled on `assessmentService.ensureQuestions` +
`cardContentService.generateCardContent`):
1. If `metadata.architect_scenario` exists and is fresh, return it (idempotent hot path).
2. Else resolve the type's `generation_prompt`, prepend `getBlueprintContext(programId, week)` (the
   WEEK CONTEXT block; returns `null` for Week 0 — the free-preview tier), call the model with
   `response_format: json_object`, parse to the `architect_scenario` schema, **validate**, persist to
   `metadata.architect_scenario` with a `scenario_version`.
3. Week 0's scenario is authored in the seed and never generated (null-blueprint), which is why Week 0
   and Weeks 1-12 share the same renderer and service but differ only in data. This is the reusability
   proof required at Gate C.

The `generation_prompt` is written **against "the WEEK CONTEXT above"** (never `{{blueprint.*}}`);
only `variables` flow through `{{...}}`, and this type has `inputs: []` / `variable_keys: []`.

---

## 6. State machine & completion enforcement

- **State machine:** the 24 LOCKED states (canonical §4) as a pure `nextState(from, event)` transition
  table in `architectMindsetService`. The backend is the sole authority: every `advance`/`interview`/
  `evaluate`/`complete` call re-derives validity from the persisted state; illegal transitions are
  rejected (`422`). A `completed` record is immutable (reopen is read-only; no re-award).
- **Completion (backend-authoritative):** `complete()` verifies all 14 gates against
  `student_progress` (not the client), then delegates to the platform's `onCardCompleted()`. Because
  `completion_rules.{on}` is declarative and **not** generically enforced by the engine (verified:
  the engine only reads `completion_rules.video_watched`), the 14-gate check is **coded in our submit
  path**, exactly as `assessmentService` gates completion on the 70% eval threshold.
- **Bypass resistance:** unique `(card_id, enrollment_id)` + `findOrCreate` (no duplicate progress /
  double-complete on refresh/reopen/double-POST); server-side gate re-check on every complete; XP /
  evidence keyed by `idempotency_key` (re-completion awards zero); a locked card is rejected `423`.

---

## 7. Autosave, failure recovery, idempotency (Failure-First)

- **Autosave:** every `advance`/`interview` call persists a draft to `student_progress` and stamps
  `last_saved_at`. Drafts **never** count as completion.
- **AI evaluation failure:** `evaluate()` degrades gracefully — preserve the student's work, set
  `evaluation_failed_retryable`, surface "evaluation pending", do **not** mark complete, allow a safe
  retry that does not duplicate artifacts/progress/XP (`retry_count++`, idempotency keys unchanged).
  A deterministic rule-based fallback score is available (mirrors `architectEvaluationAgent`'s
  fallback and `portfolioService`'s try/catch fallback) so completion is never blocked solely by an AI outage.
- **External-boundary discipline (CLAUDE.md):** every model call has an explicit timeout + capped
  retries; failures log `error_class` + context with secrets redacted; no silent `catch {}`.
- **Idempotency guarantees:** transition replay is a no-op; `evaluate` is idempotent per attempt;
  `complete` is idempotent; ADR insert is dedup'd one-per-card; XP/evidence are ledger-keyed.

---

## 8. Analytics (canonical §16, privacy-respecting)

Tracked in `student_progress` + `analytics` (no new PII): enrollment, program, cohort, week, card,
component/scenario/prompt versions, state, initial/revised decisions, interview responses + custom
responses, assumptions/stakeholders/failure-modes/alternatives/tradeoffs/evidence, dimension scores +
total + delta, receipt values, ADR reference, project-transfer artifact, started/last-saved/completed
times, retry count. Answers the product questions (where students stop; which assumptions are missed;
which perspectives overlooked; which answers change after consequence; which dimensions improve/stay
weak; stage durations; custom-answer rate; whether options are too predictable). **No unnecessary
sensitive personal data; no chain-of-thought.**

---

## 9. Render-band wiring (the format contract)

`architect_mindset` is a **free `STRING(60)`** `render_band` — data, not schema. The wiring:

1. `typeRegistry.ts` (backend) declares the band on the type → cards get stamped with it.
2. `TimelineCard.tsx` `BAND` map gets the key (else `curriculumFormatContract.test.ts` fails — the
   enforced tripwire that keeps the two renderers in sync).
3. `CardDetailBody.tsx` (drawer + Studio preview) + `RuntimeWorkspace.tsx` (workspace) each branch on
   the band to `ArchitectTimeMachine` (drawer = orientation/entry/resume/summary; workspace = the full
   cinematic experience). The renderer is fully self-styled so the `.tl-de` vs `.rt` scope difference
   does not matter (the survey pattern; avoids the AssessmentPanel drawer-styling gap).

No `ensure*Schema()` and no `sequelize.sync` — `render_band` and `renderers` columns already exist.

---

## 10. Security & privacy

- **AuthZ:** every `architect/*` route is `requireParticipant` and scoped to the caller's
  `enrollment_id`; a card belonging to another enrollment is rejected (unauthorized enrollment access
  is a required failure test).
- **Input validation:** request bodies validated (Zod/schema) at the route boundary; the generated
  `architect_scenario` validated before persistence; custom answers validated non-empty/min-length.
- **No secrets in logs; redact model keys.** Model responses never leak raw into student-facing
  surfaces (parse + validate first).
- **Privacy:** submitted explanations + structured decision evidence only; no chain-of-thought;
  analytics carries no unnecessary PII.

---

## 11. Promotion & durability (shipping = committing code, not a DB write)

Shipping `architect_mindset` = committing, then deploying (boot re-applies to the prod DB under
`TIMELINE_ENGINE_ENABLED=true`):
1. `services/timeline/typeRegistry.ts` (registry entry).
2. `seeds/seedComponentAuthoring.ts` (authored entry + Week 0 scenario + `THUMBNAIL_SLUGS`).
3. `components/timeline/ArchitectTimeMachine.tsx` + the two renderer edits + the tile edit + `runtimeApi.ts`.
4. `services/runtime/architectMindsetService.ts` + controller/route edits.
5. `frontend/public/thumbnails/curriculum-types/architect_mindset.jpg` (generated via the host pipeline).
6. The test edits/additions.

A DB edit via the Studio API is dev-local and unpromoted; the boot seeders are what reach prod. **No
manual production DB changes.** Validate on dev via the `ssh root@... docker exec -i
accelerator-dev-backend node < script.js` pattern (DB `accelerator_dev1`). Prod deploys after hours.

---

## 12. Documented gaps / genuinely-new behavior (additive, flagged)

Per the brief ("if a requirement needs a genuinely new renderer or runtime behavior, document the gap
and implement it as an additive extension"):

- **New `render_band` + bespoke renderer** — genuinely new *visual/interactive* behavior (the
  cinematic interview cannot live in the sandboxed, JS-free `body_html`). Implemented as an additive
  renderer branch + component, exactly like the Self Study reader and Setup Lab shipped as code.
- **New backend experience service** — additive service + routes; reuses the completion/artifact/XP
  engine. No change to existing routes' behavior.
- **Everything else is data** (type row, scenario, prompts, thumbnail). No schema change, no new table,
  for Week 0. The only future table candidate is a materialized Mindset Ledger cache (DL-003),
  introduced later only if needed, via the `ensure*Schema()` raw-DDL pattern (never `sequelize.sync`).
