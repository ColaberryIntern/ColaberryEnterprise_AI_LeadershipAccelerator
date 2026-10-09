# Acceptance Harness Spec — the journeys every later phase must satisfy

**Phase 1, task 10.** Session `CC-20261005-r6h2`. Against `origin/main` @ `541305a6`.

§18 requires at least twelve representative journeys. §19 lists eighteen, so all eighteen are
specified here. Each carries a precondition, a trigger, the expected decision, **the assertion
that would prove it**, the phase that makes it executable, and whether equivalent coverage
exists today.

**This is a spec, not a suite.** Phase 1 writes no test code, deliberately: a test file nothing
imports and nothing can yet satisfy is the "producer with no consumer" defect this repo has
already paid for. The executable form lands in the phase that first has behaviour to assert,
which each journey names.

**The assertion column is the point.** A journey described as "should enter Explorer and receive
activation logic" is not testable. "The identity bridge returns the enrollment, and the decision
is an activation action rather than a handoff" is.

---

## The eighteen journeys

### J1 · New free account, never engaged
- **Precondition:** no prior visitor history, no enrollment.
- **Trigger:** free account created, by either public path.
- **Expected:** enters Explorer immediately; receives activation logic, not sales escalation.
- **Assertion:** the identity bridge returns this enrollment, a profile row exists, and the
  decision's action is an activation action with no handoff created.
- **Phase:** 2 (entry must be fixed first — gap A1).
- **Coverage today:** NONE for the portal path, which the bridge cannot see at all.

### J2 · Returning learner with lesson momentum
- **Precondition:** Explorer with recent lesson completions.
- **Trigger:** nightly decision pass.
- **Expected:** continues learning; no human sales handoff.
- **Assertion:** decision action is a lesson recommendation and `create_handoff` appears in no
  deferred action.
- **Phase:** 3.
- **Coverage today:** partial — the decision path is exercised, the "no handoff" half is not
  asserted for this shape.

### J3 · Free learner repeatedly viewing paid-program pages
- **Precondition:** Explorer, low engagement, repeated commercial page views.
- **Trigger:** view threshold crossed.
- **Expected:** intent rises; may become sales-ready **only if the evidence threshold is met**.
- **Assertion:** the readiness score's intent component rises, **and** repeated views alone do
  not reach the commitment floor — a hundred views score below one form start.
- **Phase:** 3.
- **Coverage today:** NONE — no readiness score exists.

### J4 · Free learner starts an enrollment form
- **Precondition:** Explorer.
- **Trigger:** enrollment-form start event.
- **Expected:** strong intent; score updates quickly; handoff evaluated immediately.
- **Assertion:** the score recomputes within the same pass rather than on the next nightly run,
  and a handoff is evaluated — not necessarily created.
- **Phase:** 3.
- **Coverage today:** NONE — nothing recomputes an open score (gap D3).

### J5 · Open House registrant before the event
- **Precondition:** Explorer registered for a future event.
- **Trigger:** decision pass before the event date.
- **Expected:** event-prep path wins over generic weekly nurture.
- **Assertion:** the winning candidate is the event-prep tier, and the nurture candidate is
  present among the losers with its "outranked" reason recorded.
- **Phase:** 5.
- **Coverage today:** partial — tiering is exercised; the event-prep content does not resolve.

### J6 · Open House attendee with strong paid interest afterward
- **Precondition:** attended, then commercial page views.
- **Trigger:** post-event decision pass.
- **Expected:** sales escalation evaluated promptly.
- **Assertion:** attendance is present as evidence and the readiness score reflects it.
- **Phase:** 5 (attendance must become derivable — gap C5).
- **Coverage today:** NONE — attendance availability is hardcoded false.

### J7 · Open House no-show
- **Precondition:** registered, did not attend.
- **Trigger:** post-event decision pass.
- **Expected:** follow-up differs from the attendee path, **and no attendance is fabricated**.
- **Assertion:** the decision carries a no-show overlay only when real absence data exists;
  where it does not, the decision records the gap rather than inferring absence.
- **Phase:** 5.
- **Coverage today:** the *refusal* is covered — the existing instruction never to read missing
  data as absence is explicit. The positive path is NONE.

### J8 · Learner interested in Internship
- **Precondition:** Explorer with internship-page affinity.
- **Trigger:** decision pass.
- **Expected:** an internship journey is available rather than generic Accelerator messaging.
- **Assertion:** the resolved content purpose is internship-related, and the offer family is one
  the brand policy allows.
- **Phase:** 5.
- **Coverage today:** NONE — no internship asset type resolves.

### J9 · Community-active learner
- **Precondition:** Explorer with community activity.
- **Trigger:** decision pass.
- **Expected:** safe public or approved community content; **never private cohort discussion**.
- **Assertion:** the resolved asset's source is an approved public projection, and a cohort-
  scoped row can never be selected.
- **Phase:** 5.
- **Coverage today:** the refusal is covered — community content is a declared dead end
  precisely because no cohort-safe projection exists. The positive path is NONE.

