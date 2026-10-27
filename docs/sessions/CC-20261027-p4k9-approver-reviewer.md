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

- [x] Re-pin the LC-01 creation-site ratchet after the gov create call moved
  - Date: 2026-10-27
  - Session: CC-20261027-p4k9
  - What changed: the grantApproverReviewer function (45 lines) landed above
    ensureGovTwoTrackProject, moving `DeliveryProject.create(` in govDeliveryProject.ts from
    line 157 to 202. lifecycleRegistrationCoverage.test.ts pins each creation site as
    `file:line mechanism` and failed by name, exactly as designed. Re-pinned 157 -> 202 and
    extended the move-history comment. No new creation site was added:
    `DeliveryProjectMember.create(` does not match the CREATION regex (needs `Project.`, not
    `ProjectMember.`), and the bulkCreate/upsert/raw-INSERT/hooks:false tripwires still pass.
  - Verification: jest lifecycleRegistrationCoverage.test.ts 18/18 pass locally (jest 5.9.x,
    worktree node). The gate was re-pinned, not weakened.
  - Notes: this was PR 3a (#3429) CI's only red test ("Backend unit tests"). Branch had no
    divergence from origin/main on the touched files, so the fix pushes and merges cleanly.
