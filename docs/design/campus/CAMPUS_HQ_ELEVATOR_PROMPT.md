# Campus HQ: the Staff Office / Career Center / Partner Office as an elevator building

**For:** Claude Code in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
**Owner / DRI:** Ali Muwwakkil
**Written:** Wednesday 2026-10-28, Central

**Run order:** independent of the other open campus prompts (room fixes, v13 Today, v14 Community Board). Branch `campus/hq-elevator`. Two PRs:
- **PR 1:** H1-H3 and H5-H8, the building, generated from the nav, using today's access.
- **PR 2:** H4, more than one grant per person. Build it only after Ali answers the question in H4.

**Design source:** `docs/design/campus/colaberry-hq-elevator.html`. Commit it with this file, plus `docs/design/campus/hq-screenshots/`.
- Open the HTML and use **Viewing as** (a prototype-only control) to compare Ali, Sarbjit, Dhee, a mentor, support, a member, a partner and an explorer.
- **Admin sidebar** shows the source list, with three "change the sidebar" buttons that show the building rebuilding itself.
- The floors and rooms in the prototype are `adminNav.ts` as of 2026-10-28, copied as data. The people are illustrative.

**Same rules as before:**
- No invented data.
- Tests first, plus a session log on the commit and a brief-me at the end of the reply.
- Times in Central.
- The campus stays on Ali's account only (`CAMPUS_ENABLED`).
- **Section keys stay the only access truth.** `mgmtSectionGate` stays the one enforcement point. This building is presentation: it must never grant more than the admin sidebar does. The same principle is written at the top of `adminOs/domains.ts`; follow it.

## What Ali wants

- **One building, three faces.** `careerBuildingFor()` already gives it three names: Staff Office, Career Center and Partner Office. It becomes a prestige tower: **Colaberry · Refactored.ai**.
- **Floors are the admin sidebar's groups, and rooms are their links.** The sidebar changes often; the building follows by itself, with no campus edit.
- **Access decides where you can go, like a badge in a New York tower:**
  - explorers and members: the ground floor only;
  - staff: the floors their sections open;
  - locked floors are visible but grey, with red locks;
  - it's obvious on arrival what your badge opens.
- **Choose a floor, see its rooms, pick one,** and that admin page opens in a **new tab**.
- **Every page in the admin sidebar is reachable** from the building, for someone who has access to it.

## H1. One source: the building is generated from `adminNav.ts`

**New pure module:** `frontend/src/components/campus/hq/hqModel.ts`. It imports `PINNED_LINKS` and `NAV_GROUPS` from `components/Layout/adminNav.ts`. **No copy of the nav, no hand-written floor list, no labels typed twice.**

```ts
export interface HqRoom { path: string; label: string; icon: string; section: string; newTab: boolean; external: boolean; open: boolean }
export interface HqFloor { key: string; num: string; label: string; rooms: HqRoom[]; openCount: number; access: 'all' | 'some' | 'none' }
export function buildHq(canSection: (s: string) => boolean, isStaff: boolean): { floors: HqFloor[]; ground: GroundRoom[] }
```

**Floors:**
- `PINNED_LINKS` become the top floor, number **PH**, labelled with the constant `EXECUTIVE_FLOOR_LABEL = 'Executive Floor'`. This is the only label the building owns, because the sidebar's pinned set has none.
- Each `NAV_GROUPS` entry becomes a floor, **in sidebar order, top to bottom**, numbered from `groups.length + 1` down to `2`. **G** is the lobby.
- A floor's label is `group.label`. Renaming a group in the sidebar renames the floor.

**Rooms:**
- Each link is a room. Its section is `link.section ?? group.section`, the same rule as `ALL_LINKS`, so Leads stays on `leads` wherever it sits.
- `open = isStaff && canSection(section)` and, for `requiresMgmtBridge` links, a bridged portal account (always true on the campus staff path).
- **A link with no section is unreachable**, never public. This is the rule `accessibleLinksForDomain` already applies.

**Floor access:**
- `'all'` when every room is open;
- `'some'` when at least one is open;
- `'none'` otherwise.

**Ground floor:** `careerBuildingFor(audience)`'s existing rooms, per face:
- Career Center: Internship;
- Partner Office: Company;
- Staff Office: the Management Portal front desk.

