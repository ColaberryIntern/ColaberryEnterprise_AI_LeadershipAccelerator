# The Architect Time Machine: Experience Design Specification

> **Status:** Phase 1 (Documentation + Design). No production code written. Awaiting design approval.
> **Session:** CC-20260720-am03 · **Date:** 2026-07-20 · **DRI:** Ali Muwwakkil (ali@colaberry.com)
> **Conformance:** This document conforms to and never overrides `00-canonical-decisions.md`. Every
> identifier, state name, gate, dimension, weight, and label used here traces back to the canonical
> file. Where the canonical file pins a value, this file cites it and does not restate it differently.
> If a conflict is ever found, the canonical file wins and this file is corrected.

---

## 0. Purpose and scope

This is the experience-design specification for the student-facing experience named **Architect Time
Machine** (internal / admin name **Architect Mindset**, slug `architect_mindset`, immutable per
canonical §1). It defines what the student sees, hears, feels, and does; what the system captures at
each moment; and how the experience maps onto the locked 24-state machine (canonical §4) and the 14
completion gates (canonical §5).

It does not define implementation code, database migrations, or API bodies. Those live in the
technical sections of the canonical file (§6, §7) and in the build docs that follow the approval
gates. This document is the design contract that the bespoke renderer
(`components/timeline/ArchitectTimeMachine.tsx`, canonical §6.3) and the runtime workspace must
satisfy.

The core promise to the student, drawn from the canonical tagline: *Gain the lessons experience
usually teaches too late.* The experience must earn that promise without ever overstating it (the
ethics gate in canonical §8 governs every claim of represented experience).

---

## 1. The dream-like Time Machine experience

### 1.1 The central feeling

The reflection must never feel like a form, a quiz, or a worksheet. The student is not completing an
assignment; the student has stepped into the **Architect Time Machine** and is being interviewed
after returning from an architectural future. An intelligent presence, the **Architect Interviewer**,
appears to already know the past, present, and future consequences of the decision the student is
about to make. The student's job is to answer honestly, watch the consequences unfold across time,
and then reconstruct their own earlier thinking with new sight.

The intended emotional register, in order of priority:

1. **Reflective.** The student thinks harder about their own reasoning than they would in a form.
2. **Intelligent.** The interviewer feels knowledgeable and specific, never generic or cute.
3. **Cinematic and slightly surreal.** The setting is dream-like and memorable, but it stays
   professional and calm. It is Bloomberg-meets-a-lucid-dream, not a theme-park ride.
4. **Mysterious.** The interviewer seems to know more than it says, revealing consequences on its own
   schedule rather than dumping information.
5. **Memorable.** A student should be able to describe the experience to a colleague a week later.

The experience must remain consistent with the existing Colaberry platform (Design-E palette, Roboto
type, calm enterprise surfaces per canonical §11). The dream layer is atmosphere, not a costume: it
must feel like a natural, premium extension of the platform, not a separate app bolted on.

### 1.2 The setting: the machine and the interview room

The student experiences a single continuous space that shifts as time moves. The space has these
recurring visual elements, all subordinate to legibility:

- **A slowly moving tunnel of systems.** In the deep background, a gentle, low-contrast tunnel of
  system diagrams, decisions, and timelines drifts toward or past the student, suggesting travel
  through architectural time. It moves slowly enough to read comfortably over.
- **Faint architectural blueprints in motion.** Behind the interview room, translucent blueprints
  (component boxes, data flows, boundary lines) drift and re-draw themselves at low opacity. They
  imply that a system is being designed around the conversation.
- **A shifting interview room.** The foreground is a calm, softly lit room. Its lighting and depth
  shift as the interview progresses and as consequences are revealed, but the room never rearranges
  in a way that disorients the reader.
- **A table surrounded by stakeholder representations.** During the System Zoom-Out and interview,
  faint seated figures or labeled presences appear around a table, representing the users, owners,
  and roles the student did or did not consider. They are quiet, abstract, and respectful (never
  caricatures).
- **Past and future versions of the system behind the interviewer.** As time advances, ghosted
  versions of the system (the version at first build, the version under load, the version after
  failure) layer behind the interviewer to signal where in time the student currently stands.
- **A memory reconstruction of earlier choices.** During the Dream Reconstruction step, the student's
  own earlier decision is re-assembled visually: what they considered is drawn in solid form, and
  what was invisible to them appears as it fades into view.
- **Soft lighting that changes as consequences are revealed.** Light warms or cools subtly to mark
  transitions (before decision, after decision, future consequence) without flashing or strobing.
- **A time dial.** A persistent, quiet control shows the current position in time across three marked
  states: **Before Decision**, **After Decision**, **Future Consequence**. The dial is both an
  orientation device and a progress indicator. It advances as the experience advances and can be
  read by a screen reader as a labeled status.
- **Floating questions.** Interview questions arrive as calm, legible cards that settle into a fixed,
  readable position rather than drifting while the student is trying to read or answer them.
- **Subtle motion and depth.** Parallax and depth are used sparingly to make the space feel real.
  Motion is always in service of orientation, never decoration for its own sake.

