# Colaberry Campus, round 3: fix production, then front door / back door, the workstation, and booking a person

**For:** Claude Code in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
**Owner / DRI:** Ali Muwwakkil
**Written:** Friday 2026-10-23, Central, against `main` at `12d0f9cb`
**This file replaces `CAMPUS_V2_PROMPT.md`.** It contains everything from round 2 plus this round's changes.

## 0. Files and how to use them

Put these in `docs/design/campus/`:

| File | What it is |
|---|---|
| `CAMPUS_V3_PROMPT.md` | This prompt. Work through it in order. |
| `colaberry-campus-v3.html` | The interactive prototype. It is the source of truth for:<br>• the rooms<br>• the front door / back door model<br>• the workstation<br>• page navigation<br>• click-to-walk<br>• the side panel and arrival card<br>• booking a call with admissions<br><br>It supersedes `colaberry-campus.html` in those areas only. |
| `AUDIT_2026-10-23.md` | `file:line` evidence for Part 1 and Part 4. |
| `CAMPUS_DESIGN_PARITY_PROMPT.md`, `CAMPUS_GAP_ANALYSIS_DETAIL.md`, `DECISIONS.md` | Round 1 (already in the repo). They still govern every area not named here. |

Delete `colaberry-campus-v2.html` and `CAMPUS_V2_PROMPT.md` if they were committed; v3 replaces them.

**Before you build, walk the prototype at 1440×900 and 390×844:**
1. Click grass: you walk there.
2. Click the Classroom: the room opens.
3. Click the **Front door** (left, "FRONT DOOR · Week 1"): the Classroom page opens.
4. Step outside.
5. Click **"🛠 Open →"** on the screen, or the **WORK** door on the right: your workstation opens.
6. Sync a story in Project Studio until it marks itself done.
7. Finish a lesson card (watch, answer, note).
8. Take the tour.
9. Book a call with admissions from the Help desk.

Data: the Classroom and Projects content comes from Ali's real pages (2026-10-23). Other buildings, classmates, commits and replies are illustrative. **Never ship invented data**: build every element from a real source, or leave it out.

The repo rules apply: root and frontend `CLAUDE.md`, a session log on every commit, tests first, a brief-me at the end of every reply. The campus stays on Ali's account only (`directives/run-campus-pilot.md`). Ship one PR per part. Report the shipping ladder honestly: built, tested, merged, deployed (Ali's account), production-verified.

---

## Part 1. Fix production first (one PR)

All of these were seen on enterprise.colaberry.ai on 2026-10-23. Causes and `file:line` are in `AUDIT_2026-10-23.md` §2.

| # | Bug | Fix |
|---|---|---|
| 1 | The Up next **Open** button covers the step title, in the panel and in the rail. Cause: the unscoped `.cm-next{white-space:nowrap}` in `campusLive.css:23`. | Rename the section class to `cm-upnext` and scope the banner rule. The title wraps to 2 lines, with buttons on their own row underneath. |
| 2 | The same step shows 3-4 times. | Part 2.6. |
| 3 | "Welcome, ALI." | Add a shared `displayFirstName()` that title-cases names stored all upper or all lower case and keeps mixed case. Use it everywhere, including initials. |
| 4 | Campus "Quiet hours · 👥 0" while the People panel says 13 online. Cause: `/campus/here` writes only for pilot accounts (`campusRoutes.ts:79`), and the count includes you. | Record the building for **every** signed-in user (the write is flag-independent; the read stays pilot-gated). Use the People panel's heartbeat, mapped with `buildingForPath`, with the same freshness window, excluding yourself. Online users with no building count as at the Quad. |
| 5 | "Today's plan ~96 min waiting" when the step is 6 min. | In a building, show that building's step: "Step n of N · type · 6 min". Show the remaining total only at Schedule, as the sum of undone `stops[].minutes`. |
| 6 | "Tour in progress · Stop 6 of 6" sticks on every page. | The last stop counts as finished. A paused tour expires after 7 days and can be dismissed with ×. Keep one tour entry point. |
| 7 | Ali (employee and admin, who also manages an org) gets the **business** campus. | Decide audience from `isStaffOrMgmt`, the email-linked staff enrollment, and `admin_users`, independent of the page-gate flag. Serve it from one `GET /api/portal/campus/audience`. Render nothing audience-specific until it resolves. |
| 8 | The Classroom wall is a black box reading "Classroom". | Part 2.1. |
| 9 | Page chrome: the banner stops at 1180 px, the Next button's text overflows, the hint never hides, and a "YOUR NEXT STEP" strip jumps into the header on scroll. | Part 2.4. |
| 10 | Clicking empty ground does nothing. | Part 2.5. |
| 11 | The page rails duplicate each other. | Part 2.4. |
| — | Round-1 leftovers | Add `pdfkit`, `adm-zip`, `@microsoft/microsoft-graph-client` and `@modelcontextprotocol/sdk` to `backend/package.json`. Fix or document the seed FK errors in `tests/systemV2/campus-stack.md`. |

