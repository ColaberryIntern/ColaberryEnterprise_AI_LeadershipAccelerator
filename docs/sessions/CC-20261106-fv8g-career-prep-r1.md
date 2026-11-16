# Session CC-20261106-fv8g: Career Prep v27, Release 1 (CP1 to CP5)

Basecamp list: https://app.basecamp.com/3945211/buckets/7463955/todolists/10512940569 · Run directory (local, gitignored):
`.loop-architect/runs/20261116-career-prep-v27/` · Branch `workstream/career-prep-r1` · ONE PR at CP5.5 (Ali, 2026-11-16:
approve, PR and deploy only at major milestones).

Plan audit: cycle 1 FAIL 14/20 (no recruiter role exists; placement section ordering), cycle 2 PASS 18/20.
Assumptions in force (M1 defaults): no eye contact (9 skills); minimal JD-to-questions step, Watch hidden; recruiters
read-only; staff doors in place; reminders in-app + email; Pressure round in browser, phone when picked; E2E in
tests/systemV2/career-prep/.

- [x] CP1.1 Design files + the career_prep flag
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: docs/design/career-prep/ (18 files); careerPrepEnabled() over system_settings key
    career_prep_enrollments (fails closed, 60 s cache); GET /api/portal/career-prep/flags (campus on AND listed);
    seedCareerPrepFlag (idempotent, --remove = rollback); frontend fetchCareerPrepFlag/useCareerPrepFlag.
  - Verification: loop-task-verifier PASS 11/12 (commit 1cf3d3058). Tests: flag 14, route 5, seed 4, frontend 8.
  - Notes: two deviations from plan T1. (1) No frontend reads /api/portal/profile, so the flag has its own route,
    like the campus flags. (2) For the same reason ParticipantAuthContext is untouched; components use the
    standalone useCareerPrepFlag() hook (wired in at T11).

