# Session CC-20261027-p4k9 (gov-cockpit-membership branch)

**Date:** 2026-10-27
**Branch:** workstream/gov-cockpit-membership (off main @ 44430870)
**Owner:** Ali (ali@colaberry.com)

The intern-portal fix. Assigned interns could not open their gov cockpit (404), and the admin
"Project workspace" row link bounced to the portal login page. Diagnosed live: the cockpit 404s
even via view-as as the assigned intern, because project assignment never granted delivery
membership (only per-STORY assignment did), and the workspace link was a raw participant-route href.

## Changes

- [x] Grant the intern cockpit membership when a gov project is materialized/assigned to them
  - Date: 2026-10-27
  - Session: CC-20261027-p4k9
  - What changed: exported `ensureAssigneeCanBuild` from govBuildAssignment.ts and called it in
    materializeGovBuildProject (govProjectMaterialization.ts) after the project is ensured, granting
    the assigned intern the least-privilege `associate_builder` role on the DELIVERY project.
    Idempotent and non-destructive (leaves any existing membership untouched); runs on every
    materialize, so re-running it backfills an already-assigned intern.
  - Verification: jest govProjectMaterialization.test.ts (3 new tests: grants on create, backfills
    on reuse, not granted when materialize fails early) + govBuildAssignment.test.ts +
    lifecycleRegistrationCoverage.test.ts all pass (43 tests, worktree jest). No new creation site:
    ensureAssigneeCanBuild does DeliveryProjectMember.create, which the LC-01 ratchet does not count.
  - Notes: root cause was the documented gap in ensureAssigneeCanBuild ("the gov approve/materialize
    flow creates their monitored project but never a delivery membership"). Existing already-assigned
    projects (Aki, Omolola) still need a backfill: re-run the assign/materialize after deploy (a prod
    write, needs Ali).

- [x] Fix the admin "Project workspace" row link (was bouncing to /portal/login)
  - Date: 2026-10-27
  - Session: CC-20261027-p4k9
  - What changed: ProjectDeliveryView.tsx "Project workspace" was a raw <a href> to the
    participant-guarded /portal/gov-projects/:id, so an admin with no participant session was
    redirected to /portal/login. Converted it to a button that opens via the read-only view-as flow
    (the same openViewAs as the eye), landing on the intern's gov cockpit.
  - Verification: frontend tooling is not installed in this worktree; relies on CI (Frontend
    typecheck/tests/build). openViewAs and viewAsNextPath are unchanged and already tested.
  - Notes: now overlaps with the "View as" button for gov rows (both open the cockpit via view-as);
    flagged for Ali to decide whether to differentiate them.