### J10 · Human claims a hot lead
- **Precondition:** an open handoff.
- **Trigger:** a rep accepts it.
- **Expected:** AI commercial outreach pauses.
- **Assertion:** ownership opens, and a send planned before the claim is cancelled at send time
  with `human_in_conversation`.
- **Phase:** 4 (already largely satisfied).
- **Coverage today:** **covered** —

`backend/src/services/growthJourney/__tests__/handoffRuns.phase4.scenarios.test.ts:101` → "describe('A/B: learners hand off through the learner deferral"

### J11 · Human returns the lead to nurture
- **Precondition:** an accepted handoff.
- **Trigger:** disposition `nurture` or `not_ready`.
- **Expected:** AI resumes only after the configured cooldown.
- **Assertion:** candidates are withheld until the cooldown elapses and resume after it, with
  the cooldown read from body, then brand policy, then default.
- **Phase:** 4.
- **Coverage today:** **covered** — the cooldown precedence and lapse behaviour are asserted.

### J12 · Converted lead
- **Precondition:** an accepted handoff.
- **Trigger:** disposition `converted`.
- **Expected:** acquisition outreach stops.
- **Assertion:** the person produces no commercial candidate, and is absent from the readiness
  queue **by filter rather than by score**.
- **Phase:** 3 for the filter, 4 for the disposition.
- **Coverage today:** partial — the disposition is covered; the queue filter does not exist.

### J13 · No-contact disposition
- **Precondition:** an accepted handoff.
- **Trigger:** disposition `no_contact`.
- **Expected:** suppression remains enforceable.
- **Assertion:** a send-time check consults a real suppression record — not merely that the
  disposition was written.
- **Phase:** 4.
- **Coverage today:** **NONE, and this is the sharpest gap in the eighteen.** The disposition
  writes no suppression record anywhere (gap D6), so today this journey would pass a naive test
  that only checked the disposition value.

### J14 · Cross-brand visitor who becomes a free AI learner
- **Precondition:** visitor history on a non-learner brand.
- **Trigger:** free account created.
- **Expected:** origin brand preserved; free-AI-learner journey ownership correct.
- **Assertion:** acquisition brand and journey brand are both recorded and **differ**, and the
  journey programme is the learner one.
- **Phase:** 2.
- **Coverage today:** **covered for attribution** —

`backend/src/services/growthJourney/__tests__/acceptance.phase6.test.ts:99` → "describe('A - a CPN free-training signup', () => {"

### J15 · Wrong or unconfigured GHL account
- **Precondition:** a lead routed to an account with no credential.
- **Trigger:** sync, link or calendar attempt.
- **Expected:** fails closed; **never falls into another brand's account**.
- **Assertion:** the result is a named refusal, no outbound call is made, and no default-account
  credential is reachable from the refusal branch.
- **Phase:** 4.
- **Coverage today:** **covered for contact sync**, including that the refusal does not leak the
  default key. NOT covered for calendar or appointments, which do not exist.

### J16 · Two sales reps on different brands
- **Precondition:** two rep configurations, different brands.
- **Trigger:** handoffs created on each brand.
- **Expected:** same code; configuration routes correctly.
- **Assertion:** each handoff reaches the rep configured for its brand, and **no code path
  branches on a rep's name or id**.
- **Phase:** 4.
- **Coverage today:** partial — brand-scoped assignment is covered; no second rep exists to
  route to.

### J17 · Hot lead changes score while the queue is open
- **Precondition:** a rep viewing the queue.
- **Trigger:** a meaningful event raises another person's score above the top row.
- **Expected:** the queue reranks without a full manual refresh.
- **Assertion:** the affected row's position changes without a page reload, **and the server
  decided the order** — not the browser.
- **Phase:** 4.
- **Coverage today:** NONE — the queue has a manual reload button and no stream (gap G2).

### J18 · GHL slot conflict
- **Precondition:** a slot that was free when the modal opened.
- **Trigger:** booking submitted after the slot was taken.
- **Expected:** the stale slot is refused and a reload is prompted.
- **Assertion:** availability is re-checked **at submit time**, and a conflict is surfaced as a
  conflict rather than a generic failure.
- **Phase:** 4.
- **Coverage today:** NONE for GHL. The pattern exists for the Google strategy-call flow, which
  re-checks before insert and returns a conflict — a model to copy, not coverage.

---

## Reconciling three journey sets

Three sets of journeys exist and none should be silently dropped.

### Set 1 — §19's eighteen
Specified above. The current requirement.

### Set 2 — the original plan's seventeen named scenarios

`docs/EXPLORER_GROWTH_OS_PLAN.md:1719` → "### 31.2 The 17 critical scenarios (from the brief) — all become named tests"

**None exists as a test under those identifiers.** The literal `T-SCEN` appears zero times in
`backend/src`, `frontend/src` and `tests`; positive control, the same grep form matches
`EXPLORER_CAMPAIGN_KEYS` in 8 files. The honest claim is that no test carries those
identifiers — not that the behaviours are untested.

