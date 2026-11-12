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
  - Shipped: merged 2026-11-12 (#3971), deployed 087c2b756 (backend + nginx), production-verified
    in a real browser on all 6 listed profiles at 1320 and 390, light and dark: no sideways scroll,
    0 page errors; Kes's carousel 9 slides, 9 thumbnails, advanced 01 -> 02 on its own.

- [x] Phase 2: backend tables and endpoints, plus the extended profile payload
  - Date: 2026-11-12
  - Session: CC-20261106-fv8g
  - What changed: `db/ensureHireInterviewSchema.ts` (4 new tables, additive, rollback statements
    beside them, run at boot): `hire_profile_intro`, `hire_interview_availability`,
    `hire_case_study_order`, `hire_interviews`. `services/hire/hireSlots.ts` (pure slot math: the
    candidate's Mon-Fri morning/afternoon/evening blocks in THEIR zone, half-hour starts that end
    inside the block, minus notice, overlaps with held times and full weeks; per-date UTC
    conversion so DST weeks are right). `hireStudioSettings.ts` (intro, availability and order:
    zod schemas, idempotent upserts, and the only public projections). `hireInterviews.ts` (public
    slots, and a request decided under a per-candidate advisory lock, duplicate per employer +
    slot). `hireInterviewInbox.ts` (the candidate's list and confirm / decline / propose).
    Routes: `GET /api/public/hire/talent/:slug/slots` (no-store), `POST /api/public/hire/interviews`
    (JSON or form 303 to a fixed URL), the five learner routes under the portfolio gates.
    `GET /api/public/portfolios/:slug?surface=hire` now carries `hire.intro`,
    `hire.caseStudyOrder` and `hire.booking`; each is optional and falls back on failure.
  - Verification: backend tsc clean against a planted control error; test-file typecheck gate
    clean (only the local-only enrichVisitorGeo maxmind error); jest (CI config) 18 suites /
    158 tests pass, the integration suite skipping without a database
    (new: hireSlots incl. both DST changes, hireInterviews, hireStudioSettings,
    hireInterviewInbox, hirePortfolioExtras, publicHireInterviewRoutes, hireStudioController).
    Mutation-checked: removing the overlap rule fails 2 suites; dropping the enrollment scope
    from the inbox read fails its suite. New `hireInterviews.integration.test.ts` runs the DDL
    twice, the upserts, duplicate and a 3-way race for one slot against real Postgres in the CI
    integration tier.
  - Notes: sends NOTHING. Emails, the .ics, the room link and the lead_sources ingest are Phase 4
    (the kit ships notifications with the schedule page), so `confirm` records the decision only
    and `auto_confirm` is stored but not yet acted on. Booking is OFF by default, so every
    existing profile (Kes included) keeps Request intro and cannot receive a request. Holidays
    are not removed from slots yet. Location is studio-only (the kit's public chips are roles,
    setup and earliest start).
