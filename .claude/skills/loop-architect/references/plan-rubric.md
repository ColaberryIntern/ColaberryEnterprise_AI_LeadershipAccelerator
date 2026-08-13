# Plan audit rubric

Used by the `loop-plan-auditor` subagent (Phase E). The producer (main session) never
scores its own plan - that's the whole point of the split.

## Inputs the auditor receives

`execution-contract.md` and `plan.md` from the run directory. Nothing else pre-loaded -
the auditor re-derives grounding by reading the actual repo, not by trusting the
producer's claims in the plan.

## Scoring - 10 dimensions, 0-2 each, max 20

| # | Dimension | 0 | 1 | 2 |
|---|---|---|---|---|
| 1 | Goal coverage | Plan misses stated goal elements | Covers most, minor gaps noted | Every element of the contract's Goal + In Scope is covered by a task |
| 2 | Repository grounding | Tasks reference files/patterns that don't exist or contradict what's in the repo | Mostly grounded, one or two unverified claims | Every "files/components affected" claim checked against the actual repo (existence, current content) |
| 3 | Dependency/order correctness | Tasks ordered so a later task needs something an earlier one doesn't produce | Order mostly right, one soft violation | Dependency graph is acyclic and every task's prerequisites appear earlier |
| 4 | Testability of acceptance criteria | Criteria are vague ("works correctly") | Some criteria are machine-checkable, some aren't | Every task's acceptance criteria map to a command or observable fact a verifier can check without human judgment |
| 5 | Deployment completeness | No deployment task despite the request needing one | Deployment task exists but skips a required precondition (migration safety, rollback) | Deployment readiness, execution, and precondition checks (tests/build/migrations/rollback path) are all explicit tasks |
| 6 | Production verification completeness | No live-verification task | Live check exists but only hits the URL, doesn't check the actual changed behavior | Plan includes checking the specific changed user journey live, not just "site is up" |
| 7 | Rollback/recovery readiness | No rollback note anywhere | Rollback mentioned generically | Every task that writes to shared state (DB, deployed service) has a concrete rollback note |
| 8 | Boundedness and hard stops | No retry/iteration caps referenced | Caps mentioned but not tied to CLAUDE.md's actual Stall Detection numbers | Caps match the execution contract (3 plan cycles / 3 task attempts / 2 prod cycles) and every task that could loop forever has a stated cap |
| 9 | Security/data safety | Plan touches auth, PII, or payments without a validation/permission task | Some safety consideration present but incomplete | Input validation, auth/permission checks, and secret-handling are explicit tasks wherever the contract's scope touches them |
| 10 | User testing handoff | No handoff task | Handoff task exists but underspecified | Explicit final task to produce `handoff.md` with concrete, numbered, non-developer test steps |

**PASS = total >= 18/20 AND no dimension scores 0.**

## Auditor output format

```markdown
## Plan audit - cycle <n>

Score: <total>/20
1. Goal coverage: <0-2> - <one line>
2. Repository grounding: <0-2> - <one line>
... (all 10)

Verdict: PASS | FAIL

Single most important fix (only if FAIL):
<one concrete, actionable instruction - not a list, the ONE highest-leverage fix>
```

The auditor grades and recommends **one** fix. It does not rewrite the plan itself -
that stays the producer's job, so the same agent that will eventually own the tasks
also owns fixing the plan (accountability doesn't get laundered through the auditor).

## Cycle rules

- Up to 3 plan-review cycles total.
- On PASS: producer writes the score + `AUTO-APPROVED` into `plan.md` and begins
  execution. No human approval step - this is the automatic-approval rule from the
  execution contract.
- On 3rd-cycle FAIL: stop. Report the blocker exactly as the auditor's last verdict,
  plus what would need to change (repo fact, scope, or contract) to pass a 4th attempt
  if the requester wants to continue manually.
