# Colaberry Campus: v7 → v10 (one prompt)

**For:** Claude Code in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
**Owner / DRI:** Ali Muwwakkil
**Written:** Saturday 2026-10-24, Central

## How to use this

**Start state:** v7 is built, or in flight. That means `CAMPUS_V7_DELTA_PROMPT.md` (rooms, events, community) on top of v6 and round 3. Finish and merge any v7 PR you're on first.

**What this prompt adds, in order:**

| Part | Version | What it adds |
|---|---|---|
| A | v7 → v8 | **Game Room redesign:** a new page laid out like the other campus pages, leaderboards, the arcade cabinet, two new games (Stack Drop, Token Trail), and the redesigned Game Room interior with an arcade aisle. |
| B | v8 → v9 | **Local weather and time of day:** the map tint and rain/snow follow each person's real local weather and clock, every room gets a window on the right wall, and the top bar gets a weather chip. |
| C | v9 → v10 | **The real view out of each window:** the window shows the actual campus buildings and landmarks to the east of the room you're in. |

**Files in this bundle.** Commit all of them to `docs/design/campus/`:

| File | Purpose |
|---|---|
| `CAMPUS_V7_TO_V10_PROMPT.md` | This prompt |
| `colaberry-campus-v10.html` | **Source of truth** for everything below: the full campus with all three parts built in |
| `game-room.html` | The Game Room page on its own, playable |
| `screenshots/` | Reference images: the Game Room room and page, the weather views, the window views |

**Walking the prototype** (`colaberry-campus-v10.html`, 1440×900):
- **Part A:** walk into the Game Room. Click a cabinet and play. Switch leaderboard tabs in the right card. Click the board to open the Game Room page.
- **Part B:** click the weather chip in the top bar. Use PREVIEW to try Rain/Night, Snow/Dusk, Storm/Night and Clear/Night on the map and in a room.
- **Part C:** compare the windows in the Classroom (Project Studio, Events Hall and the pond outside), the Library and Meeting Rooms.

**Rules (unchanged):**
- No invented data in production. Scores, names and classmates in the prototype are illustrative.
- Tests first, a session log on every commit, a brief-me at the end of every reply.
- The campus stays on Ali's account only.
- **One PR per part (A, B, C), in order.** Report the shipping ladder honestly: built → tested → merged → deployed → production-verified.
- Where this prompt conflicts with an earlier one, this prompt wins.

---

# Part A: Game Room redesign (v7 → v8)

### Today (`/portal/game-room`, `pages/portal/campus/GameRoomPage.tsx`)

The page is a flat tab picker with three game names, a "15:00 left today" line, one Play button and a "This week · No scores yet" box. It doesn't use the page layout the other campus pages use: the kicker / title / lead block, the hero card with a summary column, accent-topped side cards and a feed.

### G1. Page layout (same format as the Classroom page)

Inside PortalShell with the campus location bar, left campus nav and right rail, like every campus page. From top to bottom:

1. **Kicker "TAKE A REAL BREAK"**, title **Game Room**, lead: "Five quick games, fifteen minutes a day. Your break resets at midnight Central, and games never change your learning points."
2. **Hero card** (purple top accent):
   - **Left summary column:** the **break left today** in big mono (`15:00`), a progress bar, and "Resets at midnight Central". When it's used up: "That's your 15 minutes · back tomorrow".
   - **Right:** the featured game. Kicker "TRY SOMETHING NEW · ‹game›" with a NEW chip, title, one-line pitch, **▶ Play ‹game›** and **See the leaderboard**, plus a small animated art canvas.
   - **Featured game rule:** the newest game you haven't played. Otherwise, the game where you're closest to the next rank.
3. **Two side cards in a row:**
   - **🏆 Your week** (green accent): games played, best game, best score, best rank (cohort).
   - **👑 Champions this week** (navy accent): one row per game with the #1 player's avatar and score.
