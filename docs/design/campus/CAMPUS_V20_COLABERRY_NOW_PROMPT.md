# Campus v20: Colaberry Now (Colaberry TV + the Community Board, split screen)

**For:** Claude Code in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
**Owner / DRI:** Ali Muwwakkil
**Written:** Wednesday 2026-11-11, Central

**Run order:** this **replaces** the TV prompts for v17, v18 and v19. Don't build a TV page, room TVs or a Chow Hall TV; the **Chow Hall stays exactly as it is live**. It **builds on** the v14 Community Board work (sections, ages, NEW, Your notes, threads): reuse that backend and those components. Branch `campus/v20-colaberry-now`, one PR.

**Design source:** `docs/design/campus/colaberry-campus-v20.html`. Commit it with this file, plus `docs/design/campus/v20-screenshots/`.
- Click the **phone on the Quad** (labelled Colaberry Now).
- In **Member view** (staff), **⚙ Manage TV** opens the playlist editor.
- The posts and the 9 shorts in the prototype are illustrative; the short IDs are the real ones from Piyush P.'s thread.

**Same rules as before:**
- No invented data.
- Tests first, plus a session log on the commit and a brief-me at the end of the reply.
- Times in Central.
- The campus stays on Ali's account only.

## Ali's decisions (2026-11-11)

1. **One place for "what's going on at Colaberry right now":** Colaberry TV and the Community Board combined, as concept **A, split screen**.
2. **The commercials are always playing** while it's open, one after another, looping.
3. **Every post and comment stays visible:** an endless stream, newest first.
4. **On the map it's not a corkboard.** It's a **giant phone**, the thing people are glued to.

## N1. On the map: the phone (replaces the corkboard and the jumbotron)

The Quad landmark at the board's spot (`BOARD_AT`, 560,470) becomes a phone standing on a small base:
- **the screen** shows the current short's thumbnail with a red "● TV" badge (it changes every 6 s; static with reduce motion);
- **three notification cards** slide in on a loop (colour dots for a win, a question and an intro);
- **a red badge** shows what's new: `new_since.count + my_new_replies`, capped at "9+";
- **a soft pulsing ring** sits at the base;
- **the label** reads "Colaberry Now".

Clicking it walks there, then opens Colaberry Now (the existing board-walk behaviour).
- **Never play video or sound on the map.**
- Remove the separate v17 jumbotron.
- **Rename everywhere:** "📌 Ask the community" → "📱 Colaberry Now"; Where-to finds it with "community, board, post, question, tv, now".

## N2. Colaberry Now (the opened view)

**A large dialog over the map,** `min(1440px,100%) × min(94vh,980px)`. It's two columns: TV 42%, stream 58%. On phones (≤900px) the TV is on top at 52vh and the stream below.

**Left: Colaberry TV (always on)**
- **Header:** "● COLABERRY TV · ALWAYS ON", with "i OF n · LOOPS".
- **Player:** a 9:16 `youtube-nocookie` player that starts **when Colaberry Now opens**. It's one shared component with `VideoEmbed` and the YouTube IFrame API (`enablejsapi=1`).
- **Order:** `onStateChange === ENDED` → the next on-air short; after the last, start again from the first. Only fall back to `duration_s` if the API doesn't load.
- **Sound:** opening it is a click, so start **with sound**. If the browser blocks unmuted autoplay, start muted and show "🔊 Tap for sound". Remember the mute choice for the visit.
- **Below the player:** the title, "‹m:ss› · the next one plays by itself", ▲ ▼, 🔊/🔇, and **⚙ Manage TV** for staff with `campaigns`.
- **A reel down the right edge:** every on-air short as a 9:16 thumbnail with its length; the current one is outlined. Clicking one plays it.
- **Stopping:** closing Colaberry Now (✕, the scrim, Esc) stops the player (`about:blank`) and its timers.

**Right: the stream (the Community Board)**
- **Header:** "What's going on" and "Everything people are posting, newest first. It never ends: keep scrolling. ‹n› new since you looked." There's also 🔍 search and ✕.
- **Composer:**
  - an avatar, then the input "Share something, ask a question, or comment on what's playing…";
  - a **kind** select: 💬 Post / ❓ Question / 👋 the current week's ritual;
  - **Post**.
  - Use v14's `createPost` and its rules (the 15-word minimum, shown as the server says it, and the in-flight guard). The new post appears **first** with a gold outline and a glow, and a toast says which section it went to.
