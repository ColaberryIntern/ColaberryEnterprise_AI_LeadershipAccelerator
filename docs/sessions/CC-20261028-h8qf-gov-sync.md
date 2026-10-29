# Session CC-20261028-h8qf — gov sync-recovery (plan publish on sync)

**Date:** 2026-10-28
**Branch:** `workstream/gov-sync-plan-publish` (cut from `origin/main`)
**Scope:** Fix the durable gov-sync defect found diagnosing Omolola's Saratoga build: the repo-sync
path never publishes a gov build's plan, so a gov student who connects a repo and clicks "Sync from
GitHub" gets `no_plan` forever and the platform never writes `.colaberry/plan.json` / manifest / docs
into their repo. Same class as the earlier gov sync-recovery wiring gap.

---

- [x] Publish a gov build's plan on the repo-sync path
  - Date: 2026-10-28
  - Session: CC-20261028-h8qf
  - What changed: NEW `backend/src/services/sbp/govPlanForSync.ts` — `ensureGovPlanPublishedForSync(projectId)`
    loads the project, and ONLY when it is a gov build (`project_variables.kind === 'gov'`, via the pure,
    tested `isGovBuildProjectVariables`) calls `ensureGovBuildPlanPublished` (idempotent). Best-effort:
    never throws, logs, returns false for a non-gov project or a handled failure. Wired into
    `refreshRepoDocuments.ts` immediately before `getPublishedPlan`, so the gov plan exists before the
    `no_plan` check. Gating to gov builds matters because regular SBP builds also carry STORY tasks, so
    an unconditional call would fabricate a gov plan for a non-gov project.
  - Verification: `govPlanForSync.test.ts` (new) — the `kind === 'gov'` gate (exact match, case-sensitive,
    false on missing/malformed). Backend typecheck authoritative in CI. The fix was PROVEN by a read-only
    prod diagnosis: her `github_connections` row is writable (`platform_can_push:true`), her build has 14
    materialized STORY tasks, but `build_plans` for her project was EMPTY and no `writeDocsToRepo`/bot
    commit ever ran — exactly the `no_plan` short-circuit this removes.
  - Notes: Also fixes a second symptom — `verifyBuildFromRepo` reads `getPublishedPlan` directly too, so
    gov commit→story evidence was never recorded on hand-sync (her `gov_build_story_evidence` was empty
    despite a STORY-000 commit). Operational unblock for the existing stuck student is separate (publish
    her plan once); this is the code fix so it never recurs for any gov intern.

## Files changed

| File | Change |
|---|---|
| `backend/src/services/sbp/govPlanForSync.ts` | New — gov-gated, idempotent plan publish for the sync path |
| `backend/src/services/sbp/__tests__/govPlanForSync.test.ts` | New — the gov-build gate |
| `backend/src/services/sbp/refreshRepoDocuments.ts` | Publish the gov plan before reading it (one import + one call) |

---

- [x] CI fix: document the new SBP module in the build-student-project runbook
  - Date: 2026-10-29
  - Session: CC-20261028-h8qf
  - What changed: `skillRunbookCoverage.test.ts` (an existing SBP gate) failed on PR #3464 because the new
    `govPlanForSync` module was not named in the `build-student-project` runbook — the gate requires every
    `backend/src/services/sbp/` module to be documented with the failure it prevents, or allow-listed with a
    reason. Added a module-table row for `govPlanForSync.ts` in
    `.claude/skills/build-student-project/references/pipeline-internals.md` naming the student-visible failure
    (a gov student's repo stays empty on Sync). Documented rather than allow-listed, since it has a very real
    student-visible failure mode (it is Omolola's bug).
  - Verification: `node ../node_modules/jest/bin/jest.js --testPathPattern "skillRunbookCoverage"` → 4/4 pass.
  - Notes: The red check on #3464 was this gate, not the new `govPlanForSync.test.ts` (which passed). Backend
    typecheck + the new test were already green.