**Acceptance:**
- No control's text overflows it (`scrollWidth <= clientWidth` on every `.btn`, `.cm-btn` and Up next title).
- A step id appears at most once in the panel outside the plan list.
- The campus online count equals the People panel's count minus you.
- The greeting is never all caps.
- No tour card ever reads "Stop N of N".

---

## Part 2. The v3 design

### 2.1 Rooms: calm, readable, two doors

Replace the current SVG interiors (`interior/RoomWalls.tsx`, `RoomFeature.tsx`, `roomWallFacts.ts`) with the prototype's CSS 3D room. It uses `perspective` + `preserve-3d`, and its walls are DOM, so text stays crisp and clickable. The room sits between the left side panel and the right arrival card.

**What is on each surface:**

| Surface | Content |
|---|---|
| **Back wall, centre: the screen** | The building page's **Next step** card: kicker with type and points, title, subtitle, primary button, plus a secondary button if the page has one (e.g. "Copy prompt"). **The primary button ("Start", "Open", "Build · +50 pts") goes through the back door into the workstation for that card.** |
| **Back wall, left: the front door** | A wooden double door in the building colour. Its sign is **on the door**: a small plate reading "FRONT DOOR" and the section name in large type ("Week 1", "Projects", "Cert Prep"). Click → the section page. |
| **Back wall, right: the back door** | A steel door with a hazard stripe and a glowing window. Its sign is **on the door**: an amber "WORK" plate. Click → the workstation for the screen's card. |
| **Left wall** | **One** board: the card that sits **to the right of** the Next step on the page (Classroom: "Your status"; Projects: "Your builds"; Cert Prep: "Skill proficiency"). Click → it opens flat in a dialog with "See it on the page →". |
| **Right wall** | Plain. |
| **Floor** | People in the building in the room's layout (rows, desks, tables, standing). The staff desk is an object (Reese at the Mentor desk in the Lounge, Dara at the Curriculum desk in the Library). **You** walk in from the front. |

**Remove every floating label from the room:**
- the building tag chip;
- the "tap the boards…" hint;
- the "N here · building" chip;
- floating door signs;
- the "Ask Reese anything" bubble;
- name tags, except your own "You". Other names show on hover.

The only overlay is the **← Step outside** button, bottom-left.

**Interactions:**
- **People:** tap a person → popover with Message, Wave, and Walk over (Walk over only when they are elsewhere). Message opens the chat panel, which says where you both are.
- **Front door:** click it, or the "Continue this week's lessons" tile → you walk to the door and the page grows out of the door's rectangle.
- **Back door:** click it, the screen's primary button, or "Open the card" → you walk to the back door and the workstation grows out of it.
- **Closing:** closing the room (×, Back to the Quad, Step outside, Esc, or clicking the dimmed map) recenters the map.

**Data: one source per page.** Add `usePageSummary(route) → { next, sideTop, card }`, built from the hooks the page already uses. The page and the room both render from it:
- `next` = the screen;
- `sideTop` = the left-wall board;
- `card` = what the back door opens;
- `doorName` = the front door sign.

| Building | Front door (route) | Door sign | Screen = page Next step | Left board | Back door opens |
|---|---|---|---|---|---|
| Classroom | `/portal/classroom` | Week N (current week) | the current week's next feed item | Your status | `/portal/runtime/:cardId` for that item |
| Project Studio | `/portal/projects` | Projects | the next story of the active build | Your builds | `/portal/projects/workspace/:projectId/:taskId` |
| Cert Prep | `/portal/cert-prep` | Cert Prep | the next knowledge check | Skill proficiency | that check's runtime card |
| Schedule | `/portal/schedule` | Schedule | the next plan item | Today | that plan item's card |
| Library, Events, My Progress, Lounge, Portfolio, Internship, Game Room | their page | page name | the page's next step | the card right of it | that card, or the page if there is no card |

