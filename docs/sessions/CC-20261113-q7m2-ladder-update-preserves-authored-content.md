# CC-20261113-q7m2 — the ladder migration would have destroyed authored work

**Date:** 2026-11-13
**Branch:** `workstream/ladder-update-preserves-authored-content`, cut from `origin/main` at `55eb149f2`
**Follows:** PR #4000 (merged), whose update path this fixes before it is ever applied
**Status:** nothing has been applied to production. The dry run is what found this.

---

## What happened

PR #4000 merged and deployed cleanly: registry image digest matched the commit, and the
marker check confirmed the new script was inside the running container. The dry run then
reported **513 updates where the measurement had said 443**.

That 70-row gap is the only reason any of the following was found.

## The defect

`planBoardReconcile` compared a stored row against `planProvision`'s output and wrote back
every field that differed. The reconciler's header stated the assumption plainly: a board is
derived from the generator, so making it match the plan can only be correct.

**The assumption was wrong.** These boards carry content authored AFTER generation, which
exists nowhere else. Measured on production across all ten boards:

| | |
|---|---|
| Rows whose authored `acceptance` would have been erased | **513** |
| Individual acceptance lines destroyed | **683** |
| Of those rows, `complete` AND carrying `verified_at` | **100** |
| Rows whose hand-written narrative would have been replaced by template text | **3** |

The generator emits acceptance for the 40 new ladder stories only, so `acceptance = $9::jsonb`
bound `null` on every other row. A representative row, `complete` and signed off on 22 Oct:

```
stored  : ["Swati names the approver and states what happens to the old cards on a re-publish."]
planned : []
```

The three narrative losses are worse in kind if not in volume. `admissions.RESEARCH-4-MANAGER-INTERVIEW`
would have dropped 487 characters including a specific finding somebody had investigated
("a role-name collision, not an ownership question"), replaced by the generic template body.

## Why twelve green checks did not catch it

The test fixture `rowFromPlan` builds a stored row **from the plan**. Stored content therefore
could never differ from planned content, so the production case was unrepresentable. The suite
was thorough about what the reconciler deletes and silent about what it overwrites, because
the fixture could not express the question.

`authoredRow` now exists for exactly that case, and is documented as such so the gap cannot
quietly reopen.

## The fix

**An update may add content. It may never destroy it.** `partitionUpdate` splits the fields
that differ into those safe to write and those that would lose something:

1. **The plan having nothing to say is not a reason to erase.** Planned value blank and
   stored value not blank, the stored value stays.
2. **A rewrite that drops what is there is a conflict, not an update.** For prose, a change
   that still contains the stored text is additive and is written (that is the IN FLIGHT /
   CANDIDATE relabel, the whole point of the migration). A planned body that does not contain
   the stored body is somebody's edit being overwritten, so it is preserved.

Rule 2 deliberately does not check `status`: status records whether a task was worked, not
whether its text was edited, and the admissions row would have been lost under any status.

Supporting changes:

- A row whose every difference is preserved drops out of `to_update` entirely, rather than
  issuing an UPDATE with no columns and reporting work that did not happen.
- `STORY_UPDATE_SQL` is replaced by `buildUpdateSql(fields)`, which builds the SET clause from
  the writable set. A preserved column is **absent from the statement**, not set to the right
  value. Every column still gets its own placeholder.
- Preserved fields are printed per domain and totalled in the summary. A migration that
  quietly declines part of its job is indistinguishable from one that did it.
- `describePlan` states preservation even on a no-op, because "nothing to do" and "there were
  differences I declined to write" are different facts.

## Verification

- `npx tsc --noEmit` from `backend/` — clean, and **proved to be checking this file** by
  planting a deliberate type error and confirming `TS2322` at the expected line before
  removing it.
- `agentDomain` + migration suites — **75 suites, 1,703 tests passed**, 0 failed.
- 8 new reconciler tests and 8 new SQL-builder tests, **mutation-tested**:

| Mutation | Result |
|---|---|
| restore the pre-fix behaviour (write every differing field, preserve nothing) | **5 failed** |
| restored | 32 passed |

The mutation is the pre-fix code path, so those five tests are a direct regression guard on
the defect rather than on a paraphrase of it. The mutation was confirmed present in the file
before the run, not assumed.

## Not done

- **Nothing has been applied to production.** The next step is re-running the dry run against
  the fixed code to see the new update and preserved counts.
- The seven builders still have not been told.
- Not addressed, and recorded so it is not mistaken for settled: the generator does not emit
  the acceptance these rows carry, so the two will keep diverging. Preserving is the right
  behaviour for a migration, but the authored acceptance has no owner in the generator.
