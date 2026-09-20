# Session CC-20260920-rv9k (Student project: review + approve, and the STORY-000 fix)

Per-PR session log (kept separate from PROGRESS.md to avoid union-merge conflicts).

From Ali testing the AI Internship intake end to end: after a phone-intake build
he could not see STORY-000 when viewing the project "as the student would", and he
asked that once a project is built the student be shown everything about it to
confirm it matches what they wanted, and be able to approve it.

Branch: `feat/project-review-approve` (cut from `origin/main`).

---

## Diagnosis (before any code)

- [x] STORY-000 is NOT missing from the build — it is a client rendering bug
  - Date: 2026-09-20
  - Session: CC-20260920-rv9k
  - What changed: nothing (read-only prod audit). Ran a read-only per-project query
    for ali@colaberry.com: the phone-built "AI Government Contract Finder" is
    `plan_status: published`, 21 tasks, `has_STORY-000: true`, `browser_imported_lists: 0`.
    Every real built project has STORY-000. So the data is correct; the student view
    was showing the local optimistic skeleton ("Project DNA & Requirements / Step 2 of 9")
    instead of the published tree. "Story 000" = `STORY-000 · Build your Command Center`,
    injected at publish by materializeTasks and kept out of `plan.stories` by design.
  - Verification: prod read-only query (SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY).

## Backend — review + approve

- [x] Project approval state (schema, model, service, routes, DTO), gated + default-free
  - Date: 2026-09-20
  - Session: CC-20260920-rv9k
  - What changed:
    - `db/ensureProjectApprovalSchema.ts` (new) + wired at boot after
      `ensureProjectArchiveSchema`. Additive, NO default on `approval_state`: NULL means
      "never gated" so every existing project (and every current student) is untouched.
      Columns: `approval_state` TEXT, `approved_at`, `approved_by`, `approval_notes`,
      `approval_updated_at`; partial index on pending rows.
    - `models/Project.ts`: `ProjectApprovalState` type + the five fields (interface,
      declare, init) — declared in init so Sequelize does not strip them.
    - `services/projects/projectApprovalService.ts` (new): `approveProject`,
      `requestProjectChanges` (both owner-guarded — loaded by id AND enrollment, foreign
      id → null → 404, idempotent), and `markProjectPendingApproval` (publish hook —
      gate-scoped, sets pending only from NULL/changes_requested, NEVER throws into the
      build). Gate matcher `approvalGateAppliesTo` mirrors `agentScopingEnabledFor`.
    - `config/env.ts`: `PROJECT_APPROVAL_GATE` ('off' | 'all' | enrollment-id list),
      default off — per-enrollment so it can be tested on one account while a class runs.
    - `sbpOrchestrator.ts` publishBuild: `markProjectPendingApproval` after `makeActiveProject`
      in both publish paths (no-repo and repo).
    - `projectTreeDto.ts`: `approval_state` (+ `approved_at`, `approval_notes`) on
      ProjectTreeDto and `approval_state` on ProjectSummaryDto, emitted by both mappers.
    - `routes/projectsPortalRoutes.ts`: `POST /:projectId/approve` and
      `POST /:projectId/request-changes` (owner-guarded, next to archive/restore).
  - Verification: `projectApprovalService.test.ts` — 13 pass (matcher, owner guard,
    idempotency, publish-gate scoping incl. never-throws); all `services/projects` — 134
    pass (existing DTO test unbroken); backend `tsc --noEmit` clean.

## Frontend — review gate + the STORY-000 fix

- [x] "Review your project" gate + Approve / Request changes
  - Date: 2026-09-20
  - Session: CC-20260920-rv9k
  - What changed:
    - `projectHydrate.ts`: `approval_state` on `BackendProjectTree`; mapped to
      `approvalState` in `backendTreeToProject` and adopted by `overlayCompletions`
      (threaded exactly like `commandCenterUrl`, incl. the same-reference fast path).
      Absent → null → ungated.
    - `projectsStore.ts`: `approvalState` on `StudentProject` (absent/null = ungated) +
      `setApprovalState` optimistic mutation.
    - `ProjectReviewPane.tsx` (new): shows what it does, the Command Center/STORY-000,
      the releases + stories, the requirements, then Approve / Request changes (with a note).
    - `projectApprovalApi.ts` (new): `approveProject` / `requestProjectChanges`, never-throw
      Result convention (mirrors projectArchiveApi).
    - `ProjectsPage.tsx`: `review` view; `openInterior`, `openTaskWorkspace` (and thus
      `openStory000`) route a `pending_approval` project to the review screen; defensive
      guard in the interior render block; `handleApprove` (clears gate, opens workspace)
      and `handleRequestChanges`. ONLY `'pending_approval'` gates — null/approved/
      changes_requested behave exactly as today.
  - Verification: frontend `tsc` clean for these files (only unrelated stale-node_modules
    d3 errors); `projectHydrate.approvalState.test.ts` (new) + all 142 `projectHydrate`
    tests pass. Full CRA build/eslint via CI (local build needs Docker).

- [x] STORY-000 rendering fix: heal server-bound local placeholders that were never active
  - Date: 2026-09-20
  - Session: CC-20260920-rv9k
  - What changed: `projectSync.ts` — the pull only fetched the ACTIVE project's tree, so a
    published build that was not active at pull time kept its `origin:'local'` skeleton
    (no STORY-000), and `hydrateMissingProjects` skipped it because the placeholder already
    "held" the backend id. Added `refreshProjectById` (GET `/:id` → `reconcileProjects` with
    UNKNOWN_INVENTORY → supersede, lossless) and `refreshHeldLocalPlaceholders` (scoped to
    `origin==='local' && backendIdOf!==null`, so genuine local-only builds and the sample are
    never touched), run last in `reconcileFromBackend`.
  - Verification: 142 `projectHydrate` tests pass (reconcile supersede guards unchanged);
    frontend `tsc` clean for these files.
  - Notes: gate ships behind `PROJECT_APPROVAL_GATE` (default off) so nothing is gated until
    Ali turns it on for an enrollment; the STORY-000 fix is unconditional.