### 1.3 What the dream layer must never do

The atmosphere is bounded by hard rules so it never becomes a gimmick or an accessibility failure:

- Motion never occurs on top of text the student is actively reading or answering. When a question is
  live, its immediate surroundings are calm.
- No excessive flashing, strobing, or rapid contrast changes. Nothing on screen flashes more than
  three times per second under any circumstance.
- No motion that competes with comprehension. Background motion is low-contrast, slow, and pausable.
- The experience is never childish, cartoonish, or sci-fi-kitsch. It is serious, premium, and adult,
  appropriate to enterprise executives aged 35 to 60 (the platform's target audience).

### 1.4 Accessibility rules (binding, not aspirational)

The dream layer is a progressive enhancement over a fully usable, fully legible base experience. The
base experience must work with all motion removed.

- **Reduced motion.** When `prefers-reduced-motion: reduce` is set, all ambient motion (tunnel,
  blueprints, parallax, lighting transitions) is disabled or reduced to a single, near-instant
  cross-fade. The time dial still updates its labeled state; it simply does not animate. No
  information is ever conveyed only through motion.
- **No flashing.** As above, nothing flashes faster than three times per second, and the design
  avoids large high-contrast flashes entirely.
- **Motion never blocks reading.** Every question, option, and consequence remains fully readable
  while any permitted motion continues, and the student can pause ambient motion at any time.
- **Full keyboard accessibility.** Every control (options, custom-answer fields, follow-up fields,
  the time dial, navigation between steps, the complete CTA) is reachable and operable by keyboard in
  a logical tab order, with visible focus states and correct ARIA roles/labels. No interaction
  requires a pointer, hover, or drag.
- **Mobile and tablet support.** The full experience works on phone and tablet. On small screens the
  cinematic layers gracefully simplify (fewer depth layers, larger touch targets, single-column
  reading), and no content is lost. Charts and visuals reflow to fit and scroll within their own
  container rather than forcing the page to scroll sideways.
- **Contrast and color independence.** All text meets WCAG 2.1 AA contrast against its actual
  animated background (the design guarantees a legible plate behind text regardless of the moving
  layer beneath). State is never conveyed by color alone (icon, label, and text always accompany
  color, per canonical §11).

### 1.5 Core feeling, restated as the acceptance test

If a student describes the experience as "I filled out a reflection," the design has failed. If a
student describes it as "I was interviewed about a decision after seeing how it played out," the
design has succeeded. Every visual and interaction choice is judged against that sentence.

---

## 2. The Architect Interview (required)

### 2.1 The interview replaces the reflection

The reflection portion of the card is delivered as a **required Architect Interview**. It is not
optional and it is not skippable. The card cannot reach `completed` until every required interview
question (Part 1 and Part 2, canonical §4 and gate 4 in §5) has a valid answer. The interview is the
spine of the experience, not an add-on to it.

### 2.2 What every interview question provides

Each interview question is a small, self-contained interaction with the following elements. All ten
are required for every question:

1. **Three to five likely multiple-choice answers.** Each option is a plausible professional instinct
   (see §2.4). Options are ordered without implying that the first is "correct."
2. **Select the closest to your thinking.** The student is asked to choose the option nearest to what
   they actually thought, not the option they believe is the model answer.
3. **An "I see it differently / write my own answer" option.** Always present, always the final
   option, so the student is never forced into a box that does not fit their reasoning.
4. **A free-text field when custom is selected.** Choosing the custom option reveals a text field. The
   field is required and validated for a meaningful, non-whitespace, minimum-length response (canonical
   §5 gate 5).
5. **An optional follow-up explanation.** For any answer (canned or custom), the student may add a
   short explanation of why they chose it. This is optional and never blocks completion.
6. **Saved progress.** Answers autosave as the student works (via `POST /architect/interview`,
   canonical §7). Returning later restores every answer, including in-progress custom text.
7. **Validation before completion.** The system verifies every required question is answered and every
   selected-custom option has meaningful text before completion is allowed (backend-authoritative,
   canonical §5).
8. **Respectful feedback when incomplete.** If the student tries to advance or complete with a
   missing or empty-custom answer, the feedback is calm, specific, and non-punitive: it names which
   question needs attention and why, in the interviewer's voice, without scolding.
9. **An opportunity to revise after consequences are revealed.** Part 2 of the interview (after the
   Consequence Simulation and Dream Reconstruction) invites the student to revisit their initial
   answers with new sight. Revision is a first-class, expected act, not a correction of a mistake.
10. **A comparison of initial vs revised thinking.** The interface shows the student their initial
    answer beside their revised answer so the change (or the deliberate decision not to change) is
    visible and owned.

### 2.3 Single-answer vs multiple-answer questions

Some questions ask for the single closest instinct; others legitimately have several things a good
architect would hold at once. The interface must clearly communicate which applies for each question,
every time:

- **Single-answer questions** present options as radio-style choices. The label states plainly:
  "Choose the one closest to your thinking." Selecting the custom option deselects any canned option.
- **Multiple-answer questions** present options as checkbox-style choices. The label states plainly:
  "Select all that reflect your thinking." When custom is one of several selected, the custom text is
  still required and validated.
- The control style (single-select vs multi-select) is declared per question in the scenario JSON so
  the renderer never has to guess, and the affordance (radio vs checkbox), the instruction text, and
  the screen-reader announcement all agree. Ambiguity here is a defect: a student must never be unsure
  whether they may pick more than one.

### 2.4 What the choices must be (and must not be)

The multiple-choice options are the hardest part of the design to get right, and the canonical file is
explicit (§10 stage 3, §10 stage 4). The rules:

- Options are **plausible professional instincts.** A working practitioner could reasonably hold any
  of them. The distribution is realistic, not a trap.
- Options are **not** one obviously-correct answer surrounded by two absurd distractors. That pattern
  turns the interview into a spot-the-right-answer test and destroys reflection.
- The interview is **not a memorization test.** There is no fact to recall; there is a way of thinking
  to surface.
- The interview is **not a personality quiz.** It does not sort students into types or flatter them.
- The interview **never pretends a subjective architectural decision has one correct answer.** The
  evaluation (canonical §9, §10 stage 4) rewards evidence, assumptions, tradeoffs, failure
  anticipation, governance, and communication, not conformity to a single "right" architecture.

The design intent: after answering, a thoughtful student should feel that every option said something
true about how people actually approach the work, and that their choice revealed their own current
altitude of thinking rather than their ability to guess.

### 2.5 Worked example questions (from the brief)

These two questions are included verbatim as the reference standard for option quality. They
illustrate the "plausible instincts, no absurd distractors" bar for Part 1 (before the lesson) and
Part 2 (after consequences).

**Part 1 example: first framing of the request** (single-answer)

> *What did you focus on when you first received the request?*
>
> - I focused on how quickly I could build the requested feature.
> - I focused on which model, framework, and tools I would use.
> - I focused on understanding the users, data, decisions, risks, and owners around the feature.
> - I focused on clarifying the business outcome and how success would be measured.
> - I see it differently, let me write my own answer.

**Part 2 example: what was missed** (single-answer)

> *When the system failed, what was the most important thing you originally missed?*
>
> - I treated all users as though they had the same needs and permissions.
> - I trusted the available information without verifying ownership or authority.
> - I planned for the successful path but did not design the failure path.
> - I focused on technical delivery without defining business success.
> - I see it differently, let me write my own answer.

In both examples every canned option is a real way a competent person frames the work; none is a
throwaay. The custom option is always present as the final choice.

### 2.6 Fields saved per question (LOCKED, from the brief)

For every interview question, the system saves exactly the following fields. This list is locked and
must not be reduced or expanded without changing the canonical file first. It is persisted inside
`timeline_card_progress.student_progress.interview` (canonical §6.1).

| Field | Meaning |
|---|---|
| Question identifier | Stable ID for the question (used to align initial vs revised, and analytics). |
| Week | The week the question belongs to. |
| Initial selected answer | The canned option(s) chosen in Part 1 (or the marker that custom was chosen). |
| Initial custom response | The Part 1 free-text answer, when the custom option was selected. |
| Revised selected answer | The canned option(s) chosen in Part 2. |
| Revised custom response | The Part 2 free-text answer, when the custom option was selected. |
| Explanation | The optional follow-up explanation the student submitted. |
| Time answered | Timestamp of the initial answer. |
| Time revised | Timestamp of the revision. |
| Scenario state at time of answer | The state-machine state (canonical §4) the student was in when answering. |
| Relevant decision identifiers | The decision IDs this question is tied to (links interview to the ADR and scoring). |
| Evaluation result | The evaluation outcome tied to this question (dimension signals, not a raw model dump). |
| Completion validation state | Whether this question currently satisfies its completion requirement. |

### 2.7 Privacy rule for interview storage (LOCKED)

The system stores the **submitted explanation and structured decision evidence only.** It does
**not** store sensitive chain-of-thought (canonical §10, §6.1). Concretely: what the student typed
and submitted is saved; any intermediate model reasoning used to score or generate is not persisted
on the student record. The saved fields above are the complete inventory; nothing beyond them is
retained per question.

---

## 3. Required completion rules

### 3.1 The 14 gates (from canonical §5), backend-authoritative

A card is complete only when **all fourteen** of the following hold, verified server-side. Frontend
validation is a courtesy to the student and is never sufficient on its own; the backend re-checks
every gate on the `POST /architect/complete` call (canonical §7).

1. Initial decision submitted.
2. All required scenario stages traversed (state reached `consequence_complete`).
3. Consequence reveal viewed.
4. Every required Architect Interview question answered (Part 1 and Part 2).
5. Any chosen custom-answer option contains a meaningful (non-whitespace, minimum-length) response.
6. Revised architectural decision submitted.
7. At least one tradeoff explained.
8. At least one assumption identified.
9. At least one consequence or failure risk identified.
10. Final reflection submitted.
11. Architect Decision Record generated.
12. Experience successfully evaluated (AI evaluation returns a result; a degraded path is
    `evaluation_pending`, which is not complete).
13. All progress saved.
14. Backend confirms completion eligibility (`completion_eligible` transitions to `completed`).

The frontend mirrors these gates in the footer complete-gate so the student always knows what remains,
but the authoritative decision belongs to the submit service (canonical §6.3, `architectMindsetService`).

### 3.2 Bypass prevention

The experience must resist every plausible attempt to reach `completed` without genuinely completing
it. Each vector below has a defined defense; all defenses are enforced on the backend.

- **Direct API calls.** The complete endpoint re-verifies all 14 gates against persisted state; a
  hand-crafted request that skips stages fails because the persisted `state` and evidence are not
  present. State transitions are validated (canonical §4: the backend rejects illegal transitions).
- **Refresh mid-experience.** State is persisted per stage via `POST /architect/advance` and
  `/architect/interview`; a refresh resumes from the persisted state (canonical §4 must support
  resume, refresh), it never resets progress to a completable shortcut.
- **Navigation away and back.** Same as refresh: the durable state is the source of truth, not
  in-memory UI state.
- **Reopening a completed card.** Reopening returns the record read-only and re-awards nothing
  (canonical §5 bypass resistance: reopening a `completed` card returns early with no re-award). There
  is no retroactive corruption of a completed record (canonical §4).
- **Skipping stages.** The state machine only allows the legal forward transitions in canonical §4;
  jumping from an early state directly to `completion_eligible` is not a permitted transition and is
  rejected.
- **Empty or whitespace answers.** Gate 5 requires meaningful, non-whitespace, minimum-length text for
  any selected custom option; whitespace-only submissions fail validation both client-side and
  server-side.
- **Custom option chosen without text.** Selecting "I see it differently" without providing text does
  not satisfy the question; the gate treats it as unanswered.
- **Stale or incomplete state.** The backend recomputes eligibility from current persisted evidence on
  every complete attempt; a stale client that believes it is done cannot force completion if the
  persisted state disagrees.

### 3.3 Autosave versus completion

Drafts autosave continuously so the student never loses work, but **a draft never counts as
completion.** The draft states in the state machine (for example `first_decision_draft`,
`rearchitecture_draft`) autosave and are fully recoverable, yet they satisfy no completion gate on
their own (canonical §4: draft states autosave but never count as completion). Completion requires the
corresponding submitted state plus all other gates.

### 3.4 Graceful failure of AI evaluation

The AI evaluation (gate 12) can fail or degrade (timeout, upstream error, malformed result). When it
does, the experience must fail safely, per the platform's Failure-First rules and canonical §4/§5:

- **Preserve the student's work.** Nothing the student submitted is lost. All interview answers,
  decisions, assumptions, tradeoffs, and reflections remain persisted.
- **Show "evaluation pending."** The student sees a calm, honest state: the experience is being
  evaluated and will finish shortly. The design never fakes a score.
- **Do not mark complete.** A degraded evaluation sets `evaluation_failed_retryable` (canonical §4)
  and the card stays `evaluation_pending` in meaning; it is explicitly not `completed` (gate 12).
- **Allow safe retry without duplication.** Retrying the evaluation (`POST /architect/evaluate`,
  idempotent per card, enrollment, and attempt, canonical §7) does not duplicate artifacts, XP, or
  progress events. The retry resumes toward `evaluation_pending` then `evaluation_complete` cleanly.
- **All completion operations are idempotent.** Running complete twice yields the same end state with
  no second award (canonical §5: unique `(card_id, enrollment_id)`, append-only ledgers keyed on
  `idempotency_key`, early return on an already-completed card).

The four Failure-First questions are answered explicitly for the evaluation boundary: if it fails, the
student sees an honest pending state and their work is preserved; it retries on demand with a capped,
non-duplicating retry; if retries are exhausted the card remains safely re-runnable and the condition
is observable for triage; the handled failure modes are timeout, upstream error, and malformed result,
while a genuinely corrupt persisted state is surfaced rather than silently completed.

---

## 4. The 16-step experience flow

The experience is a single continuous journey of sixteen steps. Each step below states what the
student sees and does, what the system captures, and the state-machine state(s) it maps to
(cross-referenced to canonical §4). The states are the locked 24-state sequence; several steps span
more than one state (for example an in-progress state and its completion state).

**State sequence reference (canonical §4):** `not_started → arrival → request_viewed →
first_decision_draft → first_decision_submitted → zoom_out_in_progress → zoom_out_complete →
interview_part_1_in_progress → interview_part_1_complete → architecture_selected →
consequence_in_progress → consequence_complete → interview_part_2_in_progress →
interview_part_2_complete → rearchitecture_draft → rearchitecture_submitted → receipt_unlocked →
adr_generated → project_transfer_in_progress → project_transfer_complete → evaluation_pending →
evaluation_complete → completion_eligible → completed`, with the retry branch
`evaluation_failed_retryable → (retry) → evaluation_pending`.

### Step 1: Arrival

- **Student experience.** The student enters the machine. The tunnel of systems settles, the interview
  room resolves, and the time dial appears at **Before Decision**. The step names the week and its
  principle (canonical §3, for example Week 1: "The Request Is Not the Requirement") and shows the
  student's current **Mindset Ledger** so they arrive with a sense of accumulated progress.
- **System captures.** Entry timestamp, week, principle reference, scenario version, prompt version.
- **State(s):** `not_started → arrival`.

### Step 2: The Request

- **Student experience.** A deceptively simple request arrives, exactly as a real stakeholder would
  phrase it, with only the information initially available. Nothing hidden is shown yet. The request
  looks easy on purpose.
- **System captures.** That the request was viewed; dwell time on the request.
- **State(s):** `arrival → request_viewed`.

### Step 3: First Decision

- **Student experience.** Before any lesson, the student states how they would approach the request
  and why. This captures their instinct at its most honest, before the machine reveals anything. This
  is the "before" the entire experience will later reflect against.
- **System captures.** The initial decision text and reasoning (draft autosaves, then submit); this is
  gate 1. The draft state is recoverable but does not count as completion (canonical §4).
- **State(s):** `request_viewed → first_decision_draft → first_decision_submitted`.

### Step 4: System Zoom-Out

- **Student experience.** The machine zooms out from the feature to the whole system. It reveals what
  was invisible in the request: the real users and their differing permissions, the roles and owners,
  the connected systems, the data and its lifecycle, the dependencies and constraints, the risks. The
  faint blueprints resolve into a fuller picture; the table gains its stakeholders.
- **System captures.** That the zoom-out was traversed and which layers were revealed; dwell per
  layer (analytics JSONB, canonical §6.1).
- **State(s):** `first_decision_submitted → zoom_out_in_progress → zoom_out_complete`.

### Step 5: Architect Interview, Part One

- **Student experience.** The Architect Interviewer asks the required Part 1 questions (§2), each with
  plausible multiple-choice instincts plus the custom "I see it differently" option. This captures the
  student's initial mindset now that they have seen the system, but before consequences unfold.
- **System captures.** Per-question fields from §2.6 for the initial answers; this contributes to gate
  4 and gate 5.
- **State(s):** `zoom_out_complete → interview_part_1_in_progress → interview_part_1_complete`.

### Step 6: Decision

- **Student experience.** The student chooses an architectural approach from several genuinely
  plausible approaches and defends the choice. A custom approach is always allowed (the student can
  design their own). This is a real architectural commitment, not a multiple-choice trivia answer.
- **System captures.** The selected or custom approach and its defense; the relevant decision
  identifiers that will link to interview questions and the ADR.
- **State(s):** `interview_part_1_complete → architecture_selected`.

### Step 7: Consequence Simulation

- **Student experience.** Time advances. The time dial moves toward **Future Consequence** and the
  lighting shifts. The machine plays the decision forward across the consequence horizon: post-launch,
  growth, a failure, an audit, an ownership transition, a business change. The student watches the
  chosen approach meet reality. Past and future versions of the system layer behind the interviewer.
- **System captures.** Which consequence branches were shown and viewed (gate 3); dwell; the scenario
  branch identifiers.
- **State(s):** `architecture_selected → consequence_in_progress → consequence_complete`.

### Step 8: Dream Reconstruction

- **Student experience.** Inside the dream, the machine reconstructs the student's own earlier
  decision. It shows, side by side, what the student actually considered (drawn solid) against what
  was invisible to them at the time (fading into view). This is the emotional core: the student sees
  their past thinking with present sight.
- **System captures.** That the reconstruction was viewed; which invisible factors were surfaced for
  this student's path.
- **State(s):** within `consequence_complete` (the reconstruction is the reflective bridge between the
  consequence reveal and Part 2; it does not add a new locked state and must not be gated as one).

### Step 9: Architect Interview, Part Two

- **Student experience.** The interviewer asks what changed. Part 2 uses the same multiple-choice plus
  custom pattern, but now requires the student to point to evidence and tradeoff reasoning, not just a
  new preference. The student may revise Part 1 answers here; revision is expected.
- **System captures.** Per-question revised fields from §2.6; at least one tradeoff, one assumption,
  and one consequence/failure risk begin to accumulate here toward gates 7, 8, and 9.
- **State(s):** `consequence_complete → interview_part_2_in_progress → interview_part_2_complete`.

### Step 10: The Lesson Experience Usually Teaches

- **Student experience.** The machine states the week's principle plainly (canonical §3) and ties it
  directly to the consequences the student just watched. This is the payoff line: the lesson that real
  projects usually teach too late, delivered exactly when the student is primed to receive it.
- **System captures.** That the lesson was presented and acknowledged; the principle reference.
- **State(s):** within `interview_part_2_complete` (presentation step; not a separately gated locked
  state).

### Step 11: Re-Architecture

- **Student experience.** The student revises the design with new sight. The system requires either at
  least one changed decision, or a deliberately defended unchanged decision (a student who still
  believes their original design must say why it survives the consequences). This is a submitted
  artifact, not a draft.
- **System captures.** The revised architectural decision (gate 6); the draft autosaves and is
  recoverable but does not count as completion until submitted (canonical §4).
- **State(s):** `interview_part_2_complete → rearchitecture_draft → rearchitecture_submitted`.

### Step 12: Experience Receipt

- **Student experience.** The machine issues an **Experience Receipt** that summarizes the patterns and
  perspectives the scenario represented (requests, roles, information classes, decisions, architectural
  concerns, strategies, assumptions, perspectives, phases) with an illustrative estimate of represented
  hours. The receipt carries the mandatory qualification label in a prominent, unavoidable position.
- **System captures.** The `experience_receipt` output (canonical §2 outputs): patterns/perspectives
  represented, the illustrative estimate, and the qualification.
- **State(s):** `rearchitecture_submitted → receipt_unlocked`.

### Step 13: Architect Decision Record

- **Student experience.** The machine generates a structured, student-owned **Architect Decision
  Record (ADR)** capturing the request, the context, the options weighed, the decision, the tradeoffs,
  the assumptions, the failure modes considered, and the consequences examined. The student can read
  and keep it; it is portfolio-eligible (canonical §2).
- **System captures.** The `architect_decision_record` output persisted as a `PortfolioArtifact`
  (`kind: 'architecture_decision'`), deduplicated one-per-card (canonical §6.1, DL-005); this is gate
  11.
- **State(s):** `receipt_unlocked → adr_generated`.

### Step 14: Project Transfer

- **Student experience.** The lesson is applied to the student's own personalized project. The machine
  asks the student to carry the week's principle into their real project context: what would they now
  do differently in their own work. This is what turns a scenario lesson into transferable skill.
- **System captures.** The `project_transfer` output (lesson applied to the personalized project,
  canonical §2 outputs).
- **State(s):** `adr_generated → project_transfer_in_progress → project_transfer_complete`.

### Step 15: Mindset Ledger

- **Student experience.** The cumulative **Mindset Ledger** updates: lessons completed, decisions
  recorded, assumptions discovered, failure conditions examined, stakeholder perspectives encountered,
  cumulative estimated exposure, and mindset growth by dimension. The student sees themselves moving up
  the stages (Feature Thinker toward Systems Steward, canonical §9).
- **System captures.** The `mindset_ledger_delta` output; the ledger itself is a derived projection
  computed on read from the enrollment's `architect_mindset` rows (canonical §6.1, DL-003), so this
  step records the delta rather than mutating a stored counter.
- **State(s):** within the evaluation-and-completion tail; the ledger delta is presented as part of the
  scored result once evaluation completes.

### Step 16: Completion

- **Student experience.** The machine confirms the experience is complete. The student sees their
  transparent, multi-dimensional score (never a single opaque number, canonical §9), their stage, and
  the change from their initial response. The time dial rests, the room settles, and the experience
  closes with the sense of a journey finished.
- **System captures.** The AI evaluation runs (`POST /architect/evaluate`), producing dimension scores
  and narrative and setting `evaluation_complete` (or `evaluation_failed_retryable` on a degraded run,
  §3.4). The backend then verifies all 14 gates and, only if all pass, transitions
  `completion_eligible → completed`, funneling through the platform's authoritative `onCardCompleted()`
  to emit ADR, evidence, and XP idempotently (canonical §5, §6.1, §7).
- **State(s):** `project_transfer_complete → evaluation_pending → evaluation_complete →
  completion_eligible → completed`, with the retry branch `evaluation_failed_retryable → (retry) →
  evaluation_pending` when evaluation degrades.

---

## 5. Before-and-after reflection, Experience Receipt, and Mindset Ledger

### 5.1 Initial vs revised comparison UI

The comparison is a core deliverable of the experience, not a footnote. It is presented as a calm,
two-column reflection (single-column stacked on small screens), aligned by question identifier so the
student's initial and revised answers sit beside each other:

- **Left: "How you first saw it."** The Part 1 selected answer(s) and any initial custom text.
- **Right: "How you see it now."** The Part 2 revised answer(s) and any revised custom text.
- **The change, made explicit.** When an answer changed, the shift is labeled clearly ("You moved from
  focusing on delivery speed to focusing on the users and owners around the feature"). When an answer
  did not change, the student's defense of the unchanged position is shown, so an unchanged answer
  still reads as a deliberate, examined choice rather than an oversight.
- **Evidence and tradeoff attached.** Because Part 2 requires evidence and tradeoff reasoning (§2, step
  9), the comparison surfaces the reasoning that justified the change or the persistence.
- The comparison never frames the initial answer as a failure. The framing is growth: the student
  returned from an architectural future with more sight. Tone follows canonical §10 stage 5:
  non-manipulative, non-clinical.

### 5.2 Experience Receipt contents and the qualification label

The Experience Receipt (step 12, output `experience_receipt`) contains:

- **Patterns and perspectives represented.** The counts the scenario embodied, for example (Week 0
  reference, canonical §8): 1 request, 8 roles, 10 information classes, 6 decision categories, 7
  architectural concerns, 4 strategies, 12 hidden assumptions, 5 perspectives, 2 phases.
- **An illustrative estimate of represented hours.** Computed from the curriculum estimation rubric
  (canonical §8), for example roughly 450 collective project hours represented for Week 0, or roughly
  3,200 for Week 1. The receipt may show the Experience Compression Ratio (represented hours divided by
  lesson duration in hours) as an illustrative figure only.
- **The mandatory qualification label.** Placed prominently and unavoidably with the estimate (directly
  adjacent, same visual block, never hidden behind a tooltip or below the fold), reading:
  *Illustrative · Scenario-based · An estimate of patterns represented · Not employment experience
  earned · Not a guarantee of competence or job readiness.* Every estimate is paired with the
  canonical statement: *"This represents patterns studied, not employment experience earned."*

This is an ethics gate (canonical §8): the experience must never claim that a roughly 25-minute
session confers thousands of hours of real employment experience. The qualification is not optional
copy; it is a required, load-bearing part of the receipt and must be present wherever a represented-hours
figure appears.

### 5.3 Mindset Ledger contents

The Mindset Ledger (step 15) is the cumulative, cross-week record of the student's growth, derived on
read from all of the enrollment's `architect_mindset` rows (canonical §6.1). It shows:

- **Lessons completed.** How many weekly experiences the student has finished (Week 0 is baseline and
  unscored; Week 1 is the first formally scored lesson, canonical §9).
- **Decisions recorded.** The count of Architect Decision Records the student owns.
- **Assumptions discovered.** The cumulative count of assumptions the student surfaced.
- **Failure conditions examined.** The cumulative count of failure and consequence risks the student
  identified.
- **Stakeholder perspectives encountered.** The distinct roles and owners the student engaged across
  weeks.
- **Cumulative estimated exposure.** The running illustrative represented-hours total, always carrying
  the same qualification label as the receipt (§5.2). It is never presented as earned experience.
- **Mindset growth by dimension.** Progress across the eight scored dimensions and their weights
  (canonical §9: System scope recognition 20%, Assumption discovery 15%, Stakeholder awareness 10%,
  Tradeoff quality 15%, Failure anticipation 15%, Evidence and observability 10%, Governance and
  ownership 10%, Decision communication 5%), and the student's current stage on the scale from Feature
  Thinker to Systems Steward.

---

## 6. Required visuals (comprehension aids, text-equivalent required)

The visuals below are comprehension aids, not decoration. Each one exists to help the student
understand something they could not grasp as quickly from text alone. Every visual has a mandatory
text equivalent so the information is fully available without seeing the graphic.

Global rules for all visuals (binding, from canonical §11 and the platform accessibility rules):

- Readable in the **right-side panel** (drawer variant) **and** in the **workspace** (full-bleed
  variant). The same data renders correctly in both scopes.
- **Text equivalent required.** Every chart ships with an equivalent table or labeled list conveying
  the same values, reachable by keyboard and readable by screen reader.
- **Responsive.** Charts reflow to the available width and scroll within their own container; they
  never force the page to scroll horizontally.
- **No misleading scales.** Axes start where they should, proportions are honest, and no visual
  exaggerates a change.
- **Estimates clearly identified.** Any figure that is illustrative (represented hours, compression
  ratio, projected exposure) is labeled as an estimate, consistent with the ethics gate (canonical §8).
- **Light theme by default, optional dark theme supported.** Both themes meet WCAG 2.1 AA contrast.
- **Never convey state by color alone.** Color is always paired with a label, icon, pattern, or text
  (canonical §11).

### 6.1 System Zoom-Out

A layered visualization that starts at the single requested feature and expands outward to the full
system: users and permissions, roles and owners, connected systems, data and its lifecycle,
dependencies, constraints, and risks. It is the visual spine of step 4. **Text equivalent:** a nested
list naming each revealed layer and its elements.

### 6.2 Before vs After

A paired visualization of the student's initial design against their re-architected design, aligned so
the changes are obvious. It supports the comparison UI in §5.1. **Text equivalent:** a two-column
table (initial vs revised) with the change described in words for each item.

### 6.3 Architect Radar (10 axes)

A radar/spider chart across ten architectural axes: **big-picture, boundary design, reliability, data
stewardship, security, observability, AI governance, business alignment, ownership, communication.** It
gives the student an at-a-glance profile of where their thinking is strong and where it is thin.

The Radar is a comprehension visualization of architectural competencies; it is **not** the
authoritative score. The authoritative Architect Mindset Score remains the eight-dimension model in
canonical §9. The Radar's ten axes are a finer-grained architectural projection of those eight scored
dimensions plus scenario-coverage signals: for example big-picture maps from System scope recognition;
observability from Evidence and observability; ownership from Governance and ownership; communication
from Decision communication; and reliability from Failure anticipation; while boundary design, data
stewardship, security, AI governance, and business alignment are derived, illustrative axes drawn from
the same evidence and from which scenario concerns the student engaged. Any Radar axis that is not one
of the eight scored dimensions is labeled illustrative so the student never mistakes the Radar for the
graded result. **Text equivalent:** a labeled list of all ten axes with each value and a one-line
strength/gap note, and a clear pointer to the canonical eight-dimension score as the graded figure.

### 6.4 Experience Mountain

A cumulative visualization of represented hours climbed across weeks, shown as a rising mountain
profile so the student sees accumulated exposure over time. Every figure is an illustrative estimate
and carries the qualification (canonical §8). **Text equivalent:** a per-week table of represented
hours and the running cumulative total, each labeled as an estimate.

### 6.5 Consequence Horizon

A timeline across the life of a system marking the moments where architecture is tested: **first
build, first user, first 1,000 users, first failure, first audit, first ownership transition, first
vendor replacement, and long-term operation.** It orients the student in the Consequence Simulation
(step 7) and shows where in a system's life the current consequence sits. **Text equivalent:** an
ordered list of the horizon milestones with what changes at each, and a marker of the current
position.

### 6.6 Mindset Ledger

The visual form of the cumulative ledger described in §5.3 (lessons completed, decisions recorded,
assumptions discovered, failure conditions examined, stakeholder perspectives encountered, cumulative
estimated exposure, mindset growth by dimension). **Text equivalent:** a labeled list of each ledger
metric with its current value, with estimates identified as estimates.

---

## 7. Tone and anti-patterns

The experience has a precise voice. Getting the tone wrong is as damaging as getting the mechanics
wrong, because the wrong tone breaks the dream and turns the interview back into a form.

### 7.1 What it must NOT feel like

- **A long article.** It is not a wall of prose the student scrolls through. Insight arrives through
  interaction and consequence, not exposition.
- **A normal quiz.** There is no answer key, no score-for-recall, no right answer to guess.
- **A generic survey.** It is not a satisfaction form or a data-collection instrument wearing a theme.
- **A chatbot in a card.** The Architect Interviewer is a designed, structured experience with visual
  presence and defined questions, not an open free-text chat window.
- **Static charts.** The visuals are living comprehension aids tied to the student's own answers, not
  decorative infographics dropped into a page.
- **A sci-fi gimmick.** The time-machine framing is a serious device for reflection across time, not a
  costume, a joke, or a special-effects showcase.
- **A branching story without architectural rigor.** It is not a choose-your-adventure game where
  choices are arbitrary; every branch reflects a real architectural consequence.
- **An AI pretending a subjective decision has one correct answer.** The experience never asserts a
  single correct architecture; it rewards reasoning quality, not conformity (canonical §9, §10 stage 4).

### 7.2 What it SHOULD feel like

- **A guided architectural simulation.** The student is walked through a realistic system decision and
  its consequences with intent and structure.
- **A conversation with an experienced architect.** The interviewer feels like a senior practitioner
  who has seen these decisions play out and asks the questions that matter.
- **A reconstruction of the student's own thinking.** The most powerful moments show the student their
  own past reasoning with new sight, not someone else's answer.
- **A controlled view of future consequences.** The machine lets the student safely watch what usually
  takes years to observe, compressed and legible.
- **A professional decision laboratory.** It is a serious environment for practicing judgment, calm and
  premium, appropriate to enterprise executives.
- **A memorable weekly ritual.** Something a student looks forward to and remembers, a recurring habit
  that compounds across the 13-part series (canonical §3).
- **A serious portfolio-building experience.** The Architect Decision Record and the growing Mindset
  Ledger are real, ownable artifacts the student can carry into their career (canonical §2,
  `portfolio_eligible: true`).

---

## 8. Traceability summary

Every design decision in this document maps back to the canonical source of truth:

- Naming, slug, tagline, render band → canonical §1.
- Outputs (`interview_responses`, `architect_decision_record`, `mindset_score`, `mindset_ledger_delta`,
  `project_transfer`, `experience_receipt`), icon, badge, capabilities → canonical §2.
- The 13-part series and its principles → canonical §3.
- The 24-state machine and every state name used in §4 above → canonical §4.
- The 14 completion gates and bypass resistance → canonical §5.
- Storage model (per-card `student_progress`, ADR as `PortfolioArtifact`, derived Mindset Ledger),
  new endpoints, and the bespoke renderer → canonical §6, §7.
- The Experience Compression Model, represented-hours rubric, and the ethics-gated qualification label
  → canonical §8.
- The transparent eight-dimension score, weights, and stages → canonical §9.
- The seven-stage versioned prompt pipeline and the privacy rule (no sensitive chain-of-thought) →
  canonical §10.
- Design-E palette, self-styled `--am-*` panel, cinematic-but-accessible motion, `.ss-complete-btn`
  complete CTA → canonical §11.

No value in this document overrides the canonical file. Where this document adds design detail (the
dream-layer treatment, the 16-step narration, the visual specifications, the tone contract), it does so
within the constraints the canonical file already pins.