If a page has no next step, the screen shows the building's plan step. If there is no plan step either, it shows a plain sign with the page name. If there is no back-door card, the WORK door is dimmed with the tooltip "Nothing on your desk here yet". **Never draw placeholder bars.**

**Acceptance:**
- **New fidelity view `21-room`, for Classroom, Projects and Cert Prep:**
  - the screen title equals the page's next-step title;
  - exactly one board is on the left wall;
  - two doors exist, and each carries its sign text;
  - no element with `position:fixed/absolute` text sits over the room other than Step outside.
- Clicking the screen's primary button and clicking the WORK door both land on the same workstation URL.
- Clicking the front door lands on the section URL.

### 2.2 The front door / back door model (everywhere)

| Way in | Goes to | Entry points |
|---|---|---|
| **Front door** (the section) | The section page, e.g. `/portal/classroom` | the front door in the room; the "Two ways in" front tile ("Continue this week's lessons →"); the front door button in the workstation's location bar; the rooms list |
| **Back door** (the workstation for one card) | `/portal/runtime/:cardId` (lessons, checks, plan items) or `/portal/projects/workspace/:projectId/:taskId` (stories) | the WORK door; the screen's primary button; the "Two ways in" back tile ("Open the card →"); **"Open the card"** in the arrival card's plan box, the side panel's Up next and the rail; the page's Next-step button; "🛠 Workspace" links on feed items |

**Arrival card (right), in this order:**
1. The **tour block**, when touring: stop n of 9, what, tip, dots, End tour, "Next: <building> →". Ali likes it on top, so keep it there.
2. **Two ways in:** a light front-door tile and a dark back-door tile.
3. The plan box, **only** when this building holds a plan step that is not the panel's Up next.
4. Who's here (💬, 👋).
5. Rooms in this building.
6. Back to the Quad / Go somewhere else.

### 2.3 The workstation (the back door): a place to get busy

Restyle **both** `RuntimeWorkspace` (`/portal/runtime/:cardId`) and `ProjectWorkspacePage` (`/portal/projects/workspace/...`) into one **workstation shell** (prototype `#ws`). It is a warm dark desk with a lamp glow and pegboard texture. **Keep their existing logic:** Cory, GitHub sync, Done means confirmed from `.colaberry/progress.json`, and the build status bar.