4. **Pick a game:** a card grid with one card per game. Each card has an art header (NEW tag where it applies), name, description, "Your best ‹score›" and "#rank this week" or "Not ranked yet", and **▶ Play**. Above the grid, a helper line: "Arrow keys or WASD · swipe on a phone · Esc to leave".
5. **Leaderboards**, inside one card:
   - Game tabs, a scope toggle **My cohort / Everyone**, and a period toggle **This week / All time**.
   - **Podium** for the top 3: 🥇 centre and raised, 🥈 left, 🥉 right. Each shows avatar, first name and score.
   - **Rows #4-#10:** rank, avatar, name + cohort, level chip (Lv / rung), score in mono.
   - **Your row:** always shown and highlighted in light red. If you're below #10, show "⋯" and then your row. If you have no score yet: "You don't have a score in ‹game› yet · [Set one]".
   - Under the heading: "Top scores reset every Monday".
6. **Recent highs:** a feed of new personal bests and #1 takeovers ("Kwame set a new best in Stack Drop · 5,410 · 12 min ago"), each with ⚔️ Challenge.
7. **Rail:**
   - Up next (unchanged).
   - **Playing now · n:** people currently in a game, with a 👀 spectate button. Spectating is a stretch goal; show a toast until it's built.
   - **Challenge a friend:** pick a friend and a game, and they get "beat my ‹score›" as a DM with a Play link.
   - Help desk.
8. **Left nav "In the Game Room":** Games / Leaderboards / Recent highs. These scroll to their sections.

### G2. The cabinet (play in a modal, not on the page)

- Clicking Play opens a **dark cabinet modal** over the page:
  - Header pills: game title in a pixel font (Press Start 2P via Google Fonts, OFL licence), score, Lv (with ♥ lives where the game has them), and **⏱ time left** (turns red and pulses under 1 min).
  - ✕ to close.
  - A 480×560 canvas.
  - Footer: per-game controls on the left, "Esc to pause and leave" on the right.
- **Phone:** an on-screen pad (◀ ⟳ ▼ ▶ ⤓) plus swipe and tap.
- **Game-over sheet** over the canvas:
  - Headline: "NEW PERSONAL BEST!", "GAME OVER", or "BREAK'S OVER 🌙" when time runs out.
  - Big score.
  - "Your best: ‹n› · #‹rank› on this week's cohort board · ‹m:ss› of break left today".
  - Buttons: **Play again** (disabled when no time is left), **Back to work: ‹next plan step› →** (walks to that building), and **Game Room**.
- **Timing:** the time cap stays server-timed. Keep `useGameTimeCap` and the existing `/api/portal/game-room/time` + `beat` mechanism, and drive the pill from it.

### G3. Two new games (original designs, no trademarks)

Both use the existing engine pattern (`components/campus/games/engine/*Engine.ts` + `useCanvasGame`). Each gets deterministic tests: line clears and collisions for Stack Drop, growth and self-collision for Token Trail.

**Stack Drop** (falling-block puzzle):
- **Board and pieces:** a 10×20 grid, 7 four-cell shapes, and a **7-bag randomiser**. Use a seeded RNG so scores can be verified.
- **Controls:** ←/→ move, ↑ rotate with simple wall kicks, ↓ soft drop (+1 per row), Space hard drop (+2 per row).
- **On screen:** a ghost piece showing where the current piece will land, a NEXT preview and a LINES counter.
- **Scoring:** clears give 100 / 300 / 500 / 800 × level. Level = 1 + ⌊lines/8⌋, and gravity speeds up with level.
- **Look:** neon data blocks on the dark cabinet, matching the arcade palette.
- **Do not** use the name "Tetris", the classic piece colours as a set, the theme music, or the trade dress. The name, colours and copy must stay original.

**Token Trail** (snake-style):
- **Board:** a 24×26 grid. You start in the middle, heading up.
- **Rules:** collect "T" tokens to grow. +10 × level per token. Level up every 6 tokens, and speed rises with level.
- **Game over:** hitting a wall or your own tail.
- **Controls:** arrow keys / WASD / swipe.