**Tests** (`hqModel.test.ts`):
- every `ALL_LINKS` entry appears as exactly one room, and nothing else appears;
- floor count = `NAV_GROUPS.length + 1`;
- order and numbering match the sidebar;
- a renamed, added or moved group or link (feed `buildHq` a modified nav through an injectable parameter) changes the floors with no other edit;
- section inheritance (Leads in Revenue → `leads`);
- per-role results for every `MGMT_ROLE_DEFS` role (owner = all open; mentor = PH partial with Dashboard and Portfolio Review; support = PH partial with Student Story, My Day and AI Training; admissions = Lead Ingestion and AI Internship plus PH Dashboard);
- explorers and members: every floor `none`.

**Drift guard:** a test fails if any `/admin/*` route in `routes/adminRoutes.tsx` that has a nav entry is missing from the building, and if any building room isn't in the nav.

## H2. The campus needs the viewer's sections

**Today:** `/api/portal/mgmt/status` (`mgmtBridgeService.getMgmtStatus`) returns `{ is_mgmt, role, label }`. The campus can't tell which sections a person holds.

**Change:**
- Add `sections: SectionKey[]` to that response, from the same `sectionsForRole()` the admin token uses. Once H4 ships, use the effective sections.
- The frontend's `useMgmtStatus` and campus mgmt hook expose `canSection(s)`.
- **No new endpoint.**
- **Tests:** the shape, every role's sections, and a non-mgmt participant gets `[]`.

## H3. Every room must be reachable through the bridge (new tab)

**Today:** `pages/portal/mgmtNext.ts` allows `next` to be only **3** fixed paths (handoffs, people, accelerator), so the campus can't open the other admin pages.

**Change:**
- Build `MGMT_NEXT_ALLOWLIST` from `ALL_LINKS`: every **internal** `/admin/...` path (exact string, no prefix match), plus the 3 existing entries. It stays an **allowlist**:
  - exact match only;
  - absolute URLs, `//host`, other paths, and paths with extra segments or query strings that aren't listed all fall back to the default landing, as today.
- **Room links:**
  - an internal room opens `mgmtBridgeTo(path)` in a **new tab** (`<a target="_blank" rel="noopener noreferrer">`, the `AdminLink` pattern);
  - an external room (`/^https?:/`, e.g. My Day) opens its own URL in a new tab;
  - `requiresMgmtBridge` links (AI Training) keep their own landing page.
- **Tests:** every internal nav path is allowed; `https://evil.example`, `//evil`, `/admin/../x` and `/admin/people/extra` are rejected; adding a link to the nav allows it automatically.

## H4. More than one grant per person (PR 2: ask Ali first)

Ali's example is "Sarbjit, who has access to marketing **and** internship". Today each admin user has **one** `mgmt_role`. Sarbjit's `marketing` role gives `['dashboard','campaigns','brands']`, so the AI Internship floor would be locked for her.

This is an access-model change, so it's **escalated, not built in PR 1**. Ali picks one:
- **A. Extra sections per person:** `admin_users.mgmt_extra_sections text[]`. Effective sections = the role's sections ∪ the extra ones, capped to `SECTION_KEYS`.
- **B. More than one role per person:** `mgmt_roles text[]`. Effective = the union of the roles' sections.

**Whichever Ali picks:**
- `mgmtSectionGate`, the admin sidebar, `/api/portal/mgmt/status` and the building all read one `effectiveSections(user)` function;
- add an audit log entry on every change;
- add an admin UI row under Settings to grant and revoke;
- write tests that a grant shows up in the sidebar and the building and that the API serves it, and that a revoke removes all three.

## H5. The experience (the design, scene by scene)

The building keeps its map position and its three faces. Entering it no longer opens the generic 3D room; it opens the HQ scenes inside the same room frame (`CampusInside`), with the campus side panel.

**1. Arriving (the map card / side panel):**
- the building's face name;
- **Your badge** card (navy, a brass ring and a red-to-brass stripe): initials, name, role label, "OPENS ‹n› OF ‹N› FLOORS" (or "ALL-ACCESS BADGE" / "GROUND FLOOR ONLY"), and chips for every floor it opens;
- below it, a **Floors** list: number tile, label, room count, and "✓ Your badge" / "✓ ‹k› of ‹n› rooms" / "🔒 No access" / "Staff only";
- locked rows are grey with the lock in red, `aria-disabled`, and a toast on click: "Your badge doesn't open ‹Floor›. Ask an admin to add it to your role."

**2. Outside (optional first view):**
- an Art Deco tower with one band per floor, generated from `buildHq`;
- your floors' windows lit gold; others grey, with a red 🔒 at the edge (staff only);
- a brass spire and the red "C";
- the base reads COLABERRY / REFACTORED.AI, with the face plaque by the door;
- hovering a band shows "‹num› · ‹label› · ‹k› of ‹n› rooms open to you";
- a night palette after 7 PM local time;
- **Walk in →**.

