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

- [x] CP3.3 + CP3.4 fixes (attempt 2) and CP4.1 (frontend) the plan flow
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: verifier results T11 PASS 11/12, T12 PASS 11/12, T13 FAIL 10/12, T14 FAIL 10/12. Fixes:
    (1) POST /interviews is retry-safe: the same interview within 10 minutes returns the first row (200) and does not
    call the model again, checked under a per-student advisory lock so two simultaneous requests make one row; the
    model call runs after the row is saved and writes its questions onto it. (2) The Hire link cuts company and role
    to 120 characters, so one long employer name cannot silently stop every link. (3) Cora's coaching path now
    carries the platform's Cora rules (coraPromptRules.ts) in its prompt and checks every reply with
    findCoraReplyViolations; a violation is treated like an invented number. (4) Cora's context has no incidental
    numbers, the exchange has a 20 s budget, and when she cannot answer the reply carries suggestion cards.
    (5) Insight lines name sources in words; practice and undated interviews are offered again after "Change".
    (6) The room conversation is split into useRoomLog, useAnchorFlow and useCareerPrep so no function passes the
    50-line limit, and it now offers plans after the insight, builds the chosen plan on the server (days, tonight,
    full, or Build my own: time then skill), opens Your plan, and offers "Start today's session".
  - Verification: backend 163 Career Prep tests pass (+3 Postgres integration tests for the lock, the duplicate
    check and the 120-character link, run in CI); frontend Career Prep 82 pass; both tsc clean.
  - Notes: T11's "close returns focus to the door" in the real app is carried into T25's scope (plan.md, ledger).
    Spelled-out numbers can pass Cora's digit guard; declared as a known limit in coraService.ts.

- [x] CP4.2 Your plan
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: PlanView.tsx (one row per day with its minutes; each day a timeline of segment blocks whose width
    follows the minutes; blocks that work on a weak skill are marked; every block is focusable and names itself;
    today has Start, later days read Upcoming; "Built from your weakest skills"; Start today's session), wired into
    the room's Your plan tab; planCards (the days plan Recommended first; one focused session when the interview is
    today; a 4-day plan for practice).
  - Verification: PlanView + plan cards 7 tests; Career Prep frontend 89 pass; tsc clean.

- [x] CP3.4 fix (attempt 3) Cora's coaching rules and time budget; the room hooks split for real
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: verifier attempt 2: T13 PASS 11/12, T14 FAIL 10/12. (1) Cora's prompt no longer includes the whole
    email-reply rules block (which told her to answer only from a knowledge base, promise "a person will follow up",
    and set needs_human); it carries COACHING_RULES, the four rules that apply to a coaching chat (coraPromptRules.ts
    1, 3, 4 and 5), and every reply is still checked with findCoraReplyViolations. (2) The 20 s budget now bounds
    every call: each gets only the time left, no SDK retries, and is raced against that time, so a hung first call
    returns the could-not-answer line with suggestion cards inside the budget (careerPrepLlm accepts per-call
    limits). (3) CORRECTION: the attempt-2 entry above says no function passed 50 lines; useCareerPrep was 74 and
    useAnchorFlow 58. Now split into useRoomLog, useAnchorFlow (41), usePlanMaker (23), useAsk (24), usePickCard
    and useCareerPrep (32).
  - Verification: coraService 13 tests (new: prompt has the coaching rules and none of "knowledge base below",
    needs_human, "follow up" or support@; each call gets the time left and no SDK retries; a never-answering first
    call returns unavailable); backend Career Prep 174 pass; frontend Career Prep 89 pass; both tsc clean.

- [x] CP4.3 (backend) Timed sessions
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: sessions.ts (start = today's day of the active plan; starting again the same Central day resumes
    the open session under a per-student lock, never a second one; applyUpdate is pure: marking segment i done twice
    changes nothing, seconds_active only grows and is capped at the wall time since the start, a finished session
    never changes again; updates lock the row FOR UPDATE and stamp ended_at once); POST /sessions (201 new, 200
    resumed), PATCH /sessions/:id (strict Zod, segment index required for segment_done), GET /sessions/current.
  - Verification: sessions 8 + session routes 11 tests; backend Career Prep 185 pass; tsc clean; route-auth lint OK.

