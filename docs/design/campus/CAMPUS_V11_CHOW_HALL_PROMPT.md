# Campus v11: Chow Hall (food links, room only)

**For:** Claude Code in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
**Owner / DRI:** Ali Muwwakkil
**Written:** Saturday 2026-10-24, Central

**Run order:** after `CAMPUS_V7_TO_V10_PROMPT.md` (Parts A, B and C merged). This is one PR on its own branch, `campus/v11-chow-hall`.

**Design source:** `docs/design/campus/colaberry-campus-v11.html`. Commit it with this file, plus `docs/design/campus/v11-screenshots/`.
- Open the HTML and walk to the orange building left of the Main Gate.
- Everything for this part is in that room and the order sheet.

**Same rules as before:**
- **No invented data.** Craving tiles are static marketing content and are fine. There are no fake orders, restaurants, prices or reviews.
- Tests first, plus a session log on the commit and a brief-me at the end of the reply.
- Times in Central.
- The campus stays on Ali's account only (`CAMPUS_ENABLED`).
- **Colaberry takes no orders and no payments.** Every food action is an outbound link that opens in a new tab.

## What this adds

A Chow Hall building with a room, and no portal page. Inside the room you pick a craving and tap a delivery app. The app opens in a new tab, searching for that craving where the app supports search.

## C1. Building on the map

- **Building:** `id: 'chow'`, name **Chow Hall**, sub "Food, coffee & treats · order from your favorite app", icon 🍔.
- **Placement:** in the `gate` zone, left of the Main Gate and mirroring Admissions on the right. Prototype box is `x:300, y:668, w:116, h:56`, with a gable roof in `#e07a1f`.
- **Map clearance:** keep trees and props out of its footprint. Add the path-graph nodes so click-to-walk reaches its door.
- **No rooms list:** `rooms: []`. When a building has no rooms, hide the "Rooms in this building" section in the arrival card. Don't render an empty heading.
- **Search keywords:** `food eat lunch dinner snack coffee hungry pizza delivery doordash ubereats grubhub`. Where-to gets a **FOOD** group, and the side panel gets a **Grab food** chip.
- **Route:** `/campus/chow` exists only as a door target. Clicking the door opens the order sheet (C3) instead of navigating, so **no `ChowHallPage.tsx` is built**. Add a test that the router has no page for it.

## C2. The room (3D interior, same shell as the other rooms)

- **Interior:** `wall: '#fbe9d2'`, `floor: '#b9805a'`, layout `tables` (café tables and stools in place of desks).
- **Back wall (screen):** "WHAT ARE YOU CRAVING?" with a 4×2 grid of craving tiles and an **Order food ↗** button.
  - A tile click opens the order sheet with that craving selected.
- **Left wall:** a chalkboard, "TODAY'S CRAVINGS". It holds the one card for this room (v3 rule: one card only). Clicking it opens the order sheet.
- **Right wall:** the v9/v10 weather window, unchanged. The view east is whatever `viewFrom('chow')` returns.
- **Spot:** `SPOTS.chow = { kind: 'counter', opens: 'order' }`.
  - The spot is a service counter: a glass case of food emoji, a red base, and a hanging sign "🛎 Order food ↗".
  - Clicking it opens the order sheet.
- **People:** presence works as in every room. People here can be seen and talked to.
- **Lead line (arrival card and room):** from `foodLead()`. It reads the local meal time and the weather:
  - before 10:30 → breakfast/coffee;
  - 10:30-14:30 → lunch;
  - 14:30-17:00 → snack;
  - 17:00-21:30 → dinner;
  - later → late-night.
  - Rain or snow adds "perfect day for delivery".
  - Use the same weather state as the window. Don't make a second weather call.

## C3. Order sheet (modal, from any entry point)

**Entry points:** the screen, the chalkboard, the counter spot, the door, the arrival-card chips, the side-panel chip and Where-to.

- **Header:** "Grab something good" and the lead line. ✕ and Esc both close it.
- **Craving chips:** Pizza 🍕, Burgers 🍔, Tacos 🌮, Noodles 🍜, Sushi 🍣, Salad 🥗, Coffee ☕, Treats 🍩. One is selected at a time; the default comes from the meal time.
- **App cards:** one per delivery app for the viewer's region. Each card shows the app name in text (**no brand logos**), "Search ‹craving› ↗" or "Open ↗", and the region note.
- **Show all apps:** a toggle that lists every app regardless of region.
- **Footer note:** "Colaberry doesn't take orders or payments. Each link opens the app's own site in a new tab."

**Links:**
- Every app link is a plain `<a href target="_blank" rel="noopener noreferrer">`. No `window.open` and no tracking redirect, unless Ali approves affiliate links (see below).
- Put the app table in `frontend/src/components/campus/chow/deliveryApps.ts`:

| App | URL | Regions |
|---|---|---|
| DoorDash | `https://www.doordash.com/search/store/{q}/` | US, ANY |
| Uber Eats | `https://www.ubereats.com/search?q={q}` | US, GB, ANY |
| Grubhub | `https://www.grubhub.com/` | US |
| Instacart | `https://www.instacart.com/` | US |
| Deliveroo | `https://deliveroo.co.uk/` | GB |
| Just Eat | `https://www.just-eat.co.uk/` | GB |
| Swiggy | `https://www.swiggy.com/` | IN |
| Zomato | `https://www.zomato.com/` | IN |

- `{q}` is `encodeURIComponent(craving)`.
- **Before shipping, check each search URL by hand.** Apps change their URL formats. If a search URL no longer lands on results, fall back to the home URL and say so in the PR.

**Region:**
- `foodRegion()` reads the browser time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`):
  - `America/*` (US zones) → US;
  - `Europe/London` → GB;
  - `Asia/Kolkata` / `Asia/Calcutta` → IN;
  - else → ANY.
- No IP lookup and no stored location.

## C4. Backend

- **Nothing new.** No endpoints, no tables.
- If Ali wants click counts later, add a fire-and-forget `POST /api/portal/campus/event {type:'food_link', app}` with no craving or location stored. Don't build it in this PR.

## Acceptance

- **Fidelity view `30-chow-hall`** (1440×900 and 390×844):
  - the map shows Chow Hall left of the gate;
  - the room shows the screen grid, chalkboard, counter and window;
  - the order sheet is open, with chips and app cards;
  - no control's text overflows.
- **E2E (time zone `America/Chicago`):**
  - The counter spot, screen and door each open the sheet, and the URL path does not change.
  - Select Pizza: the DoorDash href is `https://www.doordash.com/search/store/pizza/` and the Uber Eats href is `https://www.ubereats.com/search?q=pizza`.
  - Every app link has `target="_blank"` and `rel` containing `noopener`.
  - Show all apps reveals all 8.
  - Esc closes the sheet.
  - With time zone `Europe/London`, the sheet shows Deliveroo / Just Eat / Uber Eats.
- **Unit tests:** `foodRegion`, `foodLead` (each meal window, plus rain) and the URL builder (encoding of "ice cream").
- **No console errors.** `tsc --noEmit` is clean.

## Ask Ali before shipping

- Is the app list OK? Which regions matter (US only, or GB/IN too)?
- Affiliate or referral links: plain links for now, or are there partner codes?
- Is the name "Chow Hall" OK, or would you prefer "Café" / "Food Court"?
