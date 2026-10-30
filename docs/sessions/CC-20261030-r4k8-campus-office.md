# Session CC-20261030-r4k8 — campus: a gov intern's own "office" floor

**Date:** 2026-10-30
**Branch:** `workstream/campus-intern-office` (cut fresh from `origin/main`)
**Ask (Ali, 2026-10-30):** "when the interns login they have access to the one project they are attached
to and area ... they only have access to that one office (their page(s) of the project they are working
on) ... access straight from their app so it's easier to find without remembering the link." Example:
"Sarbjit should have access to marketing." Decision (AskUserQuestion): **"Also light their Tower floor
(gov)"** — scoped to gov, the only area with a member-facing cockpit.

## What was found first (verified, not assumed)

- The campus **Tower** (`frontend/src/components/campus/hq/hqModel.ts`) is hard **staff-only**: a room
  opens only `isStaff && canSection(section)` (`hqModel.ts:33`), a non-staff badge is pinned
  `GROUND FLOOR ONLY` (:75), every floor reads `Staff only` (:84). Signals come from
  `/api/portal/mgmt/status`, which requires `community_members.role==='staff'` + a valid `mgmt_role`.
- The outcome Ali wants **already works for gov interns in the classic portal**: an active member gets a
  membership-scoped "Gov Contracts" nav group deep-linking their cockpit `/portal/gov-projects/:id`
  (`useMyGovProjectsNav.ts`, `PortalShell.tsx:205,228`). This change ALSO surfaces it in the campus Tower.
- **Marketing is not possible today**: `DeliveryProject.ProjectClass` has no 'marketing' and no area tag
  (`DeliveryProject.ts:25`), and there is no member-facing marketing project page. Gov is the only area
  with all three prerequisites (identifiable area + member cockpit + a floor). Marketing is a separate build.
  Full map: scratchpad `campus_access_map.md`.

## The change (frontend-only — no new backend access surface)

A member's active gov membership is already fetchable membership-scoped (`listMyGovProjects`,
`GET /api/portal/gov-projects`), and the cockpit route enforces membership server-side, so nothing new is
exposed. The Tower gains a synthesized **office floor** for a non-staff member with assigned project(s).

- [x] Light a gov intern's own office floor in the campus Tower
  - Date: 2026-10-30 · Session: CC-20261030-r4k8
  - What changed:
    - `hqModel.ts` — `buildHq` takes an optional `office`; when `!isStaff && office.projects.length`, it
      appends ONE `own` floor (num '1', always free) with a room per project linking to
      `/portal/gov-projects/:id`. `badgeLevel`/`floorStatus`/`buttonSub`/`roomName`/`roomHref`/
      `conciergeLine`/`readerLine` honor `own` so the badge, floor and room read as THEIRS, never
      "Staff only"; `roomHref` sends an own room to the portal route directly (not the admin bridge).
      **Strictly additive and gated**: with no office, or for staff, the building is byte-for-byte as before.
    - `useHq.ts` — a member (audience 'member') fetches `listMyGovProjects` (fail-soft) and feeds the office.
    - `HqPanel.tsx` / `HqOutside.tsx` — the floor list, directory, tooltip and CTA label the own floor as
      the viewer's office instead of "Staff only"/"STAFF"; the room CTA reads "Open ↗" not "Open in admin ↗".
    - `hqUsage.ts` — the staff-tools "most used" list excludes `own` rooms (a cockpit is not an admin tool).
  - Verification: `hqModel.test.ts` +1 describe (office floor: appended, numbered, room-per-project, badge/
    floor/room read as theirs, concierge/reader name it, GATED for staff + empty + no-arg). `hqBuilding.test.tsx`
    mocks `listMyGovProjects` (default [] keeps the existing member/explorer cases green) + a member-with-office
    integration case (one open floor, cockpit href, new tab) and a no-project case (ground floor only).
    Worktree frontend jest/tsc are NOT runnable here (no installed react/@types/react) — **CI frontend
    typecheck + build + unit tests are authoritative** (CRA `CI=true` fails on lint warnings, so kept clean).
  - Notes: no backend route change ⇒ no `.strict()` zod risk. Screenshot review is post-deploy (can't capture
    prod until live). Marketing (Sarbjit) deferred: needs a marketing delivery-project area + member page first.

## Pending
1. Ali merges + deploys (frontend). CF caches app assets ~4h, so a hard refresh may be needed to see it.
2. Post-deploy: screenshot-review the intern campus view (member with/without a gov project).
3. Marketing office floor = a separate build (area tag + member cockpit) if Ali wants it.