- [x] CP3 verified: T11 PASS 11/12, T12 PASS 11/12, T13 PASS 11/12 (attempt 2), T14 PASS 12/12 (attempt 3)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g

- [x] CP4.3 (frontend) the session timer as a pure state machine
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: logic/sessionMachine.ts (idle, running, paused, finished, ended; a running segment stores its
    deadline and a paused one its time left, so a hidden tab or a sleeping laptop always reconciles; practice time is
    real running time only; finished and ended never change again).
  - Verification: sessionMachine 6 tests; tsc clean.

- [x] CP3.5 / CP4.1 / CP4.2 fixes (attempt 2, after the verifier failed T15 10/12, T17 8/12, T18 9/12)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: (1) Plans store each day's DATE only; "Today", "Tomorrow" and the weekday are worked out when the
    plan is shown, against the current Central date, so a plan opened the next day puts Start on the right row and
    drops days already over (server and client). (2) One active plan per interview is now guaranteed by a partial
    unique index (prep_plans_one_active) and a per-student lock around retire + insert. (3) GET /plans 404s an
    interview that is not the student's (ownership checked) and has 401 and flag-off tests; read-only view-as is
    asserted as exactly 403. (4) No plan for an interview that has already started (409). (5) A far interview keeps
    the Full rehearsal on the day before it (first 13 days, then that day). (6) Your plan shows a visible tooltip
    on keyboard focus naming the segment, its minutes and the skill, and reads skill names from the dashboard, not
    from segment titles. (7) Your progress is split into one component per section (largest 18 lines), interviews
    show a readiness bar with a tick at the ready mark, and a focused chart point shows its value in a readout.
    (8) The layout checks for Your progress and Your plan are carried into T26 (plan.md, ledger).
  - Verification: backend Career Prep 197 pass (+ Postgres integration tests for the one-active plan, in CI);
    frontend Career Prep 105 pass; both tsc clean; test-file typecheck clean (local maxmind only).
  - Notes: declared: the kit's LineTrend, WeeklyBars and SkillTable are folded into charts/PrepCharts.tsx and the
    dashboard's Skills section; there is no client-side planBuilder because the server always builds plans.

- [x] CP3.5 / CP4.1 / CP4.2 verified on attempt 2: T15 PASS 12/12, T17 PASS 12/12, T18 PASS 12/12
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - Notes: hardening from the verifier's non-blocking notes: interview dates more than two years ahead are refused
    (a year-9999 typo can never reach planDates); T26 must focus the last plan block at 390 when measuring overflow.

- [x] CP4.4 (backend) Recorded "Try" answers, scored into observations
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: prep_attempts table (UNIQUE session_id + client_key, so a retried upload is the same attempt);
    config/prepAttemptUpload.ts (one video, 100 MB, video types only); attempts.ts (scored with the intro video's
    pipeline: pace and filler words against their published targets; the 90-second length target does not apply
    to a practice answer and is dropped; scores become observations with source video, ref attempt:<id>; a
    one-at-a-time queue; the file is deleted after scoring on every path; failures stored with an error class);
    careerPrepAttemptController.ts (413 too large, 400 not a video, 202 new, 200 retried, 404 not yours);
    POST /sessions/:id/attempts and GET /sessions/:id/attempts/:attemptId; services/careerPrep/boot.ts starts the
    rollup and marks attempts left pending by a restart as failed ("record again"); nginx/nginx.conf gets the
    100m location for the attempts path (the upload-limit contract test now enforces it).
  - Verification: attempts 7, attempt routes 9 tests; Career Prep + nginx contract + schema 219 pass; tsc clean;
    route-auth lint OK.
  - Notes: the nginx change is the one infrastructure file in Release 1 and will be called out in the PR body.