**3. Lobby:**
- navy walls with brass pinstripes, a brass cornice and a marble floor;
- the brass sign COLABERRY (red C) / REFACTORED.AI / the face name;
- **Concierge desk:** Reese, the on-duty staff desk from `useStaffDesks`. If nobody is on duty, show the desk without a person. The bubble says: "Good ‹part of day›, ‹first›. Your badge opens ‹n› floors: ‹first three›… The elevators are straight ahead." For a member or explorer: "The Career Center is right here on the ground floor. The floors above are for Colaberry staff."
- **Directory board** (black felt, brass frame): every floor, each with ✓, 🔒 or STAFF;
- the **elevator bank**, with the ground-floor door (Career Center or Partner suite) to its left;
- a **badge reader:** "Tap your badge · ‹n› floors", or "Member / Visitor / Partner badge · ground floor".

**4. Elevator:**
- wood walls, a brass rail, a floor indicator, and a **brass button panel** (two columns, top floor first, then G);
- **open floors:** a lit button showing "‹n› rooms" or "‹k› of ‹n› rooms";
- **locked floors:** a grey button with a red ring and 🔒, saying "No access" (or "Staff only"). It shakes and shows a toast;
- hovering or focusing a button fills the **floor guide**: the floor's rooms, with locked ones marked;
- **riding:** the doors close, the indicator counts floors, and the doors open onto the floor (under 1.5 s; instant with reduce motion).

**5. A floor:**
- a brass plate "FLOOR ‹n› / ‹LABEL›", a cream corridor and a red runner;
- one **office door per room** (wood frame, frosted glass, icon, label, path, a brass "OPEN ↗" plaque);
- locked rooms: grey striped glass and "🔒 NO ACCESS", `aria-disabled`;
- doors are centred when there are few;
- the side panel lists the rooms, with **Open in admin ↗**, and a line saying how many of the floor's rooms you can open;
- **↕ Elevator** and **Lobby** buttons; **Esc** steps back: floor → elevator → lobby → outside.

**Icons:** the sidebar's own RemixIcon names (`ri-‹icon›`), already loaded by the admin brand fonts.

**Search:** Where-to finds rooms by label ("Leads", "Brands") and floors by label. The result rides there. Rooms you can't open don't appear for you.

## H6. Audiences

| Viewer | Face | What they can reach |
|---|---|---|
| Explorer | Career Center | G only. The directory and panel show every floor as "Staff only" (labels only, never room names). |
| Member / intern (no mgmt role) | Career Center | G only, same display. |
| Org manager (business) | Partner Office | G only: the Partner suite (Company). |
| Staff with a mgmt role | Staff Office | G plus every floor with at least one open room; partial floors show locked rooms. |
| Owner / admin | Staff Office | Every floor and room ("ALL-ACCESS BADGE"). |

Members and explorers **never** see room names on staff floors: the guide says "Staff room".

## H7. Keeping it in sync (the point of the build)

- No floor, room, label, icon or section lives in campus code. Changing `adminNav.ts` changes the building in the same deploy.
- `adminNav.ts` gets one header line: "The campus HQ building is generated from this file (components/campus/hq/hqModel.ts). Nothing else needs editing when you add, move or rename a link."
- The drift guard in H1 and the allowlist test in H3 fail the build if the nav, the routes and the bridge ever disagree.

## H8. Acceptance

- **Fidelity view `34-hq-elevator`** (1440×900 and 390×844) has these shots:
  - outside (Sarbjit-equivalent role);
  - the lobby (staff, then member);
  - the elevator, with one hovered and one locked button;
  - a full floor;
  - a partial floor (Executive Floor for a mentor);
  - the side panel badge.
  No text overflows.
- **E2E with seeded admins per role** (owner, marketing, admissions, mentor, support), plus a member and an explorer:
  - the number of lit floors matches `buildHq`;
  - a locked button can't navigate;
  - a room opens a new tab at `/portal/mgmt-enter?next=‹path›`, which lands on that admin page;
  - the member's elevator offers only G.
- **Nav-change test:** add a temporary group to `NAV_GROUPS` in a test build; the building shows the new floor and its room opens through the bridge.
- `tsc --noEmit` is clean and there are no console errors.

## Ask Ali before shipping

1. **H4:** extra sections per person (A) or more than one role per person (B)? Until then, Sarbjit sees AI Internship locked.
2. Is "Executive Floor" the right name for the pinned links at the top? (Penthouse? Front Office?)
3. Who should the lobby concierge be: Reese, Maya, or whoever's on duty?
