# Task verification rubric

Used by the `loop-task-verifier` subagent (Phase F), once per task, after the producer
claims a task is implemented. The producer never grades its own task.

## Inputs the verifier receives

The single task's entry from `plan.md` (objective, acceptance criteria, verification
commands), the current `git diff` (or worktree diff) for files touched by this task
only, and permission to run commands itself. It does **not** receive the producer's
narrative of what it did - only the diff and the task spec. This forces grading from
evidence, not from the producer's self-report.

## Scoring - 6 criteria, 0-2 each, max 12

| # | Criterion | 0 | 1 | 2 |
|---|---|---|---|---|
| 1 | On-goal | Diff does things unrelated to this task's objective | Diff is mostly on-task with minor scope drift | Every changed line traces to this task's objective |
| 2 | Acceptance criteria met | Criteria not met | Partially met | All stated acceptance criteria met, verified by re-running the task's verification commands (not by reading code and assuming) |
| 3 | Correctness and regression safety | Introduces an obvious bug or breaks an existing test | Works for the happy path only, no regression check | Happy path + at least one failure/boundary case checked; existing tests still pass |
| 4 | Tests/evidence adequate | No test added for non-trivial logic | Test exists but only covers happy path | Test covers happy path + a failure or boundary case, per CLAUDE.md's mandatory test types |
| 5 | Repository conventions followed | Ignores folder responsibilities, size targets, or contract-enforcement rules in CLAUDE.md | Minor convention miss (e.g. missing Zod validation on a new route) | Matches CLAUDE.md folder responsibilities, TypeScript contract rules, and idempotency requirements for anything side-effecting |
| 6 | No placeholders/fabrication | Contains a stub, `TODO`, disabled check, or a claimed test result that doesn't match what actually ran | One minor instance, otherwise clean | Nothing faked - every claimed pass is backed by a command this verifier itself ran or can re-run |

**PASS = total >= 11/12 AND no criterion scores 0.**

## Verifier output format

```markdown
## Task verification - <task-id> - attempt <n>

Score: <total>/12
1. On-goal: <0-2>
2. Acceptance criteria met: <0-2>
3. Correctness/regression safety: <0-2>
4. Tests/evidence adequate: <0-2>
5. Conventions followed: <0-2>
6. No placeholders/fabrication: <0-2>

Verdict: PASS | FAIL

Evidence run:
<the exact commands executed and their actual output/exit codes - this is what makes
it "fresh evidence" rather than a restatement of the producer's claim>

Single most important fix (only if FAIL):
<one concrete instruction + the exact missing evidence>
```

## Retry rules

- Up to 3 attempts per task (CLAUDE.md Stall Detection: 3x same failure = stop retrying
  blindly, enter Diagnostic Mode - which here means: apply the ONE fix the verifier
  named, don't rewrite unrelated parts of the task).
- Each retry applies only the verifier's single named fix, then re-runs verification
  fresh - it does not re-grade against the producer's memory of the previous attempt.
- 3rd-attempt FAIL: mark the task `blocked` in the state ledger, do not advance the
  cursor past it, and follow the hard-stop reporting format (exact reason, what's done,
  what's blocked, what's needed to resume).

## What the verifier must never do

- Never edit the implementation to make it pass (it grades, it doesn't fix).
- Never award credit because the producer "said" a test passed - run it.
- Never pass a task because an *unrelated* existing test suite is green if the task's
  *own* acceptance criteria weren't independently checked.
- Never treat "the code looks right" as sufficient for criterion 2 when an executable
  check (test, `tsc`, curl) is available and wasn't run.
