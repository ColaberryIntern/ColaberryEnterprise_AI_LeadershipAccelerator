# Sales Readiness Score Contract

**Phase 1, task 7.** Session `CC-20261005-r6h2`. Against `origin/main` @ `541305a6`.

§6 asks for a list of people to contact, sorted descending by readiness, and says explicitly
not to display the legacy lead score and call it done. This document defines the score's
contract and the queue ordering, **without pretending any threshold is calibrated**.

Observed facts carry citations. Forward-looking choices are labelled **DECISION**.

---

## Part 1 — The three scores that already exist, and why none of them is this one

### The legacy lead score

`backend/src/models/Lead.ts:78` → "  declare lead_score: number;"

A single number on the lead, computed from lead-side signals. §6 names it and rules it out.

### Explorer E / I / F

`backend/src/models/ExplorerJourneyProfile.ts:60` → "  declare i_score: number;"

Three band scores on the Explorer profile — engagement, intent, friction. Rich, recency-aware,
and **keyed on a different thing**: the profile row, which exists only for enrollments the
Explorer bridge can see. Different key, different population, different scale.

### Handoff expected value

`backend/src/services/growthJourney/handoffs/expectedValue.ts:78` → "export const EXPECTED_VALUE_FORMULA = 'state_rank*10 + path_weight*5 + engagement';"

An additive composite computed **once at row creation** and never recomputed. It is a
triage-ordering number for an already-created handoff, not a readiness score for a person.

**So three scores exist and none of them answers "who should a human call next".** One is
lead-side and ruled out, one is learner-side and invisible for part of the population, and one
is handoff-side and frozen at creation.

---

## Part 2 — The ordering problem, quoted

§6 says the primary ordering requirement is `readiness_score DESC` with deterministic
tiebreakers, and not to reproduce the current unstable paging. **Three different orderings
exist today for what is nominally one queue.**

**Ordering 1 — the operator's HTTP queue:**

`backend/src/controllers/growthJourneyHandoffController.ts:57` → "export const HANDOFF_QUEUE_ORDER"

Sorts `urgent DESC, expected_value DESC, created_at ASC`. `expected_value` is nullable and
there is no `NULLS LAST`, so in Postgres a NULL sorts **first** on a descending sort — an
unvalued handoff outranks every valued one in its urgency bucket. There is **no unique
tiebreaker**, and paging is offset-based, so rows can repeat or vanish between pages.

**Ordering 2 — the in-memory ranking used by the assignment pass:**

`backend/src/services/growthJourney/handoffs/expectedValue.ts:121` → "  const value = (r: T) => (r.expected_value === null ? 0 : Number(r.expected_value));"

Same three keys, but NULL is coerced to zero, so it sorts **last** — the exact opposite of
ordering 1 for the same data. Also no unique tiebreaker.

**Ordering 3 — the assignee digest:**

`backend/src/services/growthJourney/handoffs/assigneeDigest.ts:71` → "export function rankForDigest<T extends DigestHandoff>(rows: readonly T[]): T[] {"

Ranks on `priority` rather than value, and is the **only** one of the three with a unique
tiebreaker.

**And the set being ranked is itself nondeterministic.** The assignment pass fetches with a
bound and no `ORDER BY` at all:

`backend/src/services/growthJourney/handoffs/handoffService.ts:212` → "    limit: args.limit ?? 500,"

so once a brand × queue holds more than the bound, *which* rows get ranked is whatever the
database returns.

---

## Part 3 — DECISIONS

### DECISION 1 — Deterministic, versioned, and explainable component-by-component

The score is a sum of named components, each computed from evidence already in the system.
No LLM scoring in v1, per §6. Every component is individually inspectable, so the UI can
answer "why this number" without a second source.

### DECISION 2 — The weights are PROVISIONAL and the contract says so in the data

The score row stores its **ruleset version** and its **calculation timestamp**. A score
computed under version 1 is never compared with one computed under version 2 without the
version being visible.

**No threshold is calibrated and none is claimed to be.** §6 permits shipping in shadow mode
with clearly labelled provisional weights, and that is what this is. What would calibrate
them is outcome data linking a score at handoff time to a conversion — and the honest position
is that the volume of trustworthy conversion data has not been established, so the weights are
a starting hypothesis, not a finding.

