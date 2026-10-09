# North Star — the standing reference for Phases 2 to 6

**Phase 1, task 11.** Session `CC-20261005-r6h2`. Against `origin/main` @ `9e7b2891`.

This is the document later phases and tests reference. Where it disagrees with
`docs/EXPLORER_GROWTH_OS_PLAN.md`, **this one wins** — that document remains the best
statement of original intent and is stale in places, demonstrated in
`CURRENT_STATE_INVENTORY.md` §2.1.

---

## 1 · The canonical entry event

> **A person successfully creates a free AI account from one of our brand websites.**

Behaviour before registration is acquisition evidence. Behaviour after it is journey evidence.
**A page view is never the start of the Explorer lifecycle.**

Once a free account exists, the learner enters the Explorer lifecycle **immediately and
deterministically** — by any path, from any brand site. Today that is not true, and
`EXPLORER_ENTRY_SEMANTICS.md` is the resolution.

## 2 · The target loop

```
BRAND WEBSITE  (CPN · Colaberry Training · Colaberry Enterprise · Refactored · AI Flotation)
      ↓
FREE AI ACCOUNT REGISTRATION          ← the canonical entry event
      ↓
WHO IS THIS PERSON?                   ← Person 360, complete evidence history
      ↓
LEARNER + COMMERCIAL INTELLIGENCE     ← engagement · intent · friction · affinity ·
      ↓                                  state · offer fit · recency
JOURNEY GOVERNOR                      ← one question: what is the single best next action?
      ↓
   ┌──┴──┐
AI PATH   HUMAN PATH                  ← learning, community, events, rooms, proof,
   └──┬──┘                               builds, digest  |  a rep, fast
      ↓
NEXT OUTCOME                          ← learning · event · room · appointment · reply ·
      ↓                                  paid enrollment · no action
FEEDBACK LOOP
```

**The machine handles most nurturing. The human handles the moments where a real person
materially increases the chance of conversion.**

## 3 · The responsibility boundary

Two systems, and conflating them is how this project drifted before.

**Growth Journey OS — the enterprise-wide relationship and routing layer.** Which brand
relationship is this? Which programme applies? Which offer family is legal for this brand? Is
a human already in the conversation? Is the queue available? AI or human? Which queue or rep?
May a governed action execute?

**Explorer Growth OS — the free-AI-learner lifecycle intelligence and conversion engine.** Who
is this learner? Where did they come from? What have they done across our sites and platform?
What do they care about? What have they already experienced, and what have they *not* been
exposed to? What should they see next? Are they ready for a paid relationship or a human?

**Growth Journey routes and governs Explorer. It does not erase Explorer's learner-specific
intelligence.** The healthiest node on the current map is the relationship layer; the most
damaged is the one that should carry Explorer's intelligence into the human-facing view.

## 4 · Invariants that must never be violated

Each is either a standing constraint of this repo or a §-level requirement of the build prompt.
A later phase that breaks one of these has drifted, regardless of what it delivered.

1. **Nothing sends** without Ali's explicit activation. No real outbound contact with a person
   from a build loop, including from tests and capture runs.
2. **AI is never authoritative** for a cohort date, price, deadline, seat count, consent,
   compliance, or the brand boundary.
3. **No content is fabricated to fill a gap.** Where no authoritative source exists, the gap is
   named and reported. The content layer already does this and it must survive.
4. **Missing data is never read as negative data.** Absence of an attendance record is not a
   no-show.
5. **GHL account routing fails closed.** A lead routed to an unconfigured account is withheld,
   never redirected into another brand's account.
6. **Human ownership pauses conflicting AI commercial outreach**, and the check runs again
   immediately before the send, not only at decision time.
7. **One decision per person per boundary, with the losers and their reasons preserved.**
8. **No second engine.** No second campaign engine, rules engine, Governor, opt-out store,
   kill switch, ledger, approval queue, capacity mechanism or RBAC role.
   `system_kill_switch` stays authoritative.
9. **No PII in ledger payloads, packets, API responses, receipts or logs.** Ids are never
   emails.
10. **Every ordering that a human reads is total** — a stable unique final sort key, and
    explicit NULL handling. Without it the same input stops producing the same output.
11. **"Live" is earned, not labelled.** A manually refreshed queue is not live; an uncalibrated
    score is not proven.
12. **Credentials are never configuration.** Per-rep identifiers may be config; tokens stay in
    the settings store and never reach a browser.

## 5 · The eight drift questions, as a standing test

§20 requires these at every checkpoint. They are listed here so later phases can be planned
against them rather than graded by surprise.

