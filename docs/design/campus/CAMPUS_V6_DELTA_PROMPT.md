# Colaberry Campus: v3 → v6 delta (changes only)

**For:** Claude Code in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
**Owner / DRI:** Ali Muwwakkil
**Written:** Saturday 2026-10-24, Central

**Scope:** this prompt covers only what changed between `colaberry-campus-v3.html` and `colaberry-campus-v6.html`.

- **Don't stop or redo round 3.** `CAMPUS_V3_PROMPT.md` is still being built. Finish whatever round-3 PR is in flight first, then apply this delta on top.
- **Where this prompt overrides round 3:** where they conflict, this file wins. That is mainly the **two doors** (§2.1, §2.2) and the **arrival-card tiles**.
- **Everything else stands:** the rest of `CAMPUS_V3_PROMPT.md` is unchanged, including:
  - Part 1 production fixes
  - the workstation shell (§2.3)
  - page navigation (§2.4)
  - click-to-walk (§2.5)
  - the side panel (§2.6)
  - booking with admissions (§2.7)

**Files:** put `colaberry-campus-v6.html` and this file in `docs/design/campus/`. `colaberry-campus-v6.html` is the source of truth for everything below.

**Walk it before you build.** Open v6 at 1440×900 and click through these:
- the Classroom seat
- the Studio desk and cubicles
- the Library carrel
- the Cert Prep booth
- the Events Hall auditorium
- Schedule: sign up for an event, then see it in "Coming up"
- Admissions: the board, the service list, the meeting table, and Maya
- the Admissions plans page

**Same rules as before:**
- No invented data. Classmates, events and commits in the prototype are illustrative.
- Tests come first.
- Every commit gets a session log.
- End every reply with a brief-me.
- The campus stays on Ali's account only.
- Ship **one PR per section** (D1-D6). Report the shipping ladder honestly: built, tested, merged, deployed, production-verified.

---

## D1. Replace the two doors with "the board" and "your spot"

### Remove
- The front door, the back door and their door plates (`.door.front`, `.bdoor`, the `FRONT DOOR` and `WORK` plates).
- Every "front door" / "back door" label in the room, the arrival card and the workstation.
- In the round-3 code: delete the door components, their fidelity assertions (`21-room`: "two doors exist"), and the door copy.

### The two ways in are now
| | What | Click → |
|---|---|---|
| **📺 The board** | The big screen on the back wall. It shows the building page's next step, as in round 3. | Clicking the screen body, or its secondary button "See all of ‹section›", opens the **section page**. This was the front door. |
| **Your spot** | Furniture in the room where you'd actually do that building's work, with your name card. It glows on hover. | Clicking it opens the **workstation for the screen's card**. This was the back door. You walk to it and the camera zooms into it (~520 ms), then the workstation opens. |

The screen's **primary button** ("Open", "Build · +50 pts", "Start the check") also opens the workstation. "Open the card" anywhere (side panel, rail, plan box) works the same way.

### Spots per building
The prototype's `SPOTS` table is the spec.

| Building | Spot (art) | Opens |
|---|---|---|
| Project Studio | Your desk: two monitors, desk lamp, mug with steam, plant, keyboard, mouse, headphones on the monitor, name card, chair | workstation (story) |
| Internship Office | The same desk, as your seat at the team pod | workstation |
| Classroom | Your seat in the front row: laptop open on the bench, water bottle, notebook, name card. The class rows shift left to make room. | workstation (lesson) |
| Library | A study carrel: book shelf, green reading lamp, open book | workstation |
| Cert Prep | A quiet booth: partitions, wall clock, monitor, headphones | workstation (check) |
| Game Room | An arcade cabinet (Bug Breaker) with a stool | Game Room page |
| Community Lounge | A couch with a coffee table, laptop, mug and floor lamp | live rooms page |
| **Admissions** (new, D3) | A meeting table: two chairs, a laptop showing a video call, a desk calendar | **booking sheet** ("Book a call with admissions") |
| Events Hall, My Progress, Schedule | **No spot.** Nobody works in these rooms. | The board's primary button opens the page or does the action (e.g. Sign up) |

