# Explorer Entry Semantics and Authoritative Identifiers

**Phase 1, tasks 4 and 5.** Session `CC-20261005-r6h2`. Against `origin/main` @ `541305a6`.

This document resolves the four-way conflict §18 names — `enrollment_type = explorer`,
`tier = guest`, free-account entry, and the Growth Journey learner programme — and defines
the canonical entry event plus the identifier precedence later phases must use.

**Two kinds of statement, kept apart deliberately.** Observed facts carry citations.
Forward-looking choices are labelled **DECISION** and carry none, because there is nothing
yet to cite. Nothing in this document is both.

---

## Part 1 — What the four things actually are today

### `enrollment_type`

Declared as a two-value union on the model:

`backend/src/models/Enrollment.ts:106` → "declare enrollment_type: 'standard' | 'explorer';"

The database does not enforce it. The column is `VARCHAR(20)` with a default, created not by
a migration but by a startup drift-guard:

`backend/src/server.ts:1023` → "`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS enrollment_type VARCHAR(20) NOT NULL DEFAULT 'standard'`,"

**Two declared values; more than two are written in practice.** Because there is no CHECK
and no ENUM, out-of-union values exist in code paths that write this column. The model's own
doc comment describes `'explorer'` as an Open House visitor who can log in but has not paid.

### `tier`

Declared as a different two-value union, on the same model:

`backend/src/models/Enrollment.ts:93` → "declare tier: 'guest' | 'member';"

Same storage story, same kind of drift-guard:

`backend/src/server.ts:980` → "`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'member'`,"

Its doc comment claims it is the source of truth for access level. **It is not** — the
paywall never reads it, which is gap A5 in `GAP_MATRIX.md`:

`backend/src/models/Enrollment.ts:211` → "// self-serve preview account (0 points, no cohort). Source of truth for"

### Free-account entry

**Four paths write these two columns, and only one writes a consistent pair.**

| Path | `enrollment_type` | `tier` | Reachable by |
|---|---|---|---|
| A · `/enroll` | `explorer` | `member` (default) | anyone, unauthenticated |
| B · portal free-signup | `standard` (default) | `guest` | anyone, unauthenticated |
| C · enquiry prospect | `standard` (default) | `guest` | internal, reuses B |
| D · Open House deposit | `explorer` | `guest` | internal |

Path A sets the programme label and leaves access at the paying default:

`backend/src/services/enrollmentService.ts:322` → "    enrollment_type: 'explorer',"

Path B sets the access level and leaves the programme at the paying default:

`backend/src/services/freeSignupService.ts:30` → "tier: 'guest' as const,"

Path D is the only one that sets both:

`backend/src/services/openHouseCreditService.ts:125` → "tier: 'guest',"

**No code reads both columns to make a decision.** Every `enrollment_type` decision ignores
`tier`; every `tier` decision ignores `enrollment_type`. The only place both are selected
together is display-only.

**And the Explorer OS gates on one of them alone:**

`backend/src/services/explorerGrowth/explorerIdentityBridge.ts:122` → "where: { enrollment_type: 'explorer', status: 'active' },"

So **the entire population created by paths B and C is invisible to the Explorer Growth OS** —
no profile, no E/I/F, no state, no overlays, no decisions, no journey participation. They
are also absent from the free-prospect roster, so they are invisible to revenue reporting as
Explorers too. They exist only as untagged rows that look like paying enrollments.

**The shadowing makes it worse.** For a person who used both public paths, the row chosen at
login is the one Explorer cannot see:

`backend/src/services/enrollmentPick.ts:38` → "e.enrollment_type === 'explorer' ? 1 : 0,"

Lower rank sorts first, and explorer maps to 1, so the non-explorer row wins.

### The Growth Journey learner programme

A **strictly wider frame**, and not a synonym for `enrollment_type`. Programme slugs are
scoped per brand, so two brands share one slug:

`backend/src/seeds/growthJourney/journeyProgramDefinitions.ts:68` → "  cpn: 'learner',"

A journey programme answers *which journey is this person in, for which brand*. An
`enrollment_type` answers *what kind of enrollment row is this*. They are different
questions at different grains, and today neither is derived from the other.

---

## Part 2 — The conflict, stated precisely

It is not that two columns mean the same thing. It is that **two columns mean different
things, are written by disjoint paths, and are each half-populated** — so neither can be
used alone and nothing uses them together.

1. `enrollment_type` is a **programme label**. It survives conversion: a person who becomes
   paid keeps `explorer` on the retired row so dashboards keep excluding it.
2. `tier` is an **access level**. It is the only one of the two whose declared purpose is
   about entitlement, and it governs no entitlement gate.
3. Paths A and B each set exactly one, so **the same real-world event produces two different
   row shapes** depending on which page the person used.
4. The learner programme is a third, wider concept that neither column expresses.

The honest summary: **the data model is right and the writers are wrong.** Two columns for
two questions is correct design. Four writers that each answer half the question is the
defect.

---

## Part 3 — DECISIONS

### DECISION 1 — The two columns keep their distinct meanings, and every writer sets both

`enrollment_type` is the **programme label**; `tier` is the **access level**. Neither is
derived from the other. Every path that creates an enrollment sets both explicitly, and
neither is ever left to its default.

A free AI learner, however they arrived, is `enrollment_type = 'explorer'` **and**
`tier = 'guest'`. A paying student is `'standard'` and `'member'`.

*Rejected alternative: collapse to one column.* It would be smaller, and it would destroy
the distinction that lets a converted person keep a programme label while gaining access.
The repo already depends on that: the retirement path deliberately preserves `explorer` on
the superseded row.

### DECISION 2 — Explorer membership keys on `enrollment_type = 'explorer'`

The existing gate stays. What changes is that paths B and C start satisfying it, rather than
the gate widening to include `tier`.

*Why this direction.* Widening the gate to `enrollment_type = 'explorer' OR tier = 'guest'`
would make every Explorer read a two-column disjunction in perpetuity, and would leave the
underlying rows still inconsistent. Fixing the writers fixes it once.

**This requires a backfill**, and the backfill is the risky part: path-B and path-C rows need
`enrollment_type` set to `'explorer'`, and unpaid path-A rows need `tier` set to `'guest'`.
Phase 2 must treat that as a data migration with a dry-run and a reversible plan, not as a
side effect of a code change.

### DECISION 3 — `tier` stops claiming to govern access

Either the comment is corrected or the paywall starts reading it. **The comment is corrected**,
because the paywall's current inputs — payment status, comp, staff, cohort type — are the
right ones, and a guest row is correctly gated today by being unpaid rather than by being a
guest. The latent hazard the comment creates is real: were anything ever to mark a guest
paid, the "source of truth" would be bypassed silently, with no test failing.

### DECISION 4 — One canonical entry event, reusing the signal that already exists

**The event:** a person's first successful creation of a free account, by any path.

**Recorded as:** a set-once timestamp column on the enrollment, plus one emitted signal.
Set-once matters — it is an *entry* event, not a state change, and must survive every later
transition. The existing `state_entered_at` columns cannot be reused for it, because they
restart whenever the state actually changes:

`backend/src/services/explorerGrowth/explorerStateMachine.ts:343` → "    unchanged && prevEnteredAt ? new Date(prevEnteredAt) : input.asOf;"

That behaviour is correct for a state clock and wrong for an entry stamp.

**The signal name is not invented.** It already exists in the catalogue, with
`enrollments` named as its source:

`backend/src/services/explorerGrowth/explorerSignalDefinitions.ts:26` → "  account_created: { band: 'engagement', subBand: 'achievement', weight: 5, halfLifeDays: null, cap: 5, source: 'enrollments' },"

