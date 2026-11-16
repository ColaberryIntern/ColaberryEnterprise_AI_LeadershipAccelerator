# CC-20261115-w8q3 — home, brought to the model (phase 2 of 3)

Phase 1 (`/platform`, nine bands to four) is PR #4082. This is the home page.
The measurement that started both is in
`SESSION_CC-20261115-w8q3-site-fidelity.md`.

## What landed

- [x] Home from ten bands to the model's seven
  - Date: 2026-11-15
  - Session: CC-20261115-w8q3
  - What changed: the rollout grid moved into the hero; the two claims bands
    merged into one; the segment doors and the free-workspace band came off; the
    platform teaser the model has and home did not was added.
  - Verification: measured in a real browser on the built bundle —
    **7 bands, 6,777px** at 1440px against the model's 7 / 7,875px, down from
    10 / 7,792px, and the seven headings appear in the model's order. 0 page
    errors, 0 horizontal overflow at 1440px *and* 390px, one h1, all 5 images
    decode after scroll. 761 publicV2 tests pass. `tsc --noEmit` clean, build
    compiles. Six mutations each turned a new guard red.

## The five moves

| Model | Home before | Now |
|---|---|---|
| hero, with the rollout grid inside it | hero, then a separate dark rollout band | folded in |
| "Build. Guide. Train." | same | unchanged |
| "Three steps. No big-bang project." | same | unchanged |
| "Trust before intelligence." | same | unchanged |
| "Every department's AI work, in one place." | **absent** | added |
| "Short on purpose." | two bands saying it twice | merged into one |
| the close | same | now links `/demo-pilot` directly |
| — | "Who is this for?" | moved to the footer |
| — | the free-workspace band | removed |

## The segment pages were one commit from being orphaned

Home's "Who is this for?" band was their only entry point anywhere on the site.
Four real pages, `/higher-education` among them — the C2.5 beachhead — would
have been reachable only by typing the URL.

`PublicFooterV2` now carries them, **generated from `readySegments()`**: the same
call the retired band used and the same one `App.tsx` maps to routes, so a
footer link still cannot point at a page that is not mounted, and a segment
flipped to `ready: false` leaves the footer in the same commit it leaves the
router.

The five guards that protected that property moved from `HomeV2.test.tsx` to
the footer's suite rather than being deleted with the band. Deleting a live
guard in the same commit that moves the thing it guards is how a page quietly
stops being checked.

## Two guards changed meaning, and both were inverted rather than dropped

1. **The hero's "ships no product screenshot and needs no sample label".** True
   while the hero held nothing but a drawing. The hero now carries the rollout
   grid, which is invented data, so the assertion that would have passed by the
   badge being *absent* is exactly the failure it existed to catch. It is split:
   still no product screenshot, and now the sample label is **required**.

2. **"Stays within the twelve-section budget".** A ceiling cannot catch this
   drift: home ran ten bands against the model's seven and the guard was green
   the whole time. It is now an exact count, failing in both directions, plus an
   ordered check of the seven headings. A band added or dropped is a decision to
   make on purpose, not to notice in a screenshot three weeks later.

## A trap found while wiring the footer

`government` is both a segment slug in `v2Segments.ts` and a static page at
`frontend/public/government/index.html`. It is `ready: false` today, so there is
no collision — but if anyone flips it, nginx's `try_files $uri $uri/` serves the
static directory and the React route never runs, silently. There is now a test
that fails the day that happens, checking ready slugs against directories under
`public/`.

## Mutation-tested

| Mutation | Caught by |
|---|---|
| the segment doors put back on home | band count, order, retired-band list |
| the platform teaser dropped again | the ordered spine |
| the rollout grid loses its sample badge | the hero's sample-label guard |
| a department stage stated by colour alone | the stage-word guards |
| the footer stops deriving the segment links | the moved reachability guard |
| the rollout grid taken back out of the hero | four guards at once |

Baseline 767, restored 767 — the harness checks the file's hash returns to where
it started, after the phase-1 harness restored with `git checkout --` on an
untracked path, which fails the whole command and left six mutations stacked.

## Not in this phase

- Phase 3: `/services` is missing the model's "Common questions." band, and
  `/how-it-works` runs 8 bands against the model's 6. `DepartmentMapSection` is
  still rendered there and is expected to go with it; it is kept rather than
  deleted out from under a page still using it.
- `/book` still needs Ram's two-to-three sentence bio and the purchase link.
- `/pricing` stays as PR #4043 shipped it, per Ali.
