# Campus rooms fix: screens, left walls, windows, hallway doors

**For:** Claude Code in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
**Owner / DRI:** Ali Muwwakkil
**Written:** Sunday 2026-10-25, Central

**Run order:** on `main` at or after `66c9c009` (PR #3383, which shipped Chow Hall). One PR, branch `campus/room-fix`.

**Design source:** `docs/design/campus/colaberry-campus-v12.html`. Commit it with this file, plus `docs/design/campus/room-fix-screenshots/`. v12 is v11 with exactly two design changes:
- **The back-wall screen is bigger and wall-mounted.** It takes most of the back wall: `left:5%; right:5%; top:5%; height:74%`, with no stand. Its text scales up about 1.35×.
- **The window is bigger.** `left:4%; right:4%; top:5%; height:70%` of the right wall. In Meeting Rooms it is a high strip, `top:3%; height:28%`, above the doors.

**Same rules as before:**
- No invented data.
- Tests first, plus a session log on the commit and a brief-me at the end of the reply.
- Times in Central.
- The campus stays on Ali's account only.

## What Ali sees live (the screenshot in `room-fix-screenshots/live_meeting_rooms.png`)

1. The back-wall screen runs off the right side of the room. It is cut off by the right wall, and its text is clipped ("Nobody is in a room righ…").
2. The window is a small sliver, high on the right wall.
3. The left walls are empty in most rooms.
4. Meeting Rooms shows doors 1-3 on the left wall and nothing on the right wall.
5. The window's view doesn't read as the buildings next door.

## F1. Root cause of 1, 2 and part of 5: the room is built 1.5× too wide (fix this first)

`interior/room3d/Room3D.tsx` → `useRoomSize()` measures the room with `getBoundingClientRect()` in a `useLayoutEffect` on mount.

At that moment, `.cm-in-frame` (in `campusInside.css`) is running `cm-in-reveal`, which starts at `transform: scale(1.5)`. `getBoundingClientRect` includes transforms, so `fw` is read 1.5× too large. `ResizeObserver` never corrects it, because transforms don't resize the box.

**Reproduced in Chromium.** For a 985 px room:
- mount rect = **1478**;
- `offsetWidth` = 985;
- the `ResizeObserver` callback also reports 1478;
- it is never re-measured after the animation.

With `fw = 1478` everything that depends on `--fw` is wrong:
- **Back wall:** the face is 1478 px wide, but the side walls sit at the real 985 px edges. The right wall slices through the back wall, so the screen (13%–87% of 1478) runs past it.
- **Text:** every `calc(var(--fw) * …)` font is 1.5× too big, so text overflows.
- **Depth:** `--d` hits its 820 px cap and `--persp` is 1404, so the side walls are deep and narrow. That is why the window looks tiny.
- **Floor:** people, spots and furniture are placed using the wrong `fw`.

`room-fix-screenshots/bug_repro_1p5x.png` shows the v11 design built with the same 1.5× error, and it matches the live screenshot.

**Fix:**
- In `useRoomSize`, measure the **layout box**, not the painted box: `el.clientWidth` / `el.clientHeight` (or `offsetWidth/Height`).
- Use the same source inside the `ResizeObserver` callback: `entry.contentRect` is layout size, so that is fine too. Never use `getBoundingClientRect` for this.
- Also re-measure on `animationend` of the nearest `.cm-in-frame` (belt and braces).
- **Grep for the same pattern** anywhere else a size is read during the reveal: `getBoundingClientRect` inside `room3d/`, `spots/`, `hallway/`, `weather/` and `games/ArcadeRoom`. Fix every occurrence used for layout.
- **Test (unit, jsdom):**
  - mock `getBoundingClientRect` → 1478 and `clientWidth` → 985;
  - assert `--fw: 985px`, `--d: 591px` and `--persp: 936px`.
- **Test (e2e, real animation on, reduce-motion off):** open Meeting Rooms, wait 1 s, and assert that the screen's bounding rect is fully inside the back face's bounding rect (all four edges, with 2 px tolerance) at 1440×900, 1900×1000 and 390×844.

## F2. The back-wall screen: most of the wall, clickable, nothing clipped

After F1, apply v12's size:
- **`.cm-r3-screen` box:** `left:5%; right:5%; top:5%; height:74%`. Hide `.stand`; the screen is wall-mounted. The wainscot is the bottom 16%, so the screen sits just above it.
- **Font scale:** `.k` .026, `h3` .05, `p` .028, `.b` height .07 / font .03 / padding .03, `.pts` .026 (all × `--fw`).
- **Other board styles:** scale the custom boards by the same 1.35×. These are `cm-hall-board-rows`, `cm-ev-*`, `cm-ag-*`, `cm-plans-*`, `cm-arc-line`, `cm-ls-*` and the Chow craving grid.
- **No clipping:**
  - `h3` keeps its 3-line clamp and `p` its 2-line clamp;
  - every button uses `white-space:nowrap; max-width:100%; text-overflow:ellipsis`;
  - add a **fit pass**: if `.inner`'s `scrollHeight > clientHeight`, step the font scale down in 5% increments to a minimum of 80%.
  - **Test:** no `.cm-r3-screen *` element has `scrollWidth > clientWidth + 1`, in every room.
- **Clickable:**
  - the body opens the section (unchanged);
  - every button works;
  - `cursor: zoom-in`, plus a hover lift: `filter: brightness(1.03)` and a slightly stronger shadow.
  - **e2e:** click each room's screen body and primary button.

## F3. Left walls: one board in every room (the v3 rule), from real data

Today only Classroom, Project Studio, Cert Prep, Admissions, Game Room and Chow Hall draw anything. `usePageSummary` returns `plainSummary()` with `sideTop: null` for the rest, and the wall renders nothing.

Give every building its left-wall board, as the design's `PAGES[id].A`:

| Building | Board title | Rows (real source) | Empty state |
|---|---|---|---|
| Library | 🔖 Saved for later | Saved / in-progress items with % read, from the same store `GlobalLibraryPage` uses | "Nothing saved yet · Save a guide to see it here" |
| Schedule (`tower`) | 📅 Today | Today's plan steps (`campusPlan`, the same as the side panel), with done ✓ | "Nothing else on today" |
| Events Hall (`amphi`) | 🎟 Coming up | Next 2-3 events (`useCampusEvents`) with Central day and time; your RSVP shows ✓ | "No events scheduled" |
| My Progress (`observatory`) | ⭐ Your points | Builder / Learning / Community XP, from the classroom feed's `progression` (already fetched for the Classroom) | Hidden only while loading |
| Showcase Gallery | 🖼 Portfolio | Published / Drafts counts, from the portfolio API `PortfolioPage` uses | "Nothing published yet" |
| Career Center | 👥 Your team | Team name and standup time, if the career page has them | "Not assigned yet" |
| Meeting Rooms | Doors 1-3 (F4) | none | none |
| Game Room / Chow Hall / Admissions / Classroom / Project Studio / Cert Prep | Unchanged | none | none |

- **No source for a row?** Leave the row out. Never fake one.
- **No board at all?** If a building has no data for its board, the wall still gets the board with its empty-state line plus "Open ‹section› →". It is never a blank wall.
- **Where it lives:** add `librarySummary`, `scheduleSummary`, `eventsSummary`, `progressSummary`, `portfolioSummary` and `careerSummary` to `pageSummary.ts` (pure, unit-tested), and wire them in `usePageSummary`.
- **Fidelity test:** every building except `commons` has `[data-testid="cm-wall-board"]` or its custom wall piece inside `.face.left`.

## F4. Meeting Rooms: six doors, always

**Today:** `hallwayDoors()` draws one door per live, booked or your-own room only. With three rooms, the right wall is empty. The design always has six doors: 1-3 on the left wall, 4-6 on the right wall under the high window.

- **Fill to six.** After the real doors (order unchanged), add **free doors**: `state: 'free'`, plate "Room ‹n›" and "Free · open it". Clicking one opens `openMeetSheet({ mode: 'new' })`. This is a real action and invents no room, people or booking.
- **The "More rooms →" sixth door** still applies when there are more than six real doors.
- **Right wall:** the window uses v12's high strip (`.cm-win.is-small` → `left:4%; right:4%; top:3%; height:28%`, no 4/3 aspect). The doors sit at the bottom (`height:66%`), so they never overlap the window.
- **Door plates** use `--fw` and need F1. Once fixed, check that the plate text isn't clipped. Plate names ellipsize and states never wrap.
- **Tests:**
  - unit: `hallwayDoors` with 0, 3, 6 and 9 rooms returns 6 doors each time (free filler / More rooms);
  - e2e: Meeting Rooms has `cm-door-1` to `cm-door-6`, and three of them are inside `.face.right`.

## F5. The window: big, and it shows the real neighbours

The angle maths in `weather/windowView.tsx` matches the design (positions agree with `campusMap`). The **drawing** is what doesn't read:

1. **Size.** Use v12's box: `left:4%; right:4%; top:5%; height:70%` of the right wall. Drop the fixed `aspect-ratio:4/3` and use the height instead. Hide the sign line under it; the tooltip and `aria-label` keep "Outside: … · Looking out at …".
2. **Recognisable mini buildings.** Today each one is a generic CSS box: a cream wall in the same colour as the window frame, so it disappears, with a triangle roof and one window. Port the design's `miniBldg` / `miniLandmark` SVGs as React components:
   - **height:** from the building's real `w/h`;
   - **roof:** by `kind` (pediment / gable / tower → triangle, dome → arc, arcade → neon bar, amphi → two tiered arcs, office / flat → slab), in the building's map colour (`art(id)`);
   - **walls:** a grid of window panes, lit at dusk and night;
   - **wall colour:** glass blue for `office` and `pavilion`, dark purple for `arcade`, otherwise warm white with a thin outline;
   - **landmarks:** pond, fountain, board and gate get their own small SVGs.
3. **Layout inside the glass.**
   - Keep `left = 50 + (a/1.1)×38 %`, `width = clamp(22, 9000/(d+60), 58) %` and `bottom = max(6, 22 − size/3) %`, drawn back to front.
   - Hills are behind the buildings, and the buildings stand on the hills.
   - Clouds, rain, snow and fog are drawn in front.
4. **Sanity table.** Unit-test these against the map. Each must be the nearest item in its window:
   - Classroom → Project Studio;
   - Library → Schedule;
   - Schedule → Classroom;
   - Meeting Rooms → the fountain / the Community Board;
   - Chow Hall → the Main Gate;
   - Career Center → the east-edge skyline.
5. **Fidelity view:** add `31-room-windows`. It renders Classroom, Library and Meeting Rooms with a fixed weather (clear day) and compares against `room-fix-screenshots/v12_*.png` at a loose tolerance.

## Acceptance

- **F1 test:** the room's `--fw` equals the frame's layout width at every viewport size, while the reveal animation is running.
- **Fidelity views:**
  - `20-room-*` (every building), 1440×900 and 390×844: the screen sits inside the back wall, nothing is clipped, the left wall has its board, and the window is large and inside the right wall.
  - Meeting Rooms shows doors 1-6.
- **Manual check on Ali's account:** take before/after screenshots of Meeting Rooms, Library, Classroom and Events Hall, and attach them to the PR.
- `tsc --noEmit` is clean, and there are no console errors.

## Ask Ali before shipping

- Free filler doors: is "Room ‹n› · Free · open it" OK, or should they say something like "Empty room"?
- Career Center's "Your team" board: is there a real team or standup source yet? If not, ship the empty state.
