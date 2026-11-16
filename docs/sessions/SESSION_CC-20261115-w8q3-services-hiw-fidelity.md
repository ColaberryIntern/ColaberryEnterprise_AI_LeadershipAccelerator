# CC-20261115-w8q3 — /services and /how-it-works (phase 3 of 3)

Phase 1 is `/platform` (PR #4082), phase 2 is home (PR #4088). The measurement
that started all three is in `SESSION_CC-20261115-w8q3-site-fidelity.md`.

## What landed

- [x] `/services` from four bands to the model's five
- [x] `/how-it-works` from eight bands to the model's six
  - Date: 2026-11-15
  - Session: CC-20261115-w8q3
  - Verification: measured in a real browser on the built bundle —
    `/services` **5 bands, 4,338px** (model 5 / 5,044px, was 4 / 3,559px);
    `/how-it-works` **6 bands, 5,107px** (model 6 / 5,719px, was 8 / 6,311px).
    0 page errors, 0 horizontal overflow at 1440px *and* 390px, one h1 each.
    765 publicV2 tests pass, both copy ratchets pass under the CI jest config,
    `tsc --noEmit` clean, build compiles. Seven mutations each turned a guard
    red.

## /services

| Model | Before | Now |
|---|---|---|
| hero "Build. Guide. Train." | same | unchanged |
| "Three services. One question each." | same | unchanged |
| "Which one fits?" | same | unchanged |
| "Common questions." | **absent** | added |
| the closing band | **absent** | added |
| — | "The demo pilot." | removed |

The demo-pilot band sat above the three cards so a visitor who did not yet know
which service they wanted still had a correct first step. The model has no
equivalent on the chooser, and the fact has not left the page: *Starts with: a
demo pilot / a demo pilot / a free account* is a row in the comparison table,
and the closing band offers one directly. Its test was rewritten to assert that
rather than the band's heading.

The hero CTA pointed at `/contact`, which only resolves because a redirect
route catches it. My own new assertion caught it. It points at `/demo-pilot`
now. **The same is still true of `/pricing` and eleven other pages** — out of
scope here, flagged below.

## /how-it-works

Two bands over: the home rollout grid, which the model does not have on this
page, and the five-stage mechanism, which the model has nowhere.

The rollout band came off. The five stages did **not**: they carry the C2.2
audit's disclosure, each stage saying whether the platform or a person delivers
it, and the note that two of the five are people. A band count is not a reason
to retire an audited honesty. So the band's chrome went and its content stayed,
one level down, under "From one process to the whole company."

Four assertions now hold that fold in place: the six-band count, the absence of
the rollout grid, both delivery labels, and the two-of-five sentence.

## The ratchet caught a word I copied straight from the model

The model labels the chooser's secondary CTA **"Start training free"**. I
copied it, and `frontendCopyLint` refused it: the word is barred on this site
by 40 TAC 807.172(d), and the baseline may only go down. The button says
"Open a company workspace", which is what `/try` actually is.

This is the second time today a ratchet has caught something on the way in
rather than after it shipped. The first was the escaped-dash lint on
`PlatformV2.tsx` in phase 1.

## Mutation-tested

| Mutation | Caught by |
|---|---|
| the chooser FAQ dropped again | the FAQ assertion |
| the closing band loses the model wording | the closing-band assertion |
| the comparison row stops naming the demo pilot | the substance assertion that replaced the band test |
| the five stages given a band of their own again | the six-band count |
| the people-vs-platform labels removed | two disclosure assertions |
| the two-of-five disclosure softened | the disclosure assertion |
| the rollout band put back on how-it-works | the band count and the grid-absence check |

Two of the seven were GREEN on the first run and were **strengthened rather
than accepted**: one changed only an `id`, which nothing asserts, and one
inserted a component without its import, so the suite failed to compile and 24
tests silently stopped running instead of failing. A mutation that stops a
suite running is not evidence of anything.

## Flagged, not fixed

`to="/contact"` still appears on `/pricing` and eleven other pages. Every one
of them works, because a redirect route catches it, but each costs a second
client-side navigation. `/pricing` is explicitly out of scope per Ali, and the
rest are outside this workstream.
