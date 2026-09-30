# Reese: shadow mode → real enforcement, Phase 2 — report

For Ali. Covers Phase 2 of taking Reese off shadow mode. Shipped as PR #2747, merged, deployed to
production, independently verified.

## What changed, one concrete example

Before this, Reese's two real send paths never actually looked at whether an action was
approved. Her proactive outreach checked, then threw the answer away before sending anyway. Her
DM replies to students never checked at all — there was no code to check with.

Now both paths genuinely read the answer and act on it. If an action is ever held, Reese won't
send it — she'll hold it, log why, and leave it for the real approval queue Phase 1 built. Today
that branch never actually fires, on purpose: the platform-wide switch is still set to shadow
mode, so nothing is being held right now. What changed is that the wiring now exists and is
proven correct — it's not aspirational.

## Nothing about Reese's day-to-day behavior changes today

This is the important part: **Phase 2 is a genuine no-op in production right now.** I didn't just
claim that — a separate, independent check confirmed it against the live system: the platform
switch is still unset (defaults to shadow), and the real approval-queue table has zero rows
anywhere on the platform, for any agent, meaning the new "hold" branch has never fired once.
Reese keeps sending exactly as she did yesterday.

## A real gap I caught while building this, not after

While wiring the reply path, I found that the wrapper function Reese calls has two different
signals baked into it: one that says "would this be denied, in principle" and a separate one that
says "is anything actually stopping this right now." They sound similar but aren't the same
thing — the first one is true constantly, even in shadow mode, because that's what shadow mode
means. If I'd wired Reese's code to the wrong one of those two signals, shadow mode would have
started silently holding her real messages today, which is exactly the mistake this whole
careful, phased approach exists to prevent. I built against the correct signal and proved it with
a dedicated test before writing the rest of the change.

A second, smaller thing I caught while implementing: the function that reads that signal has a
fallback path for when something internally goes wrong (a database hiccup, for example) — I found
that fallback hadn't been taught to say "allowed" yet. Left as-is, a random internal error could
have looked identical to a real hold. I fixed it and added a test that proves it.

## What was verified, and in which environment

- 57 tests across the three files this touched, all passing, including dedicated tests proving
  today's behavior is unchanged (shadow mode) and dedicated tests proving a real hold works
  correctly (simulated, never against the real platform switch).
- Two independent, adversarial reviews of the plan before any code was written — the first one is
  what caught the internal-error fallback gap above.
- **Production**: independently verified, full pass. The verifier read the actual code running
  in the live container (not just what's in the repository) and confirmed the fix for both gaps
  above is genuinely deployed, confirmed the platform switch is still off, and confirmed the
  approval queue is still empty everywhere. One honest limitation: no real Reese message happened
  to go out during the short verification window right after the deploy, so there's no live
  "before vs. after" side-by-side for that one thing — everything else about the no-op proof is
  solid, and Reese's normal daily sends had already run earlier that day with no issue.

## What's still true, unchanged

- The platform-wide switch is still off. Nothing about what Reese actually sends is different.
- A held reply can't yet be released by approving it — the approval mechanism Phase 1 built only
  knows how to replay outreach messages today, not replies. This is real, disclosed, and logged
  for the next phase to close — it never comes up today since nothing can be held yet.
- The per-agent switch you asked for is still not built. That's still Phase 3.

## Next

One thing remains, needing your own separate go-ahead before I touch it:

- **Phase 3** — build the per-agent switch you asked for, then the actual flip, likely on staging
  first before anything in production.
