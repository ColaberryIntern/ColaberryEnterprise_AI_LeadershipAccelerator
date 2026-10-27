# Session CC-20261027-p4k9 (gov-cockpit-overview branch)

**Date:** 2026-10-27
**Branch:** workstream/gov-cockpit-overview (off main @ c699e58d)
**Owner:** Ali (ali@colaberry.com)

PR 3b of the intern Project Management Portal: the combined read-only project view.
Ali wanted the intern (and an admin viewing-as the intern) to see everything SAFE
about their assigned gov project in one place, read-only, with only the proposal
editable and all internal competitive data kept admin-only.

## Changes

- [x] Read-only Overview tab on the gov delivery cockpit
  - Date: 2026-10-27
  - Session: CC-20261027-p4k9
  - What changed: new frontend ProjectOverview.tsx renders solicitation facts
    (agency + detected key dates), the established requirements (compliance matrix
    with priority/track/evidence-state tags + the proposal/build counts), and the
    price-free submission readiness checklist. Wired into CockpitView as a new tab,
    made the default landing tab. Small scoped CSS (gck-overview/kv/dates/reqrow).
  - Verification: frontend tooling is NOT installed in this worktree, so verified
    via CI (Frontend typecheck + Frontend unit tests + Frontend build). Added
    GovProjectPortalPage.test.tsx coverage: Overview is default + renders the safe
    fields + is strictly read-only (no inputs/buttons); updated the existing
    Build-default test to click Build first.
  - Notes: NO trust-boundary change. Every field rendered already crosses the
    student-safe projection (govProjectProjection -> StudentGovProjectView) and was
    already delivered to the cockpit but unused by the UI. Internal data (pricing,
    win probability, competitor/bid economics, assignee identities) is absent from
    that projection, so it cannot leak. Proposal stays editable in its own tab.