It is **never emitted and never read** — the reader's source map has no `enrollments` query
and the writer only accepts signals from one other table. So the catalogue entry is currently
what its own file calls a silent lie about coverage. Phase 2 wires it rather than adding a
second name for the same thing, which is what "reuse before build" means here.

**Idempotency:** the trigger is the account's creation, the column is written once, and a
replay finds it already set. Both public paths already dedupe on email, so a second signup
attempt does not produce a second entry event:

`backend/src/services/enrollmentService.ts:307` → "  const existingCandidates = await Enrollment.findAll({ where: { email, status: 'active' } });"
`backend/src/services/freeSignupService.ts:104` → "  const existing = await Enrollment.findOne({ where: { email: clean.email } });"

Note they dedupe *differently* — one picks a best candidate among active rows, the other
takes the first match on email alone — which is part of why the two paths diverge.

### DECISION 5 — Identifier precedence for Phase 2 and beyond

Within Explorer and Growth Journey work, in this order:

1. **`enrollment_id`** — authoritative for a *journey participant*. This is already the
   implemented precedence and it is correct:

`backend/src/models/GrowthJourneyEnrollment.ts:46` → "  if (anchor.enrollmentId) return `enrollment:${anchor.enrollmentId}`;"

2. **`lead_id`** — authoritative for a *commercial relationship*, and the anchor when no
   enrollment exists yet.
3. **normalised email** — the join key of last resort, and the only key that spans the
   Explorer ↔ Lead bridge today.
4. **visitor fingerprint** — resolves pre-registration behaviour only, and never identifies
   a person on its own.

**DECISION 5a — the `persons` spine is NOT adopted in Phase 2.** It exists, with a unique
index on a normalised email:

`backend/src/seeds/migrations/20260905_add_person_identity.sql:41` → "CREATE UNIQUE INDEX IF NOT EXISTS idx_persons_primary_email ON persons (primary_email);"

and no application code reads it. It is the right long-term consolidation target and the
wrong thing to adopt mid-reconciliation: switching five identifier regimes onto an unread
spine is a larger change than Phase 2 can verify, and §22 forbids speculative framework no
current phase uses. **Recorded as the Phase 6 consolidation target.**

### DECISION 6 — The learner programme and `enrollment_type` are never derived from each other

The journey programme is authoritative for which journey and which brand. `enrollment_type`
is authoritative for what kind of enrollment row. A person can be in the learner programme
for one brand while holding a paid enrollment for another; collapsing the two would make
that unrepresentable.

---

## Part 4 — What a Phase 2 reviewer should be able to check

Stated as checks rather than prose, so the next phase has a target. None of these passes today.

1. Both public free-account paths produce `enrollment_type = 'explorer'` and `tier = 'guest'`.
2. A person created through either path appears in the Explorer identity bridge's result set.
3. `pickBestEnrollment` returns the Explorer row for a person who used both paths.
4. The entry timestamp is set exactly once and survives a state transition.
5. `account_created` is emitted on entry and read by the signal reader — the catalogue entry
   is no longer a claim with no path behind it.
6. The paywall's behaviour is unchanged by the backfill, proved by a test over a guest row
   whose `tier` changes and whose access does not.
7. No code reads `tier` to decide entitlement, asserted rather than assumed.
8. The backfill is idempotent: running it twice changes nothing the second time.

## Part 5 — Known limits of this document

- **The out-of-union value counts are not stated numerically here**, because the previous
  documents in this phase taught me not to publish a count I have not computed. That both
  columns are `VARCHAR(20)` with no CHECK is cited; the exact set of values present in
  production is not knowable from source and would need a database read this phase does not
  take.
- **DECISION 2's backfill is named, not designed.** Its dry-run, batching and reversal plan
  belong to Phase 2, where they can be tested against a real table.
- **Nothing here changes behaviour.** Every DECISION is a statement of intent for a later
  phase; this phase writes no code.
