# Session CC-20261116-jg9 — Gov Contracts as its own top-level nav group

Ali: "remove Gov Contracts from under the interns section into its own group. Under the group will be
the gov-opportunities page 1st which will have a link to 'Our Services' page which should be removed
from the navigation as its own tab and just be a link on Gov Opps. Then you can have all your contracts
that are being worked on. Gov Contracts should be its own group separated from everything else."

Frontend-only IA change. One PR, one deploy.

## What changed (4 files)
- `frontend/src/components/Layout/adminNav.ts`
  - The `gov` sub-list left the **Interns** group (Agents sub-list stays).
  - New top-level **Gov Contracts** group: leads with the **Gov Opportunities** link, then the live
    per-contract sub-list (relabeled "Contracts" so it is not "Gov Contracts > Gov Contracts").
  - **Gov Opportunities** moved out of the Program group into the new group; keeps `section: 'program'`
    (backend mgmtSectionGate maps /api/admin/factory/* to program, so nav and API still agree).
  - **Our Services** (`/admin/gov-services`) removed from the sidebar entirely and added to
    `UNLISTED_PATH_SECTIONS` as `'program'`, so `sectionForPath` still resolves it and ProtectedRoute
    does not bounce a scoped identity off the route (which stays live). The Gov Company Dossier still
    sits under it at `/admin/gov-services#dossier`.
- `frontend/src/pages/admin/AdminGovOpportunitiesPage.tsx`
  - Added an always-visible **Our Services** button in the PageHeader actions (navigates to
    `/admin/gov-services`) — the only entry point now that it left the nav.
  - Copy fix: "assigned to interns (see Interns > Gov Contracts)" -> "(see Gov Contracts)".
- Tests: `AdminGovOpportunitiesPage.test.tsx` (both copy assertions), `hqSubnavSync.test.ts` (Interns
  floor no longer carries the gov room; new assertion for the Gov Contracts floor = Gov Opportunities +
  each contract). The Campus HQ building generates the new floor from adminNav.ts with no model edit.

## RBAC preserved (by construction)
- `sectionForPath('/admin/gov-opportunities')` === 'program' (unchanged).
- `sectionForPath('/admin/gov-services')` === 'program' (now via UNLISTED_PATH_SECTIONS, unchanged value).
- The Contracts sub-list keeps its own `gov_contracts` section; a holder of gov_contracts but not program
  still sees the group, kept alive by the sub-list alone (visibleNavGroups), with the contracts and no
  Gov Opportunities link. AdminLayout needs no change (sub-lists render per `source`, group-agnostic).

## Verification (real CI gates)
- Frontend `tsc --noEmit`: clean.
- react-scripts (16 suites / 237): adminNav* (incl. Rbac, VisibleGroups), hqSubnavSync, hqModel,
  hqBuilding, careerPrepFloor, hqCareerPrepTower, AdminGovOpportunitiesPage, AdminGovServicesPage,
  useAdminAgentsNav — all pass.
- Frozen lints (frontendTypographyLint, frontendCopyLint, bannedCopy): 55 pass.
- No backend source touched.

## Deploy
- nginx only (frontend change). Marker candidate: the Gov Opps page copy "(see Gov Contracts)" or the
  "Our Services" header button, verified in the served chunk through the real hostname. Authenticated
  admin-sidebar render is Ali's eyeball step (no prod secret-mint).
