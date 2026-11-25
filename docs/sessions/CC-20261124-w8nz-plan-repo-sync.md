# CC-20261124-w8nz — a republished plan does not reach a builder's repo until the builder presses Sync

**Date:** 2026-11-24
**Kind:** production data operation plus the code change that stops it recurring
**Raised by:** Ali, after a board-versus-repo audit found five of seven builder repos missing the same four stories
**Predicted by:** [`CC-20261113-q7m2-plan-board-drift.md`](./CC-20261113-q7m2-plan-board-drift.md), which closed with "this recurs the next time a board moves"

---

## The question

Five of the seven agent-domain builder repos were missing the same four items: the three
`L0` rungs of the builder's chosen capability and `<domain>.GATE.R0.1`. Quincy's and
Mihret's repos had all four. The boards were identical. Why those two?

## The answer

They are the only two builders who have ever pressed Sync.

| When (Central) | What happened |
|---|---|
| 19 Nov, 10:59 AM | The ladder migration writes the four rows onto all seven boards, within the same second |
| 22 Nov, 4:19 PM | All seven build plans republish, v2 to v3. The published plan now carries the four for everyone |
| 23 Nov, 10:24 AM | Quincy presses Sync. His repo receives exactly the new files |
| 23 Nov, 3:29 PM | Mihret presses Sync. Same |
| 13 Nov to 24 Nov | No other repo is written at all |

The only code that writes a document into a builder's repo is `refreshRepoDocuments`, and
its only production caller is `POST /api/portal/workspace/repo/sync`, which is
`requireParticipant`. That route is the Sync button in the builder's own workspace. A
republished plan sits in Postgres until a human presses it.

## Why nobody saw it

`repoTreeRefreshService` runs every six hours on `17 */6 * * *`, pulls every connected
repo and stamps `last_sync_at`. Its own header says, correctly, that nothing is written to
the student's repository, which is what lets it run on read-only access. The effect is
that **every connection reports a fresh sync while the repo is eleven days behind the
plan**. The column that looks like the health signal is measuring the opposite direction.

This cost a wrong conclusion during the audit itself: the first pass read `last_sync_at`
across all seven, saw today's date on every row, and reported that the drift could not be a
sync failure. The commit history said otherwise. The evidence that settles it is that five
connections carry a sync stamp landing exactly on the cron minute, `:17`, and the two that
do not are Quincy's and Mihret's.

## What it costs

Ruth Kumera had done work the platform could not credit. `buildVerificationService` grades
a commit against the **published plan**, so a story the plan has never heard of cannot be
credited no matter how good the commit is. When her repo was refreshed, with nothing
re-graded and no criteria re-evaluated:

| | before | after |
|---|---|---|
| stories verified | 6 | **7** |
| criteria passed | 18 | **24** |
| points awarded | 108 | **124** |

That credit had been earned and withheld since 19 Nov. It is the concrete reason this is a
defect rather than an inconvenience, and the reason it was worth fixing in code.

## The data operation

Ran 24 Nov, 8:36 to 8:37 PM Central, on Ali's explicit authorization, using the product's
own `refreshRepoDocuments` rather than anything hand-rolled. One domain per invocation with
`--max-old-space-size=384`, because looping domains inside the live container restarted it
on 13 Nov (exit 137).

| repo | stories | verified | criteria passed | points | regressions |
|---|---|---|---|---|---|
| Kalkidan2129/admissions | 58 → 66 | 10 → 10 | 29 → 29 | 148 → 148 | 0 |
| rtkumera/AI-Agent-Project | 49 → 53 | 6 → 7 | 18 → 24 | 108 → 124 | 0 |
| tashdiah-Data/ai-project | 46 → 50 | 6 → 6 | 23 → 23 | 112 → 112 | 0 |
| sainisarbjit83-ai/Colaberry_Marketing_Agent | 75 → 79 | 7 → 7 | 24 → 24 | 77 → 77 | 0 |
| vessette/Simple | 43 → 47 | 37 → 37 | 54 → 54 | 745 → 745 | 0 |

Each repo gained exactly what it was missing and lost nothing. Four each for curriculum,
internship, marketing and sales: three `L0` rungs plus `GATE.R0.1`. Admissions gained eight,
those four plus four `maya_*` stories it was also missing. Between 12 and 14 files were
written per repo with 66 skipped as unchanged, which is the content hash gate working.

