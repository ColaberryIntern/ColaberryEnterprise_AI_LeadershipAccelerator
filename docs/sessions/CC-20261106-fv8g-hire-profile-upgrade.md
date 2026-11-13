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
  - Shipped: merged 2026-11-13 (#3981). Live via main 310bc0971 (another session's deploy at
    13:54 UTC; 14d98d2fe is an ancestor). Production-verified: `/talent/kesetebirhan-delele/schedule/`
    answers 200 with `X-Robots-Tag: noindex, nofollow`; the four new hire services are in the
    running image; Kes's payload unchanged (booking off, no "@"); 0 interviews booked. Ali approved
    the one-source seed: `seedLeadSources.js --only hire-refactored` created the source and both
    forms (intro_request, interview_request), all active. A second run proved the seed was NOT
    idempotent (each form superseded by an identical v2; JSONB reorders keys), fixed in Phase 5.

- [x] Phase 5: the intro video
  - Date: 2026-11-13
  - Session: CC-20261106-fv8g
  - What changed: colaberry/video-analysis (read with Ali's GitHub account) turned out to be an
    AWS analysis worker (S3 in, `<id>/res.json` out: Transcribe, filler words, pauses), with no
    upload, transcode or playback API, and this backend has no AWS identity that can reach its
    buckets. Ali chose: build now, plug the analysis in later. So: `hireVideoTranscode` (ffmpeg,
    argument arrays, timeouts; H.264/AAC 720p `+faststart` + JPEG poster; length measured on the
    output, 3s..180s), `hireVideoFiles` (24-hex asset ids on the `uploads` volume, path asserted
    under the root), `hireVideoService` (upload = draft, replace removes the old asset, publish /
    unpublish, captions choice, delete; HMAC preview token for drafts), `hireVideoAnalysis` (pure:
    the worker's res.json into WebVTT captions + candidate-only coaching sentences),
    `hireVideoAnalysisClient` (the hand-off; mode stays 'off' until a transport is registered, so
    nothing ever waits on a result that cannot come). Routes: studio GET/POST/PUT/DELETE
    `/api/portal/career/portfolio-page/hire-video`; public extensionless
    `/api/public/hire/video/<id>/(stream|poster|captions)` (published, or a signed draft preview;
    `Cross-Origin-Resource-Policy: cross-origin`, range requests). nginx raises the body cap to
    100m for the upload path only. Studio: record in the browser (MediaRecorder, 90s cap, REC pill,
    prompt overlay, Next prompt), show the take back, upload with progress, Publish / Unpublish,
    replace, delete (two-step), "Add captions automatically", tips, and a coaching card that says
    plainly analysis is not switched on yet. Hire profile: `crossorigin="anonymous"` on the video
    so the cross-origin caption track loads. Schema: two additive columns (`video_coaching`,
    `video_captions_wanted`). Seed: `sameJson` makes the lead-source seed order-blind.
  - Verification: backend tsc clean against a control error; test typecheck clean (only the local
    maxmind file); jest across hire, routes, controllers, seeds and the repo guards: 7365 pass, the
    1 failure is mountLearnerPortalRoutes, a CRLF artifact of this Windows checkout (green on CI's
    LF checkout of main). New: hireVideoTranscode (incl. a REAL ffmpeg run: WebM -> faststart MP4 +
    JPEG), hireVideoFiles, hireVideoAnalysis, hireVideoService, publicHireVideoRoutes (behind real
    helmet), hireVideoController. Preview-token mutation caught. Frontend tsc clean against a control
    error, CI=true build compiles, portfolio jest 89/89. Hire site node --test 129/129. Real nginx
    (production image, throwaway container): `nginx -t` ok; 2 MB to the upload path passes (401, no
    session), 2 MB elsewhere 413, 101 MB to the upload path 413. Real Chrome with a fake camera:
    recorded a real WebM, showed it back, uploaded it, the draft played (8s) with 2 caption cues;
    1320/390 light/dark: 0 errors, no sideways scroll, nothing under 44px. Hire profile with real
    cross-origin servers: captions load 2 cues, poster loads; negative control without CORS loads 0.
    Screenshots: `docs/screenshots/2026-11-13-hire-profile-p5/`.
  - Notes: one asset per candidate (the Phase 2 columns), so a replacement is a draft and hides the
    old video until it is published. Captions and coaching need the analysis transport: an IAM key
    (put on colaberry-video-analysis-input-prod, get on -output-prod) and the AWS SDK, a new
    dependency; both are Ali's call. Security note for Ali: that repo commits its AWS keys
    encrypted with a key that sits in dpu.py, which is the same as committing them; they should be
    rotated. An empty recording (a cold camera gave a 201-byte take in the first Chrome run) is now
    caught before upload.

- [x] Phase 5 shipped: merged, deployed, production-verified
  - Date: 2026-11-13
  - Session: CC-20261106-fv8g
  - What changed: #3998 merged as 1dc95c85f; "Build images" succeeded on it; deployed with
    `./scripts/deploy-prod.sh backend nginx` (exit 0, prod HEAD 1dc95c85f, backend image created
    18:45 UTC, no other deploy running beforehand).
  - Verification (live, read-only): the six hireVideo modules and publicHireVideoRoutes are in the
    running dist; `hire_profile_intro` has `video_coaching` and `video_captions_wanted`; 0 videos
    stored. Through enterprise.colaberry.ai: an unknown video id 404, a bad kind 404, the studio
    GET 401 with no session, a 2 MB upload to the video path 401 (body cap raised there), 2 MB
    anywhere else 413; the nginx rule is in `conf.d/default.conf`. Kes's public payload: no
    video, no booking, 0 "@" in the Hire block (the one "@" is `portfolio.identity.email`, shown on
    the portfolio page by design and untouched by this phase). Nothing uploaded or booked as Kes.
  - Notes: captions and coaching stay off until the analysis transport lands (IAM key + AWS SDK,
    Ali's call).

- [x] Phase 6: the five follow-ups (holidays, small thumbnails, headline review, decline note, directory ★)
  - Date: 2026-11-13
  - Session: CC-20261106-fv8g
  - What changed:
    - Holidays: `openSlots` skips every observed US federal holiday on the candidate's own
      calendar date, from `govWorkingDays.usFederalHolidays` (the gov build calendar), so the
      profile's next times, the public slots and the booking re-check all agree.
    - Small thumbnails: `scripts/case-study-thumbnails/make-small.js` writes a 320x180 copy of every
      cover to `frontend/public/site-v2/sm/` (39 files, all under 18.3 KB; the originals run to
      344 KB). The Hire profile's strip loads it (`common.thumbUrl`, lazy, fixed size); the slide
      keeps the full cover. A hire-site test fails if any cover lacks its small copy (mutation:
      removing one fails it). README step 5 says to run it.
    - Headline review: `hireHeadlineReview` + `hireHeadlineController`, admin-only
      `GET/POST /api/admin/career/hire-headline-drafts[/:enrollmentId]`, and a "Hire headline
      changes" section on /admin/career-review (hidden for mentors). Approve writes the REVIEWED
      text to `approved_identity.title` (live on Hire now) and `enrollments.title` (so the next
      portfolio approval keeps it) in one transaction, and only while the draft still matches
      (else 409); Decline clears the draft.
    - Decline note: optional, up to 500 characters (`declineSchema`, strict), stored in the new
      additive `hire_interviews.decline_reason`, and quoted to the employer in the decline email
      (HTML-escaped). The studio's Decline now opens a note box and needs a second click.
    - Directory ★: `signatureFor(cases, order)` is the one rule for the profile and the directory
      card; the directory reads every listed person's order in ONE query, adds it to the card
      cache key, and falls back to the featured pick (logged) if that read fails.
  - Verification: backend tsc clean against a planted control error (only the local maxmind
    file); test-file typecheck gate (8 GB) clean apart from the same local file; backend jest over
    hire, routes, controllers, seeds and guards: 6734 pass, 1 failure = the CRLF-only
    mountLearnerPortalRoutes. New tests: holidays (Thanksgiving, Christmas/New Year across the year,
    an observed 3 July, a Kolkata-zone date), directory ★ (one read, cache miss on a new ★, withdrawn
    slug, failed read), decline note (stored, blank = none, 400s, confirm never writes one, email
    escaped), headline review service + routes (auth through the real router, 400s, 409). Frontend
    tsc clean against a control error, CI=true build compiles, portfolio jest 91/91, new
    HireHeadlineReview 3/3. Hire site 132/132. The new SQL ran READ ONLY against production
    (list query, batched order read, jsonb_set on a literal): all parse; 0 drafts pending today.
    Real Chrome on a local production build with stubbed APIs: studio decline and admin headline
    review at 1320/390, light/dark: 0 page errors, no sideways scroll, nothing under 44px; the note
    reaches the POST body and Approve sends the exact draft. Screenshots:
    `docs/screenshots/2026-11-13-hire-profile-p6/`.
  - Notes: assumptions logged: US federal holidays apply to every candidate (the programme is US);
    headline approval is admin-only like the spotlight; a declined headline is not announced to the
    candidate (the box simply clears); the note is shared with the employer and the studio says so.
    Not in scope: live-path visitor categorization of `/talent/<slug>/`.

- [x] Phase 6 shipped: merged, deployed, production-verified
  - Date: 2026-11-13
  - Session: CC-20261106-fv8g
  - What changed: #4013 merged as c189d6521; "Build images" succeeded on it; deployed with
    `./scripts/deploy-prod.sh backend nginx` (exit 0, prod HEAD c189d6521, no other deploy running).
  - Verification (live, read-only): `hireHeadlineReview` and the holiday rule are in the running
    dist; the deployed `openSlots` offers Wed 25 and Fri 27 November and not Thanksgiving (26th);
    `hire_interviews.decline_reason` exists; no profile has booking on today. Through
    enterprise.colaberry.ai: both headline-review endpoints answer 401 without an admin session;
    `/site-v2/sm/thumb-cora-recovery.jpg` serves 200 image/jpeg at 18,235 bytes (the full cover is
    249,839); hire.refactored.ai serves the `thumbUrl` build. `GET /api/public/hire/talent`: 6
    listed, each with a signature, and Kes's card signature equals their profile's.
    `GET /api/public/portfolios/kesetebirhan-delele?surface=hire`: hire block present, no video,
    booking off, 0 "@" in the hire block, identity.email null, order [].
  - Notes: CORRECTION to the Phase 5 shipped note: its Kes check read
    `/api/public/portfolios/<slug>` WITHOUT `?surface=hire`, which carries no hire block, so its
    "no video, no booking" came from an absent block. Re-checked here on the hire surface: the
    conclusion holds (no video, booking off, no "@").

- [x] Phase 7: Hire visitor analytics categorise (code; production repair awaits Ali)
  - Date: 2026-11-13
  - Session: CC-20261106-fv8g
  - What changed: root cause found read-only on production: the `hire-refactored` lead source had
    no tenant/brand and hire.refactored.ai no `brand_domains` row, so all 2,316 Hire events
    resolved to no brand and used Colaberry's map (every profile, booking, case-study and /intro
    view `other`; all session landings `other`). And the brand map listed only the on-disk shells
    (`/talent/record`, `/schedule`), never the live paths the tracker reports. Fixes:
    `pageCategoryMaps.ts` gains anchored `pattern` rules plus `/talent/` and `/case-studies/`
    prefixes for the refactored brand (`/talent/<slug>/schedule` is `contact`, profiles and
    case studies `case_studies`); `getOrCreateSession` categorises the landing page under the
    resolved brand (`brand_slug` from both tracking endpoints); `ecosystemSeedData` adds
    hire.refactored.ai (web, non-primary) and `hire-refactored` to the brand's sources; new
    `scripts/attachHireTrafficToRefactoredBrand.ts` repairs history for Hire rows only
    (dry run by default, one transaction, guarded so a re-run writes nothing, re-categorises
    only rows still `other`, via `categorizePagePath` itself, only events on hire.refactored.ai).
  - Verification: new tests `hireLivePathCategories` (live paths, booking not swallowed, no
    over-claim, nginx routes still exist), `visitorSessionLandingCategory`, ecosystem seed row,
    parity test that both endpoints pass the brand, planner tests; mutations (drop the session
    brand, disable patterns) fail 5 tests. Backend tsc clean against a control error; test-file
    gate clean (local maxmind only); jest CI config over __tests__/services/controllers/seeds:
    7,513 pass. Production, read-only: predicted scope 357 sessions, 2,326 events (10 off-host,
    excluded), 24 distinct `other` paths; all 6 write statements EXPLAIN cleanly (plan only).
  - Notes: the repair is a production write and is NOT run; it waits for Ali's go-ahead after
    deploy. Lead scores already computed from the old categories are not recomputed.