- **Section chips** (v14 lanes, same names and counts): Everything, Your notes, Announcements, Questions ("‹n› open"), Introductions, Wins & builds, Tips & prompts, Ideas & stories, General. Each has a red dot when it has new posts.
- **"Happening now" strip** (horizontal scroll), from real data only. A chip with no data is left out. Clicking a chip does something:
  - "‹n› on campus · busiest: ‹room›" → walks to that room;
  - the next event → opens Events;
  - "‹n› questions need an answer" → the Questions filter;
  - the latest win → opens that thread;
  - "‹n› shorts on Colaberry TV" → restarts from the first short.
- **The stream:** one list, newest first. Pinned announcements are first on Everything, with a teal edge and "📌 pinned".
- **Each post shows:** avatar, first name, the section chip (ritual icon + name), its age, a NEW tag, the title, a 2-line excerpt, the ritual's reaction count, and 💬 replies ("· answer it" on an unanswered question; "‹n› new replies" on yours).
- **Endless:** cursor paging, 20 at a time, loaded when within 160px of the bottom.
- **Live:** new posts arriving while it's open don't move the list. They show a sticky **"↑ ‹n› new posts"** pill, and tapping it inserts them and scrolls to the top. Poll every 20 s, or use the existing realtime channel if the community feed has one.
- **Threads:** clicking a post opens v14's thread drawer over the right column (full post, reaction, replies, reply box). Esc closes the drawer first, then Colaberry Now.

**Backend:**
- reuse v14's `GET /api/portal/community/board` (lanes, `new_since`, cursor);
- add `GET /api/portal/community/board/since?after=‹id›` for the new-posts pill;
- add `GET /api/portal/colaberry-now/happening` for the strip (presence counts, the next event, unanswered questions, the latest win).
- `requireParticipant`, cohort scope, with tests.

## N3. The TV playlist and the staff manager

Keep v18 T1/T2/T4 exactly, renamed:
- table `colaberry_tv_videos`;
- routes `/api/portal/colaberry-tv` and `/api/admin/colaberry-tv`, gated on `campaigns`;
- the same features: add a link (with the oEmbed title), rename, reorder, who sees it, on air, delete with confirm, and an audit row for every change.

The manager opens from **⚙ Manage TV** in Colaberry Now. Its copy is "This is the Colaberry TV playlist on Colaberry Now, in play order. Changes show right away for everyone watching." The open TV updates live: if the current short is deleted or taken off air, it moves to the next one.

**Nothing else plays anywhere:** no video in rooms, lessons, quizzes, the workstation or the HQ floors. A test enforces this.

## N4. Elsewhere

- **The left panel's "📺 New on Colaberry TV" note** stays at once a day, dismissible. It now opens Colaberry Now.
- **The Chow Hall is unchanged from production:** 20 cravings, chalkboard, counter, and arrival card. Remove any v18/v19 TV code if it was started.

## Acceptance

- **Fidelity view `38-colaberry-now`** (1440×900, 900×900, 390×844):
  - the map phone;
  - Colaberry Now open, with the TV playing and the stream;
  - a new post at the top;
  - the thread drawer;
  - the Questions filter;
  - the manager open.
  No text overflows.
- **E2E:**
  - open → the player starts;
  - ⏭ and the reel change the short;
  - close → `about:blank`;
  - post a question → it's first, and Questions shows "1 open";
  - a second user's post shows the pill without shifting the list;
  - scrolling to the bottom loads older posts;
  - staff add, reorder and remove a short and the open TV follows;
  - an explorer sees no Manage button and gets 403 on admin routes.
- `tsc --noEmit` is clean and there are no console errors.

## Ask Ali before shipping

1. Should the TV start with sound, or start muted with "Tap for sound"? (The browser may force muted anyway.)
2. Can people comment on a specific short (a thread per video), or do comments stay in the main stream only?
