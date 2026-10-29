# Session CC-20261029-gv7k — Gov Contracts left-nav redesign, Phase 2 (admin side)

**Date:** 2026-10-29
**Branch:** `workstream/gov-contracts-leftnav-admin` (cut from `origin/main` @ 342360de)
**Phase 1** (intern portal nav) is PR #3473 on `workstream/gov-contracts-leftnav`. This is Phase 2.

Separate session file from `CC-20261029-gv7k.md` (Phase 1's) on purpose: the two phases are two
branches, so one shared session file would collide on the second merge.

---

- [x] Phase 2 — admin left-nav "Interns → Gov Contracts" + native read-only per-contract cockpit
  - Date: 2026-10-29
  - Session: CC-20261029-gv7k
  - What changed:
    - BACKEND: `backend/src/routes/admin/govContractsRoutes.ts` — new `GET /api/admin/gov-contracts/:projectId/cockpit`,
      gated `requireSection('gov_contracts')`, returns the SAME student-safe projection the intern sees
      (`getStudentGovProjectView(projectId, false, adminIdentity)`) for ANY non-archived gov project, so owner/Kes
      see every contract. 404 when not a gov project.
    - `frontend/src/pages/portal/projects/govCockpit/CockpitView.tsx` + `govCockpit.css` — new `readOnly?` prop
      (default false, so interns unchanged): hides `CopilotRail`, does not open `ProposalDocumentDrawer`, one-column
      layout. The other panels (ProjectOverview/BuildReleases/CommitFeed/ProposalDocuments) are pure/props-only
      (verified: they `import type` only, no fetch), so the admin read-only view fires ZERO participant-token calls.
    - NEW `frontend/src/pages/admin/AdminGovContractCockpitPage.tsx` (route `/admin/gov-contracts/:projectId`) —
      fetches the admin cockpit endpoint and renders `<CockpitView ... readOnly />` in the admin shell.
    - NEW `frontend/src/components/Layout/useAdminGovContractsNav.ts` — fail-soft hook over `fetchGovContracts()`
      (only when `canSection('gov_contracts')`) + pure `adminGovContractNavEntries()` (one sub-item per contract
      WITH a build, linking to its cockpit). `adminGovContractsApi.ts` — new `fetchGovContractCockpit()`.
    - `frontend/src/components/Layout/AdminLayout.tsx` — renders a nested, expandable "Gov Contracts" node under the
      Interns group, one sub-item per contract. `adminNav.ts` — renamed group "AI Internship" → "Interns"; added
      `['/admin/gov-contracts','gov_contracts']` to UNLISTED_PATH_SECTIONS so ProtectedRoute gates the cockpit route.
    - `frontend/src/routes/adminRoutes.tsx` — lazy route for the cockpit page. `AdminInternshipPage.tsx` — removed the
      Gov Contracts top-tab (and DELETED the now-orphaned `InternshipGovContractsMode.tsx`). Agents tab left as-is.
  - Verification: `useAdminGovContractsNav.test.ts` (pure `adminGovContractNavEntries`: per-build item, drops
    no-build pursuits, title fallback). Backend file typechecks clean under tsc 5.9.3 (whole graph, 0 errors).
    Frontend typecheck/build/unit-tests authoritative in CI (worktree has no FE react/tsc).
  - Notes: Scoping — the nav fetch is row-scoped server-side (owner/Kes broad→all; Admissions holds neither
    `gov_contracts` nor the node). The cockpit endpoint is gated `gov_contracts` (owner/admin only). Proposal doc
    CONTENT is not shown to admins in v1 (the drawer is editable, so it's withheld); a read-only doc viewer is a
    possible follow-up. "Expanded by default": the nested node's collapse key starts undefined ⇒ open once the
    Interns group is expanded.
