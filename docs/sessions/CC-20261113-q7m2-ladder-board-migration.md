# CC-20261113-q7m2 — migrating the ten live boards onto the capability ladder

**Date:** 2026-11-13
**Branch:** `workstream/ladder-board-migration`, cut from `origin/main` at `8fb3ab903`
**Follows:** PR #3993 (merged), which changed the generator but not the live boards
**Authorized by:** Ali, 2026-11-13 — "go", on the recommendation to rewrite the boards and let each
builder propose their first capability for their manager to approve.

---

## A correction to the audit, recorded because it was reported wrong

The audit told Ali that "a builder opening a story was handed 51 characters". **That was wrong.**

`description` does equal `title` on all 1,477 rows, averaging 51 characters, because
`agentDomainProvisioner.ts:324` binds `s.title` into both columns. But the substance is not
missing — measured in production:

| story_kind | rows | desc = title | avg description | avg narrative | avg build |
|---|---|---|---|---|---|
| release_behaviour | 964 | 964 | 51 | **882** | **5,012** |
| implementation | 443 | 443 | 46 | 747 | 4,554 |

The body lives in `narrative` and the Claude Code prompt in `build`, and `materializeTasks` serves
`description: story.narrative`. So this is a data wart that makes a raw board scan badly, not the
deprivation it was reported as. The visual was corrected and the driver reworded.

**What the correction does not touch:** 0 of 853 above R0 ever completed, 0 of 6 governance gates
ever used, 0 tool requests ever filed, the 2.8x behaviours-per-rung cross-product, and stories
written for rungs R3-R9 when only two rungs exist. The audit's conclusion stands on those.

## Blast radius, measured before anything was written

| | |
|---|---|
| Behaviour rows to delete | **964**, every one `not_started`, **0** verified |
| Ladder stories to insert | **40** (ten domains x four steps) |
| Capability rows to relabel | **443** |
| Foreign keys referencing `student_tasks` | **0**, so no cascade or orphan risk |

Per domain: marketing 177 (Sarbjit), admissions 135 (Kalkidan), executive 116 (unstaffed),
curriculum 109 (Ruth), sales 85 (Victoria), platform 81 (Quincy), learner_success 72 (unstaffed),
product_experience 67 (Mihret), internship 65 (Tashima), website 57 (unstaffed).

**Ten boards, not seven.** Ali's go-ahead said seven; seven have a named builder, but the 964 rows
span all ten. Migrating only the staffed seven would leave ~245 dead rows on three boards for
whoever is hired into them next. Flagged to Ali rather than decided silently.

## What was built

**`agentDomainBoardReconciler.ts`** — pure planner, no database. Compares a board against
`planProvision(domain).stories` and returns deletes, inserts, updates and refusals. Written as a
general reconciler rather than a one-off delete script, because the generator already produces the
complete desired row set and "make the board match the plan" is the reusable operation.

**`migrateAgentDomainCapabilityLadder.ts`** — the I/O. Dry run by default, `--apply` to write,
`--domain <key>` to scope. One domain per transaction.

### The safety properties, and why each exists

1. **It will not delete work somebody has done.** Any row that is not `not_started`, or that
   carries `verified_at`, becomes a refusal, and any refusal fails the whole domain before the
   transaction opens. All 964 are untouched today, which is exactly when the guard is worth
   writing — the run that trips it will be a later one nobody is watching.
2. **The guard is repeated in the SQL.** `STORY_DELETE_SQL` re-checks status and `verified_at` in
   its `WHERE`. The reconciler judged a snapshot; a builder can tick a task between the read and
   the write. A mismatched row count aborts the transaction rather than destroying that tick.
3. **Idempotent by construction, not by a flag.** Every id is `derivedStoryId(domain, story_id)`,
   a pure function, so a second run finds everything present and plans nothing.
4. **Every column has its own bind placeholder.** `migrateAgentDomainAutonomyReleases.ts` records
   why at length: sharing a placeholder across a varchar and a text column is refused by Postgres
   at parse, and pinning the type elsewhere makes it resolve and write into the wrong column
   silently. `$2` and `$3` carry the same value into `title` and `description` deliberately
   unshared.
5. **No partial application.** One domain, one transaction. A failure leaves that board as it was
   and the other nine still run; the exit code is non-zero and the summary names the failures.

## Verification

- `npx tsc --noEmit` from `backend/` — clean.
- `checkTestTypecheck` — baseline matched exactly in both directions (399 / 140).
- Full CI jest — 2,738 suites, 44,518 passed.
- New `agentDomainBoardReconciler.test.ts` — 17 tests, **mutation-tested**:

| Mutation | Result |
|---|---|
| delete regardless of whether anyone worked on the row | 5 failed |
| ignore `verified_at` | 2 failed |
| treat `position` as drift (would rewrite whole boards for nothing) | 6 failed |
| always claim no-op | 1 failed |
| restored | 17 passed |

**Known flake, reported not swept:** `watcherRetirement` failed 2 of its tests in the full
parallel run — a different two than in the previous run, which is what makes it nondeterministic
rather than a regression. It passes in isolation and this diff touches only
`backend/src/services/agentDomain/` and `backend/src/scripts/`.

## Not done

- **Nothing has been written to production.** The dry run is the next step, then the apply.
- The seven builders have not been told.
- The `description = title` wart is left alone deliberately: fixing it is a provisioner change
  affecting all 1,477 rows and is out of scope for a migration that was authorized as a board
  rewrite. Recorded here so it is not lost.
