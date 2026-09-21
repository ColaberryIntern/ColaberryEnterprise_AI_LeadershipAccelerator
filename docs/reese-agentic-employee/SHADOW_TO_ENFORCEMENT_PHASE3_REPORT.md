# Reese: shadow mode → real enforcement, Phase 3 — report

For Ali. Covers Phase 3: the per-agent switch you asked for. Shipped as PR #2751, merged,
deployed to production, independently verified — including a real screenshot of it working on
Reese's own page.

## What changed, one concrete example

Before this, there was exactly one lever for the whole platform: `abac_enforcement`, on or off
for every agent at once. You asked for something more precise: "I would like a switch for each
agent so I can turn off/on Shadow mode."

Now every agent's own detail page has one. Open any agent, click **Performance & Settings**, then
**Authority & controls**, and you'll see a real card showing whether that specific agent is
following the platform default or has its own override, plus a working control to set it. Reese's
own page shows it today, correctly, as "Currently: Shadow — following the platform-wide default."

## The switch is real and live, but I have not used it

This is the important part, per your own instruction: "build the switch, don't use it yet." I
built it, tested it thoroughly, deployed it, and independently confirmed it works — but at no
point did I set any real agent's override to anything. Every agent, including Reese, is still
sitting on the untouched default right now. A live, read-only query confirmed this directly
against the production database after deploy: zero agents anywhere on the platform have an
override set.

This is different from Phase 2. Phase 2's change was mathematically incapable of doing anything
until a later phase flipped the global switch — it was safe by construction. This one is not: the
moment someone clicks "Enforce" and "Save" on a real agent's page, that agent's real actions
actually start getting blocked when policy denies them, right then. The safety here came entirely
from discipline — never clicking it during this work — not from the code being unable to.

## A real design decision worth knowing about

The platform still has a separate, rarer "fully off" state (distinct from Shadow and Enforce) —
a bigger, more sweeping switch than the one you asked for. I deliberately did not extend the new
per-agent switch to include that state; it stays global-only. And I made sure that if the
platform is ever in that fully-off state, it always wins over any per-agent override, even if
someone had set an agent to Enforce — tested directly, not assumed.

## What was verified, and in which environment

- 118 tests across 6 test files, all passing — including a dedicated test proving the switch
  never leaks between agents (setting one agent's override never touches another's), and a test
  proving the platform's fully-off state always wins over any per-agent setting.
- One independent, adversarial review of the plan before any code was written.
- A real bug in CI (not in my design) — 7 other, unrelated test files needed the same small
  update mine already had. Caught by CI before merge, fixed, verified clean, then merged.
- **Production**: independently verified, full pass, including something new for this session —
  a real screenshot of the actual card rendering correctly on Reese's own live page, confirming
  it's not just "the right code is deployed" but "the page genuinely works," since the automated
  checker in this pass didn't have a way to click through the page itself.

## What's still true, unchanged

- Every real agent's day-to-day behavior is completely unchanged today. Nothing has been switched.
- The platform-wide `abac_enforcement` setting itself is also untouched.

## Next

One thing remains, and it's the real decision, not busywork: actually setting any agent to
Enforce — including Reese — for the first time. That's yours to choose, whenever you're ready,
agent by agent, on the page itself. I won't do it without you asking directly.
