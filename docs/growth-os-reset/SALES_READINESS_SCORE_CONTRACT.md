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

---

## Part 6 — The input contract (M24)

**Phase 3, task M24.** Session `CC-20261005-r6h2`, written 2026-10-17 against `origin/main`.

Parts 1 to 5 define what the score *is*. This part asks the prior question: is the Person 360
evidence package trustworthy enough to be its input, input by input. It is bound to the M16
evidence registry by `backend/src/services/adminOs/__tests__/srsInputContract.test.ts`, which
fails if an input named below loses its evidence group.

### 6.1 What the registry guarantees, and what it does not

There are **22 registered evidence groups**:

`backend/src/services/adminOs/__tests__/evidenceRegistry.test.ts:221` → "expect(Object.keys(EVIDENCE).length).toBe(22);"

The M16 guard proves, for every group, that the profile both *loads* it and *attaches* it. That
is a **static source-text** property. It does not prove the SQL parses, that the value is
correct, or that an absent value is distinguishable from a zero. Those are separate questions,
and 6.3 answers them input by input.

One limit is worth stating because it bears on 6.4: every behavioural test in this directory
mocks `sequelize.query`, so **no test in the package proves its SQL parses**. The suites say so
themselves. Validity rests on manual verification against production. Marked **UNVERIFIED**.

### 6.2 The rule this part enforces

From M24's acceptance criteria, and it is the one that does the work:

> **An absent input never scores as zero.**

"We have no evidence" and "we have evidence of nothing" are different facts about a person, and a
score that cannot tell them apart ranks an untracked stranger identically to a known tourist. For
each input below, the question is therefore not "is there a number" but "does the number lie when
the evidence is missing".

### 6.3 Input by input

Components are from DECISION 3, 4 and 5. **Measured** means counted from a source table.
**Derived** means computed from other fields in the package.

| Component | Evidence group | Field | M/D | What happens when absent | v1 |
|---|---|---|---|---|---|
| Tenure | `journey` | `daysKnown` | D | `null`, never 0 | **SAFE** |
| Intent | `journey` | `intentScore` | M | `null` when withheld or unknown | **SAFE** |
| Commitment: human reply | `communications` | `inboundCount` | M | panel `null`; cap admitted by `truncated` | **SAFE** |
| Friction: payment failure | `billingDetail` | `failuresSinceLastSuccess` | D | panel `null` when no enrolment | **SAFE** (see 6.5) |
| Prior outcome | `history` | `available`, `unavailableReason` | M | first-class availability flag, with a reason | **SAFE** |
| Explorer bands | `explorerScore` | `engagement`/`intent`/`fit` | M | whole panel `null`, never 0/0/0 | **SAFE**, population caveat |
| Consent | `acquisition` | `consentContact` | M | `null` distinguishes never-recorded from refused | **SAFE** |
| Passive: site sessions | `engagement` | `sessions` | M | `null` when never tracked; a real `0` only when a visitor row exists **(M24.1, fixed 2026-10-17)** | **SAFE** |
| Passive: page events | `journey` | `pageEvents`, `sessions`, `campaigns`, `emailsSent` | M | `null` when there is no lead row to count against **(M24.2, fixed 2026-10-17)** | **SAFE** |
| Commitment: enrolment | `journey` | `enrollments` | D | `null` when the ids were narrowed, named in `withheldPanels` **(M24.3, fixed 2026-10-17)** | **SAFE** |
| Commitment: appointment | `appointments` | rows | M | `null` when there was no key to look with; `[]` only when nothing is booked **(M24.3, fixed 2026-10-17)** | **SAFE** |
| Prior outcome detail | `history` | `everHired`, `everCertified`, `totalListedFees` | M | a NULL column reads `false`, and all-null fees sum to `0` | **EXCLUDED** |
| Recency | `journey` | `lastActivity` | D | `null` unless the timeline was read in FULL, so a caller-shaped recency is never scored **(unblocked 2026-10-18)** | **SAFE** |

### 6.4 The four absence defects, in full

**(a) `engagement.sessions` reads an untracked person as a tracked one with zero sessions.**
The query is a bare aggregate with no `GROUP BY`:

`backend/src/services/adminOs/personProfileService.ts:370` → "array_remove(array_agg(DISTINCT vs.site_slug), NULL) AS sites"

An aggregate with no `GROUP BY` returns exactly one row even when its joins match nothing, so the
`e ? … : null` guard immediately below it can never take the null branch. A person with no
visitor record at all receives `{sessions: 0, firstSeen: null, lastSeen: null, sites: []}`, which
is byte-identical to a tracked person who has never opened a page. This group is also the one
whose registry anchor is a bare table name rather than a call site, and the one with no
behavioural test of its contents at all.