- [x] CP1.2 The seven P5 tables + 9-skill seed
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: ensureCareerPrepSchema (additive, idempotent, boot after ensureHireInterviewSchema);
    dropCareerPrepTables (refuses without --yes).
  - Verification: unit 6 pass; integration 4 (Postgres tier in CI; skipped locally, no DATABASE_URL). Commit d61946259.
  - Notes: enrollment_id (this repo's student key) instead of the kit's participant_id; raw typed queries like the
    hire schema instead of new Sequelize models.

- [x] CP1.3 readiness.ts (pure) + readinessWeights.json
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: skill score (60-day window, 14-day half-life, source weights), 30-day change, readiness per
    interview type (hidden under 5 skills), targets, streak and this-week in Central.
  - Verification: 15 tests with hand-computed values (71.4, 74.2, 80, 75.3), DST end 2026-11-01, Central midnight.

- [x] CP1.4 observationWriter + the four source mappers + the backfill
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: observationAdapters.ts (pure): intro-video coaching (pace, fillers; proof and specific content
    points as strong 85 / good 65 / work on 40), quiz attempts on cards mapped in prep_skill_sources (score x 100),
    scored weekly interviews to role_knowledge, Hire-published case studies to proof_of_work 100.
    observationWriter.ts (ON CONFLICT DO NOTHING, batches of 200). backfillPrepObservations (--dry, --enrollment).
  - Verification: 52 Career Prep backend tests pass (adapters 17, writer 6 among them); grep test: no eye contact,
    expression or accent in careerPrep code.
  - Notes: weekly interviews are written exercises, so their source is training, not phone_mock. Quiz mapping table
    starts empty, so quizzes write nothing until a card is mapped (no invented skill links).

- [x] CP1.5 Placement section + readiness rollup + the summary, dashboard and staff read APIs
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: `placement` section key (owner/admin via ALL_SECTIONS; other staff only by per-member extra
    section; no new role) + mgmtSectionGate row + the extras editor label; prepData (5 reads per student), prepViews
    (pure dashboard + summary; missing values omitted, never 0), rollup (upsert per student/interview/Central date,
    nightly 01:30 Central, own cron), GET /api/portal/career-prep/summary and /dashboard (flag-gated 404, Zod,
    own-interview 404), GET /api/admin/placement/students/:id/prep (requireSection placement), strict response schemas.
  - Verification: 94 Career Prep backend tests pass (views 11, rollup 4, read routes 12, staff route 7 among them);
    mgmtExtraSections parity green; lint-route-auth OK (168 files); backend and frontend tsc clean.
  - Notes: the rollup cron is started from server.ts beside the schema (schedulerService.ts is ~3,900 lines).

- [x] CP1.4 + CP1.5 fixes (attempt 2, after the verifier failed both at 10/12 on "no invented data")
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: video coaching maps ONLY the measured delivery scores (pace, fillers); content levels (strong / ok /
    work on) are no longer turned into numbers, and "specific" no longer feeds "ending on a number" (it measures
    something else). Case-study refs carry the student (one case study can credit two students). Dashboard and floor
    show no "Ready at" without an interview (the hard-coded 70 is gone). Streak window 400 days. The nightly rollup
    writes only for enrollments Career Prep is on for. First name now comes from enrollments.full_name (the earlier
    leads join was wrong and its catch-all hid it; read-only prod check returns "Ali").
  - Verification: 102 Career Prep backend tests pass; backend tsc clean.
  - Notes: OPEN for Ali at the Release 1 review (no number invented meanwhile): should the intro-video content review
    (strong / good / work on) ever count toward a skill score, and at what values? Until he says, it does not.
    Also one adapter file (observationAdapters.ts) instead of the four the plan named; each mapper is about 15 lines.
    The CP1.4 entry above originally listed the content mapping; that mapping was removed in this attempt.

- [x] CP1.6 Checkpoint (CP1 complete; no PR, no deploy)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: nothing new; gate run on the release branch.
  - Verification: verifier PASS on every CP1 task (T1 11/12; T2 11/12; T3 12/12 on attempt 2; T4 12/12 and T5 11/12
    on attempt 2). Backend tsc with a planted control error reported only that file, then 0 errors; test-file
    typecheck (8192 MB) clean apart from the local-only maxmind file; jest over careerPrep, routes, middlewares,
    access, db and scripts: 3,486 pass, 6 integration tests skipped (CI Postgres tier), 1 known CRLF-only failure;
    frontend tsc clean; lint-route-auth OK (168 files).

- [x] CP2.1 Placement floor: one floor, three names; staff Student prep page
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: NAV_GROUPS Placement group (section placement) with one Release 1 link, /admin/placement/students
    (inPlace); hqModel floorLabelFor (Career Prep / Hiring / Placement) and opensInPlace; HqInside and HqPanel open
    in-place rooms in the same tab; PlacementStudentsPage (read-only list + one student's skills) on
    GET /api/admin/placement/students (prepStudents.ts, placement-gated).
  - Verification: frontend 212 tests in campus/hq, adminNav, Layout and the new page pass; backend placement and
    careerPrep tests pass; both tsc clean; lint-route-auth OK.
  - Notes: the kit's queue, inboxes, bookings and fees links join the Placement group in Releases 2 and 3, when
    those pages exist. The new page test uses react-dom/client + act, the repo's pattern (@testing-library is not a
    declared dependency).

- [x] CP2.2 One door for students + the floor copy
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: careerPrepDoors.ts (member with Career Prep on: exactly one own door to /portal/career/room;
    member off, explorer and partner: no doors, a locked note); buildHq puts those doors on the Placement floor for
    every non-staff audience, so students never see the staff room; useHq reads the career_prep flag for members;
    careerPrepApi.ts (summary, dashboard clients); logic/careerPrepCopy.ts (greeting in Central time, stops and
    waiting lines only when they have data).
  - Verification: 2,220 frontend campus + Career Prep tests pass (careerPrepCopy 13 among them); tsc clean.
  - Notes: deviation from plan T8: partners get NO doors in Release 1 (locked "Hiring opens here with the employer
    portal") instead of the kit's 4, because the 4 Hiring pages ship in Release 3 and a door to a missing page
    would be a dead link. The door status line ("Cora has today's session ready") waits for plans (CP4).

- [x] CP2.3 The Career Prep floor scene
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: CareerPrepFloor.tsx (sign, floor screen with greeting + Walk in + the stops that have data, ONE
    large door with "Start here", Cora at her desk; every one opens /portal/career/room) and CareerPrepPanelRows
    (Waiting on you); useCareerPrepSummary (one request per page, 60 s cache, failure resolves to null); the tower
    swaps in this scene for the student's own Career Prep floor and shows the locked note on anyone else's;
    the panel says "Doors on this floor · 1 door".
  - Verification: CareerPrepFloor 6 tests (every opener's href, no stop without data, works with no summary, floor
    number from the floor); 2,226 frontend campus + Career Prep tests pass; tsc clean.
  - Notes: deviation: the Playwright layout check (1440 and 390, 44 px targets, no sideways scroll) needs the app
    running with a seeded student, which T26 builds; it runs there against this scene instead of here. The CSS
    gives every link a min-height of 44 px and stacks Cora under 900 px.

- [x] CP2.4 Checkpoint (CP2 complete; no PR, no deploy)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - Verification: full frontend unit suite 9,833 pass (1 real failure, publicNextOpenHouseJs, CRLF-only and not
    touched by this branch; 3 "failed" files are test helpers with no tests); `CI=true npm run build` compiles;
    frontend tsc clean. CP2 task verification (T7 to T9) was in progress at this entry.

- [x] CP3.1 The room shell over the floor
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: CareerPrepRoom.tsx (full screen, Refactored theme via themeForBrand, "‹ Floor n" from the sidebar
    order, the level trail hidden under 900 px, the anchor pill with Change, three tabs, Esc and Back close it, Esc in
    a text field does not, focus to Cora on open and back to the opener on close); AnchorPill (source tags); the
    /portal/career/room page, flag-gated (off = not found), drawing the Career Prep floor behind the room.
  - Verification: room 7 tests + page 3 tests; Career Prep frontend 35 pass; tsc clean.
  - Notes: closing goes to /portal until T25 adds the deep link that lands on the floor. The summary loader now
    turns even a synchronous throw into "no summary" (found by the page test).

- [x] CP3.2 Cora's chat and option cards
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: OptionCards.tsx (icon, title, line, badge, readiness bar with a target tick; buttons in a
    role="list"; arrow keys move and wrap; a non-live set is dimmed and not clickable) and CoraChat.tsx (Cora and
    student bubbles, insight blocks, card sets where only the newest unanswered one is live, four suggestion chips,
    the ask box: Enter sends, Shift+Enter adds a line, empty never sends, nothing clickable while Cora answers).
  - Verification: CoraChat 7 tests; Career Prep frontend 39 pass; tsc clean.

- [x] CP2.1 to CP2.3 fixes (attempt 2, after the verifier failed T7 10/12, T8 8/12, T9 10/12)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: (1) CORRECTION: the CP2.2 entry above says "careerPrepCopy 13"; the file had 11 tests. That claim
    was wrong. (2) The Career Prep floor no longer exists at all for anyone Career Prep is not open for (members
    without the flag, explorers, partners), so nobody but Ali sees any change in Release 1, and nothing flashes while
    the flag loads; the locked-note text and style were removed (M4 adds the explorer note, Release 3 the partners'
    Hiring doors). (3) Rendered tests: the Placement staff door has no target/rel (same tab), another staff room
    opens with target _blank, the student's floor swaps in the Career Prep scene, the panel counts "1 door" and its
    door row opens the room in the same tab. (4) Staff list endpoint: 401 and extra-section 200 tests.
    (5) T9's Playwright layout check of the floor is carried into T26's scope in plan.md and recorded in
    state-ledger.json (carryOver).
  - Verification: careerPrepCopy 11 + careerPrepRender 4 + careerPrepFloor 5 = 20 (counted by the jest run);
    frontend campus + Career Prep + pages 2,250 pass; placement routes 12 pass; tsc clean.
  - Notes: declared deviations: Cora on the floor is a plain link into the room, not FloorLobbyDesk (which opens a
    staff message card; the kit says clicking Cora opens the room); CareerPrepFloor lives in components/careerPrep/
    with the rest of the room, not hq/. hqModel.test's member floor count now leaves out the hidden Placement floor.

- [x] CP3.3 (backend) Interviews: real from Hire, added (with JD questions), practice
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: interviews.ts (linkHireInterviews: confirmed, upcoming hire_interviews into career_interviews,
    ON CONFLICT on hire_interview_id; addInterview with optional job description; createPractice with a 4-day Central
    window); jdQuestions.ts (the minimal grounded JD-to-questions step, 5 to 8 validated questions, failure = saved
    without questions); careerPrepLlm.ts (the one instrumented model call: 30 s timeout, 2 retries, JSON, error
    classes); POST /api/portal/career-prep/interviews (Zod discriminated union, strict, flag-gated, enrollment from
    the token, read-only view-as tokens refused); summary and dashboard link Hire interviews before reading (a link
    failure never blocks the read).
  - Verification: 108 Career Prep backend tests pass (interviews 11, interview route 11 among them); tsc clean;
    route-auth lint OK.
  - Notes: the JD prompt avoids the word "accent" so the no-face/no-accent guard test stays a plain word check.

- [x] CP2.2 fix (attempt 3): floors are numbered after the hidden Career Prep floor is left out
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: buildHq numbers floors from the VISIBLE groups, so a member without Career Prep, an explorer or a
    partner gets exactly the tower they had on main (no gap at the hidden floor, no renumbering of the floors above
    it on the outside bands, the elevator or the guide). Found by the verifier on attempt 2.
  - Verification: new test compares every non-staff audience's floors (number + label) with a build that has no
    Placement group: identical. hqBuilding.test's member/explorer elevator test now reads floor numbers from that
    viewer's own tower. Frontend campus + Career Prep + pages: 6,666 pass, 0 fail; tsc clean.
  - Notes: the kit's `key: 'room'` on the door is not modeled (HqRoom has no key field; the door is identified by
    its path); declared here.

- [x] CP2 verified: T7 PASS 12/12 (attempt 2), T8 PASS 11/12 (attempt 3), T9 PASS 11/12 (attempt 2)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - Notes: open carry-over (also in the run folder's plan.md and state-ledger.json, which are not in git): T26 must
    run the Playwright layout check on the Career Prep floor at 1440 and 390 as well as the room.

- [x] CP3.4 (backend) Asking Cora, with the number guard
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: coraService.ts (context = only the student's computed metrics; every number in a reply must be in
    that context, else one retry with a warning, then a no-digits answer, then a fixed line; at most 3 sentences;
    a model failure gives a polite line, never an error) and POST /api/portal/career-prep/cora (strict Zod,
    flag-gated, own interview only, read-only view-as refused).
  - Verification: coraService 8 tests, Cora route 10 tests; 131 Career Prep backend tests pass; tsc clean.

- [x] CP3.3 + CP3.4 (frontend) The anchor flow and asking Cora in the room
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: logic/askRouter.ts (plan, weak, 10 minutes, add, progress and the five getting-hired sheets
    decided in code, everything else to Cora); logic/anchorOptions.ts (a card per real interview soonest first with
    a readiness bar only when one exists, then Add and Create; the four interview types; insight lines only from
    real metrics); useCareerPrep.ts (the room conversation: ask which interview, anchor, insight or a plain "not
    enough data yet", the add and practice forms, weakest skills as cards, free questions to POST /cora, failures
    stay in the chat); InterviewForm.tsx (date entered in Central and sent as UTC, a nonexistent spring-forward time
    refused); the room page wires them, with ?anchor= preselecting an interview; the room's tab can be switched from
    the chat; Esc in a dropdown no longer closes the room.
  - Verification: Career Prep frontend 73 tests pass (router + anchor 21, useCareerPrep 9 among them); tsc clean.
  - Notes: plans and the Watch/Try session plug in at CP4 through onPlan; until then picking an interview ends at
    the insight. Sheets open in CP4.6 through onSheet.

- [x] CP3.5 Your progress (the dashboard)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: ProgressDashboard.tsx (readiness with its weekly trend and a dashed ready line, or what to do
    first when there is not enough data; your interviews, each anchoring the room; skills lowest first with the
    30-day change and sources, skills without data listed as such; Cora's read = the three lowest scored skills with
    their evidence; where the data comes from, only sources with evidence; practice over time with the streak);
    charts/PrepCharts.tsx (single-series SVG, a title tooltip on every focusable point, accent color only, a "Show
    as table" toggle on each).
  - Verification: ProgressDashboard 6 tests; Career Prep frontend 79 pass; tsc clean.
  - Notes: "Tips from your data" (time of day, which practice mode lifts real-interview scores) need data this
    release does not collect, so the kit's rule "a tip without enough data is not shown" means none are shown.
    "Make me a plan for this" asks Cora for a short session; plans arrive in CP4.

- [x] CP3.6 Checkpoint (CP3 built; no PR, no deploy)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - Verification: frontend full suite 9,891 pass (only the known CRLF open-house test and 3 helper files "fail");
    `CI=true npm run build` compiled; backend 3,545 pass in careerPrep, routes, middlewares, access and the schema
    test (1 known CRLF failure); route-auth lint OK. CP3 task verification (T11 to T15) still running at this entry.

- [x] CP4.1 (backend) planBuilder + plans
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: planBuilder.ts (pure, deterministic: days from today to the day before the interview, at most 14,
    each day on the next weakest skill, the last a Full rehearsal; tonight 15, full 30, custom 10/20/45; 15 minutes
    or less = warm up, learn, try, cool down; Watch left out until an answer library exists and its 3 minutes go to
    Try; Central calendar dates); plans.ts (server builds, one active plan per interview, the previous one retired
    in the same transaction, an unknown focus skill ignored); POST and GET /api/portal/career-prep/plans.
  - Verification: planBuilder 14, plans 4, plan routes 9; 159 Career Prep backend tests pass; tsc clean.
