# Reese: shadow mode → real enforcement, Phase 1 — report

For Ali. Covers Phase 1 of taking Reese off shadow mode. Shipped as PR #2744, merged, deployed
to production, independently verified.

## What changed, one concrete example

Before this, if a human approved one of Reese's held actions, nothing happened. The button
worked, the status flipped to "approved" in the database, and that was it — no message ever
went out. Approving something was theater.

Now there's a real page — `/admin/approval-requests` — and approving something there genuinely
sends the held message, exactly once, no matter how many times you click it or how many items
you select at once. It shows you exactly what would send before you click, and says plainly that
clicking Approve is real and can't be undone.

## What you can see or control, and where to click

- **`/admin/approval-requests`**: the first real screen for this queue. See what's held, see
  exactly what it would send, approve or reject it, or select several and approve them together.
- Anything nobody reviews within about 4 hours releases on its own — a default I chose based on
  how often Reese's own outreach actually runs, not something you specified. Tell me if you want
  it different.

## A real bug this caught before it shipped, not after

My first design had a serious problem: approving several items at once would have sent each held
message twice. The "approve one" button and the "approve several at once" button both ended up
calling the real send — once through each path, for the same item. I caught this myself before
writing a line of code that would ship, with a second independent check confirming the fix: the
send can now only ever fire once per item, enforced at the database level, not just by careful
coding.

## What was verified, and in which environment

- 58 tests (50 backend, 8 frontend) passing, including a dedicated test proving the double-send
  bug is fixed — approving a batch of 2 real test items sends exactly 2 messages, never 4.
- Two independent, adversarial reviews of the plan before any code was written — the first one
  is what caught the double-send bug above.
- **Production**: independently verified, full pass. The live queue happened to be empty at
  verification time — nothing across the whole platform currently needs review — so the check
  confirmed the real page, real empty state, and real security (locked to admins only) all work,
  and confirmed the send logic itself by reading the exact code now running in production. What
  it deliberately did NOT do: click Approve on anything real. That would have sent a real message
  to a real student as a side effect of testing, so it didn't happen. The first real approval
  will be a moment either of us chooses on purpose.

## What's still true, unchanged

- Shadow mode itself is untouched. Reese's own code still doesn't check whether an action was
  approved before sending — nothing about her actual day-to-day behavior is different today.
- You asked for a per-agent switch instead of one platform-wide setting — I've logged that as
  real, upcoming work for the next phase. Today there's no per-agent concept at all; building it
  needs its own real design pass, not a guess.

## Next

Two things remain, each needing your own separate go-ahead before I touch either:

1. **Phase 2** — wire Reese's two real send paths to actually check the approval verdict instead
   of ignoring it. I found this is more work than first assumed: her outreach path already checks
   and ignores it, but her reply path doesn't check at all today — that one needs a check built
   from scratch, not just switched on.
2. **Phase 3** — build the per-agent switch you asked for, then the actual flip, likely on
   staging first before anything in production.