**How to build it**
- Each spot is a small SVG component under `components/campus/interior/spots/` (one per kind: `desk`, `seat`, `carrel`, `booth`, `cabinet`, `couch`, `meet`).
- Each spot is placed as a billboard in the CSS 3D room, front-right of centre, at the prototype's `x, z, w, h`.
- Each spot carries `data-testid="cm-spot-<kind>"`.
- All colours come from tokens (`--cm-art-*`), never hex.
- Name card: use the learner's `displayFirstName()`, in caps.
- Reduced motion: no walk, no zoom; open directly.

### Arrival card (right): tiles
- **Rooms with a spot:** the section header reads "Look up, or sit down". Admissions reads "…sit down with a person"; Game Room and Lounge read "…jump in". It has two tiles:
  - Light tile: **"📺 The board"**, with the section name and "The whole section: every card, in order". It opens the section page.
  - Dark tile: the spot's own name (**"🪑 Your desk"**, **"💺 Your seat"**, **"📚 Your carrel"**, **"🎧 Your booth"**, **"🕹 The cabinet"**, **"🛋 Your spot"**, **"📅 Meet a person"**), with the card title and the spot's line ("Sit down and work on this card"). It does the same thing as clicking the spot.
- **Rooms without a spot:** one tile, "On the board", showing the board's next step and its action.
- The tour block stays above the tiles, as in v3.

### Workstation copy
- Breadcrumb: "‹spot› · ‹card›", e.g. "Your booth · Claude Code Knowledge Check".
- Top-right buttons: **"📺 All of ‹section›"** (was "Front door") and **"← Stand up"** (was "Step outside"). Stand up returns you to the room, standing by your spot.
- The bench strip label becomes **"Pinned above your desk"**.

### Workstation surface (from v4/v5)
- Use **two monitors**:
  - **Left, angled toward you:** the repo terminal for stories, the notebook for lessons.
  - **Right, the main monitor:** the card.
- Both monitors get a bezel, a neck and a stand.
- Under the monitors is a **desk surface strip** holding: lamp, plant, branded mug with steam, keyboard, mouse, name card ("ALI M. · JULY 2026"), a phone showing Cory, and headphones. These are decorative SVGs.
- Cory stays on the right.
- This is the same shell for every spot. Don't vary the surface per spot in this round.

**Acceptance**
- Update fidelity view `21-room`, for Classroom, Projects, Cert Prep, Library, Events Hall and Admissions:
  - no door elements exist;
  - `cm-spot-<kind>` exists for spot rooms and is absent for Events Hall;
  - clicking the spot and clicking the screen's primary button land on the same workstation URL (or the booking sheet for Admissions);
  - clicking the screen body opens the section URL.
- Update view `23-workstation`:
  - two monitor bezels and the desk strip are visible;
  - Stand up returns to the room.

---

## D2. Cubicles off to the side

- **Rooms:** Project Studio, Library and Cert Prep get a row of **three cubicles** down the left side of the floor, at prototype positions x 0.17, z 0.30, 0.55 and 0.80, under the left-wall board. Internship Office gets the same treatment (it shares the desk kind).
- **Art:** the cubicle matches the room. Studio and Internship get a desk cubicle, Library a wooden carrel, Cert Prep a grey booth. Each has partitions, a monitor, a desk and a chair.
- **Occupied cubicles:** people present in the building (from real presence) fill the cubicles first. An occupied cubicle's monitor is lit and its person stands at it. Up to 3 people go in cubicles; anyone else stands in the room's normal layout.
- **Empty cubicles:** the monitor is dark and the chair is empty.
- **Purpose:** cubicles give other people a place to work, so your spot stays clearly yours.
- **Acceptance:** with 2 people present in the Studio, 2 cubicles are occupied and 1 is empty; with 5 present, 3 are in cubicles and 2 stand in the room.

---

## D3. Admissions: a building of its own, next to the main gate

**Map**
- Remove the welcome bench/desk at the gate (`art/MainGate.tsx` Maya desk token).
- Add a building called **Admissions**:
  - id `admissions`;
  - colour token from Maya's `#b0306a`;
  - gable roof with chimney;
  - at prototype `x 614, y 668, w 104, h 54`, just right of the gate;
  - its own path segment from the gate, added as a new zone `gate` in `campusMap.ts` and the walk graph.