**Layout:**
- **Location bar** (same as pages, light): ⌂ Campus › <Building> › 🛠 Workstation · <card>, then **🚪 Front door**, **← Step outside** (back into the room) and **Where to? /**.
- **Bench strip** (top, cork): paper tickets for the cards around this one.
  - Stories: the release's stories (STORY-000 ✓ "Done by commit", STORY-001 "On your desk", STORY-002 queued).
  - Lessons: the week's items, or today's plan.
  - Done tickets are crossed out and say how they got done; the active one has an amber outline.
- **Desk tools** (top right):
  - **Focus 25:00:** a local timer.
  - **Heads-down:** sets presence to "busy". Other people's person card shows 🎧 and DMs queue quietly. This needs a presence flag on `/campus/here`.
  - **Also here:** avatars of people in the same building, from real presence.
- **Left:**
  - Stories: a **repo terminal** showing the repo name, Sync from GitHub, Show command, Use a different repo, the commit log, and a "watching .colaberry/progress.json" line.
  - Lessons: a **notebook** (lined paper) that saves through the existing notebook API (`GET/POST /api/portal/runtime/notebook`).
- **Centre monitor:** the card itself.
  - **Story:** statement; "Fulfils REQ-xxx"; **Done means**, where each line shows one state: CONFIRMED BY COMMIT <sha>, YOUR NOTE · NOT CONFIRMED YET, or WAITING ON YOUR REPO; **Your prompt** with Copy. Done-bar copy: "This card marks itself done when every line is confirmed by a commit. Ticking a box is only your note."
  - **Lesson:** player; Done means = watched to the end (player progress event), the check question answered, and a takeaway in your notes. The card completes itself when all three are true; there is no separate button.
- **Right: Cory.** Name, "Your mentor for <card>", the existing chat, HINT / EXPLAIN / REVIEW, attach a screenshot.
- **Bottom status bar:** Build · Release · Tasks done · Progress · GitHub commits (stories), or Section · This card · This week · Points (lessons).

**Done rules:**
- **Story:** done when every Done-means line is confirmed from the repo. Sync shows the new commit, flips the line, awards points with a burst, moves the next story onto the desk, and Cory acknowledges it.
- **Lesson:** done when its lines are complete. Call the existing complete endpoint (`POST /api/portal/runtime/today/:cardRef/interact` with `complete`), then update the plan, the panel and the map pins.

**Acceptance:** fidelity view `23-workstation` for a story and a lesson checks that the bench, terminal or notebook, monitor, Cory and status bar are visible. An e2e test confirms that a sync which confirms the last line marks the story done and moves the next ticket to "On your desk". Step outside returns to the room with you at the WORK door.

### 2.4 Page navigation: the light location bar

Replace the dark banner (`CampusBanner.tsx`, `campusPageChrome.css`) with the prototype's `.locbar`:

- One light bar, 56 px tall, **full width** under the portal header (its own row, not capped by `.te-main`). It uses the page grid's columns: nav 236 · main · rail 300, gap 28.
  - **Left:** "Campus map" pill (round mini map + label).
  - **Middle:** ⌂ Campus › ■ Building (steps back into the room) › current room, with an ellipsis on overflow.
  - **Right:** ← Step outside and 🔍 Where to? /.
- **All controls are 36 px tall, text 13.5 px, never wrapping.** Labels sit in a span with `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`. **No Next button in the bar.**
- **On scroll:** the header scrolls away, the bar sticks to the top with a soft shadow, and the rail is sticky at `top:76px`. **Suppress the portal's condensed "YOUR NEXT STEP" header slot when the campus is active** (`ClassroomPage.tsx:295-298` → `PortalShell` `te-condensed-slot`).
- **Coach mark:** once per session, 800 ms after the first page, it auto-hides after 4.2 s. It replaces `PageHint`.
- **Columns:**
  - **Left nav:** mini map card, rooms in this building, Buildings list. Remove "Open campus map", "Take the tour", "My look", list view and the classic links.
  - **Rail:** Up next (once, title wraps, buttons below; "Open the card" goes through the back door), Tour (one compact row, three states), Here now · N with 💬, Help desk (Reese, Dara, 📅 **Talk to a person**), and Online now as the single people list.
- **Phone:** the bar keeps only the map icon, the current location, Step outside and 🔍. The nav hides and the rail moves under the content.

**Acceptance:** fidelity view `22-page-nav` at 1440 and 1920:
- the bar spans the viewport;
- no text overflows;
- after scrolling 800 px, the bar is at the top, the rail's Up next is visible, and no "YOUR NEXT STEP" appears inside the header.

### 2.5 Click anywhere on the map to walk there

- **Off-building clicks:** a click that isn't on a building, a person or a chip walks you to that spot.
  - Project you and the target onto the nearest path segment, take the shortest route on the path graph (Dijkstra over ~30 nodes), then go straight across the grass.
  - The walk is 330 u/s with ease-in-out, a red dashed route line, footsteps, a "Walking to this spot… Skip" toast and a drop pin.
- **On arrival:** "here" clears and the map **recenters**.
- **Drags:** a 6 px threshold separates them from clicks.
- **During a walk:** a new click re-routes.
- **With a room open:** clicking the dimmed map closes the room and recenters.

**Acceptance:** an e2e test clicks three grass points. Each time the avatar must end within 4 world units of the click, no card opens, and the viewBox ends at base.

### 2.6 Side panel: always on, each fact once

The panel is visible in every campus state.

**Order:**
1. Header: kicker, a greeting using `displayFirstName`, a one-line lead, and a real presence pulse.
2. **Coming up:** a booked admissions call (2.7), when there is one.
3. **Up next:** the next undone plan step, once. Buttons: "Walk there →" + "Open now", or, in that building, "Open the card →" + "Mark done". The urgent card takes this slot when something starts within 15 min.
4. **Tour card** (three states).
5. **Rooms in the <building>**, only while you're in one.
6. **Today's plan:** the full list. The current step has an "UP NEXT" tag and is not repeated as another card.
7. **Help desk:** Reese, Dara, **📅 Talk to a person**.
8. **I want to…** chips.

Remove "Here at …" and "Right now · Continue today's plan" where they repeat Up next. Mark done shows a points burst and a "🗺 Next: … [Go]" toast, and updates the numbered plan pins on the map.

### 2.7 Book a call with a person in admissions

**Why:** AI staff (Reese, Dara, Maya) cover most questions. Learners also need a real person for enrollment, payment, employer sponsorship or a cohort change.

**Entry points:**
- the side panel's Help desk chip "📅 Talk to a person · Admissions";
- the rail's Help desk;
- Where to? (the HELP group, and searches for "book", "call", "admissions", "person", "talk", "enroll");
- Reese's first chat reply offering "📅 Book a call with admissions".

**The sheet** (prototype `#book`):
1. Header: "TALK TO A PERSON · Book a call with admissions · A real person from the admissions team, not an AI. 30 minutes on Google Meet."
2. **What's it about?** chips: Enrollment & next steps · Payment or employer sponsorship · Changing my cohort · Something else.
3. **Pick a day:** the next 7 business days.
4. **Pick a time · Central (CDT):** a slot grid; taken slots are disabled.
5. **Anything they should know?** (optional).
6. **You:** name, plus "Uses your account email · Cohort". Prefilled, not editable.
7. **Book the call →**.

**After booking:** a confirmation: date, time, Meet, "invite and Meet link are in your email, and the call is on your Schedule", with Done, Reschedule and Add to calendar. A **Coming up** card appears at the top of the panel, with a Join link (live at call time) and Reschedule.

**Backend: reuse what exists, carefully.**
- **Availability:** `GET /api/calendar/availability?days=21` (`calendarController.handleGetAvailability` → `calendarService.getAvailableSlots`). The frontend already has `useCalendarAvailability` and `StrategyCallModal`.
- **Booking:** `POST /api/calendar/book` (`handleBookCall`) creates the Google Calendar event with a Meet link, saves a `StrategyCall` and sends the confirmation email.
  - It is built for **prospects** and also runs lead-pipeline side effects: Lead creation/GHL sync, pipeline stage, prep nudge, interaction outcome.
  - **Do not fire those for an enrolled learner.** Add a participant route `POST /api/portal/campus/admissions-call` (`requireParticipant`) that does the following:
    1. prefills name and email from the participant;
    2. validates with an extended schema (`topic`, `note`; `page_origin='campus'`);
    3. reuses `createBooking` and `StrategyCall` (or a sibling `AdmissionsCall` table if `StrategyCall` must stay sales-only);
    4. skips the Lead, GHL and pipeline side effects for enrolled members, keeping them for Explorers;
    5. writes a Growth Journey handoff (the same mechanism as `campusTourHandoff.ts`) so admissions sees topic and note;
    6. is idempotent per participant per day (it returns the existing booking);
    7. logs with a correlation id.
- `GET /api/portal/campus/admissions-call` returns the upcoming booking for the Coming up card and the Schedule. Reschedule = cancel + rebook through the calendar service.
- **Check with Ali before shipping:** `env.googleCalendarId` must be the **admissions** calendar. If it's the sales calendar, add `ADMISSIONS_CALENDAR_ID`.

**Acceptance:**
- An e2e test books against a stubbed calendar and checks that the confirmation shows and the panel gets Coming up.
- A unit test proves the participant route never calls the GHL sync or pipeline advance for an enrolled member.
- A second booking the same day returns the first.

---

## Part 3. Order of work

1. **Part 1 (production fixes).**
2. **2.6, 2.4, 2.5:** panel de-duplication, page navigation, click-to-walk.
3. **2.1 + 2.2:** rooms and the two-door model. Start with Classroom and Projects, then the rest.
4. **2.3:** the workstation shell (Projects workspace first, then runtime cards).
5. **2.7:** booking with admissions.
6. **Part 4.**

## Part 4. Still open from round 1 (after Parts 1-2)

From `AUDIT_2026-10-23.md` §3:
1. **WP-9 business:** company name, "X of your N", team tiles, Partner Office team rows from `/api/portal/org/members`, invite and CSV.
2. **WP-6:** read the broadcast `session_id` to light the Classroom (Q2) and auto check-in.
3. **Q6 chat on the home:** inbox, chat panel, DM toast with the message text.
4. **WP-10:** list dialog, notification pins, room catalogue.
5. **WP-7:** Me panel, photo upload, locker grid, "Every time", the Q14 flag (shares the presence flag work with Heads-down).
6. **WP-8:** Game Room.
7. **Q1:** real ambient walkers.
8. **Fidelity hygiene:** clear stale `known` entries; add e2e for R2-R11.
9. **WP-11:** copy pass and side-by-side review doc.

## Definition of done for round 3

- Part 1 is deployed to Ali's account, with each issue re-checked on production with a screenshot.
- Part 2 matches `colaberry-campus-v3.html` side by side (desktop 1440×900, phone 390×844) for the Classroom, Projects and Cert Prep rooms, their pages, both workstation types, and the booking sheet.
- Fidelity views 21, 22 and 23, the click-to-walk e2e and the booking e2e pass. `tsc --noEmit` is clean.
