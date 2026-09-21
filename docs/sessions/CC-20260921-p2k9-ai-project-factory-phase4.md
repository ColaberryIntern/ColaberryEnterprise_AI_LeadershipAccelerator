# Session CC-20260921-p2k9 — AI Project Factory, Phase 4 (approvals / evidence write layer)

Per-PR session log (separate from PROGRESS.md to avoid union-merge conflicts). Branch
`workstream/ai-project-factory-phase4`. Run via loop-architect (plan audited 20/20 cycle 1). Phase 4 =
the Approve / Request-changes write actions on the command center, plus a prod demo contract to approve
live. Scope (Ali): Capability + PROD demo. Builds on Phase 1–3 (#2750 / #2762 / #2764).

- [x] Phase 4: approve + request-changes write layer + a prod demo contract, additive
  - Date: 2026-09-21
  - Session: CC-20260921-p2k9
  - What changed:
    - `db/ensureContractTrackSchema.ts`: added the additive `contract_process_reviews` table (a companion
      review record) + `models/ContractProcessReview.ts` (exported in models/index.ts).
    - `services/factory/factoryReview.ts`: `requestChanges` — records a 'changes_requested' review against
      the reviewed version, with a required reason; NEVER mutates the immutable document.
    - `routes/admin/factoryRoutes.ts`: `POST /api/admin/factory/contract/:id/approve` (wires the gated
      `approveProcessDocument`; approvedBy from the JWT; maps ApprovalConflictError→409, ApprovalGateError
      →422 with issues, no-document→404, illegal-transition→409), `POST .../request-changes`, and
      `GET /api/admin/factory/contracts` (so the page defaults to a real contract). Added `trackType` to
      the approval response so the UI targets the right track.
    - `frontend/src/services/factoryApi.ts`: `listFactoryContracts`, `approveFactoryContract`,
      `requestFactoryChanges`. `AdminFactoryCommandCenterPage.tsx`: defaults to the newest real contract,
      ENABLES the two controls for a real contract (sample stays read-only), wires the mutations with
      saving/error/refresh; Approve defaults level=documented for a draft, full for a documented doc.
    - `scripts/seedFactoryDemoContract.ts`: a prod-safe, idempotent, reversible seed that resolves the
      `refactored` tenant/brand (never invents), findOrCreate's a labeled demo org/engagement/project on a
      stable slug, and persists the sample decomposition. `scripts/seedSampleContractProject.ts` refactored
      to export the reusable `persistSampleContract`.
    - `services/factory/README.md`: documented the approval write layer + review record + demo seed.
  - Verification: backend `jest -c jest.ci.config.ts` — factoryReview 2/2, factoryRoutes 13/13 (approve
    happy/409/422/404/illegal + request-changes 201/400 + contracts list + guard), ensureContractTrackSchema
    4/4 (new table additive), seedFactoryDemoContract 3/3 (fresh + idempotent + tenant-refusal). Frontend
    `react-scripts test` — factoryApi 5/5, page 3/3. Type-clean via `tsc --noEmit --skipLibCheck`. Graded by
    loop-task-verifier.
  - Notes: Additive — a new `contract_process_reviews` table only; the immutable contract_process_documents
    and its CAS approval ladder are untouched (request-changes is a companion record). Read-only safety kept:
    the sample fixture can never be approved. Scope: Capability + PROD demo — a guarded, idempotent,
    reversible demo contract is seeded on prod (removable, see handoff). Evidence-state editing deferred. The
    SBP student build UI and the student STORY-000 Command Center are untouched.