**Keep the existing three games** (Byte Chase, Launch Lab, Bug Breaker) and their engines. Round-1 Q3 still holds: these stay original games with new art. Give each its art canvas for the cards (prototype `drawArt`).

### G4. Backend additions

- **Register the new games:** add `stack` and `trail` to the game registry used by `POST /api/portal/game-room/start`, `/beat` and `/scores`.
- **Anti-cheat ceilings:** set the score ceilings the same way as the existing games.
  - Stack Drop: cap the points per second by level.
  - Token Trail: cap the tokens per second by level.
- **Extend `GET /api/portal/game-room/scores?game=&scope=cohort|all&period=week|all`:**
  - Each row returns `rank`, `display_name`, `avatar_url`, `rung_name`, `cohort_name`, `score`, `you`.
  - The response also carries **`me: { best, rank }`**, even when you're outside the top 10.
  - `scope=all` means everyone on the campus pilot. Respect the existing privacy rules: only names that the People panel would show.
- **New `GET /api/portal/game-room/summary`:**
  - your week (played, best game, best score, best rank);
  - the champion per game;
  - recent highs, newest first, max 10. These are new personal bests and #1 takeovers within your visibility set.
- **Playing now:** presence with `building=arcade` plus an active game session within the last 30 s. Return name and game.
- **Challenge:** `POST /api/portal/game-room/challenge {to, game, score}` sends a DM through the existing DM service: "‹name› challenges you: beat ‹score› in ‹game› →" with a link that opens the cabinet for that game. It is idempotent per (from, to, game, day).
- **All endpoints:** `requireParticipant`, campus pilot only, and tests for each.

### G5. The Game Room interior (campus room redesign)

This replaces the current room shown in `colaberry-campus-v6.html`: one Bug Breaker cabinet, a "Break time" board and a generic card. The source is `colaberry-campus-v10.html`.

**The room is an arcade aisle** with a dark purple room and ceiling lights. Remove the v6 single-cabinet spot.
- **Back wall screen:** "TAKE A REAL BREAK", with a "⏱ m:ss LEFT TODAY" chip, then the featured game (title + NEW chip + one line), **▶ Play ‹featured›** (opens the cabinet modal) and **Leaderboards** (opens the page). When there is no time left, Play is disabled.
- **Left wall: a neon "👑 CHAMPIONS" scoreboard.** It's a dark board with a pixel-font title and one row per game: the #1 player's avatar, the game name and the score in green mono. Clicking it opens the page at the leaderboards.
- **Five arcade cabinets on the floor**, one per game: three down the right side and two down the left, like an aisle.
  - Each cabinet shows a neon marquee with the game name, the game's art on its screen, the control panel, "BEST ‹your best›" or "NO SCORE YET", "▶ PLAY", and a NEW tag on new games.
  - Hover makes the cabinet glow. Clicking it opens the **cabinet modal** for that game.
  - Use `data-testid="cm-cabinet-<game>"` on each cabinet.
