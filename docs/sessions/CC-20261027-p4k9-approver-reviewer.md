# Session CC-20261027-p4k9 (gov-approver-reviewer branch)

**Date:** 2026-10-27
**Branch:** workstream/gov-approver-reviewer (off main, same base as the mgmt-portal branch)
**Owner:** Ali (ali@colaberry.com)

PR 3a of the intern Project Management Portal build: the access fix. The gov approval flow
never granted anyone a reviewer role, so the approving admin could not open the cockpit
(membership-gated 404) and nobody could Accept proposal documents. This grants the approver
a reviewer role automatically.

## Changes

- [ ] Gov approval grants the approving admin reviewer access
  - Date: 2026-10-27
  - Session: CC-20261027-p4k9
  - What changed: new exported `grantApproverReviewer(deliveryProjectId, approverIdentity)`
    in govDeliveryProject.ts, called from ensureGovTwoTrackProject AFTER the project
    transaction commits. Grants the approver the `qa_reviewer` role (evidence.verify +
    release.approve, nothing owner-level). Resolves the approver from email (primary_email)
    or a uuid; idempotent + non-destructive (never alters an existing membership);
    best-effort (never throws, so it can't roll back an approval). 5 new unit tests.
  - Verification: jest govDeliveryProject.test.ts 32/32 (5 new + 27 existing); backend tsc
    5.9.3 source + test-file typecheck clean in the changed files.
  - Notes: no schema change. Backfills an existing project the next time it is re-approved
    or its workspace self-heals (both flow through ensureGovTwoTrackProject). Makes the
    "Project workspace" link from the mgmt-portal PR open for the approving admin.
