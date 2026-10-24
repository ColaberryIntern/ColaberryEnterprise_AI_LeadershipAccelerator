# Colaberry Campus: v6 → v7 delta (rooms, events, community)

**For:** Claude Code in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
**Owner / DRI:** Ali Muwwakkil
**Written:** Saturday 2026-10-24, Central

## Read this first

- **Run order.** This runs **after** `CAMPUS_V6_DELTA_PROMPT.md`.
  - If the v6 work is still in flight, finish and merge the PR you're on first.
  - Then start here.
  - Don't redo v6. Where v7 and v6 conflict, **v7 wins**.
- **Scope.** Only the changes between `colaberry-campus-v6.html` and `colaberry-campus-v7.html`.
- **What v7 fixes.** It sorts out how rooms, events and community are explained:

  > **Every live conversation is a room, and the building tells you what kind it is. Community is a board you read and post to, not a room.**

  | What | Where it lives |
  |---|---|
  | Events, including the Colaberry Live broadcast | **Events Hall** (the broadcast is that hall's stage, magnified) |
  | Your cohort's live class sessions | **Classroom** |
  | Small rooms you open or book: study groups, pair work, 1:1s, coworkers, office hours | **Meeting Rooms** (renamed from Community Lounge) |
  | Posts and questions (async) | **Community Board**, a noticeboard on the Quad |
  | Everything with a time: classes, events you signed up for, sessions you booked | **Schedule** |

- **Files.** Commit both of these to `docs/design/campus/`. `colaberry-campus-v7.html` is the source of truth for everything below.
  - `colaberry-campus-v7.html`
  - `CAMPUS_V7_DELTA_PROMPT.md`
- **Walk the prototype before you build** (1440×900):
  1. Meeting Rooms: tap a door, Join, "+ New room", "Book a session".
  2. Community Board: click it on the map, switch tabs, post.
  3. **"Preview Colaberry Live on air"** (bottom right): check the map, the side panel and the Events Hall stage.
  4. Classroom: live classes and replays.
  5. Schedule: the mixed list.
- **Same rules as before.**
  - No invented data. The rooms, posts and classmates in the prototype are illustrative.
  - Tests first.
  - A session log on every commit.
  - Brief-me at the end of every reply.
  - The campus stays on Ali's account only.
  - One PR per section (R1-R6). Report the shipping ladder honestly: built → tested → merged → deployed → production-verified.

---

## R0. Discovery (no code, report back in your first reply)

Read the existing rooms, events, community and broadcast code. Then answer these with `file:line` evidence before building:

1. **Room model.**
   - What does a room record look like (`communityRoomsRoutes.ts` and its model)?
   - Does it have a type or kind, a schedule time, a host, visibility (public / cohort / invite) and a capacity?
   - How are the class sessions in "Your classes" on `/portal/rooms` modelled? Are they rooms, sessions, or both?
2. **Events.**
   - Does each event (`GET /api/portal/events`) already map to a room?
   - What happens when you join an event?
   - Is there an RSVP endpoint? (v6 D5 may have added one.)
3. **Broadcast.**
   - How does a broadcast relate to a room (`room_id` in broadcast discovery)?
   - How does it relate to a session (`session_id`, added in 001bd1f2)?
4. **Booking.**
   - Does "Book a session" on `/portal/rooms` already exist as an endpoint?
   - What does it create?
5. **Community.**
   - What powers `/portal/community`: the posts, questions and announcements model, and the endpoints?
   - Is there a "question" type with answers?

Propose the smallest data change that gives every room a **kind**: `event` | `class` | `session` | `open`. Prefer deriving the kind from existing fields over adding a column. If a column is needed, write an idempotent `ensure…Schema` patch like the existing campus ones.

**Stop and wait for Ali's go** only if a migration or a change to the public rooms API is required. Otherwise proceed.

---

## R1. One rule for where a room lives

Build `roomBuilding(room)` (frontend `campusMap.ts`, mirrored in a backend helper if presence needs it):

| Room kind | Building |
|---|---|
| `event` (includes every broadcast) | `amphi` (Events Hall) |
| `class` (cohort class session) | `lecture` (Classroom) |
| `session` (booked) and `open` (ad-hoc) | `commons` (Meeting Rooms) |

**Use this rule everywhere a room appears:**
- the map;
- the rail's "Here now";
- presence for people inside a room (`/campus/here` should map `/portal/rooms/:id` to the room's building, not always to commons);
- the Schedule;
- "Coming up";
- the Where-to search.

**Retire `LIVE_ROOM_BUILDING='commons'`** (`campusOnAir.ts`):
- A live broadcast always lights the **Events Hall**, which completes round-1 Q2.
- If a broadcast is tied to a class session (`session_id`), it still shows in the Events Hall. The Classroom gets a "Your class is live in the Events Hall · Walk in" line.

**Acceptance:**
- Unit tests for `roomBuilding` cover all four kinds.
- When a broadcast is live, the map marquee and beams sit on `amphi` and never on `commons`.
- Someone inside an event room shows in the Events Hall's "Here now".

---

## R2. Meeting Rooms (renamed from Community Lounge): a hallway of doors

**Rename everywhere:**
- Name: **"Meeting Rooms"**.
- Sub: "Live rooms, study groups & 1:1s".
- Icon: 🚪.
- Workplace name: **"Meeting Rooms"**.
- Tour stop: "Meet anyone", with the copy "A hallway of live rooms: study groups, pair work, 1:1s. Open one now or book one for later." and the tip "Doors that glow teal have your friends inside."
- The pulse line "busiest: Meeting Rooms (n)".
- Rooms list: **Meeting rooms** (`/portal/rooms`) and **People** (`/portal/community/people`). **Community moves out** to R3.
- **Remove the couch spot** (v6 D1). This building has doors instead.
- Reese's Mentor desk stays in this building.

**The room interior:**
- **Side walls:** a row of doors, three per wall, numbered 1-6.
  - **Each door shows:**
    - a glass panel with up to four avatars of the people inside (real participants);
    - a door sign with the room name and its state: "● n inside" (green), "Booked · ‹day time›" (amber), or "Free".
  - **Live rooms** have a warm lit glass panel. **Rooms containing a friend or teammate** get a teal glow.
  - **Friend** means someone you've messaged, waved at, or who is on your team (business), or in your cohort study group. Use whatever relation exists; if none exists, use cohort.
  - **Door order:** live rooms with friends first, then other live rooms, then your bookings, then free rooms.
  - **More than six rooms:** the last door is "More rooms →", which opens the full list.
- **Back-wall board:** "MEETING ROOMS · n OPEN NOW". Each live room is a row: name, sub, avatar stack, **Join**. Underneath sit **"+ New room"** and **"📅 Book a session"**.
- **Floor:** people in the building stand in the hallway (real presence).

**Arrival card (right):**
- **"Rooms in the hallway"**: numbered rows, each with:
  - a green dot if live;
  - name and "n inside · sub", "Booked · day time", or "Free";
  - an action: Join, Details, or Open.
- Then **"+ New room"** and **"📅 Book a session"**.
- Then **"Looking for posts and questions?"**, which links to the Community Board (R3).

**Sheets (prototype: `renderMSheet`):**
- **Door peek** (tap a door):
  - "Meeting room n", the name and the sub;
  - "Inside · n" with each person's avatar, name and cohort or role, plus 💬;
  - the footer action: Join the room, "Opens at ‹time›", or Open this room.
- **+ New room:**
  - Name.
  - **Who can join:** Anyone on campus / Cohort / Invite only.
  - **Invite:** chips of people (online first), with Reese as an option.
  - **Open the room now →** creates the room, puts you in it, and turns a free door live with your avatar.
- **Book a session:** the same fields plus **Day** (next 7 business days) and **Time** (Central slots).
  - **Book the room →** reserves the room. Invitees get it on their Schedule and in "Coming up".
  - The door shows "Booked · ‹day time›".
- **Wire to the existing endpoints** that back "+ New room" and "+ Book a session" on `/portal/rooms` (find them in R0). Never fake a room.
- **Join** uses the existing join flow (audio/video), mic and camera off by default.

**Acceptance:**
- Fidelity view `26-meeting-rooms`:
  - door count equals the live rooms plus your bookings, capped at 6;
  - door signs match the API;
  - a friend's room has the `is-friends` class;
  - creating a room makes one more door live;
  - booking shows the session in "Coming up" and on the Schedule after a reload.

---

## R3. Community Board on the Quad

**On the map:**
- A **cork noticeboard on two posts**, with a little roof and colourful pinned notes.
- **Position:** on the Quad, just south-east of the fountain (prototype `translate(560,470)`).
- **Label pill:** "Community Board".
- **Badge:** a red count of new posts since your last visit.
- **Access:** focusable, Enter to open.
- **Click:** the avatar walks there, then the board opens.
- **It is not a building:** no room and no presence.

**The board** (an overlay dialog styled as cork, prototype `#cboard`):
- **Header:** "📌 Community Board", with the line "Posts and questions from everyone on campus. Read anytime, answer anytime. For live conversations, head to Meeting Rooms."
- **Tabs:** Everything / Questions / Posts / Announcements.
- **Buttons:** **"❓ Ask a question"** and **"✏️ Post something"** open an inline composer. "Pin it to the board" posts it.
- **Notes grid:** notes appear as pinned paper, slightly rotated.
  - Questions: yellow, with an answer count ("No answers yet" when 0).
  - Posts: white, with likes.
  - Announcements: teal.
  - Each note shows the author's avatar and first name.
  - Clicking a note opens that thread in the Community feed.
- **Footer:** "Open the full Community feed →" (`/portal/community`).
- **Data:** the existing community feed and post endpoints only. Use question types and answer counts if they exist (R0); otherwise show posts and announcements only, and log the gap.

**Also:**
- **"I want to…" chips** get **"📌 Ask the community"**, which walks to the board.
- **Where-to:** searching "community", "post", "question", "ask", "board" or "forum" offers **Community Board · on the Quad · Walk →**.
- **Routing:** `buildingForPath('/portal/community')` returns `board` (a new non-building place). The page trail reads "⌂ Campus › 📌 Community Board", and Step outside from that page returns to the Quad by the board.

**Acceptance:**
- Fidelity view `27-community-board`: the board is on the map with a badge; opening it shows the 4 tabs and real notes; posting adds a note at the top after a reload.
- Keyboard: Tab to the board, then Enter opens it.

---

## R4. Events Hall: every event happens here, and Colaberry Live is the stage

This builds on the v6 D4 auditorium and D5 sign-up.

**Arrival card:**
- **"Every event happens here · one tap to sign up"**: every upcoming event, with Sign up / ✓ You're going.
- **"Replays"**: past events and broadcasts, with ▶ Replay.

**When Colaberry Live is on air:**
- **On the map:**
  - two searchlight beams sweep above the Events Hall;
  - a red **"● ON AIR · LIVE"** marquee floats above it, and clicking it walks you there;
  - the marquee's timer and state come from discovery (`editorial_state`, `content_started_at`).
- **In the side panel:** a **"Happening now"** card sits at the very top: "● Colaberry Live is on air · ‹title› · Events Hall · on air for m:ss", with **Walk in →** and **▶ Watch here**. Watch here uses the existing `LiveMiniPlayer`.
- **In the room:** the back-wall screen becomes **the broadcast**:
  - a pulsing red "● ON AIR · m:ss" chip;
  - the host;
  - "COLABERRY LIVE · ON STAGE NOW", the title, "n watching · captions on";
  - **Join the audience** (the existing join and watch flow) and 👏 React (local only, round-1 Q15).
- **In the arrival card:** a single tile, **"● COLABERRY LIVE · ‹title› · The live broadcast is this hall's stage, streamed to everyone · Join the audience →"**, replaces the board tile.
- **Seats:** the auditorium seats fill with **real** watchers/attendees where the data exists; otherwise only present people (v6 D4 rule).

**When it is not live:** the board shows the next event with Sign up, as in v6.

**Fidelity view `28-live`:** stub discovery as live and assert:
- the marquee is on `amphi`;
- "Happening now" is first in the panel;
- the screen shows the ON AIR chip;
- the arrival tile reads COLABERRY LIVE.

Do **not** ship the prototype's "Preview Colaberry Live on air" button. It is prototype-only. In e2e, use a stub.

---

## R5. Classroom: your class sessions live here

Move the class-session parts of `/portal/rooms` ("Your classes") into the **Classroom**:

- **"Live classes"** in the arrival card, also shown on the Classroom page: the next class session ("Week 1 · Build Day · Tonight 6:30 PM CDT"), with **Check in** using the existing check-in flow (`/portal/class-checkin/:sessionId`). When the session is live: **Join**.
  - If the class is broadcast, the line reads "Your class is live in the Events Hall · Walk in" (R1).
- **"Your classes · replays"**: completed sessions (✓ #n, title, "Done · replay with captions"), each with **▶ Replay**.
- **`/portal/rooms`**: remove "Your classes" (it now lives in the Classroom). Add a small link: "Your classes are in the Classroom →".

**Acceptance:** the Classroom card lists the real next session and real replays. `/portal/rooms` no longer shows the class list.

---

## R6. Schedule: one list for everything with a time

This extends v6 D5.

- **Board, list and page calendar:** they hold **classes 🎓, events 🎪 and booked sessions 🚪** together, **sorted by date and time**. The board heading is "YOUR WEEK · CLASSES, EVENTS & SESSIONS".
- **Row actions:**
  - Classes: "🎓 Class", which walks to the Classroom. Class rows are on your calendar automatically; no sign-up needed.
  - Events: Sign up / ✓ You're going.
  - Booked sessions: "🚪 Booked", which walks to Meeting Rooms.
- **"Coming up" in the side panel:** the same three kinds, plus an admissions call if booked (v6). Each item shows "‹day› Oct ‹d› · time · ‹building›" with **Walk there →** to that item's building (from R1).
- **Data:**
  - classes come from the sessions API;
  - events and RSVPs come from v6 D5;
  - sessions come from the bookings in R2.

**Acceptance:** with one class, one RSVP'd event and one booked session, the board shows all three in date order, each with the correct icon and building.

---

## Order of work

1. R0 discovery: report, then wait only if a migration is needed.
2. R1, the room-kind rule (everything else depends on it).
3. R2, Meeting Rooms, and R5, Classroom (the "Your classes" move).
4. R4, Events Hall and Colaberry Live.
5. R6, the Schedule mix.
6. R3, the Community Board.

## Ask Ali before shipping

- What counts as a **friend** for the teal door glow (cohort, messaged, waved, team)?
- Should **open rooms default to "Cohort"** or "Anyone on campus"?
- Are **class sessions that are broadcast** shown as live in the Events Hall (recommended), or in the Classroom?
- Rename **"Community Lounge" → "Meeting Rooms"**: confirm the name. The alternatives are "The Commons" or "Study Rooms".

## Definition of done for v7

- R1-R6 match `colaberry-campus-v7.html` side by side at 1440×900 and 390×844, for:
  - the Meeting Rooms hallway and its sheets;
  - the Community Board;
  - the Events Hall, live and not live;
  - the Classroom card;
  - the Schedule.
- Fidelity views 26, 27 and 28 pass. The v6 and round-3 tests still pass. `tsc --noEmit` is clean.
- No room, post, watcher or classmate is invented anywhere in production.