- **People:** people present stand in the aisle (real presence only).
- **Arrival card (right):**
  1. **"Look up, or step up":** a board tile ("Game Room · Every game, leaderboards and recent highs · Open the Game Room →") and a cabinet tile ("Stack Drop · Or walk up to any cabinet in the aisle · Play →").
  2. **Break time:** a purple meter with the time left today, a bar, and "Resets at midnight Central · games never change your points".
  3. **Games:** one row per game with a mini art thumbnail, name (+ NEW), "Your best · #rank this week" and **Play**.
  4. **Leaderboard · this week · my cohort:** game tabs, the top 5 (🥇🥈🥉 then #4 and #5), plus your row highlighted (shown even when you're outside the top 5), or "No score yet · Set one". Then **Full leaderboards →**.
- **Live updates:** finishing a game refreshes the timer, the cabinet BEST labels, the card rows and the leaderboard without reopening the room.
- **Back to work:** "Back to work: ‹next step›" in the game-over sheet walks you to the building of your next plan step.
- **Tour stop copy:** "Take a real break · Five quick games, fifteen minutes a day, with weekly leaderboards. · Games never change your learning points."
- **Where-to:** the Game Room sub becomes "Five quick games · 15 min a day".

**Acceptance:** fidelity view `30-game-room-interior`:
- 5 cabinets exist, and clicking `cm-cabinet-breaker` opens the cabinet with the Bug Breaker title;
- the champions board has 5 rows;
- the right card shows the meter, 5 game rows and a leaderboard with your row;
- after a stubbed game end, the cabinet BEST label updates.

### Acceptance

- **Fidelity view `29-game-room` (the page)** (1440×900 and 390×844):
  - the hero, both side cards, a 5-card grid, the leaderboard podium and rows, recent highs and the rail are all visible;
  - no control's text overflows.
- **E2E:**
  - Stack Drop: play, hard-drop, game over, then the game-over sheet shows the score.
  - `/scores` returns `me`, and your row shows on the board.
  - The time pill counts down via `beat`; at 0 the sheet shows "BREAK'S OVER" and Play is disabled.
- **Unit tests:** both new engines, ceilings, and the `me` rank calculation.
- **Points:** the source-scan test confirms games never award learning points.
- `tsc --noEmit` is clean.

### Ask Ali before shipping

- Are the names "Stack Drop" and "Token Trail" OK?
- Should "Everyone" leaderboards show other cohorts' names, or first name + initial only?
- Are challenges by DM OK, or should they be in-app only?

---

# Parts B and C: Local weather, time of day, and the real view from each window (v8 → v10)

Parts B and C share one prompt. **Ship B (W1–W4) as one PR and C (W5) as a second PR.**

### The idea

The campus follows each person's **local weather and time of day**, so it feels like real life:
- sunny in the afternoon;
- rain on the map;
- a sunset glow in the evening;
- the moon (in its real phase) when someone works late.

**Walk the prototype:**
1. Click the weather chip in the top bar ("⛅ 72°"). Use the PREVIEW chips to try Rain/Night, Snow/Dusk, Thunderstorms/Night and Clear/Night.
2. Walk into any room and look at the **window on the right wall**.

Preview is prototype-only. Production shows only the real weather.

### W1. Where the weather comes from (privacy first)

**Location.** Use the first of these that is available:
1. The city on the user's profile, if set.
2. A **city-level** lookup from the request IP, done on the server with an existing geo-IP library if one is already in the repo. Otherwise skip this step.
3. The city for the browser's time zone, sent by the client (the prototype's `TZCITY` table: Chicago → Dallas, New York, Denver, Los Angeles, London, Bengaluru, Kathmandu, Lagos, Addis Ababa…). Extend the table as needed.
4. **"Use my exact location"** in the weather popover, which calls `navigator.geolocation` **only when the user taps it**. Round to 2 decimals (~1 km), store it only in `localStorage` on the device, and **never send it to our database**.

Never store precise coordinates server-side. Never show a user's city to anyone else.

**Weather.** Add `GET /api/portal/campus/weather?city=…` or `?lat=…&lon=…` (2 decimals), with `requireParticipant`. It proxies **Open-Meteo**: no API key, free for non-commercial use. **Ali must confirm the licence for commercial use**; if needed, swap in the paid Open-Meteo plan or another provider behind the same endpoint.
- **Request:** `https://api.open-meteo.com/v1/forecast?latitude=&longitude=&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`
- **Return:** `{ city, temp_f, temp_c, code, condition, is_day, sunrise, sunset, fetched_at }`.
- **Cache:** 20 minutes per rounded location (in-process LRU, or the existing cache helper).
- **Failure:** a 5 s timeout. On failure return `{ condition: null }`. The client then falls back to **clock-only**: time of day still works, and there are no weather effects.
- **Logging:** structured, with a correlation id. Never log coordinates.

**Units.** °F by default. Use °C when the user's locale or region uses Celsius (`Intl.NumberFormat().resolvedOptions().locale` or the profile setting).

