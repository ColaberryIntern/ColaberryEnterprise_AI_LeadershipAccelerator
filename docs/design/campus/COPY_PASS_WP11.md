# Campus copy pass (C23 WP-11)

Every user-visible string in `colaberry-campus.html` (D:1035-3628) that the build did not already say word for word, judged against the
build. Rule (CAMPUS_DESIGN_PARITY_PROMPT.md WP-11): match the design except where it states invented facts; later rounds, DECISIONS.md
and Ali's corrections win. Written 2026-11-02 (session CC-20261016-sqcm). Strings found verbatim in the build were not listed.

| Verdict | Strings |
|---|---|
| CHANGE | 23 |
| MATCH | 77 |
| INVENTED | 328 |
| SUPERSEDED | 183 |
| NOT_BUILT | 236 |
| PROTOTYPE_ONLY | 21 |
| NOISE | 78 |
| **Total** | **946** |

## Changes proposed

Applied unless marked DROPPED (with the reason).

| D: | Design | Build before | Outcome |
|---|---|---|---|
| 1039 | Colaberry campus map | 'aria-label': 'Campus map' | applied |
| 1152 | Back to the quad | aria-label={`Close ${name}`} | DROPPED |
| 1288 | Work emails (one per line) | <label htmlFor="cm-pt-emails">Invite people</label> | applied |
| 1291 | Send invites → | {sending ? 'Sending…' : 'Send invite'} | applied |
| 1302 | Close game | aria-label="Close the cabinet" | applied |
| 1407 | Every shipped build becomes evidence in their portfolio. | tip: 'Shipped work becomes evidence in their portfolios.' | applied |
| 1444 | Session in | text: `Class in ${left}` | applied |
| 1504 | See games & leaderboards | label: 'Games and leaderboards' | applied |
| 1504 | Games & leaderboards | { label: 'Game Room', workplaceLabel: 'Games', route: '/portal/game-room' } | applied |
| 1516 | Open my engagements | label: 'Open the internship' | DROPPED |
| 1557 | Check in at the Classroom for attendance credit | detail: `${s.title \|\| 'Today’s session'} · ${buildingName(b, workplace)}` | DROPPED |
| 1850 | Here is where your Lakeshore Logistics team learns and builds. Take the six-stop tour, or explore on your own. | Here is where your team learns and builds.  | applied |
| 2717 | — tap in to keep your streak going (+5 pts) | <><b>{p.streak}-day streak</b> — tap in to keep it going</> ... (+{p.streakPoints} pts) | applied |
| 2720 | HQ is open. 10 colleagues are in today. | here ? `The campus is open. ${here} ${who(here)} ${here === 1 ? 'is' : 'are'} already inside.` : 'The campus is open.' | applied |
| 2756 | With enrollment | <b>Enrolling opens</b> | applied |
| 2864 | ⬇ Export CSV | Download CSV | applied |
| 3291 | You're all caught up. | No notifications yet. | applied |
| 3343 | Attendance recorded when you walked in — nothing to click | Your attendance is recorded | applied |
| 3507 | 🗺 Switch to the campus view | Switch to campus map | applied |
| 3510 | ⚠ Can't load who's here right now. | Nobody else here right now. (also shown on presenceError) | applied |
| 3510 | Just you in here. | Nobody else here right now. | applied |
| 3581 | THE PLAZA | THE QUAD | applied |
| 3585 | ← Back to the Plaza | &larr; Back to the Quad | applied |

