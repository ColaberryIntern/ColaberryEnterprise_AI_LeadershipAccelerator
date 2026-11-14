# CC-20261113-q7m2 — the builders' repos were being written from two different sources

**Date:** 2026-11-13
**Kind:** production data operation, no code shipped
**Raised by:** Victoria Sauber, by email, the same day the ladder migration ran

---

## What she reported

> The four new stories for ICP prospect discovery are in `.colaberry/agent-domain.json`, but they
> aren't in `plan.json`, `progress.json` or `docs/stories/`, and none of them has acceptance
> criteria yet. So I can't record progress against them. Is a sync still to come, or should I start
> "do it by hand" from the titles alone?

She was right on every point, and right to ask rather than guess.

## Root cause: one repo, two sources of truth

| File in the builder's repo | Rendered from |
|---|---|
| `.colaberry/agent-domain.json` | a **live read of the board** (`student_tasks`) |
| `.colaberry/plan.json`, `docs/stories/*.md`, the `progress.json` merge | the **published build plan** (`build_plans`) |

`refreshRepoDocuments` renders from `getPublishedPlan`. Every one of the ten agent-domain plans
was still **version 1, published 2026-10-21**, and nothing had republished one since. So the board
could move and half the repo would follow while the other half did not.

The ladder migration earlier the same day made the split visible, but it did not cause it. Measured
on production before any fix:

| | |
|---|---|
| Board stories absent from the published plan | **67**, across all ten boards |
| Plan stories absent from the board (stale) | **17** |
| Boards affected | **10 of 10** |
| Builders affected | **7 of 7** |

**The part that mattered more than the missing files:** `buildVerificationService` grades a commit
against the PUBLISHED plan. A story the plan has never heard of cannot be credited. Had Victoria
taken the other path and worked from the titles, the work would have been real and the credit
impossible, and she would have had to do it twice.

## What was done

1. **`republishDomainBuildPlans.js`, dry run, all ten.** The script already existed (AF12.7) and
   was written for exactly this: re-derive the plan from `student_tasks`, measure what moves, gate,
   then write. Its dry run reproduced the 67/17 split independently of the query above.
2. **Checked the 17 removals for credited work first.** `evidence_records` is the only possible
   witness for a story whose task row is already gone. All 17 returned **zero** evidence rows, so
   nothing anybody had been paid for was removed.
3. **Applied, one domain at a time.** All ten went v1 -> v2. Every run read back
   `NOTHING RE-MATERIALIZED: confirmed` and 553 stories with 553 sets of criteria, unchanged.
4. **Re-rendered the seven connected repos.** 43 to 82 files each.

## Verification

`progress.json` is **co-owned and merged field by field**, which is the whole reason this was safe
to run against live work. Diffed before and after, per repo:

| repo | stories | ticked criteria | regressions |
|---|---|---|---|
| vessette/Simple (sales) | 39 -> 43 | 38 -> 38 | 0 |
| Kalkidan2129/admissions | 54 -> 58 | 25 -> 25 | 0 |
| rtkumera/AI-Agent-Project (curriculum) | 45 -> 49 | 18 -> 18 | 0 |
| tashdiah-Data/ai-project (internship) | 42 -> 46 | 15 -> 15 | 0 |
| sainisarbjit83-ai/Colaberry_Marketing_Agent | 71 -> 75 | 24 -> 24 | 0 |
| qninying/platform-reliability-agent | 55 -> 59 | 70 -> 70 | 0 |
| MihretColaberry1/ColaberryInternship (product_experience) | 32 -> 36 | 18 -> 18 | 0 |

Every repo gained exactly its four ladder stories, with the acceptance criteria written in and
unticked, and lost nothing. All seven carry four `L1`–`L4` story docs.

**A false alarm worth recording.** The first diff reported 53 lost stories on Quincy's repo. It was
my own bug: the comparison read a `progress.json` left on disk by the previous repo in the loop, so
it diffed Quincy's old file against Mihret's new one. The rule that catches this is to name the
file per repo rather than reuse a scratch path, and it is the reason the table above was rebuilt
from scratch rather than spot-checked.

## One production incident, caused here

Running `node` inside the LIVE `accelerator-backend` container, in a loop over nine domains,
restarted the container (exit 137, host at ~800 MB free with 5.7 GB of swap in use). The API was
back inside a minute and returned 401 on the health probe, which is it serving. Three things
followed from it:

- the refresh script now calls `process.exit(0)`, because importing the compiled service opens a
  second pool and the event loop never drains on its own;
- later runs used `--max-old-space-size=384`, one domain per invocation;
- curriculum had in fact completed before the restart, which the re-run proved by reporting
  `unchanged` — the idempotency guarantee doing its job.

Everything copied into `/app` was removed afterwards, and the host-side copies with it.

## Open, and not fixed here

**Nothing republishes the plan when the board changes.** This drift took 23 days to be noticed and
was found by a builder, not by us. The board is edited by migrations, by the capability generator
and by the reconciler; none of them touches `build_plans`. Until something closes that loop — a
republish at the end of the reconciler, or a drift check that reports it — this recurs the next
time a board moves. It is a code change and belongs in its own diff.
