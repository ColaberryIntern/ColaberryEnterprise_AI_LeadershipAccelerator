# Campus v13: make Today the explorer's home base

**For:** Claude Code in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
**Owner / DRI:** Ali Muwwakkil
**Written:** Sunday 2026-10-25, Central

**Run order:** after `CAMPUS_ROOM_FIX_PROMPT.md` (C40-C46). It is independent of that work, so it can run in parallel on its own branch, `campus/v13-today-explorers`. One PR.

**Design source:** `docs/design/campus/colaberry-campus-v13.html`. Commit it with this file, plus `docs/design/campus/v13-screenshots/`.
- The design opens in the **Explorer** view.
- The green **EXPLORER · PREVIEW ▾** chip in the top bar switches to the Member view. It's a prototype-only control; the live build reads the real audience.
- `?as=member` opens it in the Member view.

**Same rules as before:**
- No invented data.
- Tests first, plus a session log on the commit and a brief-me at the end of the reply.
- Times in Central.
- The campus stays on Ali's account only (`CAMPUS_ENABLED`). The explorer view is reached by previewing as an explorer, as today.

## Why

For an explorer, Today (`/portal/today`) is the page that matters most. Today it's close to hidden:

| How you reach Today now | Problem |
|---|---|
| The Colaberry logo pill (`CampusTopBar.tsx` → `/portal/today?stay=1`) | No visible label. Only the `aria-label` says "open Today". |
| The Schedule tower's room list (`campusMap.ts`, `tower.rooms`) | The tower's primary button says "Open my schedule". Today is a secondary room. |
| The Main Gate card, "Start on Today" | The gate is an unlabeled arch on the map, so few people open it. |
| The phone tab bar (`CampusTabBar.tsx`) | Phones only. Desktop has nothing. |

On top of that:
- `useCampusLanding` sends the first Today visit of each tab to the map. That's on purpose, and we keep it, but nothing on the map points back.
- The explorer tour (`tourSteps.ts`, `ORDER.explorer`) never visits the Schedule tower.

## T1. A visible "📅 Today" button in the top bar (every audience)

**Where:** `home/CampusTopBar.tsx`, right after the search pill and before List.

- **Button:** a pill labelled **📅 Today** with a small count, "‹done› of ‹total›", from the same plan data the side panel's "Today's plan" uses (`useCampusPlan`). If there's no plan, show no count.
- **Explorer:** the pill is filled red with white text (`--cm-art-red` token, plus the existing pill shadow). It's the one primary control in the bar.
- **Member and staff:** a neutral pill, the same style as List.
- **Click:** go to `/portal/today?stay=1` (so the landing redirect never bounces it), using the existing page transition.
- **Phone (≤760px):** hide the count and keep the 📅 Today label. The phone tab bar already has Today. For explorers, put Today first in the tab bar and show it as active by default.
- **Accessibility:** `aria-label="Open Today: your next step, plan and events"`. Keep the logo's link to Today as is.
- **Tests:** the button renders for every audience; explorers get the `is-primary` class; it navigates to `/portal/today?stay=1`.

## T2. "Your Today page" card at the top of the explorer's side panel

**Where:** the explorer panel (`home/CampusConcierge.tsx` / `ConciergeCards.tsx`), directly under the greeting and lead line, above "people on campus", Coming up, Up next and the tour card.

- **Explorer card:** a whole-card button with a red border.
  - Kicker: **START HERE · YOUR HOME BASE**.
  - Title: **📅 Your Today page**.
  - Text: "Everything for today in one place. Come back to it any time with the red Today button at the top."
  - Up to four facts, each from real data and each **left out if there's nothing real to show**:
    - Next step: the plan's next stop title (`campusPlan`).
    - Today's plan: "‹done› of ‹total› done".
    - Coming up: the next event's title (`useCampusEvents`).
    - Help: "Maya, admissions · replies in seconds", only while Maya's desk is on duty (`useStaffDesks`).
  - A big red button: **Open Today →**.
- **Member and staff:** a slim row instead: "📅 Today · ‹n of m› done · your plan, events and next step", with **Open →**.
- **Panel order:** the card is always the first thing in the panel. That keeps the owner rule: the panel always shows next steps and the tour.
- **Tests:** the explorer panel's first card is `[data-testid="cm-today-card"]`; facts with no data are left out; clicking goes to Today.

## T3. Today lives visibly in the Schedule tower

**Where:** `campusMap.ts` and the arrival card.

