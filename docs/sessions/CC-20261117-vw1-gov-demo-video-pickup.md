# CC-20261117-vw1 — Gov cockpit demo-video pickup hardening

## Context
Follow-on to the gov cockpit demo-videos feature (PR #4146). Ali checked all 4 gov
contracts and saw no demo videos for the assigned interns. Investigation + a guarantee
that recorded demos get picked up once they exist.

## Investigation (prod, read-only)
- The feature reads ingested `presentation_recordings` for the contract owner's enrollment
  and plays them via the staff-ticketed `/api/internship-video/:id/file` route.
- **Aki Wam has zero recordings anywhere** — 0 attempts, 0 recordings, her only enrollment
  (`31c8ae5f`), any status. She marked 3 "Record Your…" prep tasks complete in
  `student_tasks`, but those are checkboxes with no video behind them. Full-text scan of
  every evidence/artifact/media/task table tied to her: no video reference.
- The platform-wide demo pipeline DOES work: `working_system_demo` has 9 ingested
  recordings (other interns). The cockpit already shows 4 videos on the 2 gov projects owned
  by the `ali@colaberry.com` enrollment. So the feature is correct; the videos simply were
  never recorded into the system for the gov interns.
- `gws:b1fb990c…` (the admin "Gov build" card id) is a **gov opportunity / qualification
  id**, not a student project — the student work still resolves to enrollment `31c8ae5f`.

## The latent silent-failure fixed
`admin/govContractsRoutes.ts` passes `resolveGovProjectActor(req)?.platformIdentityId ?? null`
to the projection. `resolveGovProjectActor` returns `null` whenever the admin's login email
has no matching `PlatformIdentity` row. The projection gated the demo-video loader on
`viewerCanVerify && viewerIdentityId`, so such an admin would **silently** see no videos even
when they exist and are playable.

That identity is only the ticket's **audit label** — `internVideoStreamRoutes` authorizes on
the signed, recording-bound STAFF ticket + recording id, never on the identity string
(`recordingTicket.ts`, `resolveStaffRecording` applies no cohort/ownership gate for staff).
So pickup must not depend on it.

**Fix:** `backend/src/services/factory/govProjectProjection.ts` — load the owner + demo
videos whenever `viewerCanVerify`, with a stable `'gov-cockpit'` fallback audit label when the
identity is null. Strictly additive: the intern path (viewerCanVerify=false) still never loads;
the admin-with-resolvable-identity path is unchanged.

## Pickup contract (now guaranteed)
When a demo becomes an **ingested** `presentation_recordings` row tied to the contract owner's
enrollment, it is (a) listed by `listGovDemoVideos` (enrollment-scoped, no cohort gate) and
(b) played by the ticket-only stream route (`resolveStaffRecording`, no cohort gate). Confirmed
Aki's PREP `working_system_demo` assignment is under enrollment `31c8ae5f`, so her recording
will match the owner the cockpit resolves.

## Tests
`govProjectProjection.test.ts` — 3 new PICKUP tests: loads with a null identity (fallback label
asserted), threads a real identity through, and never loads for an intern. Full suite green
(53 tests). Backend tsc clean except the pre-existing `maxmind` module-not-found.

## Still open (not in this PR)
No recorder is wired for gov interns in the cockpit; demos only land via the PREP
Presentation Studio. Building an in-cockpit record/upload is a separate decision Ali is holding.