### DECISION 3 — Component shape: commitment outranks browsing, and browsing cannot accumulate into commitment

§6 requires that repeated low-value page views cannot inflate the score and that explicit
high-commitment actions outrank passive browsing. Both follow from one rule: **passive signals
contribute to a capped band; commitment signals contribute outside that cap.** No quantity of
page views can reach the floor that one enrollment-form start reaches.

A human reply and a direct appointment request are commitment signals, not engagement
signals — §6 names this distinction and it is a component-placement decision, not a weight.

### DECISION 4 — Friction suppresses the action, not the score

A person with high intent and a payment failure is *more* interesting to a human, not less.
So friction does not subtract from readiness; it changes which action is appropriate. The
score says how ready; the Governor already decides what to do.

### DECISION 5 — Recency decays contribution, and the decay is in the component not the total

Each component carries its own half-life, which is how the Explorer scoring already works.
A single global decay applied to the total would make an old high-commitment action and a
recent page view indistinguishable.

### DECISION 6 — Converted, no-contact and suppressed people cannot surface as hot work

This is a **filter, not a score adjustment**. A converted person with a high score is not
scored down to zero; they are excluded from the queue. Scoring them down would make the
exclusion depend on arithmetic, and a weight change could silently re-admit them.

**And it routes through the existing suppression mechanism** — the standing constraints
forbid a second opt-out store, and gap D6 records that two dispositions currently write no
suppression record at all. That gap is Phase 4's, and this contract depends on it being closed.

### DECISION 7 — The ordering contract, replacing all three

```
readiness_score   DESC   NULLS LAST
urgent            DESC
sla_due_at        ASC    NULLS LAST
last_signal_at    DESC   NULLS LAST
id                ASC
```

Five keys, and the fifth exists **only** so the ordering is total. The prior Growth Journey
work learned this the hard way: without a stable unique final key, two equal rows order
arbitrarily, the same input stops producing the same output, and paging breaks silently.

`NULLS LAST` is explicit on every nullable key, because its absence is the live defect in
ordering 1 and the two orderings disagree about NULL today.

**One ordering, one place.** Orderings 2 and 3 are replaced by it rather than left to drift —
which is gap D1, owned by Phase 3.

### DECISION 8 — Score history is kept as events, not as a snapshot column

§6 requires preserving enough to explain major changes and requires the UI to show *why* the
score moved. A single "previous score" column cannot explain a move. The component values at
each computation are what explain it, so those are what persist.

### DECISION 9 — Ships in shadow mode, and "live" is not claimed until it is

The score computes and is visible to operators before it orders anything that sends. §22
forbids calling a manually refreshed queue live; the same honesty applies to a score whose
weights are untested.

---

## Part 4 — What a Phase 3 reviewer should be able to check

1. Two people with identical scores always order identically across repeated queries, and
   across pages.
2. A NULL score sorts last, not first, in every path that orders the queue.
3. Only one ordering definition exists in the codebase after Phase 3.
4. The set being ranked is deterministic — no bounded fetch without an order.
5. A hundred page views score below one enrollment-form start.
6. A converted person does not appear in the queue at any weight setting.
7. The score row carries its ruleset version and calculation time, and a test proves two
   versions are not silently compared.
8. The UI can state which components moved, from the stored evidence, without recomputing.
9. Nothing in the send path depends on the score while it is in shadow mode.

## Part 5 — Known limits

- **No weight is proposed here.** Proposing numbers would make them look calibrated. The
  component *structure* is the contract; the values are Phase 3's hypothesis to state and
  label.
- **The score's population depends on gap A1.** Until both free-account paths enter the
  Explorer lifecycle, a readiness score over Explorers silently omits the portal-signup
  population — so Phase 3's correctness depends on Phase 2's.
- **Threshold-free by design.** §6 warns against pretending an arbitrary threshold is proven,
  so this contract defines ordering and explainability and deliberately defines no cut-off.
- **Nothing here is implemented.** Every DECISION is intent for Phase 3.
