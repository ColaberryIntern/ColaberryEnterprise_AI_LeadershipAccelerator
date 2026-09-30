# Reese workspace mission, Phase 2 — slice 1: her first real, persisted work unit

For Ali. Covers the first slice of Phase 2 ("a bounded, persisted work loop") from the
upgraded mission brief. Shipped as PR #2763, merged, deployed to production, independently
verified.

## What changed, with one concrete example

Before this, when Reese answered a student's DM, nothing durable recorded that she had a real
piece of work in flight, what it was, or how it ended. The reply itself worked, but there was no
row anywhere saying "Reese is working on replying to Jordan" the way a human employee's own task
tracker would.

Now, every time Reese replies to a student DM, she creates one real row — a work unit titled
"Reply to `<student name>`," tagged with the real capability it needed
(`student_support.reply`) and her real risk tier (R3) — and drives it through to a real ending:
`done` if she sent a reply (or genuinely decided none was needed), `blocked` if the reply was
held for approval instead of sent, or `failed` if something broke along the way. This is the
first place anywhere in the platform where a persisted work item is actually driven by an
agent's own real decision-making, rather than written after the fact as an audit trail.

## Why this scope, not the whole of Phase 2

The mission brief describes a much bigger Phase 2: goals, plans, steps, commitments, decisions,
wake-up/resume scheduling, all of Reese's 6 behaviours wired in. Before committing to that shape,
I checked whether anything like it already existed anywhere in this codebase to build on — it
doesn't. The one table that looks like it (`ticket_work_units`) is only ever written
after the fact, by a passive audit recorder for a different feature; nothing anywhere reads a
work unit's status to decide what to do next.

Given that, I asked you directly rather than guess how big the first real slice should be, and
you chose: prove it on Reese's simplest case first — her reactive DM reply, which already runs
synchronously and needs no new scheduling machinery — before building the harder parts (the full
work loop, wake-up/resume, her other 5 behaviours). That's exactly what this slice is.

## What you can see and control, and where

- **Admin → Tickets** (`/admin/tickets`), open any ticket tied to a Reese conversation, click the
  **Work Graph** tab. A real work unit for that reply cycle appears there — title, status,
  assigned agent, risk tier — the same page ProofDesk already used for other agents' work units,
  now populated with Reese's real data for the first time.
- There is no new page or control this slice adds. This is deliberately observability, not a new
  lever: nothing anywhere reads this table to gate or change what Reese actually does yet.

## What was verified, and where

- 67 tests across 5 files, all passing, including one per real outcome (a sent reply, a held
  reply, a genuine no-reply decision, and a thrown error), a boundary test proving no work unit
  is created when ticket-linking itself fails, and a regression test proving nothing about what
  Reese sends, when, or to whom changed.
- A real bug this task's own tests caught before it shipped: the code that marks a work unit
  "failed" after an error was written in a way that would have silently crashed on every real
  failure, instead of recording it — caught by the tests I wrote to prove the failure path works,
  fixed, re-verified.
- **Production**: independently verified, full pass — the deployed code matches what was
  reviewed, the mechanism is wired exactly as designed (confirmed by reading the running
  container's own compiled code, not just the source), and nothing about Reese's real reply
  behavior changed. No real reply cycle had occurred yet in the verification window, so the first
  real work-unit row has not been directly observed live — the honest, disclosed state, not a
  gap papered over.

## What's still missing (deliberately deferred, not forgotten)

- Wake-up/resume scheduling — nothing in this codebase can yet say "come back to this work item
  at a specific later time." This slice didn't need it (Reese's reply is synchronous), but the
  fuller work loop will.
- Her other 5 behaviours (outreach, follow-ups, welcome messages, supersession resolution, and
  presence) are untouched — this slice is her reply path only.
- Goals, plans, steps, and commitments — the mission's fuller vocabulary for a work loop — none
  of that exists yet. This slice proves the simplest possible version: one work unit, created and
  closed within a single reply.
- Manager-conversation intent expansion (the Talk tab understanding "give this a real task") is
  untouched.

## Recommended next step

Now that the pattern is proven on her simplest case, the next slice worth doing is deciding
which of her other behaviours gets it next, and whether wake-up/resume scheduling needs to be
built before or after that — that's a real choice, not something to make silently. I'd recommend
picking one more behaviour (outreach is the next most similar shape) rather than building the
wake-up machinery first, but it's your call.