**(b) `journey` breaks a promise its own docblock makes.** The module states the rule:

`backend/src/services/adminOs/panels/journeyPanel.ts:10` → " * rather than 0 — the same rule the metric registry enforces everywhere else."

Four lines below the counts are coerced:

`backend/src/services/adminOs/panels/journeyPanel.ts:113` → "    sessions: counts ? Number(counts.sessions ?? 0) : null,"

`counts` is only assigned when `leadIds.length` is non-zero, so for a person with no lead row
`sessions`, `pageEvents`, `campaigns` and `emailsSent` are all a hard `0`, and the same pattern
zeroes `cardsCompleted` and `sessionsAttended` when there are no enrolment ids. Only `daysKnown`
and `intentScore` honour the docblock. **This is the defect that most directly touches the M22
population**: the rows whose lead linkage is unresolved are exactly the rows these counts lie
about.

**(c) `journey.enrollments` reports a permission state as a fact about the person.**

`backend/src/services/adminOs/panels/journeyPanel.ts:117` → "    enrollments: enrollmentsCounted ? enrollmentIds.length : null,"

The id list is already narrowed to what the caller may see, so a mentor without grants reads `0`
enrolments for a person who has several. `withheldPanels` names withheld *panels*; it does not
name withheld *values*. A score consuming this field would rank the same person differently
depending on who asked, which breaks DECISION 1's determinism at the input rather than in the
arithmetic.

**(d) `appointments` and `automation` substitute an empty list for "no key to look with".**

`backend/src/services/adminOs/personProfileService.ts:420` → "    profile.appointments = leadIdForPanels !== null ? await loadAppointments(leadIdForPanels) : null;"

`[]` means "nothing booked" and "we could not look" alike, and an appointment request is a
commitment signal under DECISION 3, which is the heaviest band in the score.

### 6.5 Three further findings that do not block, but are named

- **`trust.matchMethod` cannot be read as match quality.**
  `backend/src/services/adminOs/panels/trustPanel.ts:110` → "    matchMethod: leadIds.length > 0 && enrollmentIds.length > 0 ? 'exact_email' : 'none',"
  The field reports whether both a lead and an enrolment were found, not how they were matched.
  A pure prospect, a lead with no enrolment and the SRS's primary subject, was matched by exact
  email and still reports `'none'`. It is asserted as intended by its test, so this is a naming
  and definition problem rather than a bug. Do not use it as an input.
- **`billingDetail` is withheld without being named.** Unlike every other panel it has no branch
  pushing itself to `withheldPanels` on denial, so a reader cannot tell suppression from absence.
  It stays SAFE as an input because the panel is `null` either way, but the reader-facing gap is
  real and belongs to M26.
- **Only CCPP is bounded.** `backend/src/services/adminOs/panels/historyPanels.ts:100` → "const TIMEOUT_MS = 8000;"
  It is also the only loader with a failure contract and an error class. Every Postgres loader
  has no timeout and no classification, and a single thrown query takes the whole package to a
  500 with no partial result. For a score computed in a batch this is an availability risk, not a
  correctness one, so it does not gate v1.

### 6.6 Entry-gate tickets that still bear on this

| Ticket | State | What it changes here |
|---|---|---|
| M20 | open | The flake is in the suites guarding these very inputs. Until a red run is known to mean a real failure, the guards' verdicts carry less weight. It does not make any input above wrong. |
| M22 | open | **Population, not correctness.** 37 ambiguous rows are undecided, so *who* is scored is undecided. Defect (b) makes this worse: those rows are the ones whose counts read as zero. |

---

## Part 7 — The readiness call

**The answer M24 gave was: NO, not today. YES once four named things are done, none of them a
redesign. AMENDED 2026-10-17, later the same day: three of the four are now done.**

M24.1, M24.2 and M24.3 shipped the fixes this part asked for, so **twelve of the thirteen inputs
the score needs are safe**, up from seven. The passive-browsing component that made the original
answer "no" is usable: `engagement.sessions` is `null` when a person was never tracked rather than
a zero-filled shape, and the `journey` counts are `null` when there was no lead row to count
against, which is the rule that module's own docblock already stated. The enrolment count and the
appointments list no longer report a permission or key state as a fact about the person.

