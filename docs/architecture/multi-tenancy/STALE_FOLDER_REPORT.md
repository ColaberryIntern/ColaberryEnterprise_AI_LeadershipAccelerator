# The Stale Folder, Investigated

**Session:** CC-20260821-m6t4 · **Decision:** [DEC-02](DECISIONS_LOG.md) · **Date:** 2026-08-21

Read-only investigation of the OneDrive working copy. Nothing was changed, stashed,
pulled or rebased in that folder.

---

## First, a correction to my own alarm

I reported "76 commits that were never pushed" as though 76 pieces of work were at risk.
That overstated it, and the method was weak: I compared commit subjects, and this repo
squash-merges pull requests, which rewrites the subject to the PR title. Matching on
subject therefore reports work as missing when it merged perfectly well under a different
name.

The reliable check is at the file level, and it is much less alarming:

| | Count |
|---|---|
| Files touched by the 76 local commits | 177 |
| **Already present in the real codebase** | **104** |
| Exist only in the OneDrive folder | 73 |

So most of that work did land. What follows is about the 73 that did not.

---

## The one thing that is actually broken right now

**A scheduled job has been dead for roughly six weeks and nobody was told.**

```
crontab:  10 12,17,22 * * 1-6  /opt/colaberry-accelerator/scripts/task-prompt-worker.sh
on disk:  the file does not exist
```

Production fires this three times a day, Monday to Saturday. The file is not there,
because it was never merged into the real codebase, and production deploys by pulling the
real codebase. Every one of those firings has been a no-op.

Its log tells the rest of the story. The last time it actually ran was **2026-07-08**, and
even that run failed:

```
[tpw] wrote .../TPW_TPW-202607082210.html
[tpw] delivery failed: Mandrill preflight failed:
  - HTML has "Ali Muwwakkil" 4 times - likely a duplicate signature.
exit 4
```

So it did its work, produced its report, and then could not send it. Then it disappeared
entirely. Two separate failures stacked on top of each other, neither of which surfaced
anywhere a person would see.

The only copy of its source code is the OneDrive folder: the shell script, its runner, and
four library modules are all in the 73.

**This is worth fixing or switching off regardless of anything to do with multi-tenancy.**
A cron line pointing at a missing file is not harmless — it is a job somebody believes is
running.

---

## What else exists only in that folder

Grouped by whether losing it would matter.

### Load-bearing code with no other copy

| What | Files | Live? |
|---|---|---|
| **Task Prompt Worker** | shell script, runner, 4 library modules | scheduled, currently dead (above) |
| **Student platform build-plan sync** | `buildPlanIngestService`, `buildPlanSchema`, `buildPlanIngestHelpers`, `buildPlanWebhookController`, `StudentSprint` model, 2 test files | not referenced by the real codebase, so dormant |
| **Chapter quality scoring** | `chapterQualityService`, `chapterOnTopicGuard`, 2 test files | dormant |
| **Commission pipeline** | 9 files under `scripts/commission/` | see the note below |
| **Basecamp reference kit** | 7 files including a zero-access bootstrap | reference material, not scheduled |
| `bcTokenRefresh.js` | 1 | the equivalent *is* in the real codebase under another path |

### Skills that do not exist for anyone else

Three of the skills you use are absent from the real codebase entirely:

- **story-build** (6 files)
- **short-form-video** (5 files)
- **monthly-commission** (1 file)
- **build-curriculum-type** is partially there: 1 file merged, 4 reference documents did not

These work for you because you are sitting in the folder that has them. Anyone who clones
the repository fresh, and every worktree created from the real codebase, silently does not
have them. That is why my own session could invoke `monthly-commission` from the OneDrive
folder but the clean worktree I did the multi-tenancy work in has no such skill.

### Not worth rescuing

Session changelog HTML files, two marketing `.mp4` renders, and assorted walkthrough
documents. These are outputs, not sources. They can be regenerated or simply let go.

---

## A note on the commission pipeline

The commission cron line is **not** broken:

```
0,30 8-22 * * 1-5  /opt/ai-pathway/run_comm_pipeline.sh   ← exists, different repository
```

That runs out of the AI Pathway project, which is its own repo. The nine
`scripts/commission/` files in the OneDrive folder are a separate, later implementation
that pairs with the `monthly-commission` skill. Before rescuing them, it is worth
establishing which of the two is the one you actually want to keep — I did not assume.

---

## The stash pile

Twelve stashes, and the ages matter:

| Age | Count | Assessment |
|---|---|---|
| 10-11 days | 2 | Recent. One is from a *different worktree* (`worktree-agent-a63ad…`) and one from the Reese Phase 3 branch. Plausibly still wanted. |
| 5 weeks | 1 | Community Rooms backend. That feature shipped, so this is probably superseded. |
| 2 months | 1 | `p2-staging-temp`. Name suggests it was always throwaway. |
| **5 months** | **8** | Booking funnel, Apollo webhook, Leads page, Auto-Advance curriculum engine and others. Almost certainly dead — the codebase has moved 2,600 commits since. |

This pile is exactly the hazard behind the standing rule never to blindly stash-pop in this
repo: `stash@{0}` does not belong to this branch at all, so a reflexive `git stash pop`
here would apply another session's work into your tree.

## The rest of the working tree

- **63 tracked files modified** and uncommitted. A real mix: public-site pages
  (`HomePage`, `PricingPage`, `EnrollPage`, `ProgramPage`), backend services
  (`schedulerService`, `emailService`, `enrollmentService`), and
  `docker-compose.production.yml`. Some of this may be genuinely unfinished work; some is
  likely drift from experiments never cleaned up. I did not attempt to judge which,
  because the diffs are large and several touch the live sending path.
- **795 untracked files**, overwhelmingly `tmp/` scratch files, screenshots and session
  HTML. Noise.
- **2 deleted files**.

---

## What I would do, in priority order

Your call on all of it — nothing here has been actioned.

1. **Deal with the dead cron job this week.** Either restore the Task Prompt Worker
   properly (merge its six files, fix the duplicate-signature bug that broke its last
   real run) or remove the cron line. Leaving a scheduled job pointing at a missing file
   is the worst of the three options.
2. **Get the three missing skills into the real codebase.** Small, safe, and it stops your
   tooling from depending on one folder on one machine.
3. **Decide the commission question** — the AI Pathway version or the newer local one.
4. **Rescue or discard the dormant code** (build-plan sync, chapter quality). It is
   finished-looking work with tests that nothing currently calls.
5. **Drop the eight five-month-old stashes** once you have glanced at the list. Keep the
   two recent ones until their branches are resolved.
6. **Then, and only then**, decide whether the folder gets brought up to date or retired
   in favour of clean worktrees.

The folder is not on fire. But one job is silently not running, and a handful of genuinely
useful things exist in exactly one place, on one machine, inside a sync client.