**Method, and one rule carried over.** Every repo was snapshotted before and after into a
file **named per repo**, then diffed on story ids, per-story passed criteria text, and the
three totals. The per-repo naming is not incidental: the 13 Nov run reused one scratch path
and compared one builder's file against another's, producing a false alarm of 53 lost
stories on Quincy's repo. Nothing staged on the host or in the container was left behind.

## What ships in this change

A six-hourly sweep, `AgentDomainPlanRepoSync`, that delivers each agent domain's **published**
plan into its builder's repo without waiting for the builder to press Sync.

| File | Role |
|---|---|
| `services/agentDomain/planRepoSyncDecision.ts` | Pure. Decides push / skip per project and computes board-versus-plan drift. No I/O, no clock. |
| `services/agentDomain/planRepoSyncSweep.ts` | The I/O shell. Loads the domains, asks the rule, calls `refreshRepoDocuments`, paces and caps, reports. |
| `services/scheduling/planRepoSyncCrons.ts` | Registration, out of `schedulerService.ts` which is over the ceiling. |
| `services/agentRegistry/agentDomainPlanSyncAgents.ts` | The `ai_agents` row, so the job has run counts and a one-click pause. |
| `data/platformOperations/timerScan.ts` | Regenerated: the new timer appears with its schedule and its reporting name. |

It writes nothing of its own. Every file goes through `refreshRepoDocuments`, which renders
only from the published plan, commits only files whose content hash differs, merges
`progress.json` field by field, is path-allowlisted and never throws. The steady state of
this job is that it writes nothing at all.

**It is registered rather than self-started, on purpose.** `repoTreeRefreshService` starts
its own cron and never calls `instrumentCronJob`, so it has no registry row, no run count
and no off switch short of a redeploy. That is precisely the class of finding the platform
domain builder is cataloguing under `scheduler_liveness_watch`, and adding a second one
while fixing this would be a poor joke.

**It ships enabled**, unlike the recently added Growth Journey rows. A switch that is off
closes nothing. The safety is in the writer, not in the switch, and Admin > Agents can pause
it in one click.

## What this change does NOT do, and why

**It does not republish.** Re-deriving a plan from the board needs `buildPlanFromTasks` and
the credited-removal gate, which live in `backend/src/scripts/lib/domainBuildPlan.js` and
`domainPlanRepublish.js`. Those are plain `.js` under `src`, the backend build is bare `tsc`
with no `allowJs`, and the production image is dist-only. Verified in the running container:

```
ABSENT in dist: domainBuildPlan
ABSENT in dist: domainPlanRepublish
ABSENT in dist: domainStoryAcceptance
/app/src present in the image? NO (dist-only image)
```

So the republish logic **cannot execute in production at all**. That is the real reason it
has only ever been a hand-run script, and it is why the 13 Nov note's "republish at the end
of the reconciler" was never as small as it sounded. Porting credit-bearing logic to
TypeScript belongs in its own diff, not bolted onto a new unattended writer.

Until then the sweep **reports** the debt: `plan_repo_sync_board_plan_drift` names the
stories the board has that the published plan has never heard of, with the remedy command.
That is the signal whose absence let this run for 23 days in October and 11 days in November.

## Still open after this

1. **The republish half.** Port the three plan libraries to TypeScript so a republish can run
   inside the container, then let the sweep republish before it pushes. Until that lands,
   `republishDomainBuildPlans.js --domain=<key> --apply` is still a hand-run job, and the
   sweep's drift line is what tells anyone it is owed.
2. **Where the drift report lands.** Today it is a structured log line. Container logs on this
   box held 475 lines over 96 hours when this was investigated, so a log is a weak place for a
   finding that matters. Surfacing it on the operations health page is the natural follow-up,
   and it is the same gap the platform builder filed as "a critical finding reached a person,
   with when and how".
3. **The candidate list** still has no screen to write to, so step 0.1 remains unreachable for
   all seven builders and the platform builder's four proposed capability titles are sitting in
   a Basecamp comment rather than in the product. Tracked separately; not addressed here.