- [x] CP4.3 / CP4.4 (frontend) The Session tab: timed parts, recorded Try answers
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: useSession.ts keeps the pure session machine in step with the server (Start resumes today's
    open session after the parts already done; a session with every part done opens as finished; the last Next
    marks the part done, then finishes, because the server ignores changes after finish; a failed save never
    stops the timer). SessionRunner.tsx: ring timer with "m:ss left in this part", Pause / Resume, the part list
    (done, current, upcoming), "Part i of n", End session, Next / Finish. Bodies from logic/sessionCopy.ts: warm-up
    line, Learn text per skill, Try and Pressure questions (the interview's own job-description questions first,
    then a bank per interview type; Pressure adds a follow-up and can be read aloud by the browser). TryRecorder.tsx:
    camera asked for only on Record; upload with a client key; "Send again" re-sends the same recording with the
    same key (one attempt on the server); polls the score every 3 s up to 40 times; shows each score with its
    source; "Record again" after a failure. The room's Session tab and Cora's "start" card both open it.
    Backend: interview views now carry their job-description questions (prepData, prepViews, schema).
  - Verification: frontend Career Prep 117 pass (12 new: SessionRunner.test.tsx); frontend tsc clean; backend
    Career Prep tests pass (207) with the questions passthrough.
  - Notes: the recap after a finished session is CP4.5 (T21); until then the runner shows "Session finished".

- [x] CP4.4 attempt 2: fixes from the T20 verification (T19 PASS 11/12; T20 FAIL 7/12 on attempt 1)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: a route test proves an oversized upload gets the readable 413 (and the real limit is 100 MB);
    RTL tests for every part's body (Warm up, Learn, Try, Pressure with "Hear Cora ask" and without speech, Full
    rehearsal, Cool down); each part gets its own recorder (keyed), so a score never carries to the next
    question; the Full rehearsal now asks three questions in one recording; TryRecorder split into a view and
    useTryRecorder (no function over 50 lines); useSession computes each move once outside React's state updater
    (one request per move, StrictMode-safe) and resumes a session left paused on the server; nginx: the attempts
    block sits above the intro-video comment again and accepts upper-case ids; a frontend guard test finds no
    face / eye contact / expression / spoken-accent wording in Career Prep.
  - Declared deviations (also in the run's plan.md, for Ali's Release 1 review): (1) Try answers are scored on
    delivery only; interviewService.scoreAnswer content scoring is not wired because it yields levels, and
    whether levels may count toward skill numbers is Ali's open question. (2) The Pressure round runs in the
    browser only; "by phone (Synthflow)" is a Release 2 candidate. (3) Carried to T26: a 40 MB upload through
    nginx to the attempts path returns 202.

- [x] CP4.5 Finish, recap, reminders
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: recap.ts: on finish or end, every scored attempt of the session is written as observations
    FIRST (idempotent), then the recap is read: "before" is the dashboard without this session's rows, "after"
    the dashboard with them, both through buildDashboard, so the recap's numbers are the dashboard's; omitted,
    never 0, when unknown. PATCH /sessions/:id returns { session, recap } on finish/end; a recap failure never
    loses the session. Reminders: prep_reminders (UNIQUE ref + kind, so asking twice is one), reminderTime.ts
    (tonight = 6:00 PM Central, refused after 6; tomorrow = next Central date at the session's start time,
    DST-exact; quiet hours 9 PM to 8 AM Central move a reminder to 8 AM), reminders.ts (5-minute sender claims due
    rows before sending; kill switch system_settings career_prep_reminders_off, fail closed; students off the
    allow-list skipped; plain-text email through guardedSendMail), POST/GET /api/portal/career-prep/reminders.
    Frontend: the Session tab ends in the recap (readiness, streak, minutes, "What changed today" before and
    after); Cora posts the recap with See my dashboard / Same time tomorrow / Another session; the dashboard
    reloads and marks the moved skills New; "Remind me tonight at 6:00 PM" follows a new plan before 6 PM; a
    reminder sent in the last 12 hours is Cora's first line in the room.
  - Verification: backend Career Prep 248 pass, 11 skipped (Postgres integration, run in CI); frontend Career Prep
    144 pass; both tsc clean (local maxmind only); no test type-check error in a Career Prep file.
  - Notes: declared deviation: the in-app half of a reminder is Cora's line in the room, not the community
    notification feed (its notification_type CHECK lists six community kinds; widening it changes a shared table).
    Rollback: kill switch stops all sends; UPDATE prep_reminders SET status = 'cancelled' WHERE status = 'pending'.