**Mapping** WMO `weather_code` to a condition (prototype `codeToCond`):

| Code | Condition |
|---|---|
| 0 | clear |
| 1–2 | partly |
| 3 | cloudy |
| 45/48 | fog |
| 51–67, 80–82 | rain |
| 71–77, 85–86 | snow |
| 95–99 | storm |

**Time of day.** Use the user's **local clock** together with that day's sunrise and sunset:
- **dawn:** sunrise ±45 min;
- **dusk:** sunset ±45 min;
- **night:** before dawn or after dusk;
- **day:** otherwise.

Without sunrise and sunset, fall back to 6:45 and 18:35. The greeting ("Good morning/afternoon/evening") uses the same clock. Refresh the time of day every minute and the weather every 20 minutes.

### W2. The campus map follows the weather

These are full-screen layers **under** the panels and over the map, with `pointer-events:none`:
- **Time-of-day tint** (`#wxFx`):
  - night: deep blue vignette;
  - dusk: orange-to-violet;
  - dawn: soft peach;
  - overcast: a light grey wash in daytime for cloudy, rain, storm or fog.
- **Particles** on a canvas (`#wxCv`):
  - rain: about 180 slanted streaks;
  - snow: about 140 drifting flakes;
  - storm: rain plus an occasional screen flash (at most every few seconds; skip under reduced motion).
  - Pause the particles while a page or the workstation is open.
- **Under `prefers-reduced-motion`:** no particles and no flashes. The tint still applies.
- **Performance:** one `requestAnimationFrame` loop, paused when the tab is hidden. Particle count scales with viewport area.

### W3. A window in every room

