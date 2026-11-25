# CC-20261124-b4rk — R12: the government pipeline behind the pipeline

Ticket: R12, "Link the 18 orphan gov qualification rows so the second pipeline tier can be
displayed" — https://app.basecamp.com/3945211/buckets/7463955/todos/10472280590
(due 2026-11-19, **not closed here**: the ticket says "Never auto-close; Ali closes after
validating.")

The ticket's gate was explicit, and it is the whole reason this phase looks the way it does:

> Establish why the rows are orphaned before linking any of them. A qualification written
> without a project is either a broken write path or a legitimate pre-project stage, and those
> need opposite fixes.

---

## The diagnosis: a lifecycle stage, not a broken writer

The ticket's numbers were measured 2026-11-03. Re-measured on production 2026-11-25, because
22 days had passed and they had moved a long way: the table holds **299** rows now, not 166,
and the stage in question holds **14** live rows, not 18.

The evidence is one-sided:

| decision | rows | with a delivery project |
|---|---|---|
| `pending_review` | 195 | 0 |
| `needs_evidence` | 51 | 0 |
| `no_bid` | 27 | 1 |
| `approved_bid_pursuit` | 26 | **19 (73%)** |

**A delivery project appears only after a bid is approved for pursuit.** Across 246 rows at the
two earlier stages, not one has ever carried a project. A broken writer would scatter orphans
across every stage; this is a column populated at one point in a lifecycle, which is the
opposite finding and takes the opposite fix.

Confirmed from the other direction: opportunities that pass through all three stages hold
linked rows at the approved stage and unlinked rows at the earlier ones. The same opportunity
is unlinked before approval and linked after it.

So **nothing was backfilled and nothing was linked.** The ticket's branch for this case is that
"the Room renders them as a count with no names rather than pretending they are nameable
opportunities", and its warning is the reason: an incorrectly linked bid silently misattributes
its evidence later, which is worse than a bid shown as unlinked.

### They genuinely cannot be named, which the ticket assumed and I checked

Both directions were tested rather than taken on trust:

- All 14 live rows have `source_snapshot = NULL` and `source_available = false`. There is no
  snapshot of the opportunity on the row.
- `gov_opportunity_aliases` — the only other table in the database carrying
  `canonical_opportunity_id` — holds **0 rows**.

So the only identifier that exists is an internal `gws:<uuid>`. Rendering it would look like a
name without being one.

### The linking mechanism exists, is reachable, and has never been used

`linkGovOpportunity()` is wired to the gov qualification admin route, has conflict /
project-not-found / project-not-government error classes and its own tests, and records
`linked_by_identity_id` and `link_reason`. Zero rows. **This is the actionable finding for
Ali:** linking is a deliberate human act that nobody has performed yet, not a missing feature.

### The three approved-but-unlinked rows

Three `approved_bid_pursuit` + `active` rows carry no project while 11 peers do. They are
**not** explained by a writer change: they are indistinguishable from the linked 11 on
reviewer, evidence, requirements and organization, and their dates interleave (unlinked
10-09 → 10-19, linked 10-10 → 11-17). Every version of those three opportunities is unlinked,
so nothing was lost — a project was never created for them.

`govBidFlow` already surfaces these per row ("no delivery project, so it cannot be named or
priced") and its header already documents them, so they are visible rather than hidden. Not
touched here; naming them is a separate judgment about three specific bids.

---

## What shipped

A `preProject` tier on the government stream: a count, what the stage is, why it has no names,
and the human action that would give one a name.

**It is not a funnel stage, and that was the main design decision.** A funnel is one population
whose counts partition, and the funnel in `govBidFlow` describes the flagged bids — 14 flagged,
of those how many priced, documented, submitted. These 14 rows are a *different* population:
other opportunities, some of which may later become flagged and most of which will not.
Rendered as a stage above "Flagged for pursuit" it would assert a flow of 14 into 14 that does
not exist. Same reasoning R24 used for the membership demand bands, and the same shape — its
own block, above the funnel where the demand path sits.

**It carries no money field at all**, structurally rather than by choice. A count of unassessed
opportunities beside a dollar figure is how "pipeline behind pipeline" becomes "pipeline", and
`gov_qualifications` holds no value column, so any figure would be invented. A test asserts
nothing on the object is shaped like a `Money` and no string on it prints a currency amount.

**The copy follows the measurement rather than being frozen.** `whyNoNames` has three forms —
nothing at this stage, none nameable, some nameable — because "none of these can be named"
stops being true the moment somebody links one, and a frozen sentence would then tell a reader
something false about work they had just done. A linked row at this stage is reported rather
than contradicted.

---

## Three splits, forced before the new code

`govBidFlow.ts` stood at **548 lines**, already past the 500-line hard ceiling. CLAUDE.md's
rule for an oversize file is that the next change splits it *before* adding, and R12 was that
change.

| File | Before | After |
|---|---|---|
| `govBidFlow.ts` | 548 | **465** |
| `revenueFlowTypes.ts` | 485 → 501 when the tier type landed | **472** |
| `govBidFlowShared.ts` | — | 117 (row shapes, helpers, `absentFlow`) |
| `money.ts` | — | 56 (`Money` and its three constructors) |
| `tableExists.ts` | — | 27 (leaf, so two callers can share it) |
| `govPreProjectTier.ts` | — | 177 |

`govBidFlowShared` is a verbatim move: the funnel's behaviour cannot have changed in a diff that
only relocates declarations, which is what makes it reviewable. `money.ts` was the cleanest
thing to lift out of the types module — three runtime *functions* in a module whose job is
types were always slightly the wrong shape, and `Money` belongs beside its own constructors.
`tableExists` became a leaf because R12 needed it in a second place and the alternative was a
second copy of the same six lines.

**Named and not attempted:** `buildGovFlow` is still a single ~400-line function, four times
the repo's function ceiling. Breaking that up is a rewrite of the gov pipeline's core and
belongs in its own ticket rather than riding in on a display change.

---

## Verification

| Gate | Result |
|---|---|
| Backend, revenue suites | **27 suites / 547 tests pass** (15 new) |
| Backend, copy ratchets | **56 suites / 921 tests pass** |
| Frontend, revenue suites | **8 suites / 169 tests pass** (13 new) |
| Backend project typecheck | clean, with a planted control reported |
| Frontend project typecheck | clean for every file touched |
| Mutation check | **11 of 11 killed**, 0 survived, control green first |

Eleven mutations, each one a change that would make the page assert something nobody measured:
a missing table reported as a measured zero; the nameable count summed so it could exceed its
own population; the copy frozen at "none can be named"; a linked row at this stage hidden; a
money figure added to the tier; the alias guard dropped; the count rendered as a currency
amount; the explanation removed; the unlock sentence removed; the lifecycle warning shown
unconditionally; and the block rendered when no tier exists. All eleven killed on the first
pass.

**The typecheck is real this time.** TypeScript 5.7.3 was installed into the session scratchpad
(the version `package.json` declares; the hoisted local install is 4.9.5, which aborts inside
`@types/d3-dispatch` before reaching repo source). A planted control error **was** reported, and
removing it left 4 errors across the whole backend, all `TS2307` for `maxmind` and
`@anthropic-ai/sdk` — packages this worktree lacks and CI installs. The 4 frontend errors are
the same gap (`@dnd-kit/core`, in two files this branch does not touch).

**Branch correction worth recording.** The work began on `workstream/revenue-brand-ui`, which
had already merged. Committing there would have opened a PR from a branch 82 commits behind
main and silently reverted other sessions' work. Moved to a branch off current `origin/main`
after confirming that none of the four modified files had changed on main, then re-ran both
suites on the new base.

---

## Artifact the ticket asked for

> A count of orphans before and after, plus the stated cause.

**Before:** 14 live `needs_evidence` rows, 0 linked, 0 nameable — and invisible to the Revenue
Room, because `govBidFlow` queries only `approved_bid_pursuit AND active`.

**After:** the same 14 rows, still 0 linked and 0 nameable, now **displayed** as a counted stage
with its cause stated on the page. No row was linked, invented or renamed.

**Stated cause:** not an orphaning defect. A delivery project is created when a bid is approved
for pursuit; `needs_evidence` is the stage before that decision. The rows carry no project
because none exists yet, and they carry no name because no snapshot was kept and no alias has
ever been recorded.