- [x] CP4.6 Sheets and the jump bar
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: the getting-hired pages open as sheets over the room (kit 4.7), each a hash on the room URL
    (#interviews, #inbox, #offers, #applications, #resume): from the URL (email links), from Cora ("my offers",
    "inbox", "applications", "resume", "show my interviews"; routed before any model call) and from the jump bar
    (/ when not typing, or Ctrl+K / Cmd+K; filter by every word, arrows, Enter, Esc). logic/sheets.ts (pure),
    useSheet.ts (opening pushes history so browser Back closes; sideways replaces; a direct link closes by
    clearing the hash; focus returns to the opener), PageSheet.tsx ("‹ Back to Career Prep", sibling tabs, title
    focused on open, Esc and scrim close without closing the room), SheetBodies.tsx (Your interviews: real Hire
    bookings in Central with status and "Join the room" from 10 minutes before the start, plus added and practice
    interviews; Digital resume links the portfolio page), JumpBar.tsx (combobox over a listbox).
  - Verification: frontend Career Prep 159 pass (sheets.test.tsx 15 new + 3 room-level); frontend tsc clean.
  - Notes: declared deviation: the inbox, offers and applications are not tracked by the platform yet, so those
    sheets say so plainly; no offers payload exists to carry a fee, and a test keeps "fee" out of every sheet
    source and the rendered Offers sheet.

- [x] CP4.5 attempt 2: fixes from the T21 verification (T20 PASS 11/12 on attempt 2; T21 FAIL 10/12 on attempt 1)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: the recap counts answers still being scored when the session ends (`pending`; scoring runs
    after the upload returns) and says "One answer is still being scored; it will show on Your progress" instead
    of "your numbers did not change". A wall time skipped by spring-forward now lands on the same minutes in the
    hour after it (2:30 AM -> 3:30 AM CDT); the old test asserted 1:30 AM CST under a 3:30 label. Reminders more
    than 12 hours late (held by the kill switch or downtime) are skipped as Stale, never sent late. Asking again
    for a reminder already sent no longer confirms a past time as upcoming. A Postgres integration test for one
    reminder per (ref, kind) under concurrent asks and exactly-once sending under two concurrent sender passes;
    the schema integration test now counts nine tables. useSession split (server sync in its own hook; the
    resume state is a pure function); the largest hook is 42 lines. The T20 content-scoring deviation text is
    corrected (scoreAnswer returns a keyword-hit number; the levels come from hireVideoContent).
  - Verification: backend Career Prep 250 pass, 13 skipped (Postgres integration, run in CI); frontend Career
    Prep 162 pass; both tsc clean.