- **Where:** a window on the **right wall** of every room. In Meeting Rooms it's a smaller high window above the doors.
- **The frame:** cream frame, cross mullions, sill, and a sign under it reading "☀️ 72° · Dallas" (🌙 at night when it's clear).
- **The view** follows the same weather state:
  - **Sky gradient** by time of day: day blue, dawn peach, dusk violet-orange, night navy. Daytime cloudy or rain turns it grey; snow turns it pale grey.
  - **Sun:** day, low at dawn and dusk, glowing. Shown only when clear or partly cloudy.
  - **Moon:** at night when clear or partly cloudy, drawn in the **real current phase** (prototype `moonPhase`), with twinkling stars.
  - **Clouds:** drifting. 2 when partly cloudy, 4 when cloudy, rain, storm or snow. Grey when it's raining, dark at night.
  - **Hills and a little skyline:** building windows light up at dusk and night.
  - **Rain:** streaks, plus drops on the glass.
  - **Storm:** rain plus lightning flashes.
  - **Snow:** flakes.
  - **Fog:** a white haze.
- **Room light:** a tint over the room itself (`.wxtint`) makes it feel lamp-lit at night, warm at dusk and slightly grey on overcast days.
- **Live:** the window updates in place when the weather or time changes, without reopening the room.
- **Not a click target.** Its `title` says "Outside: Rain in Dallas".
- **Acceptance (fidelity view `31-weather`):** stub the weather endpoint, fake the clock, and check:
  - with rain and 14:00, the map has the overcast class and a rain canvas, and the room window has rain streaks;
  - with clear and 23:00, the night tint is on and the window has a moon and stars;
  - with reduced motion, the canvas draws nothing.
- **Unit tests:** `codeToCond`, the time-of-day boundaries, `moonPhase` (known dates: new moon, full moon), and the °C/°F choice.

### W4. Top bar chip, popover and copy

- **Top bar chip:** add a weather chip to the stats pill: "‹emoji› ‹temp›°". Click it to open a small popover:
  - condition, temperature and city;
  - local time and time of day;
  - "The campus sky, the windows in every room and the light follow your local weather and time of day.";
  - **📍 Use my exact location**;
  - a **Change city** field that saves the city to the profile;
  - a **Turn weather effects off** toggle, stored in the existing campus settings next to Reduce motion. When off, there are no particles or tint; the window still shows the time of day.
- **Side panel lead** (only when nothing urgent is happening). Prototype `wxLead`:
  - rain or storm: "It's raining in Dallas, a good day to stay in and build.";
  - snow: "Snow in Dallas today. Stay warm.";
  - night: "Working late? The moon's out over Dallas.";
  - otherwise: "It's 72° and clear in Dallas."
- **Workplace look:** the same behaviour, with no copy changes needed.
- **Do not ship** the prototype's PREVIEW chips. They exist only for design review.

### W5 (Part C). The view out of the window is the real campus

The window looks **east** on the map ("to the right"). It shows the buildings and landmarks that are actually there, drawn small. The sky, light and weather of W3 sit behind them.

- **Pick what's in view.** Use `viewFrom(buildingId)` from the prototype:
  - candidates are all other buildings plus four landmarks: the pond, the Quad fountain, the Community Board and the Main Gate;
  - keep the ones east of the building (`dx > 20`) within ±63° of due east (`|atan2(dy,dx)| < 1.1`) and closer than 620 map units;
  - take the **nearest 3**.
  - Use the same building coordinates as `campusMap.ts`, so it stays correct if the map changes.
- **Place them.**
  - Horizontal position: from the angle. Looking east, south is to the right, so `left = 50% + (angle / 1.1) × 38%`.
  - Size: from distance, `size = clamp(22%, 9000 / (distance + 60), 58%)` of the window width. Near things are big; far things are small and sit higher on the hills.
  - Draw them back to front.
- **Draw them** as mini versions of the map art, reusing the map's roof families (pediment, gable, tower with clock, dome, flat, office tower, pavilion, amphitheatre arcs, arcade neon) and each building's colour token.
  - The windows light up at dusk and night.
  - The whole view dims at night.
  - Landmarks get small drawings: the pond as water, the fountain with a water arc, the board with notes on posts, the gate with an arch.
- **Nothing in view:** for a building on the east edge (Internship Office), show the generic distant skyline.
- **The window sign** gets a second line, "Looking out at ‹nearest›". The window `title` lists everything in view ("you can see Project Studio, Events Hall, the pond").
- **Expected views:**

  | Room | In view |
  |---|---|
  | Classroom | Project Studio · Events Hall · the pond |
  | Library | Schedule · Classroom · the Quad fountain |
  | Cert Prep | Library · Schedule · Meeting Rooms |
  | Game Room | Meeting Rooms · Schedule · the Quad fountain |
  | Meeting Rooms | the Main Gate · the Quad fountain · the Community Board |
  | Internship Office | the city skyline |

- **Acceptance:**
  - A unit test for `viewFrom` asserts the table above.
  - Fidelity view `31-weather` also asserts that the Classroom window contains a Project Studio mini building (`data-view="studio"`) and that its sign reads "Looking out at Project Studio".

### Ask Ali before shipping

- Is Open-Meteo's licence OK for this use, or should we use a paid provider?
- Default units: °F for everyone, or by locale?
- Should weather effects be on by default? (Recommended: on, with the toggle in settings.)

### Definition of done for Parts B and C

- v10 matches `colaberry-campus-v10.html` side by side for these combinations, on the map and in the Classroom, Studio and Meeting Rooms:
  - clear/day
  - rain/day
  - clear/night
  - snow/dusk
  - storm/night
- Fidelity view 31 and the unit tests pass. Reduced motion is respected. No coordinates are stored server-side. `tsc --noEmit` is clean.

---

# Definition of done for v10

- Parts A, B and C each match `colaberry-campus-v10.html` side by side at 1440×900 and 390×844.
- These fidelity views pass, along with all earlier views and tests:
  - `29-game-room` (the page)
  - `30-game-room-interior`
  - `31-weather` (including the window-view assertions)
- `tsc --noEmit` is clean.
- No coordinates are stored server-side. Games never award learning points. Reduced motion is respected everywhere.