1. Does free-account registration still define Explorer entry?
2. Can we answer "Who is this?" better than before?
3. Did this phase improve the learner's actual experience, or only add infrastructure?
4. Did we preserve one clear owner for each decision?
5. Can a human take over without AI competing?
6. Did we add any duplicate system, table or score that should have been reused?
7. Is the system closer to paid conversion?
8. What still prevents a rep from acting on the best lead immediately?

**Question 3 is the one that will sting most often**, and it should. Infrastructure that never
reaches a learner is the failure mode this reset exists to correct.

## 6 · The scoring rubric

§20 requires a 0–100 score with explained deductions. A score with no published rubric is a
number someone made up, so the rubric is here and the arithmetic is checkable.

| # | Component | Weight | Full marks means |
|---|---|---|---|
| 1 | Prompt tasks delivered with cited artifacts | 15 | every task has an artifact; every current-state claim carries a resolving citation |
| 2 | The ten unverified "facts" adjudicated | 10 | all ten, with any narrowing disclosed rather than smoothed |
| 3 | The semantic conflict resolved by decision | 15 | one labelled decision per term, each with its rejected alternative |
| 4 | Every gap owned by a phase | 10 | no orphan gaps; every *build* names its phase |
| 5 | Contracts defined without false calibration | 10 | no invented weight, threshold, scope or endpoint |
| 6 | Journeys specified with assertions, nothing dropped | 15 | ≥12 journeys with provable assertions; overlapping sets reconciled |
| 7 | Evidence mechanically checkable | 10 | a gate exists, runs in required CI, and is proven able to fail |
| 8 | No runtime behaviour changed | 5 | the diff is confined to documentation and the checker |
| 9 | Independently verified | 10 | every task graded by a verifier that did not produce it |

## 7 · Phase 1's score against that rubric: 90 / 100

| # | Component | Awarded | Why |
|---|---|---|---|
| 1 | Tasks delivered | **15** / 15 | all eleven prompt tasks have artifacts; 122 citations resolve, zero drift |
| 2 | Ten facts adjudicated | **10** / 10 | eight confirmed, two confirmed-but-narrower with the narrowing stated |
| 3 | Conflict resolved | **15** / 15 | six labelled decisions, each with a rejected alternative |
| 4 | Gaps owned | **10** / 10 | 36 gaps, every one with a phase; the table accounts for all of them |
| 5 | No false calibration | **10** / 10 | no weight, no threshold, scope names marked UNVERIFIED |
| 6 | Journeys | **15** / 15 | 19 journeys with assertions; three sets reconciled; 9 unmapped recorded, 1 promoted |
| 7 | Mechanically checkable | **7** / 10 | **−3**, see below |
| 8 | No runtime change | **5** / 5 | diff confined to `docs/growth-os-reset/`, the checker, the session log and one CI job |
| 9 | Independently verified | **3** / 10 | **−7**, see below |

### Deduction 1 — the gate cannot catch a fabricated count (−3)

The citation gate proves a quoted literal is real, findable and unique in the file named. It
says nothing about a **number** written in prose. That is not theoretical: during this phase I
published three invented counts — stale case counts in the session log, a disposition table
written before counting, and two line counts typed into a commit body three lines below the
command that printed the real ones. All three were corrected in the record rather than amended
away, and the working rule is now that a number reaches prose by being pasted from a command's
output, never retyped from memory of it. But the gate does not enforce that, so the phase does
not get full marks for mechanical checkability.

### Deduction 2 — most tasks are not independently verified (−7)

Two tasks were graded by an independent verifier: the gate itself passed 12/12 on its third
attempt, and the inventory failed at 10/12 and was fixed. **The remaining nine artifacts are
committed but ungraded.** I batched verification deliberately, on the reasoning that the gate
now catches the mechanical failure mode for documents and §22 forbids turning this into a
two-month exercise — but batching is a trade, not a free action, and the honest score reflects
what was actually verified rather than what was checked by its author.

**This deduction is recoverable without rework:** the artifacts exist and can be graded.

### What the score is not

It is not a claim that Phase 1 improved anything a learner can feel. It did not, and
drift question 3 is answered honestly in the checkpoint. **A reconciliation phase that scored
itself highly on learner impact would be lying about its own purpose.**

## 8 · What is cited in this document

This file is mostly decisions and standing rules, which carry no citations by design. One
current-state claim appears above — that the content layer already refuses to substitute when
no authoritative source exists — and here is its evidence:

`backend/src/services/explorerGrowth/content/syncTimelineCards.ts:226` → "('LESSON', :source_system, :source_id, :title, :summary, :url,"

That single hardcoded kind, against twenty-one declared asset types, is why the Governor can
only choose a lesson today.
