# CC-20261113-q7m2 — a builder checked our brief against its own sources, and five things were wrong

**Date:** 2026-11-14
**Branch:** `workstream/legacy-brief-corrections`, cut from `origin/main` at `74e0adead`
**Raised by:** Tashima Diah, in `internship.LEGACY-MIGRATION-PLAN`, section 8, "What I believe is
wrong in the brief"

---

## Why this exists

The story asks a builder to write a legacy migration plan from the brief the platform generates.
Tashima did not take the brief on trust. She checked every citation in it against the platform
repository and listed what did not hold. Four of her five findings are confirmed below against
`origin/main`; the fifth is real and is recorded as open rather than fixed here.

**The most useful thing she found is not any single number. It is that a test was pinning the
wrong one in place**, which is the failure mode that makes a defect look deliberate and survive
review.

## Finding 1 — "Five of them are live production rows" (CONFIRMED, fixed)

`_unresolved.json` has carried this correction in its own `_comment` since **2026-10-28**:

> CORRECTION, measured 2026-10-28: this comment previously said 'Five of these are live production
> rows'. Five is the count of rows whose PROPOSED KIND is unresolved; the live population is
> THIRTEEN of the 21, and between them they have run 1,491,129 times.

The data file was corrected. Three places that restate it were not:

| Site | What it said |
|---|---|
| `agentDomainPhaseReport.ts:186` | `'Five of them are live production rows.'` |
| `agentDomainStoryTemplates.ts:361` | the same sentence, in the story body sent to **all ten boards** |
| `agentDomainPhaseReport.test.ts:216` | `expect(...).toMatch(/Five of them are live production rows/)` |

So for seventeen days every builder was briefed from a superseded number, and the suite was green
the whole time because it asserted the superseded number.

**Fix:** the counts are now derived from the bucket, not restated. `liveLegacyRows`,
`legacyRunTotal` and `retirementCandidates` live in `capabilityRecord.ts` beside the type, so both
generators read one definition and the next correction to the file cannot leave prose behind again.

### The contract was the root cause

`UnresolvedLegacyRow` did not declare the `measured` block, although every row in the file has
carried one since 2026-10-28. No caller could read the number off the type, so the one sentence
that needed it hard-coded a literal. `measured` is now typed (`LegacyRowMeasurement`). This is the
general shape: **a number that is not reachable through the contract gets retyped as prose, and
prose does not get updated.**

## Findings 2 and 3 — two stale line numbers (CONFIRMED, fixed)

Verified against `origin/main`:

| Citation in `internship.json` | Claimed | Actual |
|---|---|---|
| `aiOpsScheduler.ts:343` | the `20 6 * * *` career job | **line 392** |
| `agentRegistrySeed.ts:2260-2269` | its registry entry | **lines 2431-2439** |

## Finding 4 — "four sibling directors" (CONFIRMED, fixed)

`directorActions.ts:39` says in its own docblock: *"Shared by the 7 directors…"*, and lines 70-76
export seven. `internship.json` named four siblings and listed only curriculum, certification,
finance and student success, omitting operations and community. Corrected to six siblings, with
all six named.

This one matters beyond accuracy: the sibling count **is** the blast-radius argument for the
capability's autonomy ceiling. Understating it by two understates the risk of a change.

## Finding 5 — the prompt promises evidence the brief does not carry (CONFIRMED, NOT fixed)

The research prompt tells the builder the page brief holds each record's disposition, reason and
`file:line` evidence. The brief on the story page names only the counts; the detail is in
`internship.json` in the platform repository, which the builder cannot see from the page. Tashima
worked around it by reading the platform repo directly, which is not something the story asks for
and not something every builder will think to do.

Left open deliberately: fixing it means deciding whether the brief carries the evidence or the
prompt stops promising it, and that is a change to what the story asks for rather than a
correction to a number.

## Verification

- `npx tsc --noEmit` — clean, backend and frontend. **Control error planted first** (a
  `string`-to-`number` assignment) and `tsc` reported it, so the clean pass is a real pass.
- Full backend CI jest — **2,770 suites, 44,863 passed, 0 failed**.
- Mutation-tested:

| Mutation | Result |
|---|---|
| `liveLegacyRows` counts `has_run` instead of `enabled` | first attempt: **0 failed** (see below), after the fix: **2 failed** |
| restore the literal `Five of them are live` in the story template | **1 failed**, in every domain |
| both restored | 68 passed |

**The first mutation attempt passed, and that was the useful result.** In the shipped file every
enabled row has also run — 13 and 13, zero enabled-but-never-run — so "live means enabled" and
"live means has_run" return the same number against the real data, and a test written against that
file cannot tell the two rules apart. The rule is now tested on a **constructed** bucket holding
the rows the real file does not have: one enabled row that has never fired, one disabled row with
history, one row with no measurement at all.

## What a builder finding this says about the loop

Tashima's section 7 is a citation-by-citation re-check with a found/stale column. Nothing in the
platform asked her for that table; the story asked for a migration plan. The cheapest way to keep
getting these is to keep the brief honest about what it does not know, which is finding 5.