- **Primary for explorers:** for the `explorer` audience, the tower's primary becomes `{ label: 'Open Today', route: '/portal/today' }`. Members keep "Open my schedule". Use the same audience-override pattern the gate and Admissions already use; don't fork the building list.
- **Explorer subtitle:** "Today, your home base · plus your schedule". The name stays "Schedule", so Workplace names are unchanged.
- **Map flag:** explorers see a small red **TODAY** flag above the tower spire, a speech-bubble pill with a pointer. Clicking it opens Today directly, without walking. It goes in the map art layer, uses art tokens, and is hidden for other audiences.
- **Arrival card (explorer):** a red-bordered tile at the top: "📅 **Today lives here** · Your next step, today's plan and events, on one page", with **Open Today →** and **Full schedule**. Today stays first in "Rooms in this building".
- **Tests:** the explorer tower card's primary is Open Today; the flag is present only for explorers; a flag click navigates without starting a walk.

## T4. The Main Gate says "Start here"

**Where:** `campusGate.css` and the map art.

- **Sign:** under the gate arch, a red pill sign **START HERE → TODAY**, for explorers only. The gate is already explorer- and staff-only.
- **Click:** opens Today. The sign is a button with an `aria-label`.
- **Gate card:** keep its existing "Start on Today" primary as is.

## T5. The explorer tour starts at Today

**Where:** `tourSteps.ts`.

- **Stop order:** `ORDER.explorer.stops` becomes `['tower', 'commons', 'library', 'amphi', 'lecture', 'studio', 'testing', 'gallery']`, so it has 8 stops.
- **Copy for the tower stop:** add it to the `EXPLORER` table. Keep every other stop's live copy.
  - Title: **Start here: Today**.
  - Body: "Today is your home base. Your next step, today's plan, events coming up and Maya are all on one page."
  - Tip: "The red 📅 Today button at the top brings you back here from anywhere on campus."
- **Stop 1 button:** stop 1's tour block gets an **Open Today →** button.
- **Labels:** the tour's name in the card and the rail is **Explorer tour**, not "What's in your seat?". The panel's tour card says "Take the explorer tour · A 3-minute walk through 8 places. It starts at Today, your home base."
- **Finishing toast (explorer):** "That's the campus, ‹first›. Today is always one tap away: the red 📅 Today button at the top."
- **Tests:**
  - explorer stop 1 is `tower`, with the new copy;
  - the member order is unchanged;
  - existing tour snapshot tests are updated in this PR.

## T6. Inside Today (explorer)

The Today page keeps its existing layout and data (`TodayShell`). For the explorer audience only, add three small pieces. The design's Today page shows the target arrangement.

- **Kicker** above the greeting: **EXPLORER · YOUR HOME BASE**.
- **🎟 Your explorer pass** card in the rail:
  - "Open to you" and "Peek inside" building lists, from the same `ExplorerAccess` table the campus uses (never hard-coded);
  - an **Ask Maya about enrolling** button that opens Maya's DM.
- **🧭 Explore the campus** card in the rail: "A 3-minute walk through what's open to you and what unlocks when you enroll", with **Take the tour**. It opens `/portal/campus` and starts the explorer tour.
- Don't change the members' Today page.

## Not changing

- **The landing rule (`useCampusLanding`).** Explorers still land on the map first. With T1-T5, Today is one obvious click away. See the question for Ali below.
- **Today's data.** Every number and title shown comes from sources Today and the side panel already read.

## Acceptance

- **Fidelity view `32-today-explorer`** (1440×900 and 390×844) shows:
  - the red Today button in the top bar;
  - the Today card first in the panel;
  - the TODAY flag on the tower and the START HERE sign at the gate;
  - the explorer tower card with Open Today;
  - tour stop 1 at the tower.
- **The same view as a member:**
  - a neutral Today button;
  - the slim Today row;
  - no flag and no gate sign;
  - the member tour unchanged.
- **E2E:** from the campus map, as an explorer, each of these reaches `/portal/today` without bouncing back to the map:
  - the top-bar button;
  - the panel card;
  - the tower flag;
  - the gate sign;
  - the tower card's primary;
  - tour stop 1's button.
- `tsc --noEmit` is clean and there are no console errors.
- **Screenshots:** before/after of Ali's account in explorer preview, attached to the PR.

## Ask Ali before shipping

- **Landing:** keep explorers landing on the map (recommended for now), or land them on Today with the campus one click away?
- **Red Today button for members:** members have the full map and an Up next panel, so the neutral style is recommended. OK, or should they get the red one too?
