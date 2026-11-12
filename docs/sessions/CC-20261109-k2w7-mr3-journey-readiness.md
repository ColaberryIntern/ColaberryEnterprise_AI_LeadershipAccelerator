# CC-20261109-k2w7 — MR3: the journey readiness checklist learns why nothing has ever been decided

**Date:** 2026-11-12
**Branch:** `workstream/mr4-maya-welcome-audience-and-delivery` off `origin/main` @ `031db3b5c`
**Ticket:** MR3, https://3.basecamp.com/3945211/buckets/7463955/todos/10503714655
**Run:** `.loop-architect/runs/20261112-maya-release-ladder/` (gitignored)

> **Scope note from the ticket itself:** *"Activating a programme and setting the execution flag
> are Ali's calls, not implementation details. This ticket prepares and evidences them; it does
> not take them."* Nothing here flips a flag, activates a programme, writes a control row, or runs
> a classification pass.

## The ticket's premise was wrong, and the correction is the deliverable

MR3 says *"220 people are waiting"* and lists five locks. The 220 is real — `growth_journey_enrollments`
holds exactly that, every row enrolled on 2026-09-11. But they are **not the queue.**

Measured in production 2026-11-12:

| Table | Rows |
|---|---|
| `growth_journey_enrollments` | **220** |
| `growth_journey_classifications` | **0** |
| `growth_journey_decisions` | 0 |
| `growth_journey_executions` | 0 |
| `growth_journey_execution_controls` | 0 |
| `journey_programs` | 4, **all `draft`** |

**The decider's subject population is `growth_journey_classifications`, grouped by `subject_ref`
(`decisionService.ts:437-442`).** A subject with no classification row is skipped by design. With
that table empty, the engine produces **zero decisions** no matter what else is true — every flag
on, a programme activated, a rollout control in place. The 220 enrolled people were never an input
to anything.

**This changes the advice I gave Ali.** My earlier recommendation was "turn on decisions, activate
one programme, read what it decides". With zero classifications that produces silence, which reads
as a broken deploy rather than as a missing step. The corrected order is: **classify, then decide,
then activate a programme, then execution.**

Two further locks the ticket missed, both confirmed in code:

- **No rollout row means everything is shadow.** `resolveExecutionMode.ts:143` is literally
  `if (!rollout) return result('shadow', 'no_rollout')`. The two control defaults are asymmetric:
  a **pause allows** by default, a **rollout denies** by default. So an empty
  `growth_journey_execution_controls` means nothing is paused and nothing is permitted live.
- **A decision is stamped once and never re-stamped** (`executionModeStamp.ts:104`), and the
  executor reads `mode: 'live'` only (`decisionReads.ts:48`). So the 612 existing
  `explorer_journey_decisions`, all shadow, are permanently invisible to the executor. Flipping a
  flag does not make them live; the engine has to decide again.

And one correction that saves a wasted step: **activating a programme is not a prerequisite for
decisions.** The nightly decider accepts `['draft','active','paused']`
(`runShadowDecisionsNightly.ts:127`). Only the *executor* requires `active`
(`runExecutor.ts:129`).

## T008 — what changed

**Two read-only diagnostics already existed**, so nothing new was written: `buildReadiness.ts`
(17-item ordered checklist, served by `growthJourneyLaunchReadiness.ts` and
`GET /status/readiness`) and `growthJourneyExecutionStatus.ts`. The checklist was extended from
**17 items to 22**.

| New item | Blocks | What it reports |
|---|---|---|
| `enrollments_present` | nothing — context only | the count, and that it is **not** the decider's input |
| `classifications_present` | **everything downstream** | zero rows means no decidable subjects |
| `programmes_active` | execution only | 0 of 4 active, and that the decider accepts draft |
| `explorer_channel_flags` | the `in_app` and `ali_outreach` channels | which Explorer channels are open |
| `decisions_mode_split` | execution | live vs shadow, because shadow is never re-stamped |

**Order is the product**, and the existing suite pins it by name. `classifications_present` sits
immediately after the switches that let the decider run and **before** everything that consumes a
decision, because it is the item that answers the question. `programmes_active` sits with the
execution items, not the decision ones, because that is what it actually gates.
`decisions_mode_split` sits after `review_rollout`, because the rollout is what causes a decision
to be stamped live in the first place.

Two repo rules this had to respect:

- **The dark-launch guard is a raw text scan** for direct sub-flag reads anywhere outside the
  flags module, *including inside comments*. The Explorer item therefore reads through
  `isExplorerFeatureEnabled(feature, flags)`, which also means the master flag is honoured —
  reading the per-channel flags directly would have reported both channels open while
  `EXPLORER_GROWTH_OS_ENABLED` was off, the opposite of what `resolveExecutionMode` does. A test
  pins that specific inversion, because the guard itself cannot see it.
- **No `@` in output, ever**, scrubbed per field. The new reasons interpolate counts only, and a
  test asserts it anyway.

### The guard caught one of my own tests

Running the guards surfaced an offender in **T007's** test, not in this change:
`mayaEmailShippedDefaultCannotSend.test.ts` asserted the execution sub-flag as a property of the
resolved flags object. The guard failed the build, correctly, and the fix was to read through
`isGrowthJourneyCapabilityEnabled`. It then fired a second time on the *comment* explaining the
first fix, because the comment spelled the property path out. A comment is not a usage and the
scan cannot tell — which is the right trade for a guard defending a dark launch, and is now
recorded in that file.

## Verification

- **43 tests pass** in `buildReadiness.test.ts`, up from 34. The fixture gained the three tables
  the reader now reads, and world 1 was corrected to be genuinely empty: it had been seeded with
  production's 220 enrollments, which made one item ready and quietly broke that world's own
  "every knowable item is blocked" premise. Production's state is now its own describe block,
  where it belongs.
- **The load-bearing assertion:** with the master and decisions flags on and the nightly agent
  enabled — the reachable "decisions only" state — `next_move` is **`classifications_present`**,
  and explicitly **not** `execution_flag`.
- **Mutation tested:** removing the `classifications_present` item fails **6 tests**.
- **358 tests pass** across the 18 affected suites, including both flag text-scan guards and the
  two read-only script tests that spy on `create`/`update`/`destroy` to prove nothing writes.
- `tsc --noEmit`: 0 errors.

## Still Ali's, and now visible on one screen

The checklist reports these; it does not touch them. In the corrected order:

1. a classification pass, so the 220 become decidable
2. `GROWTH_JOURNEY_ENABLED` and `GROWTH_JOURNEY_DECISIONS_ENABLED`, plus the
   `GrowthJourneyShadowDecisions` agent row
3. a rollout control row — without one every scope is shadow
4. activating one programme (execution only)
5. `GROWTH_JOURNEY_EXECUTION_ENABLED` — the one flag the code itself calls the only thing that can
   cause a person to be contacted
