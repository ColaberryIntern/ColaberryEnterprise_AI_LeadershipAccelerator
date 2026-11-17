# Session CC-20261117-vw1 - Gov cockpit: the intern's demo videos + "View as them"

Two asks from Ali on the gov Contract cockpit (`/admin/internship/gov-contract/:projectId`), after seeing
Akiwam's (Aki Wam's) contract:

1. **See the intern's recorded demo videos in Build artifacts.** The section read "No build artifacts submitted
   yet", but Aki recorded 3 demos in the app (Presentation Studio takes: Record Your Project Introduction /
   Working-System Demo / AI Visual Presentation). Ali, confirmed: "When she says locally she means in the app. She
   completed 3 of the videos. Find them and make sure demo videos always end up in this path."
2. **A link to open the project AS the assigned intern** (read-only), from every contract.

One PR, two features, both on the same cockpit surface (so no stacked PRs, one merge/deploy).

## Ask 1 - demo videos in Build artifacts (admin-only, ticketed)

The videos are ingested `presentation_recordings` on the intern's enrollment (`-> presentation_attempts ->
presentation_assignments.enrollment_id`). They are NOT `runtime_portfolio_artifacts`/repo files (that is the
"Submitted from the repo" block), which is why an empty Build-artifacts section did not show them.

- **`backend/src/services/factory/govDemoVideos.ts`** (new): `resolveGovContractOwner(deliveryProjectId)` (the
  `solution_build` track's student project owner: enrollment id + name) and `listGovDemoVideos(enrollmentId,
  staffIdentity)` - ALL the enrollment's ingested takes, newest first, scoped strictly to that enrollment ("always
  end up in this path"). Playback reuses the existing admin route `GET /api/internship-video/:id/file`, authorized
  ONLY by a signed, recording-bound STAFF ticket (`createStaffRecordingTicket`), so the `<video>` plays with no
  session. No secret returned.
- **`govProjectProjection.ts`**: new admin-only, best-effort loader block (guarded by `viewerCanVerify &&
  viewerIdentityId`) sets `view.demoVideos` + `view.ownerEnrollmentId`/`ownerName`. Withheld from an intern mount
  (viewerCanVerify false); the intern's own takes live in their Project Studio. New optional type fields +
  `GovDemoVideo` imported from `govDemoVideos`.
- **`DemoVideoGallery.tsx`** (new, frontend): poster-thumbnail cards; clicking plays the take in a modal. URLs
  prefixed via `internVideoApi.apiUrl`.
- **`BuildEvidence.tsx`**: renders `<DemoVideoGallery videos={view.demoVideos ?? []} />` in the Build-artifacts
  section (renders nothing when empty). Empty-state copy reworded (demo videos now have their own block); the
  frozen escaped-dash baseline for this file dropped 2 -> 1 accordingly.

## Ask 2 - "View as the assigned intern" on the cockpit

The read-only view-as flow already exists (`getViewAsUrl(enrollmentId)` -> opens `/portal/gov-projects/:id` as the
member, a short-lived participant token, writes blocked). It was wired on the Project Delivery board, not the
cockpit.

- **`AdminGovContractCockpitPage.tsx`**: a "View as <intern>" button in the PageHeader actions (shown only when
  `ownerEnrollmentId` is present), opening the read-only session landing on the intern's own gov cockpit.

## Tests (real CI gates)

- Backend jest: `govDemoVideos.test.ts` (owner resolve, enrollment-scoped ingested query, per-recording ticketed
  url shaping). Gov consumer suites (govProjectPortalRoutes / govBuildArtifactResponse / govBuildArtifacts /
  govProjectAccess) still green: 75 pass. Frozen lints (typography/copy/banned): 55 pass.
- Frontend react-scripts: `studioParity.test.tsx` (demo videos render, player opens on the ticketed file url, no
  block without videos) + new `AdminGovContractCockpitPage.test.tsx` (view-as button names the intern, opens with
  `next=/portal/gov-projects/:id`, absent with no assigned intern): 64 pass.
- Backend tsc: clean (the only errors are a pre-existing local `maxmind` dep gap in `enrichVisitorGeo.ts`, declared
  in package.json, present in CI). Frontend tsc: clean.

## Deploy

BOTH backend AND nginx (registry mode, sha-<full40>) via `scripts/deploy-prod.sh` after Ali's merge. Backend
carries the projection + resolver; nginx carries the cockpit UI. The authenticated eyeball (open Aki's contract,
see her 3 videos play; click "View as Aki Wam") is Ali's manual step - no participant/admin token is minted here.