- Keep trees clear of it.
- Maya's staff token sits on it.
- It is visible to **every audience** (members, Explorers, business, staff).
- Update the map's base framing so the whole campus, Admissions included, fits beside the side panel (prototype `baseView` fits 990×700 around y 410).

**The room** (pink-walled lobby)
- **Board (back wall):** "PLANS & PRICING" as four tiles, plus "Compare plans →" and "📅 Talk to a person". Source of truth is `frontend/src/config/claimsRegistry.ts` (render through `<Claim>`, never hard-coded):
  - Explorer `$0` to start;
  - Individual `$149` /mo billed annually (`pricing.individual.annual`), highlighted;
  - Team licenses `from $950` /seat per year, "Team $1,200 · Department $950 · Enterprise custom" (`pricing.team`, `pricing.department`);
  - Services "Scoped" on a call (`pricing.services`).
  - **Do not show $199 month-to-month.** `pricing.individual.monthly` is retired. Flag to Ali that `PricingPage.tsx` still prints "Or $199/mo month-to-month" and the FAQ mentions it.
- **Left wall board:** "Your account": Enrollment (status + cohort), Plan, Team seats, Seat code. Data comes from the same sources as `pages/portal/settings/EnrollmentSection.tsx`, `SubscriptionSection.tsx` and `TeamSection.tsx`.
- **Maya** is always in the room, standing at a **Welcome desk** (gold desk object). She is clickable: popover → Message.
  - Maya's chat stays the C6 decision (the website chat widget), unless Ali says otherwise. The prototype's in-campus replies are illustrative.
  - **Ask Ali** whether this building should switch Maya to the in-campus DM (Q8 was "keep as is").
- **Your spot:** the meeting table (D1). Clicking it opens the round-3 §2.7 booking sheet, **"Book a call with admissions"**.

**Arrival card, under the tiles**
1. **"Sign up or change a service"**. Each row mirrors a Settings section and acts on it:

   | Row | Button | Action |
   |---|---|---|
   | Individual plan | "✓ Active" or "Activate" | existing checkout or `/enroll` |
   | Team licenses | "Add seats" | existing seat checkout / `TeamSection` invite flow |
   | Redeem a seat code | "Redeem" | `POST /api/sponsor/redeem` |
   | Subscription & billing | "Manage" | `SubscriptionSection` (billing portal) |
   | Services | "Book a call" | §2.7 booking sheet |

   Show only the rows that apply to the viewer. For example, staff see no "Activate", and business viewers see seats first.
2. **"Maya · always here"** row with Message.
3. Who's here, the rooms, Back to the Quad.

**Rooms in this building**
- Plans & pricing → **new page `/portal/plans`**
- Subscription & billing → `/portal/settings#subscription`
- Enrollment → `/portal/settings#enrollment`
- Invite your team → `/portal/settings#team`

Add anchor ids to those Settings sections if they don't exist.

**New page `/portal/plans`** (inside PortalShell with the v3 location bar)
- Kicker "ADMISSIONS", title "Plans & services", lead.
- The four plan cards, full width, each with:
  - name, price, unit, a one-line description (copy from `PricingPage.tsx` tiers);
  - one action: "Your current tier" (disabled) / "Activate" / "Activate seats" / "📅 Book a call".
- Below the cards: "Your account" and "Talk to a person" cards, side by side.
- `buildingForPath('/portal/plans') = 'admissions'`. The Settings anchors above also map to admissions when reached from this building.

**Help desk:** add Maya to the rail's Help desk chips (Reese, Dara, Maya, 📅 Talk to a person) for every audience. This replaces the current Explorer/staff-only Maya rule for the rail.

**Acceptance**
- Fidelity view `24-admissions`:
  - the building is on the map near the gate;
  - the board's four prices match `claimsRegistry` and `$199` is absent;
  - the service rows render for member and business;
  - the meeting table opens the booking sheet;
  - `/portal/plans` renders 4 cards.
- A unit test proves prices come from `<Claim>` keys.

---

## D4. Events Hall as an auditorium