- [x] CP4.6 attempt 2: fixes from the T22 verification (T21 PASS 12/12 on attempt 2; T22 FAIL 8/12 on attempt 1)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: Esc closes only the top layer (useEscapeLayer.ts: the jump bar over a sheet over the room is a
    stack; one capture listener hands Esc to the newest layer and stops it there). The jump bar puts focus back on
    what had it BEFORE the chosen item runs, so a sheet opened from it returns focus to that element on close (it
    used to land on the page body). The sheet traps Tab (campus focusTrap; it is a modal dialog) and its title
    shows a focus mark. Cora's chat no longer moves focus to a new message while a sheet or the jump bar is open
    (on a direct link, the greeting used to steal focus from the sheet's title). "Join the room" re-checks the
    time every 30 s while the sheet is open.
  - Verification: CareerPrepRoomSheets.test.tsx (17 new): every one of the five sheets opens from its URL, from
    Cora and from the jump bar, with focus on the title, closes on browser Back, and returns focus to the opener;
    Esc closes the jump bar, then the sheet, never the room; Tab stays in the sheet. Frontend Career Prep and
    campus 2401 pass; tsc clean.

- [x] CP5.1 The Career Prep card on the campus home panel
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: campus/home/CareerPrepCard.tsx, directly under Today in CampusConcierge (shot L1-1): students
    only, and only when Career Prep is open for them (explorers, partners, staff and non-flagged students see no
    change; the summary is not even requested). logic/prepCardCopy.ts (pure): headline by rule, first match
    wins (a dated interview within 7 days -> "Get ready for <weekday>'s interview", weekday in Central; later ->
    "Get ready for your <company> interview"; practice only -> "Keep practicing for <role>"; none -> "Get ready
    for your next interview"); rows soonest first, past ones left out, at most 2, "+n more" from the server's full
    count; readiness bar against ready-at only when the server has a readiness. The summary now carries
    interviewCount and sessionMinutes (today's Central-date minutes in the next interview's active plan; prepData
    reads active plans as a sixth query). Card colors are campus art tokens (campusArtTokens.css, the one file
    allowed hex). Rows open the room anchored on that interview; Go opens the room until T25's goStart('prep').
  - Verification: CareerPrepCard.test.tsx (17): every headline rule with expected strings, precedence, Central
    weekday across DST, sort and cap, hidden for explorer / business / staff / non-flagged / loading. Backend
    prepViews 14 pass (2 new: interviewCount, sessionMinutes). Frontend Career Prep + campus 2401 pass; tsc clean.
  - Notes: carried to T25: Go to Career Prep switches to goStart('prep').

- [x] CP4.6 attempt 3 and CP5.1 attempt 2: fixes from the verification (T22 FAIL 9/12 on attempt 2; T24 FAIL 9/12)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: T22: in a real browser the sheet and the jump bar were drawn BEHIND the room (they rendered beside
    it, z-index 1060/1070 against the room's 1200, and missed its theme variables, so the sheet had no background).
    They now render inside the room (CareerPrepRoom `overlay`), stacking above its content and sharing its theme.
    The room no longer takes focus on mount while a sheet is open (the sheet's title keeps it). A sheet opened by a
    direct link closes with focus on Cora's column, never the page body; the jump bar does the same when what had
    focus is gone. T24: the summary lists and counts only interviews still ahead, soonest first (the data includes
    ones that started up to a day ago, so "+n more" counted an interview that had happened); the card test that
    asserted the wrong count is corrected. Today's minutes are rounded. The card's flag request is skipped for
    non-students (useCareerPrepFlag(enabled)). The Go button is darker (6.15:1 white-on-blue, was 4.31:1).
  - Verification: a test that the sheet and the jump bar sit inside the room; a test for focus after closing a
    direct-link sheet; a backend test with an interview 5 hours ago; the exact 7-day edge; the flag not asked for
    other audiences. Carried to T26: elementFromPoint at the sheet title and the jump input is the sheet / jump bar.

- [x] CP5.2 + CP5.3 Tower scenes, goStart('prep'), deep links
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: goStart('prep') (hq/goStart.ts) records a start intent and opens the HQ building; useHqStartIntent
    holds it until the Career Prep floor is known, then rides there, or opens the lobby when the badge does not open
    it (off the campus it goes to /portal/career). Members' rides are express (no intermediate floor on the
    indicator). LevelTrail.tsx: "1 Tower · 2 Floor n · 3 Career Prep" on every tower scene (step 1 outside, lobby,
    elevator; step 2 on the Career Prep floor) and in the room (step 3). Outside: "Your floor is lit: n · Career
    Prep"; lobby: "Hi <first>! Career Prep is on Floor n. Cora, your interview coach, is waiting for you up there."
    and the express button "n · Go to Career Prep · Elevator A · straight up". /portal/career (CareerPrepFloorPage)
    lands on the floor; closing the room (‹ Floor n or Esc) lands there with focus on the door. The campus card's Go
    is goStart('prep'). Nobody Career Prep is not open for sees any of it.
  - Verification: hqCareerPrepTower.test.tsx (6, through the real useHq): elevator lights exactly G, 1, 6; express
    ride shows no intermediate floor; trail steps; outside hint, lobby line and express button; goStart to the floor
    and to the lobby when off. CareerPrepFloorPage.test.tsx (6): /portal/career floor, room with ?anchor, close by
    ‹ Floor n and by Esc lands on the floor with focus on the door. Frontend Career Prep + campus 2418 pass; backend
    Career Prep 252 pass, 13 skipped; both tsc clean.
  - Notes: declared: the lobby greeting says Cora "is waiting for you up there" (the kit's "has today's session
    ready" needs a per-session readiness the lobby does not load); the directory's "k other floors are Colaberry
    staff offices" line is not added (the directory already shows staff floors as locked).

- [x] CP5.2 + CP5.3 attempt 2: fixes from the T25 verification (T22 PASS 11/12 on attempt 3; T24 PASS 12/12 on attempt 2; T25 FAIL 9/12)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: the level trail loads its own styles (levelTrail.css, imported by LevelTrail; theme variables
    with campus fallbacks), so /portal/career shows the styled trail on a direct load (it was a bare numbered list).
    The kit items previously dropped are now built, not declared: students with Career Prep get no badge gate in
    the lobby (the express button replaces it); the elevator says "Tap your floor. It goes straight up, no stops.";
    the lobby greeting says Cora "has today's <m>-minute session ready" when today has a planned session (from the
    summary), else "is waiting for you up there"; the directory lists only the student's floors plus "🔒 k other
    floors are Colaberry staff offices." The outside chip no longer promises an office a student may not have, and
    the floor tooltip names Career Prep. A test covers the card's Go on the campus (START_PREP set, the HQ opened).
  - Verification: frontend Career Prep + campus pass (HQ 121, incl. 4 new tower tests and goStart.test.tsx 3);
    frontend tsc clean.

- [x] CP4.7 Checkpoint (T23): T22 PASS 11/12 (attempt 3), T24 PASS 12/12 (attempt 2), T25 PASS 11/12 (attempt 2)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - Verification at cbe2fcd8e: backend tsc (only the 2 known maxmind errors); backend Career Prep jest 252 pass,
    13 skipped (Postgres integration, run in CI); frontend tsc clean; frontend Career Prep + campus 2424 pass (the
    2 campus testEnv helper files report FAIL because they hold no tests); lint-route-auth OK (168 files).

- [x] CP5.4 Browser checks and layout (T26)
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: tests/systemV2/career-prep/careerPrep.e2e.js + fakeApi.js: the built app in Edge, served on
    127.0.0.1, API answered from fixtures (nothing reaches a server). Checks: /portal/career floor with one door and a
    one-row styled trail; the room flow (interview, plan, Start, Try recorded with a fake camera and scored, Finish,
    recap, dashboard marks the moved skill New with readiness equal to the recap's); ‹ Floor n and Esc land on the
    floor with focus on the door; Add and Create set the anchor pill; sheets from the URL and the jump bar are the
    topmost element with an opaque background; no API payload carries a fee; a button-styled link is 44px; zero
    console errors, also inside a sandboxed iframe; layout (no horizontal scroll, no overflowing text) for the room
    at 1600/1440/390 light and dark and the floor at 1440/390, with the last plan block focused at 390. A self-test
    (CP_E2E_SELFTEST=flag-off) makes the suite fail. CSS: a link styled as a button keeps its 44px target.
  - Verification: 10/10 pass, exit 0; self-test exit 1 (0/1).
  - Notes: declared deviation: no Docker or local Postgres here, so fixtures replace the seeded local stack; the 40 MB
    nginx upload check moves to the production verification (a no-login 40 MB POST must get 401, not 413).
