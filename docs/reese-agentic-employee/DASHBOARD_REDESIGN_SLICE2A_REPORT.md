# Dashboard redesign, Slice 2a — report

For Ali. Covers Slice 2a of the Agent Detail dashboard redesign (the Work/Decisions tab split).
Shipped as PR #2730, merged, deployed to production, independently verified.

## What changed, one concrete example

Open Reese's Agent Detail page. The tab bar used to show one combined "Work & Decisions" tab.
Now it shows two: **Work** and **Decisions**.

Click "Work" — 4 real filter buttons: Overdue, Ready to verify, Needs a reply, Open, each with a
live count. Today that's 0 / 0 / 0 / 36 for Reese — every ticket she owns is genuinely current,
so the first three buckets show their real empty-state sentence ("No tickets are overdue right
now.") instead of an empty box. Click a ticket in the Open list and it expands to show the real
description, priority, type, and timestamps.

Click "Decisions" — the same Pending Approvals + Decision Journal content that used to live
under the old combined tab, unchanged. Nothing about how approvals work moved or changed, only
where the tab lives.

## What you can see or control, and where to click

- **Work** (new top-level tab): a real ticket list filtered into 4 honest buckets, each backed
  by a real field, not a guess.
- **Decisions** (relocated top-level tab): the same real Pending Approvals + Decision Journal
  content, same approve/reject buttons, same behavior.
- **At a Glance**: the tile that used to say "Work & Decisions" now says "Decisions" (its real
  number was always the pending-approvals count, never a ticket count) and takes you to the
  Decisions tab.

## The honesty call this slice made

Your mockup's Work tab filters by "Waiting on Ali," "Waiting on staff," and "Waiting on
student" — a 3-way split on WHO a ticket is blocked on. I checked every real field on a ticket
(status, assignment, activity history) and none of them record who a ticket is currently waiting
on. Building that filter would mean guessing at something the data doesn't actually say.

Instead, the Work tab uses 4 buckets built from fields that ARE real:

- **Overdue** — the ticket's real due date has passed and it isn't finished.
- **Ready to verify** — the ticket is genuinely sitting in review status.
- **Needs a reply** — the last real action on the ticket was someone other than Reese, so she
  hasn't followed up yet.
- **Open** — everything else that's still active.

This stays inside your own decision (derive from what's already there, don't add a new database
column) rather than fabricating a 3-way split the data can't actually support.

## What was verified, and in which environment

- Backend: 26 test suites / 335 tests passing, including a full precedence/boundary suite for
  the new filter logic. Frontend: 115 tests passing across the touched components. `tsc --noEmit`
  clean on both stacks.
- An independent plan-audit (before any code was written) scored 18/20 and caught 2 real, small
  gaps — both fixed before the plan was executed.
- The test suite itself caught a real design gap during development: a closed (done/cancelled)
  ticket was initially falling into the wrong filter bucket. Fixed so a closed ticket is excluded
  from the Work tab entirely, rather than mislabeled.
- **Production**: independently verified by a `loop-production-verifier` pass. Real click-through
  on the live site with screenshots, confirmed on both Reese's page and a second, unrelated
  agent's page (Dara), proving this works for every agent, not just Reese. The verifier's first
  pass correctly flagged that I'd deployed before finishing this run's own paperwork
  (`deployment-log.md`) — a real process miss, fixed immediately; the deploy itself was already
  live and correct the whole time.

## What's still missing or disabled

This is Slice 2a only. Slice 2b — Overview's hero sentence, the mockup's 4-tile KPI shape, a
standalone "Needs Ali" card, the "Work, explained" decision timeline, and the mockup's 4-panel
decision inspector — is real, deliberately deferred scope, not started. The decision inspector
specifically needs fields (blast radius, reversibility, expected result) that don't exist on a
real proposed action today; building it would mean fabricating that detail, so it waits until
those fields are real.

## Next

Slice 2b, once you're ready — I'll scope it the same way, as its own plan for review before any
code ships.
