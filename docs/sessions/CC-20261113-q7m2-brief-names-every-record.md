# CC-20261113-q7m2 — the brief was dropping 68% of the inventory, and one builder could see one row of it

**Date:** 2026-11-14
**Branch:** `workstream/legacy-brief-names-every-record`, cut from `origin/main` at `04b9652f6`
**Closes:** finding 5 of Tashima Diah's section 8, left open deliberately in PR #4023

---

## What she reported

> The prompt says the page brief holds each record's disposition, reason and `file:line` evidence.
> The brief shown on the story page names only the counts.

She has **one** inherited legacy record. It is `WorkforceCareerDirector`, disposition
`migrated_to_capability`. So for her domain the brief really was nothing but counts, and she said
so from the only evidence she had.

## What it actually was

`legacyMigrationStory` rendered a section for `superseded`, a section for `retired`, a section for
`unknown`, and nothing for anything else. Measured across the ten capability matrices:

| disposition | records | rendered before |
|---|---|---|
| `migrated_to_capability` | **154** | **no** |
| `superseded` | 44 | yes |
| `retired` | 18 | yes |
| `unknown` | 9 | yes |
| **total** | **225** | 71 of 225 |

**154 of 225 inherited records — 68% of the whole inventory — existed in the brief only inside a
count line.** Internship was the extreme case rather than a special one: its single record is
migrated, so its entire section list was empty.

Per-domain, the records that never appeared: executive 75, marketing 40, platform 38, admissions
28, sales 16, learner_success 11, curriculum 8, website 8, internship 1.

## There is no `evidence` field, and the fix does not invent one

The prompt promises `file:line` evidence. Checked: **0 of 225 records carry an `evidence` array.**
The row shape is `agent_name, proposed_kind, disposition, capability_id, reason`, and the refs are
written inline in `reason` — internship's reads in part *"a live, enabled cron (20 6 \* \* \*,
aiOpsScheduler.ts:392, agentRegistrySeed.ts:2431-2439)"*.

So the promise is kept by printing `reason` verbatim for every record, which the three rendered
classes already did and the missing 154 did not. Adding an `evidence` field would have meant
backfilling 225 rows to satisfy a sentence, when the data was already there.

## The fix renders the remainder, not the missing class

`remainingDispositions(m)` emits every record whose disposition is not already in a named
section, grouped by class, classes sorted by name, rows sorted by agent name.

Naming `migrated_to_capability` explicitly would have fixed today and left the next new
disposition to vanish identically. **The defect was that the renderer enumerated classes at
all**, so the replacement enumerates the complement.

## Verification

- `npx tsc --noEmit` — clean.
- Full backend CI jest — **2,771 suites, 44,894 passed**, 1 failed: `watcherRetirement.test.ts`,
  `EPERM: operation not permitted, rename` on a Windows temp path, in a subsystem this branch does
  not touch. Re-run in isolation: **27 of 27 pass.** A Windows filesystem flake, not a regression;
  the same full suite was 0-failed before these edits.
- Mutation-tested, each mutation **proved to have applied** by diffing the line first:

| Mutation | Result |
|---|---|
| drop the remainder again (restore the original bug) | **2 failed** |
| remove the per-row sort | **1 failed** |
| remove the per-class sort | **1 failed** |
| restored | 47 passed |

### Two mutation runs that lied, and what they cost

**The per-class sort mutation reported "passed" twice before it ever ran.** The `sed` pattern had
six spaces of indentation and the line has four, so the file was never modified and the green run
meant nothing. It was caught by diffing the line before and after; every mutation here now does
that first.

**The first honest run of that mutation still passed**, for a different reason: every domain has
at most ONE disposition class outside the named three, so there is nothing for a between-class
sort to order and no data-driven test can distinguish the two implementations. It is now tested on
a constructed matrix carrying two unnamed classes — which also pins the behaviour that matters
most here, that an unanticipated class is rendered under its own name rather than dropped.

Both are the same lesson in different clothes: **a green mutation run is only evidence if you have
proved the mutation reached the code and that the data can tell the two versions apart.**

## Why row and class ordering are sorted at all

The repo sync commits only when content differs. A render that tracked the order rows happen to
sit in would rewrite seven builders' repositories whenever somebody tidied a JSON file. The test
for this shuffles the INPUT (reversed and rotated), because two renders in one process are stable
by accident — Map iteration is insertion order — and would pass either way.