| Original scenario | Subsumed by | Note |
|---|---|---|
| 1 Inactive Explorer | J1 | |
| 2 High E, low I; no voice | J2 | the voice half is moot — voice is not enabled |
| 3 Moderate E, very high I outranks higher-E | J3, J4 | the tier-over-engagement property |
| 4 High I + payment friction, recovery outranks selling | — | **UNMAPPED, see below** |
| 5 Registered for Open House, preparation outranks invitation | J5 | |
| 6 Attended event replaces no-show logic | J6, J7 | |
| 7 Paid ⇒ all acquisition stops | J12 | |
| 8 SMS opt-out: SMS never sends, email evaluated separately | — | **UNMAPPED, see below** |
| 9 DNC: voice never sends | — | **UNMAPPED, see below** |
| 10 Two campaigns qualify, only the winner executes | — | **UNMAPPED, see below** |
| 11 Worker runs twice, no duplicate communication | — | **UNMAPPED, see below** |
| 12 Expired event cannot be selected | J5 | partially — expiry is the mechanism behind it |
| 13 No upcoming cohort ⇒ AI does not fabricate one | J7, J9 | the same refusal property |
| 14 Cohort date changes after queueing | — | **UNMAPPED, see below** |
| 15 Voice webhook never arrives | — | **UNMAPPED, moot while voice is off** |
| 16 AI generation fails, fallback is safe | — | **UNMAPPED, see below** |
| 17 Shadow mode dispatches nothing | — | **UNMAPPED, see below** |

**Nine are unmapped, and that is a finding rather than an oversight.** They fall into two
groups:

- **Safety invariants that §19 does not restate because they are not journeys** — 8, 9, 10, 11,
  14, 16, 17. These are properties of the send path (per-channel suppression, single-winner
  execution, idempotency, send-time content re-resolution, fallback safety, shadow-mode
  silence). **They must not be lost.** They are already covered by the existing communication-
  safety and execution suites, and Phase 6 must confirm each still holds rather than assume it.
  Scenario 8 in particular describes a defect that has since been fixed, so its *assertion* is
  now satisfiable where the plan said it would fail.
- **One genuine journey gap**: scenario 4, high intent plus payment friction where recovery
  outranks selling. §19 omits it, and it is a real case — the friction decision in
  `SALES_READINESS_SCORE_CONTRACT.md` depends on it. **DECISION: it is added as J19 below**
  rather than left unmapped, because dropping a journey because the newer list forgot it is
  exactly the drift this phase exists to stop.

### J19 · High intent with payment friction *(added from the original plan's scenario 4)*
- **Precondition:** Explorer with high intent and a failed payment or booking error.
- **Trigger:** decision pass after the failure.
- **Expected:** recovery outranks selling.
- **Assertion:** the winning candidate is the friction-recovery tier, the commercial candidate
  is among the losers with its reason, and **the readiness score is not reduced** — friction
  changes the action, not the score.
- **Phase:** 3 for the score behaviour, 5 for the recovery content.
- **Coverage today:** partial — friction tiering exists; friction-recovery content is a declared
  dead end.

### Set 3 — the original plan's six persons

`docs/EXPLORER_GROWTH_OS_PLAN.md:1991` → "## 38. CRITICAL SUCCESS TEST — six journeys through the architecture"

| Person | Shape | Subsumed by |
|---|---|---|
| A | signs up, does nothing | J1 |
| B | many lessons, ignores paid | J2 |
| C | light learning, repeated pricing views, starts an application | J3 + J4 |
| D | tries to enroll, hits a booking/payment error | J19 |
| E | Open House registrant, attends, returns to the paid page | J5 + J6 |
| F | active learner, internship interest, heavy community, no paid signal | J8 + J9 |

**All six map, with nothing left over.** The persons set is the most useful of the three for
Phase 6, because each one is a *multi-day sequence* rather than a single decision, which is what
the final success test in §26 actually asks for.

---

## Counts

- §19 journeys specified: **18**
- Added from the original plan: **1** (J19)
- Total in this harness: **19**
- Original seventeen scenarios: 8 subsumed, **9 unmapped** (7 safety invariants belonging to the
  send path, 1 moot while voice is off, 1 promoted to J19)
- Original six persons: **6 mapped, 0 unmapped**
- Journeys with **NONE** as today's coverage: **7** — J1 (portal path), J3, J4, J6, J8, J13, J17
- Journeys with coverage today: **4** — J10, J11, J14, J15 (the last two partially)

## Known limits

- **"Coverage today" is a judgement about equivalence, not an identifier match.** Where it says
  covered, a cited suite asserts something materially equivalent; it does not mean a test is
  named after the journey.
- **No executable harness is produced here.** Each journey names the phase that makes it
  executable, and that phase owns writing it.
- **The nine unmapped original scenarios are the highest-risk item in this document.** Seven are
  safety invariants that §19 simply does not restate, and the way they get lost is precisely by
  nobody writing down that they were dropped. They are written down here.