Dropped: BuildingCard close label ("Close <building>" says more than "Back to the Quad"); Career Center "Open my engagements" (low
confidence, Explorers see it too); the urgent card detail (the design's line drops the real session title).

## Invented, superseded and not built

| D: | Verdict | Design | Why |
|---|---|---|---|
| 1079 | INVENTED | 🏢 Lakeshore Logistics | Sample company name. Build shows a BUSINESS chip (AccountChip); company/seat chips DELIBERATE (gap S1, A3.2). |
| 1079 | NOT_BUILT | Seats in use | Seat-count chip not built: DELIBERATE (gap S1 / Stats pill sponsor row "partner data"); PartnerTeam.tsx:13-14 comment: the server has no seat count tied to a co |
| 1080 | INVENTED | Ali Muwwakkil | Placeholder person name on the avatar aria-label; build uses "You: your look and campus settings" with real initials/photo. |
| 1104 | INVENTED | Colaberry AI Sessions | Fixed show title in the live bar; the build renders the real broadcast title (b.title). |
| 1111 | NOT_BUILT | Colaberry Live player | The campus mini player is not a campus component; playback uses the portal-wide LiveMiniPlayer (components/portal/LiveMiniPlayer.tsx:277, aria "Broadcast player |
| 1113 | NOT_BUILT | Keeps playing while you walk | Mini player sub line; the portal LiveMiniPlayer has no such line. Not in campus scope. |
| 1114 | NOT_BUILT | Go to the Classroom | Mini player expand button; not in LiveMiniPlayer. Q2: the live building is the Community Lounge until broadcasts carry session_id, so "Classroom" would also be  |
| 1114 | NOT_BUILT | Close player | Mini player close; LiveMiniPlayer has its own controls (outside campus scope). |
| 1187 | SUPERSEDED | Portal page | Prototype page section aria; the build page is the real PortalShell with campus chrome (round 3 §2.4, CampusLocationBar/CampusNav/CampusRail). |
| 1197 | SUPERSEDED | Campus navigation | Dark banner replaced by the location bar in round 3 §2.4; build nav aria-label "Where you are on campus" (CampusLocationBar.tsx:77). |
| 1209 | SUPERSEDED | Portal navigation | Classic nav is the real PortalShell te-nav (gap 4.11 BUILT equivalent). |
| 1210 | NOT_BUILT | Open the live page ↗ | DELIBERATE (gap 4.9): the page is the live page, so no "Open the live page" link. |
| 1213 | SUPERSEDED | People here | Rail head is "Here now · N" per round 3 §2.4 (CAMPUS_V3_PROMPT.md:181; CampusRail.tsx:20 comment). |
| 1213 | SUPERSEDED | People and plan | Rail container aria; round 3 rail sections carry their own labels ("In <building>", "Help desk"). |
| 1218 | SUPERSEDED | Back into the building · Esc | Bottom dock: the design itself hides it (CSS 909); replaced by the location bar (gap 4.13, round 3 §2.4). |
| 1223 | SUPERSEDED | , tap a building on the map, or press Esc to go back out. | Page hint replaced by the location bar coach mark: "You’re still on campus. Step outside goes back into the room; Campus map takes you to the map." (CampusLocat |
| 1244 | NOT_BUILT | Join the AI Systems Architect Accelerator | In-campus signup sheet not built (gap A4.7 PARTIAL, X4 MISSING); enroll CTAs go to the real enroll/paywall route. No DECISIONS row. |
| 1245 | NOT_BUILT | Everything you did as an Explorer comes with you. Takes about two minutes. | Signup sheet (gap A4.7/X4). |
| 1247 | NOT_BUILT | 🌱 Explorer · you now | Signup sheet comparison column (gap A4.7/X4). |
| 1247 | NOT_BUILT | ✓ Intro AI course | Signup sheet comparison column (gap A4.7/X4). |
| 1247 | NOT_BUILT | ✓ Community & live rooms | Signup sheet comparison column (gap A4.7/X4). |
| 1247 | NOT_BUILT | ✓ Events & Open House | Signup sheet comparison column (gap A4.7/X4). |
| 1247 | NOT_BUILT | ✓ Live-class previews | Signup sheet comparison column (gap A4.7/X4). |
| 1247 | NOT_BUILT | ✓ Maya, Reese & Dara, 24/7 | Signup sheet comparison column (gap A4.7/X4). |
| 1248 | NOT_BUILT | 🎓 Enrolled member | Signup sheet comparison column (gap A4.7/X4). |
| 1248 | NOT_BUILT | ✓ Everything in Explorer | Signup sheet comparison column (gap A4.7/X4). |
| 1248 | NOT_BUILT | ✓ 12 weeks of guided curriculum | Signup sheet comparison column (gap A4.7/X4). |
| 1248 | NOT_BUILT | ✓ Live weekly Build Day classes | Signup sheet comparison column (gap A4.7/X4). |
| 1248 | NOT_BUILT | ✓ Real AI project builds | Signup sheet comparison column (gap A4.7/X4). |
| 1248 | NOT_BUILT | ✓ Cert prep & verified portfolio | Signup sheet comparison column (gap A4.7/X4). |
| 1248 | NOT_BUILT | ✓ AI Internship | Signup sheet comparison column (gap A4.7/X4). |
| 1251 | INVENTED | Sam Rivera | Sample person name prefilled in the signup form. |
| 1252 | INVENTED | sam.rivera@example.com | Sample email prefilled. |
| 1253 | INVENTED | The November 2026 cohort | Invented cohort date; signup sheet not built (X4). |
| 1253 | NOT_BUILT | Talk to admissions first | Signup sheet option (X4); the admissions opt-in exists as CampusTourEnd "Have admissions reach out to me". |
| 1254 | NOT_BUILT | Have a seat code from your employer? | Signup sheet seat-code disclosure (X4); the real seat-code path is "Redeem a seat code" (admissions/plansModel.ts:77). |
| 1254 | INVENTED | e.g. LAKE-7Q2X — your seat is already paid | Invented seat code in the placeholder. |
| 1255 | NOT_BUILT | Continue to enrollment → | Signup sheet submit (X4). |
| 1257 | NOT_BUILT | — our admissions guide, here 24/7. | Signup sheet footer (X4); Maya is the website widget per Q8 (keep as is). |
| 1259 | INVENTED | You're almost in, Sam | Invented name "Sam"; signup done state not built (X4). |
| 1260 | NOT_BUILT | Finish enrollment ↗ | Signup done state (X4). |
| 1261 | NOT_BUILT | Keep exploring for now | Signup done state (X4). |
| 1265 | NOT_BUILT | Email preview from Maya | Maya email preview sheet: MISSING (gap 3.12, T8 PARTIAL: handoffs live in the Growth Journey admin page). |
| 1269 | NOT_BUILT | Maya · email preview | Maya email preview (gap 3.12). |
| 1270 | NOT_BUILT | What Maya would send | Maya email preview (gap 3.12). |
| 1272 | NOT_BUILT | Maya · Colaberry Admissions | Maya email preview (gap 3.12). |
| 1274 | NOT_BUILT | Not sent — email is off until Ali activates it. | Maya email preview (gap 3.12); states a policy that would need checking against the campaign engine before shipping. |
| 1274 | NOT_BUILT | When it's on, delivery goes through the existing campaign engine: consent required, at most 3 contacts per 7 days, 48 hours apart, and nothing while a person ow | Maya email preview (gap 3.12); the "3 contacts per 7 days, 48 hours apart" figures are not verified against the engine. |
| 1275 | NOT_BUILT | Close preview | Maya email preview (gap 3.12). |
| 1280 | NOT_BUILT | Invite your team | No "Invite your team" sheet: the Q12 invite is an inline form in the Partner Office team panel (PartnerTeam.tsx:28-60), toggled by "Invite people" (:98). Gap S1 |
| 1284 | INVENTED | Lakeshore Logistics · 5 of 20 seats open | Invented company and seat counts; PartnerTeam.tsx:13-14: no seat count exists server-side. |
| 1286 | INVENTED | Each invite carries a seat code. When they enroll with it, the seat is already paid and they show up on your dashboard. | Claims each invite carries a seat code and the seat is paid; inviteMembers (POST /api/portal/org/invites) sends emails+team only, no seat codes. Unsupported fac |
| 1290 | INVENTED | Or share a code directly | Shareable seat codes do not exist (no seat codes on the org API); design lists invented codes. |
| 1339 | INVENTED | The campus is open. 10 classmates are already inside. | Count "10 classmates" invented; build uses the real presence count: "The campus is open. {here} classmates are already inside." (CampusGate.tsx:90). |
| 1344 | INVENTED | Cohort · July 2026 | Invented cohort date "July 2026"; build ID card shows "AI Systems Architect Accelerator" and leaves unknown facts off (CampusGate.tsx:15-16, 117). Gap A1.15. |
| 1361 | SUPERSEDED | Cherry Cruiser | C46 (Ali, 2026-10-25, "I think it should be walking"): no rides; Cherry Cruiser became the Gold Architect jacket (backend/src/services/campus/campusUnlocks.ts:8 |
| 1379 | INVENTED | Elaine Porter | Invented sample sponsor name. |
| 1380 | INVENTED | Morgan Hale | Invented sample staff name. |
| 1386 | INVENTED | Included for you: a short preview of every live class, and the Open House on Oct 29. | Invented date "Oct 29"; also the build preview is week 0 only (campusAccess.ts:12), not "every live class". Build NOTICE.preview: "You can watch a short preview |
| 1389 | INVENTED | Included for you: walk the sprint board in demo mode. Click around all you like — running prompts and creating builds is for members. | Names a "sprint board" the real Projects demo does not have; build NOTICE.demo states the real rule: "Explore it in demo mode. Running and saving work is for me |
| 1394 | NOT_BUILT | Work on real client engagements | Career/AI Internship gate: DELIBERATE, career is open in the build (gap analysis line 561, C6 rule "access never invents a rule"; no PageGate on the internship  |
| 1394 | NOT_BUILT | Enrolled members join client teams, weekly standups and handoffs — the work experience employers ask about. | Career/AI Internship gate: DELIBERATE, career is open in the build (gap analysis line 561, C6 rule "access never invents a rule"; no PageGate on the internship  |
| 1395 | NOT_BUILT | A seat on a real client team | Career gate perks (see 1394). |
| 1395 | NOT_BUILT | Weekly standups and sprint reviews | Career gate perks (see 1394). |
| 1395 | NOT_BUILT | Handoffs and references you can point to | Career gate perks (see 1394). |
| 1401 | NOT_BUILT | Inactive · seat reclaimable | Per-learner sponsor roster statuses come from invented seat/Demo Day data; partner seats and status chips are DELIBERATE (gap A3.2, Q12 defers seats/demo day) |
| 1401 | NOT_BUILT | Demo Day candidate | Per-learner sponsor roster statuses come from invented seat/Demo Day data; partner seats and status chips are DELIBERATE (gap A3.2, Q12 defers seats/demo day) |
| 1401 | NOT_BUILT | Needs a nudge | Per-learner sponsor roster statuses come from invented seat/Demo Day data; partner seats and status chips are DELIBERATE (gap A3.2, Q12 defers seats/demo day) |
| 1403 | NOT_BUILT | Team progress | Q12 (DECISIONS): dashboard, invite and CSV now from /api/portal/org/*, the rest deferred; Partner Office face has one room (campusMap.ts:149 Company) |
| 1403 | NOT_BUILT | Seats & invites | Q12 (DECISIONS): dashboard, invite and CSV now from /api/portal/org/*, the rest deferred; Partner Office face has one room (campusMap.ts:149 Company) |
| 1403 | NOT_BUILT | Weekly digest | Q12 (DECISIONS): dashboard, invite and CSV now from /api/portal/org/*, the rest deferred; Partner Office face has one room (campusMap.ts:149 Company) |
| 1406 | SUPERSEDED | Twelve weeks of guided curriculum and live weekly Build Day classes. Your people check in here, so attendance and lesson progress roll up to you automatically. | tourSteps.ts:7-10 header: no counts, dates, times, progress figures; copy written from what the page really does (gap row 1.2 DELIBERATE); "Twelve weeks" is a c |
| 1406 | INVENTED | Avg. lesson progress | Sponsor tour KPI tile label; its value (58% / 86%) is invented and the build draws no KPI tiles (Q12 defers sponsor reporting) |
| 1406 | INVENTED | Live-class attendance | Sponsor tour KPI tile label; its value (58% / 86%) is invented and the build draws no KPI tiles (Q12 defers sponsor reporting) |
| 1407 | INVENTED | Each person ships real AI projects on a sprint board — tickets, reviews and releases, the same way your engineering teams work. | Claims a sprint board with tickets/reviews/releases; the portal Projects page has none (no sprint board anywhere in pages/portal) |
| 1407 | INVENTED | Builds in progress | Sponsor KPI tile label; values (11 / 4) invented; no KPI tiles built |
| 1407 | INVENTED | Builds shipped | Sponsor KPI tile label; values (11 / 4) invented; no KPI tiles built |
| 1408 | INVENTED | Where they get certified | Implies certification is granted on campus; Cert Prep prepares (knowledge checks are not certification), build says "Where they get certification-ready" |
| 1408 | SUPERSEDED | Short knowledge checks verify each skill on the AI Systems Architect path, then practice exams prepare them for certification. | tourSteps.ts:7-10 header: no counts, dates, times, progress figures; copy written from what the page really does (gap row 1.2 DELIBERATE); "verify each skill on |
| 1408 | INVENTED | Skills verified this month | Sponsor KPI tile label with invented value (9); no KPI tiles built |
| 1409 | SUPERSEDED | Live rooms, peers from other companies, and AI staff on duty 24/7 — Reese for mentoring, Dara for curriculum — so nobody gets stuck alone. | C87 (Ali 2026-10-29, backend campusStaffDesks.ts:55): Dara is upstairs for staff, learners go through Reese; "peers from other companies" unverifiable |
| 1409 | INVENTED | Active this week | Sponsor KPI tile label with invented value (12 of 15, 24/7 tile); no KPI tiles built |
| 1409 | INVENTED | Mentor coverage | Sponsor KPI tile label with invented value (12 of 15, 24/7 tile); no KPI tiles built |
| 1410 | SUPERSEDED | Portfolios employers can verify, built automatically from class work and projects, and Demo Day where standouts present. | Demo Day is deferred (Q12); "employers can verify" is not a built verification; build: "Each person's work collected into a portfolio others can view." |
| 1410 | INVENTED | Demo Day candidates | Sponsor KPI tile label with invented value (2 / 15); no KPI tiles built |
| 1410 | INVENTED | Portfolios started | Sponsor KPI tile label with invented value (2 / 15); no KPI tiles built |
| 1410 | NOT_BUILT | Your standouts, ready to present. | Demo Day standouts deferred (Q12) |
| 1411 | INVENTED | Seats, invites and reporting for Lakeshore Logistics. Reassign inactive seats, invite new people, and see who is ready for Demo Day. | Names the sample company "Lakeshore Logistics"; seat reassignment deferred (Q12) |
| 1411 | INVENTED | Inactive seats to reclaim | Sponsor KPI tile label with invented value (2); seat reclaim not built (Q12) |
| 1418 | SUPERSEDED | Three quick, classic-style games for a reset between lessons. Your scores go on the leaderboard. | C36 (v8 G5) and CAMPUS_V7_TO_V10_PROMPT.md:147: "Five quick games, fifteen minutes a day, with weekly leaderboards." |
| 1418 | SUPERSEDED | Play Byte Chase, Launch Lab or Bug Breaker | C36: five games now |
| 1418 | SUPERSEDED | Beat your cohort's high scores | V7_TO_V10 prompt :147 sets weekly leaderboards; build bullet reflects weekly boards |
| 1418 | SUPERSEDED | Breaks are capped at 15 minutes a day, and games never cost or earn learning points. | v10/v11 and V7_TO_V10 prompt :147: "Games never change your learning points." |
| 1419 | INVENTED | All 12 weeks of the Accelerator live here, plus live Build Day classes every Thursday at 6:30 PM. | Week count and "every Thursday at 6:30 PM" are not real per learner (tourSteps.ts:7-10 header: no counts, dates, times, progress figures; copy written from what |
| 1419 | INVENTED | Pick up Week 5 right where you left off | "Week 5" illustrative |
| 1419 | INVENTED | Rewatch any class — every session has a replay with captions | Claims every session has a replay with captions; captions deferred (Q15) |
| 1420 | SUPERSEDED | The full curriculum and a reference shelf of guides, templates and examples. | Library holds shared documents; /portal/curriculum is a banned illustrative route (campusMap.ts:12-14) |
| 1420 | SUPERSEDED | Find any lesson from any week | Lessons are not in the Library (campusMap.ts:12-14) |
| 1420 | SUPERSEDED | Grab templates for your builds | tourSteps.ts:7-10 header: no counts, dates, times, progress figures; copy written from what the page really does (gap row 1.2 DELIBERATE); template-for-builds c |
| 1420 | SUPERSEDED | Ask Dara at the curriculum desk to explain anything, 24/7 | C87 (Ali 2026-10-29): Dara is staff-facing, learners go through Reese; note the build bullet itself still names Dara for learners (possible stale copy, out of s |
| 1420 | SUPERSEDED | Dara can turn any lesson into a plain-words summary. | Library holds documents, not lessons; C87 Dara staff-facing |
| 1421 | INVENTED | Your real AI projects run on a sprint board — tickets, reviews and releases, like a real team. | No sprint board in the portal Projects page |
| 1421 | INVENTED | Work your next ticket: STORY-001 (+50 pts) | Ticket id and points are samples |
| 1421 | NOT_BUILT | Copy the build prompt straight into your tools | Bullet absent from the build stop; the feature is real (pages/portal/projects/presentation/PromptPanel.tsx), so it could be added as a third bullet |
| 1421 | SUPERSEDED | Start a new build from the blueprint | /portal/project/blueprint is a banned illustrative route (campusMap.ts:12-14) |
| 1421 | INVENTED | Every shipped build counts toward certification. | Certification credit for builds is not a real rule; build: "Every shipped build becomes evidence in your portfolio." |
| 1422 | SUPERSEDED | Short knowledge checks verify each skill on your path, and practice exams get you certification-ready. | tourSteps.ts:7-10 header: no counts, dates, times, progress figures; copy written from what the page really does (gap row 1.2 DELIBERATE); knowledge checks are  |
| 1422 | INVENTED | Take the Claude Code check — about 10 min, +10 pts | Specific check, minutes and points are samples |
| 1422 | NOT_BUILT | Follow a guided study track | No study track in pages/portal/certprep |
| 1422 | NOT_BUILT | Track your readiness as you go | Bullet absent; readiness is real (pages/portal/certprep/CertReadinessHero.tsx), so it could be added |
| 1422 | INVENTED | You're at 1% verified. One check moves the needle. | Verified percentage is a sample |
| 1423 | SUPERSEDED | Where you stand: your tier, points, streak and skill radar. | Q5: levels ("Lv N"), not tiers; skill radar not on the path page |
| 1423 | INVENTED | See what unlocks AI Builder I | Names a specific rung (AI Builder I) / unverified-skills view not built |
| 1423 | INVENTED | Spot the skills you haven't verified yet | Names a specific rung (AI Builder I) / unverified-skills view not built |
| 1423 | INVENTED | Ship your first build to reach AI Builder I. | Names a specific rung (AI Builder I) / unverified-skills view not built |
| 1424 | SUPERSEDED | Never stuck alone | C29 (v7 R2) renamed the Commons to Meeting Rooms; C62 events moved there |
| 1424 | SUPERSEDED | Live rooms, your cohort, and Reese at the mentor desk around the clock. | C29/C62 Meeting Rooms copy |
| 1424 | SUPERSEDED | Drop into a live room to co-work | C29 Meeting Rooms copy |
| 1424 | NOT_BUILT | Message anyone in your cohort | Bullet absent from the stop (DMs exist per Q6, but the stop lists rooms/booking) |
| 1424 | SUPERSEDED | Ask Reese when you're stuck — replies in seconds | "replies in seconds" is a latency claim; build: around the clock |
| 1424 | INVENTED | Reese can also find you a pairing partner. | No pairing-partner feature exists |
| 1425 | SUPERSEDED | Your class work and builds become a portfolio employers can verify, with the evidence behind every claim. | tourSteps.ts:7-10 header: no counts, dates, times, progress figures; copy written from what the page really does (gap row 1.2 DELIBERATE); "employers can verify |
| 1425 | SUPERSEDED | Preview it the way an employer sees it | tourSteps.ts:7-10 header: no counts, dates, times, progress figures; copy written from what the page really does (gap row 1.2 DELIBERATE) |
| 1425 | INVENTED | Choose what's shared — private by default | Default visibility not verified as private |
| 1425 | NOT_BUILT | Get picked for Demo Day | No Demo Day selection in the build |
| 1426 | SUPERSEDED | The AI Internship: client teams, weekly standups and handoffs — the experience employers ask about. | Build splits it: what "The AI internship: client work, standups and handoffs." + tip "Internship work is the experience employers ask about."; "weekly" cadence  |
| 1426 | INVENTED | Join Monday's standup at 9:00 | Day/time sample |
| 1426 | NOT_BUILT | Read handoff notes from last sprint | /portal/handoff is the phone-handoff page, a different meaning (gap row 556) |
| 1426 | INVENTED | You're in Week 5 and orientation is still open. | Week number sample |
| 1427 | SUPERSEDED | Explorer campus tour | CAMPUS_V13_TODAY_FOR_EXPLORERS_PROMPT.md:93: the tour name is "Explorer tour" |
| 1428 | SUPERSEDED | Start here: your community | C53/C77 (Ali 2026-10-27): the Explorer tour starts at the Schedule ("Start here: what is coming up"); Commons is "Meet anyone" |
| 1428 | SUPERSEDED | Live rooms, other Explorers, and staff on duty 24/7. All of this is included with Explorer. | C29/C62 Meeting Rooms copy |
| 1428 | SUPERSEDED | Drop into a live room | C29 Meeting Rooms copy |
| 1428 | NOT_BUILT | Message other Explorers | Bullet absent; stop lists rooms/events |
| 1428 | SUPERSEDED | Ask Maya, Reese or Dara anything, any time | Q8: Maya is the website chat widget; C87: Dara is staff-facing |
| 1429 | SUPERSEDED | The intro AI course | Q13 keep as is (no Explorer course change); C91 cut the Explorer tour to tower/commons/lecture; lesson counts/minutes are samples |
| 1429 | SUPERSEDED | Six short lessons on how AI systems fit together — open to every Explorer. | Q13 keep as is (no Explorer course change); C91 cut the Explorer tour to tower/commons/lecture; lesson counts/minutes are samples |
| 1429 | SUPERSEDED | Pick up at lesson 3 of 6 | Q13 keep as is (no Explorer course change); C91 cut the Explorer tour to tower/commons/lecture; lesson counts/minutes are samples |
| 1429 | SUPERSEDED | Earn your Explorer badge when you finish | Q13 keep as is (no Explorer course change); C91 cut the Explorer tour to tower/commons/lecture; lesson counts/minutes are samples |
| 1429 | SUPERSEDED | About 12 minutes a lesson. | Q13 keep as is (no Explorer course change); C91 cut the Explorer tour to tower/commons/lecture; lesson counts/minutes are samples |
| 1430 | SUPERSEDED | Open events | C62 events moved to the Meeting Rooms; C91 3-stop tour; "Oct 29, 6:30 PM CDT" is a sample date |
| 1430 | SUPERSEDED | Open houses, demos and talks, open to everyone. | C62 events moved to the Meeting Rooms; C91 3-stop tour; "Oct 29, 6:30 PM CDT" is a sample date |
| 1430 | SUPERSEDED | RSVP to the Open House · Oct 29, 6:30 PM CDT | C62 events moved to the Meeting Rooms; C91 3-stop tour; "Oct 29, 6:30 PM CDT" is a sample date |
| 1430 | SUPERSEDED | Meet instructors and see real builds | C62 events moved to the Meeting Rooms; C91 3-stop tour; "Oct 29, 6:30 PM CDT" is a sample date |
| 1430 | SUPERSEDED | The Open House is the fastest way to ask everything at once. | C62 events moved to the Meeting Rooms; C91 3-stop tour; "Oct 29, 6:30 PM CDT" is a sample date |
| 1431 | INVENTED | Members get 12 weeks of curriculum and live Build Day classes. You can watch a short preview of any live class. | "12 weeks" count per tourSteps header; preview is said by STATE_NOTE.preview |
| 1431 | INVENTED | Preview Thursday's live class | Day sample |
| 1431 | SUPERSEDED | See what a week of curriculum looks like | tourSteps.ts:7-10 header: no counts, dates, times, progress figures; copy written from what the page really does (gap row 1.2 DELIBERATE) |
| 1431 | SUPERSEDED | Enrolled members can rewatch every class. | C91: lecture is the last stop; tip points at Today |
| 1432 | SUPERSEDED | Members ship real, working AI tools on a sprint board. You can walk a sample project in demo mode. | C91 (tourSteps.ts:6-7): studio is no longer an Explorer stop; also no sprint board in the portal |
| 1432 | SUPERSEDED | Click around a real sprint board | C91 (tourSteps.ts:6-7): studio is no longer an Explorer stop; also no sprint board in the portal |
| 1432 | SUPERSEDED | See how tickets, reviews and releases work | C91 (tourSteps.ts:6-7): studio is no longer an Explorer stop; also no sprint board in the portal |
| 1433 | SUPERSEDED | Practice exams and a study track mapped to the AI Systems Architect certification. | C91: testing is no longer an Explorer stop |
| 1433 | SUPERSEDED | Members-only — the box below shows exactly what enrolling unlocks here. | C91: testing is no longer an Explorer stop |
| 1434 | SUPERSEDED | A portfolio employers can verify | C91: gallery is no longer an Explorer stop |
| 1434 | SUPERSEDED | Members' class work and builds become a professional portfolio automatically. | C91: gallery is no longer an Explorer stop |
| 1434 | SUPERSEDED | Last stop. Next: see everything enrolling unlocks. | C91: gallery is no longer an Explorer stop |
| 1440 | SUPERSEDED | Collab Café | C29 (v7 R2): the Community Lounge is "Meeting Rooms" in both looks (campusMap.ts:103), so the Café rule has no source |
| 1440 | SUPERSEDED | the Café | C29 (v7 R2): the Community Lounge is "Meeting Rooms" in both looks (campusMap.ts:103), so the Café rule has no source |
| 1440 | SUPERSEDED | Training home | Workplace rule for the "Classroom home" room; v14 (colaberry-campus-v14.html:1142) names the room "Classroom" |
| 1442 | NOT_BUILT | across HQ | No "across campus" string in the build for the rule to rewrite |
| 1444 | NOT_BUILT | Session check-in | No "Class check-in" room in the build (v14 lecture rooms: Classroom, Live sessions) |
| 1444 | INVENTED | Session Thu | Rewrites the sample "Class Thu" standup badge |
| 1444 | INVENTED | Week 5 training | "Week 5" sample |
| 1452 | INVENTED | Week 5 · Today's plan | Sample plan/class values; build shows real "Today’s plan · step n of m" and "Next live class · <title> · in Xd Yh" (campusFacts.ts:84-100) |
| 1452 | INVENTED | ~96 min of lessons waiting | Sample plan/class values; build shows real "Today’s plan · step n of m" and "Next live class · <title> · in Xd Yh" (campusFacts.ts:84-100) |
| 1452 | INVENTED | Thursday · in 1d 3h | Sample plan/class values; build shows real "Today’s plan · step n of m" and "Next live class · <title> · in Xd Yh" (campusFacts.ts:84-100) |
| 1452 | NOT_BUILT | Check in when the session opens | Static Attendance row not drawn; Happening-here rows are real-data only (campusArrival.ts header; campusFacts.ts factsAt; gap row 1.7 DELIBERATE) |
| 1453 | INVENTED | Continue Week 5 lessons | "Week 5" sample; build: "Continue this week's lessons" |
| 1454 | INVENTED | Week 5 lessons | "Week 5" room is a sample week |
| 1454 | SUPERSEDED | Classroom home | v14 (colaberry-campus-v14.html:1142) names the room "Classroom" |
| 1457 | INVENTED | Lessons across 10 AI architecture skills | Skill count sample; Happening-here rows are real-data only (campusArrival.ts header; campusFacts.ts factsAt; gap row 1.7 DELIBERATE) |
| 1457 | NOT_BUILT | Reference shelf | Static Library now-row not drawn; Happening-here rows are real-data only (campusArrival.ts header; campusFacts.ts factsAt; gap row 1.7 DELIBERATE) |
| 1457 | NOT_BUILT | Guides, templates and examples | Static Library now-row not drawn; Happening-here rows are real-data only (campusArrival.ts header; campusFacts.ts factsAt; gap row 1.7 DELIBERATE) |
| 1458 | SUPERSEDED | Browse the curriculum | /portal/curriculum is a banned illustrative route (campusMap.ts:12-14); build "Browse the library" |
| 1462 | INVENTED | Plan · ~96 min | Sample minutes/countdown; build Schedule rows are real (campusFacts.ts tower: Today ~N min left, Next live class, Next event) |
| 1462 | INVENTED | Open House · in 15d | Sample minutes/countdown; build Schedule rows are real (campusFacts.ts tower: Today ~N min left, Next live class, Next event) |
| 1465 | SUPERSEDED | Projects, builds & assignments | Design's own DISTRICT override (D:1508) replaces it with 'Sprint board, tickets & builds', which the build uses |
| 1467 | INVENTED | Ship your first build | Rung name / first-build hint is a sample |
| 1467 | INVENTED | Unlocks AI Builder I | Rung name / first-build hint is a sample |
| 1467 | NOT_BUILT | See what's due this week | Static Assignments now-row; Happening-here rows are real-data only (campusArrival.ts header; campusFacts.ts factsAt; gap row 1.7 DELIBERATE) |
| 1469 | SUPERSEDED | Project blueprint | /portal/project/blueprint banned (campusMap.ts:12-14) |
| 1470 | SUPERSEDED | Events, open houses & demos | C62: events moved to the Meeting Rooms; Events Hall sub is 'Colaberry Live broadcasts' |
| 1472 | INVENTED | AI Systems Architect Accelerator Open House | Sample event/date; build shows the real next event (campusFacts.ts ev row) |
| 1472 | INVENTED | Oct 29 · 6:30 PM CDT · in 15d | Sample event/date; build shows the real next event (campusFacts.ts ev row) |
| 1473 | SUPERSEDED | See events & RSVP | C62 (campusMap.ts:89-90): primary is the events list, said plainly |
| 1477 | INVENTED | +10 pts · about 10 min | Points/minutes sample |
| 1478 | SUPERSEDED | Start the knowledge check | C24 (v6 D1, commit c04924f7): Cert Prep = diagnostic and practice; "the knowledge check" pointed at the sample Claude Code check |
| 1479 | SUPERSEDED | Verify skills | /portal/verify banned (campusMap.ts:12-14) |
| 1482 | INVENTED | AI Enabled II | Sample rung/points/streak; build row is real "Lv N · <rung>" + "N pts" (campusFacts.ts:108-111) |
| 1482 | INVENTED | 1,252 pts · top tier reached | Sample rung/points/streak; build row is real "Lv N · <rung>" + "N pts" (campusFacts.ts:108-111) |
| 1482 | INVENTED | Daily streak | Sample rung/points/streak; build row is real "Lv N · <rung>" + "N pts" (campusFacts.ts:108-111) |
| 1482 | INVENTED | 2 days · claimed today | Sample rung/points/streak; build row is real "Lv N · <rung>" + "N pts" (campusFacts.ts:108-111) |
| 1485 | SUPERSEDED | Community, people & live rooms | C29/C62 Meeting Rooms sub 'Events, live rooms, study groups & 1:1s' |
| 1487 | INVENTED | Classmates online | Count sample; build says real "N people here now" (campusArrival.ts happeningAt) |
| 1490 | SUPERSEDED | Portfolio & showcase | Design's DISTRICT override (D:1519) 'Portfolio & client demos', which the build uses |
| 1492 | NOT_BUILT | Add your first shipped build | Static Gallery now-rows; Happening-here rows are real-data only (campusArrival.ts header; campusFacts.ts factsAt; gap row 1.7 DELIBERATE) |
| 1492 | NOT_BUILT | See what classmates shipped | Static Gallery now-rows; Happening-here rows are real-data only (campusArrival.ts header; campusFacts.ts factsAt; gap row 1.7 DELIBERATE) |
| 1494 | SUPERSEDED | Portfolio preview | Design's DISTRICT override renames it 'Client preview' (D:1521) and v14 drops the preview room; build 'Preview' |
| 1495 | SUPERSEDED | AI Internship & company work | Design's DISTRICT override (D:1513) 'Engagements, internship & company work', which the build uses |
| 1497 | INVENTED | AI Internship · Week 5 | "Week 5" sample |
| 1497 | INVENTED | Orientation and the Monday standup | "Week 5" sample |
| 1497 | NOT_BUILT | Team, placement and handoffs | Static Career now-row; Happening-here rows are real-data only (campusArrival.ts header; campusFacts.ts factsAt; gap row 1.7 DELIBERATE) |
| 1498 | SUPERSEDED | Open my internship | Overwritten in the design itself by DISTRICT.career.primary 'Open my engagements' (D:1516); see that row |
| 1501 | SUPERSEDED | Three quick games · 15 min a day | C36 (v8 G5): 'Five quick games · 15 min a day' (campusArrival.ts:37) |
| 1503 | INVENTED | People playing right now | Sample activity/"this week's favorite"; Happening-here rows are real-data only (campusArrival.ts header; campusFacts.ts factsAt; gap row 1.7 DELIBERATE) |
| 1503 | INVENTED | Byte Chase is this week's favorite | Sample activity/"this week's favorite"; Happening-here rows are real-data only (campusArrival.ts header; campusFacts.ts factsAt; gap row 1.7 DELIBERATE) |
| 1503 | SUPERSEDED | 15 minutes · resets at midnight | Build shows the real break left: "N min left · resets at midnight Central" (campusFacts.ts:112-115) |
| 1510 | INVENTED | STORY-001 is in progress | Sample ticket/project/sprint values |
| 1510 | INVENTED | PropertyPulse AI · Release 0 · +50 pts | Sample ticket/project/sprint values |
| 1510 | INVENTED | Sprint 2 of 4 | Sample ticket/project/sprint values |
| 1510 | INVENTED | Review Friday · standup Monday 9:00 | Sample ticket/project/sprint values |
| 1511 | NOT_BUILT | Open the sprint board | No sprint board in the portal; build keeps the base primary "Open my projects" (campusMap.ts:85) |
| 1515 | INVENTED | PropertyPulse AI · Medical Courier · PromiseGuard | Sample client names |
| 1521 | SUPERSEDED | Client preview | v14 drops the preview room; build "Preview" |
| 1524 | SUPERSEDED | Town halls, events & demos | C62: Workplace sub 'Town halls & live broadcasts' |
| 1525 | SUPERSEDED | Colleagues, coffee & live rooms | C29: Workplace sub 'Events, meetings & 1:1s' |
| 1530 | SUPERSEDED | AI admissions · reports to Taiwo's team | staffCard.ts:8-9: "reports to Taiwo's team" names a person the campus cannot vouch for, so her line is just her role |
| 1531 | SUPERSEDED | Who did you hand off today? | Q8: Maya speaks through the website widget; backend campusStaffDesks.ts:73 gives her no prompts (her widget offers its own quick replies) |
| 1531 | SUPERSEDED | Show me the Admissions queue | Q8: Maya speaks through the website widget; backend campusStaffDesks.ts:73 gives her no prompts (her widget offers its own quick replies) |
| 1531 | SUPERSEDED | What do I get if I enroll? | Q8: Maya speaks through the website widget; backend campusStaffDesks.ts:73 gives her no prompts (her widget offers its own quick replies) |
| 1531 | SUPERSEDED | How much does it cost? | Q8: Maya speaks through the website widget; backend campusStaffDesks.ts:73 gives her no prompts (her widget offers its own quick replies) |
| 1531 | SUPERSEDED | Can my employer sponsor me? | Q8: Maya speaks through the website widget; backend campusStaffDesks.ts:73 gives her no prompts (her widget offers its own quick replies) |
| 1531 | SUPERSEDED | Can I talk to a person? | Q8: Maya speaks through the website widget; backend campusStaffDesks.ts:73 gives her no prompts (her widget offers its own quick replies) |
| 1534 | INVENTED | I'm stuck on STORY-001 | Sample ticket id |
| 1534 | SUPERSEDED | Help me plan my week | Suggested questions are server-owned (backend campusStaffDesks.ts:54 REESE_PROMPTS) and must work for the real agent; no pairing feature exists |
| 1534 | SUPERSEDED | Who can I pair with? | Suggested questions are server-owned (backend campusStaffDesks.ts:54 REESE_PROMPTS) and must work for the real agent; no pairing feature exists |
| 1534 | SUPERSEDED | When does the next cohort start? | Suggested questions are server-owned (backend campusStaffDesks.ts:54 REESE_PROMPTS) and must work for the real agent; no pairing feature exists |
| 1537 | SUPERSEDED | Explain MCP in plain words | C87 (Ali 2026-10-29, backend campusStaffDesks.ts:55-57): Dara is upstairs for staff; only questions that work for staff stay |
| 1537 | SUPERSEDED | Which lesson covers agents? | C87 (Ali 2026-10-29, backend campusStaffDesks.ts:55-57): Dara is upstairs for staff; only questions that work for staff stay |
| 1537 | SUPERSEDED | How do I get certified? | C87 (Ali 2026-10-29, backend campusStaffDesks.ts:55-57): Dara is upstairs for staff; only questions that work for staff stay |
| 1537 | SUPERSEDED | What's in the course? | C87 (Ali 2026-10-29, backend campusStaffDesks.ts:55-57): Dara is upstairs for staff; only questions that work for staff stay |
| 1544 | INVENTED | Read ahead while it's quiet | Quiet-hours suggestions are samples ("Week 5 notes"; leave-a-note not built); Right now list is real-data only (rightNow.ts:11-15: prototype suggestions were sa |
| 1544 | INVENTED | Week 5 notes · no rush | Quiet-hours suggestions are samples ("Week 5 notes"; leave-a-note not built); Right now list is real-data only (rightNow.ts:11-15: prototype suggestions were sa |
| 1544 | INVENTED | Leave a note for your cohort | Quiet-hours suggestions are samples ("Week 5 notes"; leave-a-note not built); Right now list is real-data only (rightNow.ts:11-15: prototype suggestions were sa |
| 1544 | INVENTED | They'll see it in the morning | Quiet-hours suggestions are samples ("Week 5 notes"; leave-a-note not built); Right now list is real-data only (rightNow.ts:11-15: prototype suggestions were sa |
| 1546 | INVENTED | ~96 min · Week 5 lessons | Sample minutes/week; build "Continue today’s plan" uses real step minutes (rightNow.ts:55) |
| 1549 | INVENTED | Drop into Colaberry AI Sessions | Sample room name; build: `Drop into the ${busiest building}` with real count (rightNow.ts:65) |
| 1551 | NOT_BUILT | Your internship standup is about to start. | No standup moment (momentOf, conciergeCopy.ts:64-71, has no standup source) |
| 1552 | INVENTED | Internship standup starts in 4 min | Sample standup time/week |
| 1552 | INVENTED | Week 5 · Monday standup at the Career Center | Sample standup time/week |
| 1553 | INVENTED | Class Thu | Sample badge |
| 1554 | INVENTED | Check today's agenda | Sample standup-day suggestions |
| 1554 | INVENTED | Standup, then ~96 min of lessons | Sample standup-day suggestions |
| 1554 | INVENTED | Week 5 lessons after standup | Sample standup-day suggestions |
| 1555 | INVENTED | Monday standup | Sample standup now-override rows |
| 1555 | INVENTED | Starts 9:00 AM · in 4 min | Sample standup now-override rows |
| 1555 | INVENTED | Orientation is still open | Sample standup now-override rows |
| 1559 | INVENTED | Skim the Week 5 reading first | Sample reading/end time |
| 1559 | INVENTED | See the rest of tonight | Sample reading/end time |
| 1559 | INVENTED | Class until 8:30 PM | Sample reading/end time |
| 1560 | INVENTED | Live class · Week 5 | Sample now-override (week, time, arrivals) |
| 1560 | INVENTED | Starts 6:30 PM · check-in open | Sample now-override (week, time, arrivals) |
| 1560 | INVENTED | Classmates arriving | Sample now-override (week, time, arrivals) |
| 1561 | NOT_BUILT | No classes today. Build something or hang out. | No "free day" moment in momentOf (conciergeCopy.ts:64-71); a real version is possible (no session today) |
| 1562 | INVENTED | Ship build | Sample badge with no real signal |
| 1563 | SUPERSEDED | Hang out in the Lounge | C29: no Lounge (Meeting Rooms); count sample |
| 1566 | NOT_BUILT | What does enrolling unlock? | CampusConcierge.tsx:105-106: the Explorer's sign-up shortcut waits for the sign-up sheet |
| 1569 | INVENTED | Continue the AI course | Sample lesson count/minutes/event date (Q13 keep as is) |
| 1569 | INVENTED | Lesson 3 of 6 · about 12 min | Sample lesson count/minutes/event date (Q13 keep as is) |
| 1569 | INVENTED | RSVP to the Open House | Sample lesson count/minutes/event date (Q13 keep as is) |
| 1569 | INVENTED | Oct 29 · 6:30 PM CDT | Sample lesson count/minutes/event date (Q13 keep as is) |
| 1569 | NOT_BUILT | Meet other Explorers | Right now list is real-data only (rightNow.ts:11-15: prototype suggestions were samples; gap row 357) |
| 1569 | NOT_BUILT | Live rooms are open to you | Right now list is real-data only (rightNow.ts:11-15: prototype suggestions were samples; gap row 357) |
| 1569 | NOT_BUILT | Peek into Project Studio | Right now list is real-data only (rightNow.ts:11-15: prototype suggestions were samples; gap row 357) |
| 1569 | NOT_BUILT | Demo mode · see how projects work | Right now list is real-data only (rightNow.ts:11-15: prototype suggestions were samples; gap row 357) |
| 1629 | SUPERSEDED | Maya, AI admissions, welcome desk | C21 (StaffTokens.tsx:6-9): the welcome bench at the gate is gone; Maya is at Admissions; tokens read `${name}, AI staff, walk to their desk` |
| 1634 | SUPERSEDED | WELCOME DESK | C21: no welcome-desk sign at the gate (StaffTokens.tsx:8) |
| 1850 | NOT_BUILT | 12 learners on campus. 4 could use a hand — they're listed below and pinned on the map. | Q11: the at-risk ("could use a hand") list is a separate backend project; build says real `${n} learners on campus.` (conciergeCopy.ts:115) |
| 1953 | INVENTED | Building agents with MCP | Sample broadcast topic (campusLiveState.ts:8-13: discovery lists only LIVE/RECONNECTING; prototype topic, 58 min, per-state crowd rows were samples) |
| 1967 | INVENTED | replay ready · 58 min | Sample replay duration (campusLiveState.ts:8-13: discovery lists only LIVE/RECONNECTING; prototype topic, 58 min, per-state crowd rows were samples) |
| 1980 | NOT_BUILT | Tonight's session has ended. The replay is ready whenever you are. | Replay state: campusLiveState.ts:8-13: discovery lists only LIVE/RECONNECTING; prototype topic, 58 min, per-state crowd rows were samples; leadFor has no replay |
| 1981 | INVENTED | Try the demo | Sample live-moment badges |
| 1981 | INVENTED | Watch party | Sample live-moment badges |
| 1982 | NOT_BUILT | Colaberry Live starts soon | Backstage urgent: discovery does not list backstage yet (campusLiveState.ts:8-13: discovery lists only LIVE/RECONNECTING; prototype topic, 58 min, per-state cro |
| 1984 | INVENTED | Week 5 notes · Agents & MCP | Sample backstage suggestions ("Week 5 notes"); Right now steps aside while live (rightNow.ts:14-15) |
| 1984 | INVENTED | Check in early | Sample backstage suggestions ("Week 5 notes"); Right now steps aside while live (rightNow.ts:14-15) |
| 1984 | INVENTED | Attendance opens with the doors | Sample backstage suggestions ("Week 5 notes"); Right now steps aside while live (rightNow.ts:14-15) |
| 1985 | SUPERSEDED | Watch with classmates | Right now list steps aside while live (rightNow.ts:14-15, :49); "Community Lounge" renamed (C29); watch-party not built |
| 1985 | SUPERSEDED | Watch party in the Community Lounge | Right now list steps aside while live (rightNow.ts:14-15, :49); "Community Lounge" renamed (C29); watch-party not built |
| 1985 | SUPERSEDED | Check in for attendance | Right now list steps aside while live (rightNow.ts:14-15, :49); "Community Lounge" renamed (C29); watch-party not built |
| 1985 | SUPERSEDED | Credit for tonight's session | Right now list steps aside while live (rightNow.ts:14-15, :49); "Community Lounge" renamed (C29); watch-party not built |
| 1986 | NOT_BUILT | Chat while it reconnects | Right now steps aside while live (rightNow.ts:49); "the Lounge" renamed (C29) |
| 1986 | NOT_BUILT | Your cohort is in the Lounge | Right now steps aside while live (rightNow.ts:49); "the Lounge" renamed (C29) |
| 1987 | INVENTED | Watch the replay | Sample replay suggestions (58 min, starter project, +10 pts); replay not listed by discovery |
| 1987 | INVENTED | 58 min · captions and chapters | Sample replay suggestions (58 min, starter project, +10 pts); replay not listed by discovery |
| 1987 | INVENTED | Try what was demoed | Sample replay suggestions (58 min, starter project, +10 pts); replay not listed by discovery |
| 1987 | INVENTED | Agents & MCP starter project | Sample replay suggestions (58 min, starter project, +10 pts); replay not listed by discovery |
| 1987 | INVENTED | Lock it in | Sample replay suggestions (58 min, starter project, +10 pts); replay not listed by discovery |
| 1987 | INVENTED | Quick check on tonight's topic · +10 pts | Sample replay suggestions (58 min, starter project, +10 pts); replay not listed by discovery |
| 1989 | INVENTED | Doors open · | Per-state crowd rows were samples (campusArrival.ts happeningAt WP-6 comment); backstage not listed |
| 1989 | INVENTED | · starts in a moment | Per-state crowd rows were samples (campusArrival.ts happeningAt WP-6 comment); backstage not listed |
| 1989 | INVENTED | Your cohort is arriving | Per-state crowd rows were samples (campusArrival.ts happeningAt WP-6 comment); backstage not listed |
| 1989 | INVENTED | Watch them stream in across campus | Per-state crowd rows were samples (campusArrival.ts happeningAt WP-6 comment); backstage not listed |
| 1989 | INVENTED | Check-in opens with the doors | Per-state crowd rows were samples (campusArrival.ts happeningAt WP-6 comment); backstage not listed |
| 1990 | INVENTED | Your cohort is in the hall | Per-state crowd rows were samples (campusArrival.ts WP-6 comment: "reactions are flowing" and "your cohort is arriving" not drawn) |
| 1990 | INVENTED | Reactions are flowing | Per-state crowd rows were samples (campusArrival.ts WP-6 comment: "reactions are flowing" and "your cohort is arriving" not drawn) |
| 1990 | INVENTED | Check in for tonight's credit | Per-state crowd rows were samples (campusArrival.ts WP-6 comment: "reactions are flowing" and "your cohort is arriving" not drawn) |
| 1991 | INVENTED | Your cohort is still here | Per-state crowd rows were samples (campusArrival.ts WP-6 comment) |
| 1991 | INVENTED | Nobody needs to leave | Per-state crowd rows were samples (campusArrival.ts WP-6 comment) |
| 1992 | INVENTED | Replay ready · 58 min | Replay now-rows: sample duration/notes; replay not listed by discovery |
| 1992 | INVENTED | Captions and chapters | Replay now-rows: sample duration/notes; replay not listed by discovery |
| 1992 | INVENTED | Session notes | Replay now-rows: sample duration/notes; replay not listed by discovery |
| 1992 | INVENTED | Slides and the demo project are in Week 5 | Replay now-rows: sample duration/notes; replay not listed by discovery |
| 2001 | NOT_BUILT | Starting in | Backstage stage overlay. The server lists only LIVE and RECONNECTING broadcasts, so the campus never shows backstage (campusLiveState.ts:8-9). |
| 2001 | NOT_BUILT | The host is setting up backstage | Backstage overlay; backstage is not served to the campus (campusLiveState.ts:8-9). |
| 2005 | NOT_BUILT | …so the agent asks the MCP server for tools instead of calling the database directly. | Live captions deferred (DECISIONS Q15; LiveStage.tsx:17). The caption text itself is invented. |
| 2014 | NOT_BUILT | Go to the replay → | Replay state is not served to the campus (campusLiveState.ts:8-9); replays live in the Classroom ClassSessions list ("▶ Replay"). |
| 2032 | SUPERSEDED | · in the Classroom | Colaberry Live airs in the Events Hall, not the Classroom (DECISIONS Q2; C28/C62 in campusOnAir.ts:15, campusMap.ts:89). |
| 2033 | NOT_BUILT | ✓ Checked in · open Live sessions | Backstage-state CTA; backstage is not served. Check-in is a cheer "Checked in · <title>" (useLiveCheckIn.ts:40) and the Classroom "Check in" button. |
| 2034 | NOT_BUILT | Open the replay in Sessions | Replay-state CTA; replay is not served (campusLiveState.ts:8-9). |
| 2036 | SUPERSEDED | Live room · audio & Q&A | The live building's room list is replaced by a single LiveTile (events/LiveScreen.tsx:12, C28/C62). The CTA form "Join the live room · audio & Q&A" exists (Arri |
| 2036 | SUPERSEDED | Class check-in | Live building room list replaced by the LiveTile (events/LiveScreen.tsx:12); check-in moved to the Classroom (C32, ArrivalPanel.tsx:142). |
| 2056 | NOT_BUILT | Picture-in-picture · tap ↗ to go to the hall | No mini stage on the map; the broadcast plays in the portal's one mini player ("Playing in your mini player / It keeps playing while you walk", LiveStage.tsx:33 |
| 2158 | INVENTED | Roselen Flores | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Kendra Mills | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Andre Shaw | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Tashima Diah | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Victoria Spencer-Auber | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Mihret Netsereab | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Unuforoh Iyasere | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Marcus Lee | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Priya Nair | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Jordan Kim | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Sofia Ramos | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Kwame Mensah | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Elena Petrova | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Omar Haddad | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Grace Liu | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Tunde Bello | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Hannah Cole | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Diego Torres | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Aisha Khan | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Ben Carter | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Mei Tanaka | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Samuel Ortiz | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Nia Brooks | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Lucas Silva | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Zara Ahmed | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Ravi Patel | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Chloe Martin | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Ade Okafor | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Laila Hassan | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Noah Reed | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Iris Wang | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Kofi Asante | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Maya Gold | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Ethan Park | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Fatima Noor | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Leo Russo | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Amara Eze | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Tom Becker | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Yuki Sato | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Carmen Diaz | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Gabe Moreno | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Ana Lima | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Sean Walsh | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Rina Das | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Max Holt | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Dee Carter | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Paul Ng | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2158 | INVENTED | Jade Fox | Invented roster name (fake ROSTER; gap P10 DELIBERATE, real presence only). |
| 2172 | INVENTED | Explorer — Prospects | Roster cohort label for the fake roster (invented cohort/date; gap P10). |
| 2172 | INVENTED | Cohort · November 2026 | Roster cohort label for the fake roster (invented cohort/date; gap P10). |
| 2177 | INVENTED | Playing Byte Chase | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2177 | INVENTED | On a quick break | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2177 | INVENTED | Going for a high score | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2177 | INVENTED | Working on STORY-002 | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2177 | INVENTED | Reviewing PR #12 | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2177 | INVENTED | Pairing on Release 0 | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2177 | INVENTED | In Week 5 lessons | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2177 | INVENTED | Watching lesson 2 | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2177 | INVENTED | Reading Week 5 notes | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2178 | INVENTED | Hanging out in live rooms | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2178 | INVENTED | Grabbing a coffee | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2178 | INVENTED | Taking a knowledge check | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2178 | INVENTED | In the internship sync | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2178 | INVENTED | Prepping a client update | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2179 | INVENTED | Polishing a demo | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2179 | INVENTED | Checking their path | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2179 | INVENTED | Planning the week | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2179 | INVENTED | At the event | Fake ACT activity line (gap P10 DELIBERATE; presence carries no activity). |
| 2261 | INVENTED | Saved searches | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2261 | INVENTED | Comps panel | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2261 | INVENTED | Opportunity Score | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2261 | INVENTED | Location picker | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2261 | INVENTED | Scaffold & auth | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2261 | INVENTED | Release 0 kickoff | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2262 | INVENTED | SPRINT 2 · PROPERTYPULSE AI | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2274 | INVENTED | PropertyPulse AI | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2274 | INVENTED | Real estate · Release 0 | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2274 | INVENTED | Regional Medical Courier | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2274 | INVENTED | Logistics · Release 1 | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2274 | INVENTED | Insurtech · kickoff | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2279 | INVENTED | CLIENT DEMO DAY · FRI | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2279 | INVENTED | Medical Courier | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2279 | INVENTED | Your next demo | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2302 | INVENTED | Week 5 · Agents & MCP | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2304 | INVENTED | TODAY · THURSDAY | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2305 | INVENTED | LECTURE HALL | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2305 | INVENTED | Week 5 office hours | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2305 | INVENTED | Internship sync | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2305 | INVENTED | CAREER CTR | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2312 | INVENTED | MONDAY STANDUP | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2312 | INVENTED | Week 5 · AI Internship | Room-interior wall art with invented tickets/clients/schedule (gap 2.12-2.18 DELIBERATE; build draws generic boards). |
| 2406 | NOT_BUILT | Admissions queue | Staff pages (/staff/admissions) not built; Staff Office links to Growth Journey handoffs through the Mgmt bridge (DECISIONS Q11; gap 3.15). |
| 2406 | NOT_BUILT | Needs attention | At-risk service is its own backend project (DECISIONS Q11). |
| 2406 | NOT_BUILT | Search insights | /staff/search not built; Mgmt bridge links (DECISIONS Q11; gap 5 row /staff/*). |
| 2417 | NOT_BUILT | Project Studio · Workspace | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2418 | INVENTED | Client: real-estate investors · Release 0 · Sprint 2 of 4 · standup Mon 9:00 · review Fri | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2419 | INVENTED | Hair Salon Booking | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2419 | NOT_BUILT | ＋ New build | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2420 | INVENTED | User selects location and receives Opportunity Score | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2420 | NOT_BUILT | Start building → | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2420 | NOT_BUILT | >Copy prompt | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2422 | INVENTED | Saved searches & alerts | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2422 | INVENTED | Comparable sales panel | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2423 | INVENTED | +50 pts · due Fri | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2424 | INVENTED | Project scaffold & auth | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2424 | INVENTED | PR #12 · CI ✓ | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2428 | INVENTED | >PropertyPulse AI | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2431 | INVENTED | Checks passed on PR #12 | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2433 | INVENTED | You shipped | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2438 | NOT_BUILT | Project Studio · Assigned to you | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2438 | NOT_BUILT | Everything on your plate across client builds, sorted by due date. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2440 | INVENTED | Route optimizer | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2443 | NOT_BUILT | Internship Office · AI Internship | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2443 | INVENTED | Week 5 · orientation and the Monday standup. Your client work, meetings and handoffs in one place. | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2444 | INVENTED | 9:00 AM · Internship Office, Room 2 | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2444 | INVENTED | Real estate · Release 0 · weekly sync Fri | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2444 | INVENTED | Orientation checklist | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2445 | INVENTED | >Marcus Lee | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2454 | SUPERSEDED | Three quick, classic-style games. Scores go on the leaderboard. Breaks are capped at 15 minutes a day so they stay breaks — and games never cost or earn learnin | The Game Room has five games now (C-rounds); build page sub: "Five quick games, fifteen minutes a day. Your break resets at midnight Central, and games never ch |
| 2457 | NOT_BUILT | A sample project you can click around. Building for real is for enrolled members. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2457 | NOT_BUILT | Enroll to build → | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2459 | NOT_BUILT | A live look at the AI Systems Architect Accelerator. Meet instructors, see real builds and ask anything. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2462 | NOT_BUILT | Build and learn | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2462 | NOT_BUILT | Your builds live here — every project you ship, as lists and tasks in the same feed you see across the platform. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2464 | INVENTED | Your next step · PropertyPulse AI | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2464 | INVENTED | STORY-001 · User selects location and receives Opportunity Score | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2464 | INVENTED | As an investor, I want to select a location and receive an Opportunity Score, so that I can identify potential properties. | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2464 | INVENTED | Build · +50 pts | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2466 | INVENTED | Regional Medical Courier System | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2466 | INVENTED | Not started | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2466 | INVENTED | Hair Salon Booking & Payments | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2467 | NOT_BUILT | Start a new build | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2470 | NOT_BUILT | What is due, what is in review, and what you have shipped. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2472 | NOT_BUILT | Turn an idea into releases, stories and tasks before you write a line of code. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2474 | INVENTED | All 12 weeks of the AI Systems Architect Accelerator. You're in Week 5. | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2475 | INVENTED | Deploy & ops, governance, capstone, Demo Day | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2476 | INVENTED | Guides, templates and worked examples you can lift straight into your builds. | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2477 | INVENTED | Prompt patterns | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2477 | INVENTED | MCP server starter | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2477 | INVENTED | Template repo · Week 5 | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2477 | INVENTED | RAG checklist | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2477 | INVENTED | Before you ship | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2477 | INVENTED | Eval harness | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2477 | INVENTED | Worked example | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2478 | NOT_BUILT | Ask Dara about anything here | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2478 | INVENTED | She's at the curriculum desk in this building, 24/7. | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2479 | INVENTED | Today's plan is about 96 minutes. Pick up where you left off. | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2480 | INVENTED | What an agent actually is | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2480 | INVENTED | Video · 12 min | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2480 | INVENTED | MCP servers, tools and resources | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2480 | INVENTED | Lab · 45 min | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2480 | INVENTED | Week 5 knowledge check | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2480 | INVENTED | Quiz · 10 min · +10 pts | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2481 | NOT_BUILT | Time left | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2482 | NOT_BUILT | Every live class, with check-in and replays in one place. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2484 | NOT_BUILT | Drop in, work alongside classmates, or join tonight's live class. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2486 | NOT_BUILT | Classmates across every cohort, and who is online right now. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2488 | NOT_BUILT | Join orientation and the Monday standup. Your team works out of the Career Center. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2490 | NOT_BUILT | Short checks that verify a skill and add points to your path. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2491 | INVENTED | About 10 minutes · 12 questions · | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2491 | NOT_BUILT | Start the check | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2492 | INVENTED | 1,252 points · top tier reached. Ship your first build to reach AI Builder I. | Page mock-up content with invented data. Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page cont |
| 2494 | NOT_BUILT | Open houses, demos and talks. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2495 | NOT_BUILT | Everything you ship, ready to share. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2496 | NOT_BUILT | Your day | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2496 | NOT_BUILT | Everything on your calendar this week. | Portal page bodies are mock-ups; the build opens the real portal page for each route (gap analysis section 5 "Page contents", outside components/campus). |
| 2512 | NOT_BUILT | Down the hall | Page room tabs ("Down the hall") not built; the location bar crumb shows the room (CampusLocationBar.tsx:18). |
| 2519 | NOT_BUILT | Back into | Bottom dock not built; the design itself hides it (gap 4.13 "DELIBERATE-ish", CSS .dock{display:none}). |
| 2520 | NOT_BUILT | Tour stop | Dock "Next" button label; dock not built (gap 4.13). |
| 2570 | NOT_BUILT | the Lobby | whereAmI() feeds the chat "Share where I am" strip, which is not built (gap 4.1); the side panel says "In the lobby" (conciergeCopy.ts:45). |
| 2595 | NOT_BUILT | Not in your cohort | Peek/Who's here rows carry no per-row 💬 button (PeekCard.tsx:11: cohort and activity lines not shown); the reason lives on the person card note instead. |
| 2640 | NOT_BUILT | 📍 Share where I am: | Chat location strip not built; the campus chat is the shared Today DM dock (CampusDmDock.tsx:12; gap 4.1). |
| 2647 | SUPERSEDED | Maya is Colaberry's AI admissions guide and works with Taiwo Oludimimu's admissions team. She never quotes prices, dates or seats — when a person should talk wi | Maya is the website chat widget, not an in-campus DM (DECISIONS Q8). Also names a real staff member not in build data. |
| 2647 | NOT_BUILT | on Colaberry staff. | Staff chat system line; the DM dock is the shared Today ChatDock (pages/portal/today/ChatDock.tsx), which has no system line. |
| 2647 | NOT_BUILT | only replies to you — never messages first. | Same staff chat system line, not in the shared DM dock. |
| 2647 | NOT_BUILT | Direct message · | Classmate chat system line ("Direct message · <cohort>"); not in the DM dock, and presence carries no cohort. |
| 2660 | INVENTED | Sounds good 👍 | Scripted classmate auto-reply (fake conversation; gap 4.11 DELIBERATE). |
| 2667 | SUPERSEDED | Maya at the welcome desk takes care of everything about enrolling — she knows the details and can bring in a person from admissions. I'll pass you over. | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2667 | SUPERSEDED | Message Maya | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2668 | SUPERSEDED | Yes — lots of members are sponsored. If your employer buys a seat, they'll send you a seat code. Enter it when you enroll and the seat is already paid. | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2668 | SUPERSEDED | Enroll with a seat code | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2669 | SUPERSEDED | The next cohort starts in November 2026. Enrolling unlocks the Classroom, Projects, Cert Prep, your Portfolio and the AI Internship — and everything you did as  | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2669 | SUPERSEDED | See what enrolling includes | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2670 | SUPERSEDED | The course is six short lessons on how AI systems fit together — about 12 minutes each. You've done 2 of 6. Lesson 3 covers prompts vs. tools. | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2670 | SUPERSEDED | Continue the course | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2674 | SUPERSEDED | Let's get you unstuck. STORY-001 returns an Opportunity Score for a location: stub the score endpoint first, then wire the location picker to it. Project Studio | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2674 | SUPERSEDED | Go to Project Studio | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2675 | SUPERSEDED | is in Project Studio right now ( | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2675 | SUPERSEDED | ), and is in your cohort, so you can message them directly. | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2676 | SUPERSEDED | This week: ~96 min of Week 5 lessons, the Claude Code check (+10 pts) and Thursday's live class. I'd knock out the knowledge check first, it's about 10 minutes. | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2676 | SUPERSEDED | Go to the Cert Prep Center | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2677 | SUPERSEDED | I'm here 24/7. Tell me what you're working on and I'll point you to the right place or person. | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2679 | SUPERSEDED | Week 5, lesson 2 covers it: "MCP servers, tools and resources" (18 min). In plain words: MCP is a standard plug that lets an agent ask a server what tools it ha | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2679 | SUPERSEDED | Open Week 5 lessons | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2680 | SUPERSEDED | Start with the Claude Code Knowledge Check: 12 questions, about 10 minutes, +10 pts. Each check you pass verifies a skill on your path. | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2681 | SUPERSEDED | Happy to help with anything in the curriculum or certification. Which lesson or skill are you on? | Scripted staff reply. Real Reese/Dara agents answer through the DM API (gap 3.6); Maya replies are the website widget (Q8). Several carry invented facts (dates, |
| 2705 | INVENTED | Hey! Are you picking up STORY-001 today? I'm on the location picker 👀 | Scripted inbound demo DM from a fake classmate. |
| 2720 | SUPERSEDED | Colaberry Live is about to start. Your cohort is heading to the Classroom. | Only on-air broadcasts reach the campus (so "on air", not "about to start"), and it airs in the Events Hall (Q2/C62); build: "Colaberry Live is on air. Your coh |
| 2722 | INVENTED | AI Internship · Week 5':'Cohort · July 2026 | Invented week and cohort date on the ID card; build shows the program name only (CampusGate.tsx:117). |
| 2722 | INVENTED | Systems Architect · Colaberry Works | Invented job title on the ID card; not in profile data. |
| 2723 | INVENTED | Badge · All-floors access | False permission claim: a learner's badge opens only the lobby and their office (hqModel.ts:108, HqOutside.tsx:83). Build shows the real rung and points. |
| 2728 | SUPERSEDED | Colaberry Live is starting — you can watch a preview. Come on in. | Only on-air broadcasts reach the campus, so the build says "is on" (colon instead of an em dash): "Colaberry Live is on: you can watch a preview. Come on in." |
| 2730 | INVENTED | No card needed, no time limit | "no time limit" is an unverified product claim (Claim Registry: no row, no claim); the build keeps "No card needed" only. |
| 2733 | INVENTED | Or take the 3-minute tour → | Fixed "3-minute" duration; the build computes tour minutes from the stop count elsewhere (NextSteps.tsx:20) and the gate says "short". |
| 2736 | INVENTED | Morning, Morgan. | Invented name; build uses greetLine with the real first name (CampusGate.tsx:74). |
| 2738 | INVENTED | Program coach | Invented role; build "Program staff · Colaberry". |
| 2738 | INVENTED | STAFF · all-access | "all-access" is false: a staff badge opens only the floors its permissions allow (HqOutside.tsx:83 "Your badge opens N of M floors"). Build tier "STAFF". |
| 2742 | INVENTED | See where your Lakeshore Logistics team learns and builds. 5 of your 15 people are on campus right now. | Invented company and counts; build uses the server team size and presence count (C23 WP-9). |
| 2744 | INVENTED | Director of Learning | Invented job title; build shows the real company or "Partner account". |
| 2744 | INVENTED | Lakeshore Logistics | Invented company; build uses p.team.company. |
| 2745 | INVENTED | Business partner · 20 seats | Invented seat count (partner seats DELIBERATE, gap S1); build tier "Business partner". |
| 2754 | INVENTED | Visitor pass · Sam Rivera | Invented name in the Explorer pass head; build head "EXPLORER PASS · No card needed". |
| 2756 | NOT_BUILT | 🔒 12-week Classroom | The pass lists real building names from campusPath.opens (locked/demo/preview buildings), not a fixed list. |
| 2756 | NOT_BUILT | 🔒 Real AI projects | Fixed list replaced by real building names (campusPath.ts:32). |
| 2756 | NOT_BUILT | 🔒 Cert Prep | Fixed list replaced by real building names (campusPath.ts:32). |
| 2756 | NOT_BUILT | 🔒 AI Internship | Fixed list replaced by real building names (campusPath.ts:32). |
| 2758 | SUPERSEDED | 🧭 Resume the tour · stop | Paused tours use the C13 card: "🧭 Tour in progress / Stop N of n · <building>" + Resume + × (NextSteps.tsx:115-131). |
| 2758 | SUPERSEDED | 🧭 Take the tour · 7 stops, about 3 min | Explorer tour offer reworded in C53 (v13 T5)/C77 with computed counts: "🧭 Take the explorer tour" + "A N-minute walk through n places. It starts with what is c |
| 2759 | INVENTED | Enroll · next cohort starts November → | Hard-coded cohort month; build CTA is path.cta.label from campusPath. |
| 2761 | NOT_BUILT | Demo Day ready | Sponsor team card stats DELIBERATE (gap A3.2: partner seats and company chips). |
| 2762 | SUPERSEDED | ▶ Resume the tour · stop | C13 paused-tour card: "🧭 Tour in progress / Stop N of n" + Resume (NextSteps.tsx:115-131). |
| 2770 | NOT_BUILT | % of lessons | Sponsor "Right now" team list DELIBERATE-OMISSION (gap B "Right now" list); random % invented. |
| 2775 | NOT_BUILT | Not on your team | No anonymous-learner card: people a viewer may not see by name are counted, never listed (WhoIsHere.tsx:17). |
| 2775 | NOT_BUILT | Other companies' learners appear without names or photos. Their progress is private to them and their own sponsor. | Same: unnamed people are only counted (WhoIsHere.tsx:17). |
| 2778 | NOT_BUILT | Last active | Teammate card only opens for people present on campus; shows "📍 Here with you / In <place>" (PersonPop.tsx:113). |
| 2779 | NOT_BUILT | Not yet certified | Teammate KPIs are Readiness and Level from GET /api/portal/org/members/:id (PersonPop.tsx:116-119); no certification field. |
| 2803 | NOT_BUILT | People online | No "Classmates online" row to rename: the build’s Happening row is "N people here now" (campusArrival.ts:71) for every audience. |
| 2805 | SUPERSEDED | enterprise.colaberry.ai/portal/curriculum | Explorer AI course CTA: Q13 (keep as is, no Explorer course change); the Library card keeps the real curriculum action. |
| 2810 | SUPERSEDED | 🔒 Enrolled members | BuildingCard.tsx:70 comment: a locked building shows its own paywall copy (C6 contextual sign-up, LockedNotice); kicker is "🔒 Members only · you can look insid |
| 2814 | NOT_BUILT | Look around in demo mode | Locked-box "Look around in demo mode" button missing (gap X3). Demo buildings already open the real page in demo mode. |
| 2815 | NOT_BUILT | See events instead | "See events instead" missing (gap X3 lists it). |
| 2817 | NOT_BUILT | Members inside · | "Members inside · N" heading variant missing (gap X3); build heading is "Who’s here · N" for everyone (WhoIsHere.tsx:92). Would need an explorer+not-open condit |
| 2828 | NOT_BUILT | What your team does here | Partner arrival body ("What your team does here", KPI tiles, team-here rows) not built off-tour (gap S6; KPI tiles DELIBERATE "No counts"). |
| 2831 | NOT_BUILT | None of your team is here right now. | Per-building "Your team here now" rows not built (S6). Nearest build line is the side panel’s "None of your team is on campus right now." (home/PanelNow.tsx:65) |
| 2832 | NOT_BUILT | here too. People from other companies appear without names — their progress stays private. | Per-building privacy note not built (S6); Partner Office has its own "Private: only your company’s managers can see this list and its download." (PartnerTeam.ts |
| 2833 | NOT_BUILT | Open the partner dashboard | No partner dashboard page (S8); the Partner Office main action opens the company page and says so: "Open your company" (campusMap.ts:149). Q12 builds the dashbo |
| 2833 | NOT_BUILT | See your team's progress | No partner dashboard page (S8); the Partner Office main action opens the company page and says so: "Open your company" (campusMap.ts:149). Q12 builds the dashbo |
| 2843 | SUPERSEDED | Explorer · $0 to start | Page header program line: gap 4.2 DELIBERATE, fidelity known 05-page "the page header is the existing portal header, not rebuilt". |
| 2846 | NOT_BUILT | What an AI system actually is | Explorer course page not built (Q13 keep as is; gap X5 says /portal/curriculum is the real page). Lesson titles are prototype content. |
| 2846 | NOT_BUILT | Prompts, models and context | Explorer course page not built (Q13 keep as is; gap X5 says /portal/curriculum is the real page). Lesson titles are prototype content. |
| 2846 | NOT_BUILT | Prompts vs. tools | Explorer course page not built (Q13 keep as is; gap X5 says /portal/curriculum is the real page). Lesson titles are prototype content. |
| 2846 | NOT_BUILT | How agents decide | Explorer course page not built (Q13 keep as is; gap X5 says /portal/curriculum is the real page). Lesson titles are prototype content. |
| 2846 | NOT_BUILT | Retrieval in plain words | Explorer course page not built (Q13 keep as is; gap X5 says /portal/curriculum is the real page). Lesson titles are prototype content. |
| 2846 | NOT_BUILT | Shipping your first tiny tool | Explorer course page not built (Q13 keep as is; gap X5 says /portal/curriculum is the real page). Lesson titles are prototype content. |
| 2847 | NOT_BUILT | AI for everyone · Explorer track | Explorer course page (Q13, X5). |
| 2847 | NOT_BUILT | Six short lessons, open to every Explorer. Finish them to earn your Explorer badge. | Explorer course page (Q13, X5). |
| 2848 | NOT_BUILT | About 12 min | Explorer course page (Q13, X5); "About 12 min" per lesson is invented. |
| 2849 | NOT_BUILT | Ready for more? The full Accelerator | Explorer course lock card (Q13, X5). |
| 2849 | NOT_BUILT | 12 weeks of guided curriculum, live Build Day classes, real project builds and certification. | Explorer course lock card (Q13, X5). |
| 2855 | INVENTED | Lakeshore Logistics · Partner | Sample company name. |
| 2855 | INVENTED | 20 annual seats on your plan. Reclaim inactive seats and hand them to someone new — no extra cost. | Invented seat count; seats page not built (S9, Q12 deferred). |
| 2856 | INVENTED | Seats purchased | Seat tiles: server has no seat count tied to a company (PartnerTeam.tsx:13-14); seats page deferred (Q12, S9). |
| 2856 | INVENTED | Seats redeemed | Seat tiles: server has no seat count tied to a company (PartnerTeam.tsx:13-14); seats page deferred (Q12, S9). |
| 2856 | INVENTED | Unassigned — ready to invite | Seat tiles: server has no seat count tied to a company (PartnerTeam.tsx:13-14); seats page deferred (Q12, S9). |
| 2856 | INVENTED | Inactive seats you can reclaim | Seat tiles: server has no seat count tied to a company (PartnerTeam.tsx:13-14); seats page deferred (Q12, S9). |
| 2857 | NOT_BUILT | Unassigned seat codes | No seat-code listing endpoint (S9, Q12 deferred). |
| 2858 | NOT_BUILT | Reclaim seat | Reclaim needs an endpoint (S9, Q12 deferred). |
| 2860 | NOT_BUILT | View portfolio | Demo Day page not built (S10, Q12 deferred). |
| 2860 | INVENTED | · shipped Release 1 | Invented project status (Demo Day page S10). |
| 2861 | NOT_BUILT | ✓ Reminder sent | Nudge (S12, Q12 deferred). |
| 2862 | INVENTED | Lakeshore Logistics · Partner dashboard | Sample company name. |
| 2862 | NOT_BUILT | Your sponsored team | No campus-chrome dashboard page (gap S8); the Partner Office panel heading is "Your team · N people" (PartnerTeam.tsx:79). |
| 2862 | INVENTED | Progress for the 15 people on your seats. Live from | Invented headcount and seat ownership; server has no seat count tied to a company (PartnerTeam.tsx:13). |
| 2864 | NOT_BUILT | ✉ Weekly digest | No digest service (gap S11); Q12 defers everything beyond dashboard, invite and CSV. |
| 2864 | NOT_BUILT | Nudges come from Colaberry, not from you, and replies stay private. | Nudge needs a send endpoint (gap S12); Q12 defers it. |
| 2871 | NOT_BUILT | To start building in Project Studio | In-campus sign-up sheet and its per-building context kicker not built (gap X4); enroll CTAs link to the paywall/enroll page. |
| 2871 | NOT_BUILT | To unlock the Classroom | In-campus sign-up sheet and its per-building context kicker not built (gap X4); enroll CTAs link to the paywall/enroll page. |
| 2871 | NOT_BUILT | To unlock your Portfolio | In-campus sign-up sheet and its per-building context kicker not built (gap X4); enroll CTAs link to the paywall/enroll page. |
| 2871 | NOT_BUILT | To unlock Cert Prep | In-campus sign-up sheet and its per-building context kicker not built (gap X4); enroll CTAs link to the paywall/enroll page. |
| 2871 | NOT_BUILT | To join the AI Internship | In-campus sign-up sheet and its per-building context kicker not built (gap X4); enroll CTAs link to the paywall/enroll page. |
| 2871 | NOT_BUILT | To watch every live class in full | In-campus sign-up sheet and its per-building context kicker not built (gap X4); enroll CTAs link to the paywall/enroll page. |
| 2871 | NOT_BUILT | After the course | In-campus sign-up sheet and its per-building context kicker not built (gap X4); enroll CTAs link to the paywall/enroll page. |
| 2871 | NOT_BUILT | Using a seat code from your employer | In-campus sign-up sheet and its per-building context kicker not built (gap X4); enroll CTAs link to the paywall/enroll page. |
| 2871 | NOT_BUILT | You've seen the whole campus — here's how to unlock all of it | In-campus sign-up sheet and its per-building context kicker not built (gap X4); enroll CTAs link to the paywall/enroll page. |
| 2872 | INVENTED | Enroll · next cohort November 2026 | Invented cohort date (November 2026). |
| 2876 | INVENTED | Admissions will reach out, Sam | Sample name "Sam"; sign-up sheet done state not built (X4). |
| 2877 | NOT_BUILT | Seat code | In-campus sign-up sheet not built (gap X4); seat codes are redeemed via Admissions "Redeem a seat code" (admissions/plansModel.ts:77). |
| 2877 | INVENTED | accepted — Lakeshore Logistics sponsors your seat, so there's nothing to pay. Finish setting up and your buildings unlock. | Sample company and sponsorship; sign-up sheet not built (X4). |
| 2878 | INVENTED | Maya has passed your details and what you've explored to a person on our admissions team. Keep exploring — everything you do now carries over. | Sign-up sheet done text (X4) with invented cohort date / Maya handoff claim; build confirms a handoff only when the server says so (CampusTourEnd.tsx:6-10). |
| 2878 | INVENTED | Your spot in the November 2026 cohort is held. Pick a payment plan to finish — everything you did as an Explorer comes with you. | Sign-up sheet done text (X4) with invented cohort date / Maya handoff claim; build confirms a handoff only when the server says so (CampusTourEnd.tsx:6-10). |
| 2879 | NOT_BUILT | Open enrollment anyway ↗ | Sign-up sheet (X4). |
| 2881 | INVENTED | Each one carries a seat code. You'll see them on your dashboard as soon as they enroll — | Seat codes and "N seats still open" are not real data (PartnerTeam.tsx:13). Build invite confirmation: "Invite sent to N people." (PartnerTeam.tsx:43). |
| 2884 | SUPERSEDED | Tour complete. Your dashboard, seats and Demo Day are in the Partner Office whenever you need them. | Q12 defers seats and Demo Day; build tour-end lead names only what exists. |
| 2897 | NOT_BUILT | Maya's outreach is paused until you hand it back | Claim-a-handoff toast belongs to the admissions queue page (T8 DELIBERATE: admin handoffs page via the bridge). |
| 2897 | NOT_BUILT | You own | Claim-a-handoff toast belongs to the admissions queue page (T8 DELIBERATE: admin handoffs page via the bridge). |
| 2900 | NOT_BUILT | Seat reclaimed ✓ | Reclaim (S9). |
| 2920 | SUPERSEDED | Who needs help, search insights & view-as | Staff Office face: C6 comment at campusMap.ts:143-145 (links go to existing admin pages through the bridge; view-as link removed); campusArrival.ts:21-22 "Where |
| 2921 | SUPERSEDED | Your seats, invites & reporting | Seats page deferred (Q12); campusArrival.ts:21-22 rule (line says what the building really holds). |
| 2971 | SUPERSEDED | Munch every data dot in the maze and dodge the bugs. Grab a cherry to turn the tables. | Q3: keep the original Byte Chase (different game). |
| 2972 | SUPERSEDED | Fling cherries at shaky towers and knock the bugs out of the code. | Q3: keep the original Launch Lab. |
| 2973 | SUPERSEDED | Move the mouse or drag · or ←→ · click or Space to serve | Later round game-room.html / v14 word it "← → or mouse to move · Space to serve". Build matches neither exactly; optional follow-up against game-room.html, not  |
| 2980 | SUPERSEDED | 🌙 That's your 15 minutes for today | Later rounds (game-room.html, v10-v14) use "That’s your 15 minutes · back tomorrow", "Resets at midnight" and "games never change your points", which the build  |
| 2980 | SUPERSEDED | Every learner gets 15 minutes a day, then the room closes for them until tomorrow. Games never touch learning points. | Later rounds (game-room.html, v10-v14) use "That’s your 15 minutes · back tomorrow", "Resets at midnight" and "games never change your points", which the build  |
| 2980 | SUPERSEDED | 15 minutes a day, resets at midnight. Games never cost or earn learning points. | Later rounds (game-room.html, v10-v14) use "That’s your 15 minutes · back tomorrow", "Resets at midnight" and "games never change your points", which the build  |
| 3008 | SUPERSEDED | on this week's board | game-room.html / v14: "on this week’s cohort board", which the build uses. |
| 3166 | SUPERSEDED | Click or press Space to serve | Prototype canvas prompt; build engine gives the serve instruction in its HUD hint "Mouse, finger, arrows or A/D. Click, tap or Space to serve." (games/engine/bu |
| 3200 | NOT_BUILT | pts · now showing on your avatar — everyone can see it | Unlock toast not built (gap M9 MISSING). |
| 3303 | INVENTED | Write down one tool your project could expose | Sample plan steps; the build’s plan comes from the real plan endpoint. |
| 3304 | INVENTED | Review anything you missed | Sample plan step. |
| 3305 | INVENTED | Stub the score endpoint | Sample plan steps (STORY-001). |
| 3305 | INVENTED | Wire the location picker | Sample plan steps (STORY-001). |
| 3305 | INVENTED | Open a PR for review | Sample plan steps (STORY-001). |
| 3306 | INVENTED | Or play one round in the Game Room | Sample break step. |
| 3307 | INVENTED | Try the one-question check | Sample Explorer plan step (gap 2.10 DELIBERATE). |
| 3308 | INVENTED | Add it to your calendar | Sample RSVP step (gap 2.10 DELIBERATE, real-data rule). |
| 3309 | INVENTED | Introduce yourself | Sample step (gap 2.10). |
| 3331 | NOT_BUILT | Today's plan · card | Prototype plan "card" pages; build plan items open their real portal pages. |
| 3332 | NOT_BUILT | What to do | Prototype plan card page (checklist). |
| 3334 | INVENTED | Dara: "Stuck? Ask me for a plain-words summary." | Invented comments. |
| 3334 | INVENTED | : "The lab right after this is the fun part." | Invented comments. |
| 3337 | INVENTED | Wednesday, October 14 | Invented date; Today is the real portal page. |
| 3339 | NOT_BUILT | Nothing planned today. | Prototype Today page; the real Today page is outside the campus components. |
| 3343 | NOT_BUILT | Attended the live class | Separate "+5 pts" points burst is not built (gap M9); the build folds the points into the check-in cheer ("+N pts for attending"). |
| 3345 | INVENTED | · nice break | "nice break" assumes the invented break step; build cheers "✓ Done" with the real step title (useCampusWorldProps.tsx:65). |
| 3354 | SUPERSEDED | ✓ You're on the list | RSVP is Eventbrite sign-up; the build says "✓ You’re going" (events/EventSignup.tsx:8, OpenHouseCard.tsx), the Eventbrite-is-the-record decision. |
| 3362 | INVENTED | Jordan Pike | Invented handoff person. |
| 3363 | INVENTED | Alex Moreno | Invented handoff person. |
| 3364 | INVENTED | Chris Odum | Invented handoff person. |
| 3366 | NOT_BUILT | Tour done | Handoff evidence line of the admissions queue (T8 DELIBERATE, admin page via bridge). |
| 3366 | NOT_BUILT | Tour not finished | Handoff evidence line of the admissions queue (T8 DELIBERATE, admin page via bridge). |
| 3366 | NOT_BUILT | RSVP'd to the Open House | Handoff evidence line of the admissions queue (T8 DELIBERATE, admin page via bridge). |
| 3366 | NOT_BUILT | Asked Maya | Handoff evidence line of the admissions queue (T8 DELIBERATE, admin page via bridge). |
| 3367 | NOT_BUILT | Finished the whole tour | Handoff reason labels (T8). |
| 3367 | NOT_BUILT | Asked about price | Handoff reason labels (T8). |
| 3367 | NOT_BUILT | Asked to talk to a person | Handoff reason labels (T8). |
| 3367 | NOT_BUILT | Chose "Talk to admissions first" | Handoff reason labels (T8). |
| 3367 | NOT_BUILT | Employer might sponsor | Handoff reason labels (T8). |
| 3368 | NOT_BUILT | Hi Sam, I'm on the admissions team. Maya said you toured the whole campus — what caught your eye? | Suggested first messages (T8); all addressed to sample "Sam". |
| 3368 | NOT_BUILT | Hi Sam, you asked Maya about cost — here are the exact options for the November cohort, including payment plans. | Suggested first messages (T8); all addressed to sample "Sam". |
| 3368 | NOT_BUILT | Hi Sam, Maya said you'd like to talk to a person — that's me. When works for a quick call? | Suggested first messages (T8); all addressed to sample "Sam". |
| 3368 | NOT_BUILT | Hi Sam, thanks for reaching out — what would you like to know before you enroll? | Suggested first messages (T8); all addressed to sample "Sam". |
| 3368 | NOT_BUILT | Hi Sam, I can help you ask your employer about a sponsored seat — want a one-page summary to send them? | Suggested first messages (T8); all addressed to sample "Sam". |
| 3371 | SUPERSEDED | You're already with our admissions team — a person will reach out soon. I'm still right here in the meantime. | Q8 keep as is: Maya is the website chat widget (AskMaya.tsx:3, C6), not a campus DM with scripted replies. |
| 3371 | SUPERSEDED | 📅 Book a call instead | Q8 keep as is: Maya is the website chat widget (AskMaya.tsx:3, C6), not a campus DM with scripted replies. |
| 3375 | SUPERSEDED | Done — I've asked a person from our admissions team (Taiwo's team) to reach out, usually within one business day. I shared what you've explored so you won't hav | Q8 (Maya = website widget). Also invented facts ("Taiwo’s team", "within one business day"). |
| 3377 | SUPERSEDED | A person from admissions will reach out | Handoff is opt-in and confirmed only when the server says so (CampusTourEnd.tsx:6-10, Ali’s decision; Q10): "Maya: Done. Someone from admissions will reach out  |
| 3377 | SUPERSEDED | Maya passed along what you've explored | Handoff is opt-in and confirmed only when the server says so (CampusTourEnd.tsx:6-10, Ali’s decision; Q10): "Maya: Done. Someone from admissions will reach out  |
| 3379 | SUPERSEDED | I've asked for a call. Admissions will email you a few times that work — pick whichever suits you. | Q8; and booking is a real 30-minute slot picker (admissions/BookCallSheet.tsx:9, C20), not "admissions will email you times". |
| 3380 | SUPERSEDED | Call requested | Real booking sheet (BookCallSheet.tsx, C20) replaces the "email you times" request. |
| 3380 | SUPERSEDED | Admissions will email you times | Real booking sheet (BookCallSheet.tsx, C20) replaces the "email you times" request. |
| 3383 | SUPERSEDED | I'm talking with 6 Explorers on campus right now. | Q8 (no in-campus Maya chat); "6 Explorers" invented. |
| 3383 | SUPERSEDED | waiting for your team in the Admissions queue, each with what I saw and a suggested first message. | Q8 (no in-campus Maya chat); "6 Explorers" invented. |
| 3383 | SUPERSEDED | Open the Admissions queue | Q8 (no in-campus Maya chat); "6 Explorers" invented. |
| 3385 | SUPERSEDED | Good question. I don't quote prices myself — the right number depends on your plan, any sponsorship and current offers, and I'd hate to get it wrong. A person f | Q8: Maya’s replies come from the website widget, not campus scripts. |
| 3385 | SUPERSEDED | Yes, connect me with admissions | Q8: Maya’s replies come from the website widget, not campus scripts. |
| 3386 | SUPERSEDED | Lots of members are sponsored by their employer. If yours buys a seat, they'll send you a seat code and the seat is already paid. If they haven't yet, admission | Q8. |
| 3386 | SUPERSEDED | Have admissions help me ask | Q8. |
| 3387 | SUPERSEDED | Enrolling unlocks the Classroom, Project Studio, Cert Prep, your Portfolio and the AI Internship — and everything you've done as an Explorer comes with you. A p | Q8. |
| 3388 | SUPERSEDED | The course is six short lessons, about 12 minutes each. Dara in the Library knows it inside out if you get stuck. | Q8; also invented course facts (six lessons, 12 minutes) and Q13. |
| 3389 | SUPERSEDED | I'd love to show you around. The tour takes about three minutes and you can stop any time. | Q8. |
| 3389 | SUPERSEDED | Take the 3-minute tour | Q8. |
| 3390 | SUPERSEDED | Hi Sam! I'm glad you're here. Ask me anything — the program, enrolling, or just where to start. | Q8 (Maya greeting is the widget’s). |
| 3391 | SUPERSEDED | I can help with that or find someone who can. Ask me about the program, enrolling, or what Explorers can do — and if a person should talk with you, I'll bring o | Q8. |
| 3397 | SUPERSEDED | Hi Sam, it's late but I'm still here. I'm Maya from admissions — wander as long as you like, and ask me anything. | Q8 (Maya greeting toast). |
| 3398 | SUPERSEDED | Hi Sam, welcome to Colaberry! I'm Maya from admissions. I'll be right here while you take the tour — tap me any time with a question. | Q8. |
| 3399 | SUPERSEDED | Hi Sam, welcome to Colaberry! I'm Maya from admissions. Make yourself at home — want a quick tour, or would you rather wander? | Q8. |
| 3405 | SUPERSEDED | Welcome desk · just now | Q8 (Maya toast). |
| 3417 | SUPERSEDED | It's Maya from Colaberry. You're two lessons into the course — lesson 3, "Prompts vs. tools", takes about 12 minutes and picks up right where you left off. | Maya email preview: Q8 and T8; invented facts (Oct 29, 4 days, lesson progress). |
| 3417 | SUPERSEDED | The Open House is on Oct 29 if you'd like to meet the team and current members. And if you have any questions about the program, just reply — I'm here, and I'll | Maya email preview: Q8 and T8; invented facts (Oct 29, 4 days, lesson progress). |
| 3417 | SUPERSEDED | Sam hasn't visited in 4 days | Maya email preview: Q8 and T8; invented facts (Oct 29, 4 days, lesson progress). |
| 3417 | SUPERSEDED | Lesson 3 is waiting for you, Sam | Maya email preview: Q8 and T8; invented facts (Oct 29, 4 days, lesson progress). |
| 3417 | SUPERSEDED | Hi Sam, | Maya email preview: Q8 and T8; invented facts (Oct 29, 4 days, lesson progress). |
| 3417 | SUPERSEDED | Continue lesson 3 | Maya email preview: Q8 and T8; invented facts (Oct 29, 4 days, lesson progress). |
| 3418 | SUPERSEDED | It's Maya. You toured the whole campus yesterday, so I've asked Kemi on our admissions team to say hello — she'll reach out personally, no pressure. | Maya email preview: Q8/T8; invented people (Jordan, Kemi). |
| 3418 | SUPERSEDED | Meanwhile, your course and Open House spot are waiting whenever you are. | Maya email preview: Q8/T8; invented people (Jordan, Kemi). |
| 3418 | SUPERSEDED | Jordan finished the tour, then left | Maya email preview: Q8/T8; invented people (Jordan, Kemi). |
| 3418 | SUPERSEDED | You saw the whole campus — what stood out? | Maya email preview: Q8/T8; invented people (Jordan, Kemi). |
| 3418 | SUPERSEDED | Hi Jordan, | Maya email preview: Q8/T8; invented people (Jordan, Kemi). |
| 3418 | SUPERSEDED | Come back to campus | Maya email preview: Q8/T8; invented people (Jordan, Kemi). |
| 3424 | NOT_BUILT | Owned · AI paused | Admissions queue table (T8 DELIBERATE). |
| 3425 | NOT_BUILT | Admissions · Taiwo Oludimimu's team | Admissions queue page (T8 DELIBERATE). |
| 3425 | NOT_BUILT | Maya, our AI admissions guide, greets every Explorer and answers questions. When a person should step in, she hands off here with what she saw and a suggested f | Admissions queue page (T8 DELIBERATE). |
| 3426 | NOT_BUILT | Explorers talking to Maya | Admissions queue page not built in campus chrome (gap T8 DELIBERATE: Staff Office "Handoffs" bridges to /admin/growth-journey?tab=handoffs, campusMap.ts:157). T |
| 3426 | NOT_BUILT | Handoffs waiting | Admissions queue tiles (T8). |
| 3426 | NOT_BUILT | Owned by a person | Admissions queue tiles (T8). |
| 3426 | NOT_BUILT | Emails sent · off | Admissions queue page (T8). |
| 3427 | NOT_BUILT | Why Maya handed off | Admissions queue table headers (T8). |
| 3427 | NOT_BUILT | Suggested first message | Admissions queue table headers (T8). |
| 3428 | NOT_BUILT | When Maya brings in a person | Admissions queue panel (T8). |
| 3429 | NOT_BUILT | Maya's guardrails | Maya guardrails panel (T8). |
| 3429 | NOT_BUILT | Never quotes a price, date or seat count | Maya guardrails panel (T8). |
| 3429 | NOT_BUILT | A person confirms those | Maya guardrails panel (T8). |
| 3429 | NOT_BUILT | Email is off until Ali activates it | Maya guardrails panel (T8). |
| 3429 | NOT_BUILT | Then max 3 contacts per 7 days, 48 h apart, consent required | Maya guardrails panel (T8). |
| 3429 | NOT_BUILT | Steps back when a person owns it | Maya guardrails panel (T8). |
| 3429 | NOT_BUILT | No AI outreach until you hand it back | Maya guardrails panel (T8). |
| 3429 | NOT_BUILT | ✉ Preview the email Maya would send | Maya guardrails panel (T8). |
| 3434 | SUPERSEDED | Create your $0 to start | Q13 keep as is: the path stays unticked; ExplorerPath.tsx:6-7 "nothing is ticked off because there is no per-step completion data". Build steps come from campus |
| 3434 | SUPERSEDED | Start the course | Q13 keep as is (path stays unticked; ExplorerPath.tsx:6-7). Build steps are built from real building states (campusPath.ts). |
| 3434 | SUPERSEDED | Finish the course · | Q13 keep as is (path stays unticked; ExplorerPath.tsx:6-7). Build steps are built from real building states (campusPath.ts). |
| 3434 | SUPERSEDED | Come to the Open House | Q13 keep as is (path stays unticked; ExplorerPath.tsx:6-7). Build steps are built from real building states (campusPath.ts). |
| 3437 | NOT_BUILT | Use it → | Seat-code entry in the sign-up sheet not built (X4); Admissions offers "Redeem a seat code" (plansModel.ts:77). |
| 3440 | INVENTED | Stuck on STORY-003 for 3 days | Invented at-risk flag (Q11: needs a separate backend at-risk project). |
| 3440 | INVENTED | Missed 2 live classes | Invented at-risk flag (Q11). |
| 3440 | INVENTED | Asked Reese the same question 4× | Invented at-risk flag (Q11). |
| 3441 | NOT_BUILT | 👁 View as | Needs-attention row (Q11: separate backend project; Management Portal links until then). |
| 3443 | NOT_BUILT | 🔎 What people search for | Staff card links to search insights / all learners (Q11, T1, T7). |
| 3443 | NOT_BUILT | All learners | Staff card links to search insights / all learners (Q11, T1, T7). |
| 3444 | NOT_BUILT | ⚑ Needs attention here | Per-building needs-attention box (Q11, T4). |
| 3446 | NOT_BUILT | Who needs attention | /staff/attention page (Q11, T5). |
| 3446 | NOT_BUILT | Signals from attendance, builds, messages and activity. Message someone, or view the portal exactly as they see it. | /staff/attention page (Q11, T5). |
| 3452 | NOT_BUILT | What people search for | Search insights page needs a search-log endpoint (T7). |
| 3452 | NOT_BUILT | Everything typed into "Where are you headed?" this week. Searches that found nothing are the clearest signal of what's hard to find. | Search insights page needs a search-log endpoint (T7). |
| 3453 | NOT_BUILT | Top searches | Search insights (T7). |
| 3453 | NOT_BUILT | Most went to | Search insights (T7). |
| 3454 | NOT_BUILT | From this session | Search insights (T7). |
| 3455 | NOT_BUILT | Found nothing | Search insights (T7). |
| 3455 | NOT_BUILT | Add a keyword, or give it a room | Search insights (T7). |
| 3457 | NOT_BUILT | · read-only — they won't see this visit | View-as page (T6 DELIBERATE: admin-minted token; campusMap.ts:143-145). |
| 3457 | NOT_BUILT | Exit view-as | View-as page (T6 DELIBERATE: admin-minted token; campusMap.ts:143-145). |
| 3458 | INVENTED | Week 5 · Lv | Sample learner week/level (T6). |
| 3459 | INVENTED | Lesson 2 · MCP servers, tools & resources | View-as sample learner content (T6). |
| 3459 | INVENTED | Classroom · not started | View-as sample state (T6). |
| 3459 | INVENTED | STORY-003 · Saved searches & alerts | Invented ticket (T6). |
| 3459 | INVENTED | Project Studio · in progress since Monday | Invented state (T6). |
| 3459 | INVENTED | Cert Prep Center · not started | Invented state (T6). |
| 3460 | NOT_BUILT | Reach out | View-as page (T6). |
| 3460 | NOT_BUILT | A short, specific message works best. | View-as page (T6). |
| 3470 | NOT_BUILT | Emailed to you every Monday at 8:00 AM. This is what arrives next. | Weekly digest page (S11, Q12 deferred). |
| 3471 | INVENTED | To: Elaine Porter · Subject: Your Lakeshore Logistics team this week | Invented recipient and company. |
| 3472 | NOT_BUILT | This week at a glance | Digest (S11). |
| 3472 | INVENTED | Certified · Marcus Lee | Invented person. |
| 3473 | NOT_BUILT | Worth a nudge | Digest nudge list (S11/S12). |
| 3474 | INVENTED | Oct 29 · good for colleagues who are curious | Invented date; digest not built (S11). |
| 3474 | INVENTED | Victoria and Marcus are candidates | Invented people; no Demo Day candidate flag (S10). |
| 3475 | NOT_BUILT | Mondays · 8:00 AM | Digest delivery settings (S11, Q12 deferred). |
| 3475 | INVENTED | elaine.porter@… | Invented email. |
| 3475 | NOT_BUILT | ⬇ Export team progress (CSV) | Digest delivery panel (S11); the Partner Office has its own CSV button (see 2864 CHANGE). |
| 3478 | NOT_BUILT | It comes from Colaberry, not from you, and their reply stays private | Nudge toast (S12). |
| 3478 | NOT_BUILT | Colaberry sent | Nudge toast (S12). |
| 3481 | INVENTED | ⬇ lakeshore-team-progress.csv | Sample company file name; build names the file from the real company (teamRoster.csvFileName). |
| 3481 | INVENTED | · 15 people, downloaded | Invented count; no export toast in build. |
| 3490 | NOT_BUILT | Projects (demo) | Prototype classic-nav list; the classic sidebar is the existing portal nav (PortalShell ClassicNav), outside the campus components. |
