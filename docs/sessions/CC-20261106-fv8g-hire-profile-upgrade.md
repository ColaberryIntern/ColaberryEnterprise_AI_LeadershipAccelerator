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
  - Shipped: merged 2026-11-12 (#3974), deployed a6570baf8 (backend + nginx). Production-verified:
    boot log "[DB] hire interview schema ensured" with no skipped statement; the 4 tables exist
    and are empty (read-only SELECT); Kes's hire payload carries intro null, order [], booking
    off and no "@"; his slots endpoint 200 + no-store + empty; unknown slug 404; learner route 401
    without a session; all 6 listed profiles render in a real browser at 1320/390, light/dark,
    0 errors, no sideways scroll.

- [x] Phase 3: the candidate studio ("Hire profile" tab in /portal/portfolio)
  - Date: 2026-11-12
  - Session: CC-20261106-fv8g
  - What changed: new `frontend/src/pages/portal/portfolio/hire/`: `HireStudio` (header with the
    "N of 7" strength meter as a progressbar, Preview my public profile, a left menu with badges
    that wraps on phones, each data source loading and failing on its own), `HireOverview`
    (interview requests in the candidate's zone with Accept / Suggest a time / Decline, the
    7-item "Finish your profile" checklist with jump CTAs, and the availability panel folded in
    from Publishing), `HireAboutYou`, `HireInterviewTimes` (Mon-Fri x morning/afternoon/evening
    44px aria-pressed grid, formats, weekly cap, notice), `HireCaseStudyOrder` (star, up, down,
    labelled), `HireIntroVideo` (says what is coming, shows the three prompts), pure
    `hireStudioModel`, `HireStudio.css` (portal tokens only). `services/hireStudioApi.ts`.
    `PortfolioPage` gains the tab. Backend: the case-study-order read also returns titles,
    covers and the Hire address; the profile's signature is the candidate's starred (first
    ordered) case study, falling back to the featured pick.
  - Verification: frontend tsc clean against a control error; CI=true production build compiles
    (lint as errors); portfolio jest 73/73 (new hireStudioModel, HireStudio, HireStudioPanels);
    a reorder mutation fails 2 suites. Backend tsc clean, test-file typecheck clean, hire jest
    160 pass. The real build rendered in Chrome with the studio API stubbed: every section at
    1320 and 390, light and dark: 0 page errors, no sideways scroll, no control under 44px.
    Screenshots: `docs/screenshots/2026-11-12-hire-profile-p3/`.
  - Notes: Intro video recording is Phase 5, so that section offers no dead control. "Confirm
    automatically" is not offered until Phase 4 makes it do something. Decline takes no reason
    (the API has no field for one). The headline is stored as a draft only: no admin surface
    reviews `headline_draft` yet, and the copy says the live headline does not change. Photo,
    resume and LinkedIn link to /portal/settings. Gold is the portal's --amber.
  - Shipped: merged 2026-11-13 (#3976). Live via main 16862cce6 (backend started 09:49 UTC, after
    the merge; nginx redeployed). Production-verified: the studio's text is in the served chunk
    824.804c6985; the studio API answers 401 without a session; Kes's public payload unchanged
    (order [], booking off, no "@"); all 6 listed profiles at 1320/390, light/dark: 0 errors, no
    sideways scroll, carousel advanced 01 -> 02 on its own.

- [x] Phase 4: the schedule page, the booking card, "In their words", and the notifications
  - Date: 2026-11-13
  - Session: CC-20261106-fv8g
  - What changed: hire site: `/talent/<slug>/schedule/` (new `src/schedule/index.html`,
    `schedule.js` + pure `schedule-model.js`, `schedule.css`): Format, Time (week grid in the
    viewer's zone, zone picker), Your details (the /intro/ fields + up to 5 interviewers + record
    consent, inline errors, focus to the first), Done (timeline, a tentative .ics hold); and the
    employer's side of a suggested time (`?accept=&t=`). nginx routes it (nested in `^~ /talent/`)
    with `X-Robots-Tag: noindex, nofollow`. Profile: new `profile-extras.js` renders "In their
    words" and the "Book an interview" card; when bookable the head says Schedule interview and
    Contact drops Request intro, otherwise nothing changes. Backend: `hireInterviewNotify` (request
    -> candidate email + an `interview_request` lead on `hire-refactored`, whose notify rule tells
    the team; confirm -> Zoom room via the meeting provider, then one .ics message per person;
    decline / propose -> the employer), `hireInterviewEmails` (all copy), `hireInterviewIcs` (no
    ORGANIZER/ATTENDEE, folded, CRLF), `hireInterviewAccept` (HMAC link over id + time, preview GET,
    confirming POST). Auto-confirm books straight in and the studio now offers it. `?tab=hire`
    opens the studio tab from the emails. 44px fixes on the masthead theme toggle and Shortlist.
  - Verification: backend tsc clean against a control error; test-file typecheck clean (only the
    local maxmind file); jest 474 pass across hire, routes, controller and seeds (new
    hireInterviewNotify, hireInterviewAccept; extended routes, controller, hireInterviews,
    integration). Token-check mutation caught. Hire site node --test 129/129 (new schedule,
    profileExtras, nginx route). Frontend tsc clean against a control error, CI=true build
    compiles, portfolio jest 76/76. Real nginx (the production image, throwaway container on the
    host): `nginx -t` ok; the schedule path serves its shell with X-Robots-Tag noindex and the
    security headers; the profile path unchanged. Chrome on the real hire origin with the new
    assets and a stubbed API: profile + all four steps + accept, 1320/390, light/dark: 0 errors, no
    sideways scroll, no control under 44px, no unlabeled input. Screenshots:
    `docs/screenshots/2026-11-13-hire-profile-p4/`.
  - Notes: emails go only through `sendOnce` (one recipient per message, ledger-deduped) and fire
    after the response; failures are logged by class and never undo the decision. The team alert
    and the intro form both need the `hire-refactored` lead source, which production does NOT
    have yet (read-only SELECT 2026-11-13: 0 rows), so the seed must run once at deploy. Video
    stays Phase 5. Employer reply-to is not promised in copy: the emails point at the intro form.
