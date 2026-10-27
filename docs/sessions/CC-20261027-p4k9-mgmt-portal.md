# Session CC-20261027-p4k9 (intern-mgmt-portal branch)

**Date:** 2026-10-27
**Branch:** workstream/intern-mgmt-portal (off origin/main)
**Owner:** Ali (ali@colaberry.com)

Part of the intern Project Management Portal build (Ali, 2026-10-27): from the admin
internship-projects section, open each intern's actual project — as admin and read-only
"as the user" — with friendly project names. Gov first; the combined read-only page +
reviewer access follow in later PRs. (PR 1, the gov pipeline endpoint, is tracked on its
own branch workstream/gov-pipeline-funnel.)

## Changes

- [ ] Internship projects row: friendly gov names + open / view-as links
  - Date: 2026-10-27
  - Session: CC-20261027-p4k9
  - What changed: materialize-build-project names a gov project from the pursuit's
    solicitation title (not the gws key); projectDeliveryService surfaces project_kind +
    gov_delivery_project_id (+ enrollment_id on the row type); ProjectDeliveryView rows gain
    a "Project workspace" link (to /portal/gov-projects/:deliveryProjectId) and a read-only
    "View as <intern>" action (view-as token deep-linked to the cockpit). viewAsNextPath
    extracted as a tested pure helper.
  - Verification: tsc 5.9.3 clean in changed files (backend + frontend); backend service
    tests 27/27 (projectDelivery + projectDeliveryInterns); backend test-file typecheck
    ratchet clean; new frontend unit test projectDeliveryViewAs (runs in CI frontend-tests).
    Screenshot review follows post-deploy (user-facing admin UI).
  - Notes: no schema change. The "Project workspace" link 404s for a non-member admin until
    reviewer access exists (PR 3 auto-grants it). Rename of Aki's EXISTING project + the
    reviewer backfill have no clean admin endpoint; pending as optional one-off prod writes.
