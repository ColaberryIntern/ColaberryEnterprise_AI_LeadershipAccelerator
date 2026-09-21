# Session CC-20260920-af3p — AI Project Factory, Phase 1 (contracts + one sample)

Per-PR session log (separate from PROGRESS.md to avoid union-merge conflicts). Branch
`workstream/ai-project-factory-phase1`. Run via loop-architect (plan audited 19/20; foundation
independently verified 12/12). Phase 1 = typed contracts + one worked sample, no UI, no LLM,
additive schema only. Product spec: AI_PROJECT_FACTORY_AND_INTERNSHIP_COMMAND_CENTER_PLAN.md;
execution plan: docs/AI_PROJECT_FACTORY_EXECUTION_PLAN.md. Decomposition model from the NuOrg
teardown Ali emailed.

- [x] Phase 1: two-track contract model + decomposition schema + machine gate + transactional
      approval + identity map + one validated sample, all additive
  - Date: 2026-09-20
  - Session: CC-20260920-af3p
  - What changed:
    - `services/factory/contracts/factoryContract.ts` (+ `factoryContractSchema.ts` mirror):
      the typed contracts — ContractTrack, ContractRequirement (compliance matrix, evidence_state),
      ProcessRecord, FactoryTask (source-evidence cites + required_skills/judgment/decision_authority/
      data_sensitivity/interaction_pattern/frequency/confidence/method), Assignment (role +
      responsibility + executor person|team|agent), Role, TransitionEdge, ApprovalRecord, FactoryProject.
    - `services/factory/factoryIds.ts`: idempotent uuid5 from source identity.
    - `services/factory/factoryValidate.ts`: the pure machine gate with NuOrg rule codes —
      SOURCE_COVERAGE, SOURCE_CLASSIFICATION, PERFORMER, OVERSIGHT (agent needs a human
      ACCOUNTABLE/APPROVER; a system may never BE one), LOOP, BRANCH_KIND/DECISION,
      START/END/REACHABILITY, DUPLICATE_ASSIGNMENT, EFFORT_EVIDENCE, STAGE_LIMIT.
    - `services/factory/factoryApproval.ts`: content hash + expected_version compare-and-swap +
      fork-on-edit + two-level (documented/full) with decoupled enrichment_status.
    - `services/factory/projectIdentityMap.ts`: branded id types (delivery vs student build) so
      the two UUID spaces cannot be crossed at compile time; bridge resolution via DeliveryProjectSourceLink.
    - `db/ensureContractTrackSchema.ts` (+ models ContractTrack/ContractRequirement/ContractProcessDocument,
      exported in models/index.ts): new tables FK'd to delivery_projects/projects — additive only.
    - `db/ensureFactoryTaskSchema.ts` (+ StudentTask model additive field declarations): 11 new
      nullable, default-free columns on student_tasks (the archived_at/approval_state pattern).
    - Both ensure*Schemas wired at boot in server.ts after the approval block.
    - `services/factory/sample/sampleContractProject.ts`: one worked sample government contract
      (both tracks, an agent-performed task with a human accountable, evidence-cited process).
    - `scripts/seedSampleContractProject.ts`: idempotent persistence of the contract layer for a
      given delivery project (run at deploy). `scripts/renderSampleContractReview.ts` +
      `docs/samples/sample-contract-review.html`: the rendered manager review, generated from the data.
  - Verification: 47 factory tests pass under `jest -c jest.ci.config.ts` (contract 4, ids 5,
    validate 11, approval, identityMap, sample 5, render 5, two additive-only schema suites 7);
    foundation T1–T5 independently graded 12/12 by loop-task-verifier; backend `tsc --noEmit` clean.
  - Notes: sample is NOT seeded to a live DB in Phase 1 (needs a delivery_projects parent =
    engagement + tenant, a later delivery-domain integration); the seed script is the persistence
    path. No existing table column changed. Phases 2–6 (LLM decomposition, generation pipeline,
    command-center UIs, evidence/approvals, builder integration, migration) follow. Phase 5 is
    gated on the AI-builder tab design.
