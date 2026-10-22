# Colaberry Campus: design parity build prompt

**For:** Claude Code, working in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
**Owner / DRI:** Ali Muwwakkil
**Written:** Thursday 2026-10-22, Central time, against `main` at `8ccd5e46` (merge of PR #3292)
**Companion file:** `CAMPUS_GAP_ANALYSIS_DETAIL.md` (every gap, with design line numbers and `file:line` evidence). Put both files in `docs/design/campus/` before starting.

---

## 0. How to use this prompt

You are continuing the Colaberry Campus build. The goal is a live Campus that is **identical to the design**, except where Section 2 (owner requirements) overrides the design, or where Section 3 records a decision Ali has made.

- **Design source of truth:** `docs/design/campus/colaberry-campus.html` (single-file prototype, 3,628 lines). CSS is lines 9-1034, markup 1035-1354, JS 1355-3626. Lines 1072, 1189 and 1337 are ~59 KB base64 blobs: never read them whole. Design line numbers below are written `D:1234`.
- **Implementation:** `frontend/src/components/campus/**`, `frontend/src/pages/portal/campus/**`, `backend/src/services/campus/**`, `backend/src/routes/campusRoutes.ts`.
- **Repo rules still apply:** root `CLAUDE.md` and `frontend/CLAUDE.md` (session ID + `docs/sessions/CC-<id>.md` on every commit, typed props, no hex outside tokens, no `react-hooks/exhaustive-deps` disable comments, tests first, brief-me block at the end of every reply).
- **Run the design** next to your work: open the HTML file in Playwright (Python Playwright and Chromium work in the sandbox). Click "Tap your ID to enter campus" to reach the map. The "Viewing as" menu top right switches Enrolled learner / Explorer / Sponsor (= business) / Staff, and Campus / Workplace look.
- **Run the build:** follow `tests/systemV2/campus-stack.md`. Two things that doc does not tell you (found 2026-10-22):
  1. The backend does not boot until you install four packages it imports but `backend/package.json` does not list: `pdfkit`, `adm-zip`, `@microsoft/microsoft-graph-client`, `@modelcontextprotocol/sdk`. **Add them to `package.json` as part of this work** (it is a real bug, not a local quirk).
  2. Without Docker, run Postgres 16 directly (`initdb` + `pg_ctl` as the `postgres` user, data dir outside the repo).
  3. The seed logs foreign-key errors creating the Reese/Dara/domain-agent records; desks still show. Fix or document.
- **Screenshots:** `scripts/captureCampusLocal.js --fidelity` currently passes 88 of 88 views. **That pass does not mean parity**: the checklist only asserts that test IDs exist and lists many differences as `known`. Every work package below adds or tightens assertions so the gate fails until the gap is closed, and shrinks the `known` list in `tests/systemV2/lib/campusFidelityViews.js`.

Work in the order of Section 4. Ship each work package as its own PR (small, reviewable, behind the existing `CAMPUS_ENABLED` allowlist, which today is Ali's account only). Do not turn the campus on for anyone else; that is Ali's call (`directives/run-campus-pilot.md`).

---

## 1. The real-data rule (read before building anything)

The design is a prototype full of invented people, events, KPIs and dates. The team's standing rule (see the header of `tourSteps.ts`, `campusArrival.ts:329-333`, `campusMap.ts:165`, and the `known` lists in `campusFidelityViews.js`) is **never ship invented data**. Keep that rule. "Identical to the design" means:

1. **Identical layout, components, motion, states, copy patterns and interactions.**
2. **Filled with real data** wherever an API exists or can be added cheaply. Most "deliberate omissions" today have a real source that nobody wired up (listed per item below as **Real source**).
3. **Honest empty states** where no real data exists, styled exactly like the design's populated component (same card, same position) so the layout never collapses.
4. Items that cannot be made real without a product decision are listed in Section 3 for Ali. Do not build them until he decides.

---

## 2. Owner requirements that override the design

These two come straight from Ali and win over the prototype wherever they conflict.

### 2.1 The map recenters itself every time

**Rule:** every time the learner comes back to "the campus" state, the camera eases back to the whole-campus framing (`baseView`), fitted to the space left by the side panel(s). A manual pan or zoom is temporary: it survives only until the next return event.

The design already does this (`baseView` D:1737 via `closePanel(true)` D:1830 / `flyOut` D:2373, on resize D:3615). The build recenters only on first mount and on resize-if-untouched.

**Return events that must recenter (eased, about 1 s settle, ease 0.06 per frame like D:1730; instant under reduced motion):**

| # | Event | Build today | Where to fix |
|---|---|---|---|
| R1 | Close the building card (x, "Back to the Quad") | No recenter: `closeCard` only does `setOpen(null)` | `CampusWorld.tsx:90-94` |
| R2 | "Step outside" inside a room | Same path as R1 | `CampusWorld.tsx:153` |
| R3 | Esc with a card open | No recenter | `CampusWorld.tsx:114` |
| R4 | End or finish the tour | `endTour` only clears `tourIndex`; camera stays on the last stop | `CampusContext.tsx:144`, `CampusWorld.tsx:98-100` |
| R5 | Window resize / rotate | Re-bases only if `mode === 'base'`; any drag/zoom/focus sets `manual` and it never re-bases again | `useCampusCamera.ts:142` |
| R6 | Return from a portal page (Step outside, Campus crumb, mini-map, Where to, browser Back) | Opens `CampusMapOverlay`, a different map with no insets; avatar restarts at the gate and walks again | `CampusDoorTransition.tsx:56`, `CampusLayers.tsx:25-50`, `CampusBanner.tsx:64,78,93` |
| R7 | Phone tab bar "Map" on the campus home | Does nothing | `CampusTabBar.tsx:31`, `CampusHomePage.tsx:70` |
| R8 | Remount of `/portal/campus` | Re-bases, but instantly, and resets avatar to the gate and "here" to null | `useCampusCamera.ts:117`, `CampusWorldMap.tsx:154`, `CampusHomePage.tsx:52` |
| R9 | Entering through the gate | Camera already at base view; no zoom-out | Start at the gate close-up `{cx:500, cy:600, w:300}` and ease out at 0.035 starting 900 ms into the gate opening (D:3602) |
| R10 | Closing a person card, the Wayfinder, the list, the bell, the Me panel | No camera change (matches design) | Add: re-base if the camera is not at base (owner rule "each time") |
| R11 | Tab returns to visible after being hidden (`visibilitychange`) | Nothing | Re-base if no card is open |

**Also:**

- Expose `camApi.base({ eased: true })` from `CampusWorld` and call it from R1-R4, R7, R10, R11. Make `resize` call `base()` when no card is open and `focus(current)` when one is (R5).
- **Ignore drag, wheel and arrow keys while the avatar is walking** (design D:1750). Today a drag during a walk breaks follow mode and the avatar walks off screen (`useCampusCamera.ts:90,122`).
- **One map, not two.** Every "go to the map" from a portal page navigates to `/portal/campus` (with the target building in state) instead of opening `CampusMapOverlay`. Retire the overlay, or make it render the same home layout (top bar, side panel, insets). The design's `toCampus` (D:2550) closes the page onto the same map.
- **Continuity across pages:** keep the avatar position and the current building (`hereId`) in `CampusContext` plus `sessionStorage`, so returning from a page does not reset you to the gate. "Step outside" from a page returns you **inside the same building** with the arrival card open and the camera on that building (design D:2546), then R1 applies when you close it.
- Base-view insets must be computed from the **actual rendered width** of the left panel (and the right arrival card when open), not hard-coded numbers, because the panel is now always present (2.2).
- Keep the "Show the whole campus" button (`CampusZoomControls.tsx:14`) and **show it on phones** (it is `display:none` at `campusHome.css:128`).

**Acceptance (add to `campusCamera.test.ts` / `campusMotion.test.tsx` and a new e2e fidelity view `13-recenter`):** for each of R1-R11, drag the map 300 px and zoom twice, trigger the event, wait 1.5 s, assert the SVG `viewBox` equals `baseView(viewport, insets)` within 1 world unit. For R6 assert the URL is `/portal/campus`, the side panel is visible, and the avatar is at the building you left, not at the gate.

### 2.2 There is always a side panel with your next steps and the tours

**Rule:** in every campus state the learner can see a side panel that lists what they can do next, including the tour. Nothing ever hides it with `display:none`.

This **overrides the design**, which tucks the concierge while walking, while a building card is open and during the tour (D:1780, D:1830). Keep the design's look for the panel itself (`.cc`, 384 px, D:1135-1145, CSS D:63-98); change only when it hides.

**Where the build hides or lacks the panel today:**

| State | Build today | Fix |
|---|---|---|
| Building card open / inside a room | `CampusConcierge` gets `tucked` and `.cm-cc.is-tucked{display:none}` | Keep it visible. Card on the right, panel on the left, room view between them (`campusHome.css:42`, `CampusHomePage.tsx:59,92`, `CampusWorld.tsx:132`) |
| Person card | Hidden (`anyCard` includes `personCard`) | Keep it visible; design keeps it too (D:2573 popover) |
| Tour running | Hidden, and `CampusTour` replaces the building card | Keep it visible; tour card goes inside the arrival card (see WP-2) |
| My look panel | Hidden | Keep it visible |
| Map opened from a page (`CampusMapOverlay`) | No panel, no top bar | Gone once R6 is fixed (one map) |
| PortalShell pages | `CampusNav` left + `CampusRail` in the contacts column; the rail disappears if contacts are collapsed (`PortalShell.tsx:276-281`), is squeezed to 66 px at <=1200 px (`TodayShell.css:610-612`), and both vanish at <=820 px | Render `CampusRail` regardless of `contactsCollapsed`; give it its own column; at narrow widths collapse to a "Next steps" drawer button in the campus banner, never to nothing |
| Legacy `PortalLayout` pages (`/portal/classroom/week/:n`, `/portal/curriculum/lessons/:id`, `/portal/sessions`, `/portal/assignments`, `/portal/progress`, Showcase gallery) | `CampusScopedChrome` renders only the banner: no side panel, no rail | Render the same side nav + rail (design `.pg-side` / `.pg-rail`, D:1176-1211, CSS D:322-405) |
| Phone | Bottom sheet hidden when a card opens | Collapse to a peek strip (about 64 px: "Next: <step> · Tour" with a drag handle) instead of hiding |

**What the panel always contains, in this order** (design content, real data):

1. Kicker + greeting + lead (time-aware lead, see WP-4).
2. **Up next**: the urgent card if something starts within 15 minutes (D:1868 `#urgent`, "Run there" / "Skip the walk"), otherwise the next unfinished plan step with a Go button.
3. **Here at <building>** (only when you are at a building): that building's next actions, i.e. the plan box with "Open the card" / "Mark done" (WP-2), the primary CTA, and the tour stop if touring. This keeps "next steps" in the panel while the right card shows the building details.
4. **Tour card, always present, three states** (D:2764-2766): "What's in your seat? A 3-minute walk through the 9 places your enrollment unlocks, including a few most people miss. [Take the tour]" / "Tour in progress · Stop n of 9 · <building> [Resume]" / "You've seen everything in your seat · take the tour again". Explorer and partner variants per D:2758, D:2762. Real counts from `tour.stops.length`.
5. Today's plan card (built; add the type/duration line, WP-2).
6. Right now list (WP-4).
7. Help desk chips, I want to... chips, Campus directory toggle (D:1142, D:1888-1892).
8. Photo prompt (WP-7) until a photo exists.

On portal pages the rail shows: people in this building, Today's plan, **Up next**, **the tour card** (the design rail has no tour; Ali wants it), Help desk.

**Acceptance:** new fidelity assertion on every view (01-12 plus new ones): `[data-testid="cm-concierge"]` or `[data-testid="cm-page-rail"]` is visible and contains `cm-cc-tour` (or its resume/done variant) and at least one next-step action. Unit test: `CampusConcierge` never receives a prop that sets `display:none`.

---

## 3. Decisions for Ali (do not build these until he answers)

Each has a recommendation. Record the answer in `docs/design/campus/DECISIONS.md` and update `campusFidelityViews.js` `known` to match.

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | Ambient classmates walking the paths (D:3229 `setupAmbient`). Not in `known`, so currently an unrecorded gap. | (a) drop; (b) animate **real** present people: idle near their real building, walk when a presence poll shows they moved | (b) |
| Q2 | Live building: design uses the Classroom; build uses Community Lounge because broadcasts join through `room_id` | (a) keep Commons; (b) map a broadcast to the Classroom via its session/cohort | (b) if the broadcast record can carry `session_id` |
| Q3 | Byte Chase and Launch Lab are deliberately different from the design for IP distance (engine headers) | (a) keep originals, redraw design art for them; (b) match the design | (a) |
| Q4 | Crown (2,000) and jetpack (3,000) unlocks need a points ladder above the top rung (`campusUnlocks.ts:7`) | (a) extend the ladder; (b) leave out | Ali's call |
| Q5 | Numeric "Lv 7" vs rung name "AI Enabled II" in the top bar, pin and cards | (a) derive Lv N from rung index; (b) keep rung names | (a), with the rung name in the tooltip |
| Q6 | Chat on the campus home (inbox 💬, chat heads, chat panel) is `known` as "messages stay on Today" | (a) keep; (b) build the design's chat on the home using `/api/portal/dm/*` | (b): data and `MessagesButton.tsx` already exist |
| Q7 | Help desk press: design opens a staff popover; build walks to the desk building (`known`) | (a) keep walk; (b) popover with "Visit the desk" | (b), matches design and keeps the walk as a button |
| Q8 | Maya: build uses the website chat widget (C6 decision); design has Maya as an in-campus DM with greeting, toast, handoff, book-a-call | (a) keep widget; (b) in-campus Maya | Ali's call (C6 was his) |
| Q9 | Gate streak: design claims the streak on Enter (+5 pts); build only informs (`known`) | (a) keep; (b) claim via `POST /api/portal/streak/claim` | (b) |
| Q10 | Explorer tour end: design auto-creates an admissions handoff; build requires opt-in (Ali's consent decision) | keep opt-in | keep opt-in, but add Maya's end-of-tour toast and the "Finish · see what you'd unlock" sheet |
| Q11 | Staff "Needs attention" list (design invents flags) | (a) keep Management Portal links; (b) build an at-risk service from attendance, task age, inactivity, repeated mentor questions | (b) as its own backend project |
| Q12 | Sponsor pages `/sponsor/dashboard`, `/seats`, `/demo-day`, `/digest` inside campus chrome; Nudge, Reclaim seat, digest need new endpoints | (a) build dashboard + invite + CSV now from `/api/portal/org/*`, defer the rest; (b) all | (a) |
| Q13 | Explorer course (`/portal/curriculum` redirects to Today) and Explorer "path to enrolling" ticks | needs product decision on the Explorer course | Ali's call |
| Q14 | "Show which building I'm in" setting (needs a presence-sharing flag) | build / skip | build: small backend flag on `/campus/here` |
| Q15 | Live reactions, captions | need a reactions channel / transcript stream | defer; build only the viewer's own reactions locally if Ali wants the motion |

---

## 4. Work packages, in build order

Each package lists the gaps (IDs refer to `CAMPUS_GAP_ANALYSIS_DETAIL.md`: A = gate & world, B = camera & panel, C = cards/interiors/pages, D = tour/plan/staff/chat, E = live/games/me/personas), the real data source, and acceptance criteria. Before each, screenshot the design state and the build state side by side and attach both to the PR.

### WP-1. Owner requirements (Section 2)
Recenter R1-R11, one map, continuity, always-on panel, phone peek strip, rail on all page types. Fix `CampusRail` collapse/width. **Ship first.**

### WP-2. Arrival card, tour and plan (the core loop)

1. **Arrival card shell** (C1.1): `top:76px` (it currently overlaps the top bar at `top:16`), open 420 ms after arrival, slide-in .55s, dim other buildings `.bld.dim{opacity:.45}` while open (A6.7).
2. **Hero** (C1.2-1.4): kicker variants (zone, tour "<tour> · stop n of N", Explorer "🔒 Members only · you can look inside" / "Demo mode · look around" / "preview", partner, live); short `sub` line per building from the design catalog (D:1449-1504), not the long tour sentence; remove the extra access chip.
3. **Happening here** (C1.7) with real rows: next live class countdown (`GET /api/portal/sessions`), next event (`/api/portal/events`), plan minutes (`/api/portal/cape/today-plan`), points and rung (`/campus/look`), knowledge check status (cert prep), break time left (`useGameTimeCap`), people here (presence). Fall back to "quiet" only when none apply.
4. **CTA** with urgent override "<thing> · go now", route line with host prefix `enterprise.colaberry.ai/portal/...` (C1.8-1.9).
5. **Plan box** (D2.4, C1.19): "① TODAY'S PLAN · STEP n OF N", title, "<type> · <minutes> · +pts", "Open the card →" (`/portal/runtime/:cardId`) and "Mark done" (`POST /api/portal/runtime/today/:cardRef/interact` with `complete`). On complete: points burst + cheer "+n pts · <title>" then "🗺 Next: <title> · <building> [Go]" (D:3344-3348).
6. **Tour inside the arrival card** (D1.4-1.11): numbered red circle, access tag in the kicker row, "YOU CAN" arrow list, dashed 💡 tip box, nav row "End tour · dots · Next: <next building> →" / "Finish tour ✓" / Explorer "Finish · see what you'd unlock →"; no Back button; no separate end card. Show the interior room during each stop (`CampusWorld.tsx:152` currently suppresses it). Off-route state "Back to the tour · stop n →" (D:2793). **STOP n badges** on every tour building, current one green (D:1853-1863). Hide the plan route during the tour. Persist tour index and "toured" flag (localStorage per account) so Resume and "take the tour again" work; finishing sets the panel lead (D:2884).
7. **Tour copy** back to the design wording where no invented data is involved ("Your classroom", "Knowledge on demand", "Your path & points", "Your portfolio builds itself", "What's in your seat"); fill figures from real data where possible (current week, next class time, verified %); otherwise drop the clause, keep the sentence shape.
8. **Plan on the map** (D2.2-2.3): one continuous **teal** dotted marching path (`#0f766e` token, dash 1 8) from the avatar through each unfinished stop via `walkPath.routeTo`, hidden while walking, touring or live; small numbered pins at each building's top-left (✓ green done, filled teal next, outlined otherwise), clickable to walk. Replace the red hub spokes and the STOP pills.
9. **Plan rows** (D2.1): "<Building> · <type> · <minutes>" from `estimated_time`/`type` (not mapped today in `campusPlan.ts:30-40`); map plan item types to the right building (lesson → Classroom, knowledge check → Cert Prep, project → Studio) instead of all to Schedule.
10. "Walk the route on the map" button on Today (D2.7).

**Acceptance:** fidelity views 03/04 assert plan box, tour card inside `cm-arrive`, interior visible during tour, STOP badges; unit tests for plan-route geometry starting at the avatar.

### WP-3. Travel feel and map dressing (pure front end)

- Walk speed 330 u/s, run 560, times ride speed (board 1.35, cruiser 1.9), ease-in-out-quad, min 600 ms (A7.6; `CampusWorldMap.tsx:37` is 900 linear).
- Red dashed marching route line while walking, footstep dots every 140 ms fading over 1.6 s, destination `.hl` highlight, "Walking to X…" / "Skating / Driving to X…" toast with **Skip** (A7.7-7.10).
- Gate: fade `.is-done` before unmount (class exists, never applied), camera zoom-out (R9), concierge slide-in timed to 1.9 s (A1.22).
- Big transparent hit rect `w+32 × h+74` per building (A6.4); arcade neon CSS (A6.3: classes emitted, no rule); Explorer-locked buildings desaturate `saturate(.35) brightness(1.06)` not fade (A2.6).
- Pin: photo in the head (A7.2), **initials from the name, not the email** (bug: `useWorldStage.ts:28` uses `readParticipant().initials`; pass `facts.initials`), "Lv N" badge (A7.4), account colour (A2.5), ride shown whenever equipped.
- Urgent ping ring on the building of anything starting within 15 min (A6.5); learner time badges ("Class in 1d 3h", "In 15d", "1 live") from real sessions/events/plan (A6.8).
- People chip click opens the **peek** popover (A6.9, C3.5); presence-down shows "—" on chips (A9.4); sponsor "N · M yours" with teal dots. **Remove the extra row of person tokens under every building** (A6.12, not in design) and move them into the peek.
- Quiet-hours night look `#map.quiet` when nobody is online (A5.6).
- Mini maps: simplified schematic (grey blocks, current building coloured, pulsing pin, emoji icons, locked grey, unread counts, click to walk) for the banner tile and page side map (A11.1-11.2).

### WP-4. Side panel content, top bar, Wayfinder, points feedback

- Kicker per audience: Explorer "EXPLORER · VISITOR PASS", partner "PARTNER VISIT · <company>", staff "STAFF VIEW · EVERY BUILDING", Workplace "IN THE LOBBY" (B.2). Company name from `campusTeam.ts` managed org.
- Greeting: "Good morning" before noon including 0-4 AM (`useHomeFacts.ts:38-42` says evening); business "Welcome, <first>." (A1.4-1.6).
- Lead: time-aware ("Nothing is starting soon, so this is focus time." / "Live class starts in a few minutes."), per-audience copy D:1849-1850, after-tour line (B.2).
- Pulse: Explorer "N people on campus · K Explorers like you", partner "X of your N people on campus · M learners in all", quiet variant clickable to Reese (B.2, E P3).
- Help desk sub-labels "Mentor / Curriculum / Admissions"; hidden for business (A2.7).
- Right now list (3 rows, icon tile in building colour, hover highlights the building) from real plan / sessions / live rooms; sponsor "Your team on campus right now" from team presence (B.2).
- Urgent card (D:1868), Campus directory toggle (D:1888).
- Chips: sponsor copy "See where your team…" (`CampusConcierge.tsx:127`).
- Top bar: "Lv N" chip (Q5), avatar photo, 💬 inbox (Q6), Explorer level, `/` kbd hint; brand "HQ" in Workplace.
- **Wayfinder modal** (E §6): centred palette over a blurred map, opens on the pill, `/` and Cmd/Ctrl+K; empty state groups Happening now / Suggested / Staff · always on / All buildings; keyword synonyms (design `keys`), multi-token AND, people and staff results with avatars; result rows with icon and action label (Walk / Run / Message / View / 🔒 Peek); a room pick **walks** there and flashes the room in the card; a person pick opens their card; visible no-results line; footer hints; search logging endpoint (feeds staff search insights, Q11).
- **Points feedback** (D5.2): diff `look.points` after any server-side earn; "+n pts" burst under the pill, cheer queue top-centre, unlock cheer "<icon> Unlocked: <item> · now showing on your avatar [Locker]", level-up cheer. Welcome-back cheer "You were last at <building> [Go back in]" (A1.24).

### WP-5. People, person cards, interiors

- Who's here: "Who's here · N + staff", staff chips first with gold STAFF tag, up to 8 first-name chips with Lv chip, "+N more" → peek, "Nobody yet. You're first in.", design down-state copy (C1.10, E P4).
- Person card as a **popover at the click point** (300 px, clamped, top ≥ 76, phone sheet, outside-click close): cohort line, "Lv n · pts", gear icons, "Here with you" vs "In <place>", Message / Wave / Walk over (hidden if here) / Profile ↗ (`/portal/community/people`), Reese hint in the disabled note, Explorer note (C3.2, E P6).
- Staff popover (Q7) and sponsor teammate card from `/api/portal/org/members/:id` (C3.4, E S7).
- Interior figures: gear accessories and numbered level coin (`CampusPerson.gear`, `rung_name`), teal team ring for business viewers, gold ring for staff, red lanyards in studio/career/gallery, name tag on hover except you/team (C2.6, A12.2-12.4). Clickable "Ask <name> anything" bubble (C2.7).
- Wall features with **real** text instead of grey bars: Schedule board from sessions/events/plan, Sprint wall from the learner's project tasks with a YOU mark, Gallery screens titled from portfolio items, Events banner from the next event, Classroom screen from current week/topic; observatory label "YOUR SKILL CONSTELLATION" (C2.12-2.19).
- Arcade cabinets: game art, "▶ TAP TO PLAY", "BEST n", clickable (C2.20).
- Walk-to-door then curtain then page; on return walk back to the seat (C2.22, design D:2387, D:2546).
- Restore "🔒" in "MEMBERS ONLY" and the lock overlay; partner "PARTNER VIEW · YOUR TEAM IN TEAL" tag; preview tag green.

### WP-6. Colaberry Live (data already in discovery, unused)

`DiscoveryBroadcast` already carries `editorial_state`, `content_started_at`, `scheduled_start_at`, `preview_seconds_remaining`, `offer_upgrade` (`hooks/useBroadcastDiscovery.ts:44-56`).

- States backstage / live / reconnecting / replay with per-state classes (`ls-*`), marquee pill on a post over the live building with a 1 s timer ("DOORS OPEN · 0:14", "● ON AIR · 4:12", "RECONNECTING", "▶ REPLAY") (A10.4-10.5, E L2-L4).
- Live bar: state chip, title + timer, **Walk in** (walks the avatar, run when late; "You're here" when there), Watch here / ⏸ Watching, dismiss × (E L10).
- Concierge live card with compact stage, Watch/Stop, chime opt-in (`broadcastLaunchCue.ts` already has `readSoundOptIn/writeSoundOptIn/playChime`), Explorer preview line, sponsor team-in-hall line (E L11).
- Arrival card live dressing: hero in state colour, stage with backstage countdown / reconnecting / watch-here overlays driving the real `LiveMiniPlayer`, per-state CTA (Check in / Join the live room / Open the replay), rooms swapped to Live room / Class check-in / Week lessons (E L12-L13).
- Launch cue + chime on the campus home (the home hides `.lnb`, `campusHome.css:147`) (E L9). Explorer preview countdown pill and "preview ended" overlay (E L16).
- Auto check-in when you walk into the live building while live (`POST /api/portal/sessions/:id/join`, idempotent) needs broadcast → session mapping (Q2) (A4.4).
- Gate sub line during live (A1.9).

### WP-7. Me panel and photo

- Full-body figure preview with gear and level (reuse `interior/RoomFurniture.tsx` `Figure`), "Lv n" chip, progress bar from the previous unlock to the next with icon, "Everything unlocked" line, sponsor/staff lines (E M2-M3).
- In-panel photo upload, square crop to 128 px client side, `POST /api/portal/settings/avatar`, applied everywhere at once (top bar, pin, gate ID, cards, room figure) (E M4). Photo prompt card in the panel (A3.5).
- Locker as a 4-column icon tile grid ("✓ Wearing" / "Wear it" / "Ride it" / "🔒 n pts") (E M6).
- Entrance setting adds "Every time" (A1.23). "Show which building I'm in" (Q14).
- Me panel reachable from portal pages and from unlock cheers (E M1).

### WP-8. Game Room on the campus

- Arcade arrival card: break meter with bar and copy (capped state), 3 game rows with art thumbnails, "Your best · #rank this week", Play / "Back tomorrow", leaderboard tabs per game (E G2). Data: `/api/portal/game-room/time`, `/scores?game=`; add `me: {best, rank}` to `GET /scores` (E G7) and `avatar_url` + `rung_name` to board rows (E G8).
- Play in a cabinet modal over the map: header pills (score, ♥ lives · level, ⏱ time left, red under 1 min), Esc to pause/leave, per-game help text (E G3).
- Game-over sheet: new personal best / game over / break's over, rank, time left, Play again, "Back to work: <next plan stop> →" (walks there), Game Room (E G5).
- Game Room page re-laid out as the design's `arcadePanel(true)`: meter, three game cards side by side, leaderboard (E G9). New art for the build's own games (Q3).

### WP-9. Personas

- **Explorer:** pass with the design's feature lists (not building names), owner name, tour button inside the pass with its three states, path-to-enrolling rendered (it is computed in `campusPath.ts:30-31` but never shown), seat-code link (`POST /api/sponsor/redeem`) (B.2, E X1-X2). Locked-building box: lock chip, "Included for you" line, "Look around in demo mode", "See events instead", "Ask Maya about enrolling", "Members inside · N"; hide standard sections (C1.14). In-campus sign-up sheet (D:1238-1262) with per-origin kicker; "Talk to admissions first" uses the existing Growth Journey handoff (A4.7). Copy fixes: "Pick up your pass & explore →", "Or take the 3-minute tour →".
- **Business (sponsor):** per Q12. Gate and panel with company name and "X of your N people" (team size via a small endpoint over `teamEnrollmentIdsFor`), team card tiles (seats from `Sponsor.seats_purchased`, on campus from presence; Certified / Demo Day per Q12), "Your team on campus right now", partner arrival body (what your team does here, team rows with lesson % and status pill from `/api/portal/org/members`, privacy note, "Tour from here"), sponsor person card, invite sheet (`POST /api/portal/org/invites`), CSV export client-side, Partner Office rooms (A1.11, A3.2, C1.16, E S1-S16).
- **Staff:** per Q11; until then keep Management Portal links but lay them out as the design's staff card (B.2, E T1-T9). Staff gate stripe colour `#0f5132` token (A1.14).
- **Workplace look (map art, not just labels):** paving ground, quad lawn `#ddd6c9`, gate lawn `#d7d1c5`, "THE PLAZA", "LOBBY", slate roofs `#5d6876`, minor trees hidden, brand "HQ", "Back to the Plaza", lobby gate with skyline and red lanyard badge (straight card), interiors re-skinned, sentence-level copy rules (`WRULES` D:1450: classmates→colleagues, cohort→team, class→session, campus→HQ) applied to panel, cards, tour and live copy (A2.8, A1.18, C2.3, E W1). Restore "Collab Café".
- **District names for every account:** career → "Internship Office" (🏙, "Engagements, internship & company work"), gallery → "Portfolio Gallery" ("Portfolio & client demos") (A2.3). The design's live screenshots show these names; the build shows "Career Center" / "Showcase Gallery".

### WP-10. Pages, rooms, list, notifications, chat

- Room catalogue per building to the design (C §6): "Week N lessons" (`/portal/classroom/week/:n`, real week), "Classroom home", "Sprint board / My tickets" labels in the district, "My path", "Live rooms", "Client preview", Management Portal room for members with mgmt access (`useIsMgmt`) (C §10). Map unmapped routes (`/portal/runtime/:id` → the plan step's building, others → Schedule, like `bForRoute` D:3485) so every page gets a trail, side and rail (C §11). Trail room labels for runtime cards and week pages (C4.4).
- Banner: building crumb steps back **inside** the building (C4.4); Next button tour/urgent variants and walks on the map (C4.6); `/` hint (C4.3); page hint auto-hides after 4.2 s (C4.14).
- List view: design dialog (round ×, no extra buttons), plan rows with number/✓ and building, compact "sub · N here · N new", locked → single "See what enrolling unlocks", keyword filter, "HQ directory" in Workplace (C §7).
- Notifications: "📍 <Building> · ago" line, per-building red count pins on the map that open the panel, clicking walks to the building and flashes the room (D4.13). Map notification types to buildings via `buildingForPath`.
- Chat (per Q6): inbox popover (Staff · always on / Recent / In <building> with you), chat panel with AI STAFF header, role line, system line, location strip with Walk over, "📍 Share where I am" (needs a message metadata field or text prefix on `/api/portal/dm/:roomId/send`), chat heads, unread badges, typing (D §4). DM toast: avatar, "In <place> · just now", the message text (already fetched in `useCampusDmToasts.ts:21,71`), Reply / Walk over, dark style (D4.9). Structured action buttons on AI replies need an `actions` field on agent messages (D3.6).
- Staff desks: role lines ("AI mentor · Student success"…), per-desk colours, design prompts including Explorer-specific ones (D3.1).

### WP-11. Copy pass and final fidelity

Go through the design's strings for every audience and look, and match them except where they state invented facts. Then update `campusFidelityViews.js`: one view per state in this prompt, assertions for the new elements, and a `known` list that contains only Section 3 items Ali declined. Produce the side-by-side review HTML (`/screenshot-review` skill) with design vs build for every view and audience, desktop 1440×900 and phone 390×844.

---

## 5. Definition of done for the whole effort

- Every row in `CAMPUS_GAP_ANALYSIS_DETAIL.md` is BUILT, or DELIBERATE with an answered Section 3 decision recorded in `DECISIONS.md`.
- Section 2 acceptance tests pass (recenter R1-R11, panel visible in every view).
- `tsc --noEmit` clean; campus unit tests and `campus.e2e.js` green; the fidelity run fails if any required element is missing.
- Side-by-side review doc shows no visible difference for the enrolled-learner campus look at 1440×900 except Section 3 items.
- Shipping ladder reported honestly per PR: built, tested, merged, deployed (Ali's account only), production-verified.