**AMENDED AGAIN 2026-10-18: recency is unblocked**, which takes the count from eleven to twelve.
The defect was never the value, it was that `lastActivity` is the newest event among the domains
the CALLER was permitted, so two readers saw different answers. Widening anybody's permissions
would have been the wrong fix. Instead the data now says whether the read was complete:
`timelineDomains` records which domains were included, and recency is scored only when all six are
there. A partial read reports recency **absent**, which is true, and which the engine already
knows how to handle. Nobody sees a domain they could not see before.

**The original finding is kept rather than overwritten**, because it is why the fixes exist:
every untracked person would otherwise have entered the queue carrying the same browsing evidence
as a tracked person who never came back.

### 7.1 What is still not safe, and it is not nothing

**One input remains EXCLUDED.** Recency was the second until 2026-10-18; its entry is kept below,
struck, because the reasoning is the record of how it was unblocked.

- **Prior outcome detail** (`history.everHired`, `everCertified`, `totalListedFees`). A NULL
  column still reads `false`, and a set of enrolments with all-null fees still sums to `0`, so
  "not recorded" and "not hired" remain the same answer. The panel's availability flag is sound;
  the per-enrolment booleans beneath it are not.
- ~~**Recency** (`journey.lastActivity`). Section-filtered per caller, so two callers with
  different roles read a different "last activity" for the same person.~~ **UNBLOCKED
  2026-10-18.** The diagnosis held; the fix was not to widen permissions but to let the data
  declare its own completeness. `timelineDomains` records which domains a read covered, and
  recency is scored only when all six are present; a partial read reports it absent. DECISION 5
  still wants recency as a per-component decay, and that remains unimplemented: what ships is a
  recency SIGNAL scored as its own factor, which is a simpler and different thing.

  **CORRECTION, 2026-10-18.** Earlier versions of this row gave TWO reasons and one of them was
  wrong: they also blamed the timeline's 150-row cap. ~~derived from a timeline capped at 150
  with no truncation flag~~. The cap cannot affect this field. `getPersonTimeline` assembles with
  `ORDER BY max(occurred_at) DESC` and then applies the limit, so the cap truncates the TAIL and
  `timeline[0]` is always the newest permitted event. The cap genuinely does break a COUNT taken
  from the timeline, which is why `journeyPanel` takes its counts from the source tables and says
  so in its own docblock, and that is the claim this row borrowed without checking that a MAX
  behaves like a count. **It does not.** The per-caller domain filter is the whole of the defect,
  and it is enough on its own, which is why the unblock above addresses exactly that and nothing
  else.

**So the answer is now: yes for a score built on the twelve, with prior-outcome detail declared
and left unpopulated and its reason recorded**, which is the shape this part already permits. It
is not yet yes for the full component set in Part 3, because DECISION 5's per-component decay is
still unbuilt.

**What has to change, in order:**

1. ~~**Fix `engagement` (defect a).**~~ **DONE 2026-10-17 (M24.1).** The aggregate now counts
   visitor rows alongside sessions, so absence is detectable without splitting the totals a
   `GROUP BY` would have split. The group also got the behavioural test it had never had.
2. ~~**Fix the `journey` counts (defect b).**~~ **DONE 2026-10-17 (M24.2).** Six fields are now
   `number | null` and the frontend renders the absent case the way it already rendered
   `daysKnown`. The docblock and the code agree.
3. ~~**Fix `journey.enrollments` and the `appointments` substitution (defects c and d).**~~
   **DONE 2026-10-17 (M24.3).** The enrolment count is withheld through the existing
   `withheldPanels` mechanism rather than shrunk, and the appointment and automation lists are
   `null` when there was no key to look with.
4. **Decide M22.** Not a code fix and not mine. Until the 37 ambiguous rows are resolved or
   explicitly parked, the score's population is a default rather than a decision. **This is now
   the only one of the four still open.**

Each of the three fixes was mutation-proved: reverting it fails exactly one named test, and every
restore was verified byte-identical with `cmp`.

**What may proceed now, without waiting:** M25 may build the engine against the eleven SAFE
inputs, because its own acceptance criteria are about determinism, attribution and absence
handling rather than about having every component populated. A component that is *declared and
left unpopulated*, with its reason recorded, is consistent with this contract. One fed from an
input marked EXCLUDED in 7.1 is not.

**What this does not establish.** That the SQL behind any group parses, which no test in the
package proves (**UNVERIFIED**). That the weights are right; Part 5 already refuses to propose
any, and DECISION 2 keeps them provisional. That the seven safe inputs are *sufficient* to rank
well, which only the distribution run in M25 can show. And it does not revisit DECISION 6's
dependency on the suppression gap, which remains Phase 4's.
