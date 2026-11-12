# Session CC-20261106-fv8g: hire.refactored.ai profile upgrade

Kit: `hire-profile-upgrade.zip` (Ali, 2026-11-12), copied to `docs/hire-refactored/profile-upgrade-demo/`
(PROMPT.md + static demo). Five phases, one PR each, in the kit's order. This file is the log for
the workstream; it is separate from `CC-20261106-fv8g.md` so open PRs on that log never conflict
with these.

- [x] Phase 1: case-study carousel, thumbnails, and a ledger that never shows a 0 tile
  - Date: 2026-11-12
  - Session: CC-20261106-fv8g
  - What changed: `apps/hire-refactored-public/src/assets/portfolio.js`: `carouselSlides()` (every
    published Hire case study exactly once, signature first, then `hire.caseStudyOrder` when present,
    then API order; projects only set the kicker), `carousel()` and thumbnails (pure markup), and
    `ledgerTiles()` / `metricTile()` (zero or missing figures drop out; the record's own headline
    figures, largest first, then the walkthrough count, fill in). The signature card and both
    `.projs` grids are gone. Copy link is a 44px icon button with an accessible name. New
    `src/assets/carousel.js` runs it: 6s advance, pauses on hover and focus and in a hidden tab,
    play/pause, arrows, thumbnails, starts paused under reduced motion; progress line is scaleX.
    `portfolio.css` styles, `motion.css` keyframes + reduced-motion line, `launch.js` accepts
    `carousel` as a launch source, talent shell loads the script.
  - Verification: node --test hire site 106/106 (new carousel.test.js; portfolio.test.js rewritten
    around the carousel, keeping every guarantee the old card tests held). Kes's LIVE profile with
    these assets swapped in (Playwright route, real API, real origin): 9 slides, 9 thumbnails, no
    sideways scroll at 390 in light and dark, 0 page errors; advanced 01->02 after 6s, held on hover,
    next + ArrowRight -> 04, pause relabels "Play carousel", thumbnail -> 09; reduced motion stays on
    01. Ledger before 9 | 0 | 0 | 8, after 9 | 8 | 268 | 97%. `build.js` ships `carousel.js?v=...`.
    Screenshots: `docs/screenshots/2026-11-12-hire-profile-p1/`.
  - Notes: kept "Request intro" as the primary action and left out "In their words" and the
    booking card: their data arrives in Phases 2-4, and the kit's collapse rule says an absent
    piece renders nothing. Thumbnails use an equal-column wrapping GRID, not the kit's flex-wrap:
    flex stretched the lone last thumbnail to full width at 390px. The demo's "26,773" is not in
    Kes's record; his figure is "268 of 20,773", and that is what renders. Thumbnails load the full
    1536px covers (170-330 KB each); a small thumbnail rendition is a follow-up.