- **Room:** dark walls, a raised **stage** under the screen, and **six tiered rows of red seats** filling the floor, with heads in the seats. The room is deeper than the others: `D = FW × 0.95`, capped at 1100.
- **Who's in the seats:**
  - During a live event, use real attendance or presence.
  - Otherwise, show **present people only**: one head per person present, and leave the rest of the seats empty.
  - The prototype's random heads are illustrative. **Do not fake a crowd.** This matches the round-1 "no invented crowd" rule.
- **No spot (D1).**
- **Board:** the next event, with a one-tap **Sign up** and "All events".
- **Arrival card:** the "Upcoming events · one tap to sign up" list (D5) replaces the plan box.
- **Acceptance:** with 0 people present, the auditorium renders with empty seats (no heads). The Sign up button on the board works (D5).

---

## D5. Schedule: upcoming events on a calendar, one-tap sign up

**Schedule board (back wall)**
- "YOUR WEEK · UPCOMING EVENTS".
- A 7-day strip from today: today filled in ink, days with events marked with a red dot.
- Then each upcoming event as a row: day/date, title, time · place, and **Sign up**. After signing up the row shows **"✓ You're going"**; tap again to cancel.

**Arrival card (Schedule and Events Hall):** "Upcoming events · one tap to sign up", the same rows with buttons.

**Side panel:** a **"Coming up"** section at the very top lists events you're going to (🎪, date · time · place · "on your calendar") and any booked admissions call.

**Schedule page (`/portal/schedule`)**
- Full width (the side cards drop below).
- Hero next step, then a **7-column week calendar**. Each day shows:
  - today's plan items, in teal;
  - events, in amber, each with a Sign up / ✓ You're going button.
- The Events page gets the same one-tap buttons on its list.

**Data**
- Events come from `GET /api/portal/events`. The Open House and the internship and strategy sessions are real events on that feed.
- Sign up is the events feature's **existing** RSVP/registration action. Find it in `pages/portal/events` / `EventsPage` and reuse it. If there is none for portal users, add `POST /api/portal/events/:id/rsvp` and `DELETE` (idempotent, `requireParticipant`).
- Signing up adds the event to the learner's schedule.
- The calendar invite uses the same calendar service as §2.7, if the event has a Meet link.
- "Coming up" reads the learner's RSVPs.

**Acceptance**
- Fidelity view `25-schedule`: Sign up on the board → the button shows "✓ You're going", and Coming up lists the event.
- Reload → the RSVP is still there.
- Cancel → it disappears.
- The schedule page shows the event in the correct day column.

---

## D6. Small things from v4-v6

- **Remove all floating room labels**, as v3 already required: building chip, hint, head-count chip, staff speech bubbles. "← Step outside" stays.
- **Arrival card plan box:** show it only when the in-building plan step is **not** the panel's Up next. Otherwise it repeats.
- **"Coming up"** (D5) sits above "Up next" in the side panel.
- **Tour block** stays on top of the arrival card.

---

## Order of work
1. Finish the in-flight round-3 PR.
2. **D1** (spots replace doors) + **D6**.
3. **D3** (Admissions building, room, `/portal/plans`).
4. **D5** (events sign-up and the Schedule calendar), then **D4** (auditorium).
5. **D2** (cubicles).
6. Continue round-3 / round-1 leftovers per `CAMPUS_V3_PROMPT.md` Parts 3-4.

## Ask Ali before shipping
- Does Maya switch to an in-campus DM inside Admissions, or stay the website widget (Q8)?
- Remove "$199/mo month-to-month" from `PricingPage.tsx`?
- Is there an existing event RSVP endpoint for portal users, or should we add one?
- Is the admissions calendar for "Book a call" the same as the sales calendar (round-3 §2.7)?

## Definition of done for this delta
- D1-D6 match `colaberry-campus-v6.html` side by side at 1440×900 and 390×844, for:
  - the Classroom, Studio, Library, Cert Prep, Events Hall, Schedule and Admissions rooms;
  - `/portal/plans` and `/portal/schedule`;
  - both workstation types.
- Fidelity views 21, 23, 24 and 25 pass. `tsc --noEmit` is clean. The round-3 tests still pass.
