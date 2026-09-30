# Government Qualification Workspace — Permission & Authorization Matrix (Phase 2)

**Status:** Phase 2 completion checkpoint (built + unit-tested; NOT merged, NOT deployed). The live OP v2 detail
adapter is IMPLEMENTED against the pinned contract (OP PR #3, schema LF sha256 `26ff667e…`) but that PR is
**undeployed**, so no cross-repo LIVE integration is claimed — the adapter is verified with mocked fetch +
fixtures. In **production** the adapter uses the live HTTP path and NEVER falls back to fixtures; with no live
config in production, source resolution fails closed. Approvals stay **blocked** whenever the source is not
`available`, current, covered, and unblocked. See the "Phase 2 completion update" section at the end.

This document is the human-readable half of the access contract the code enforces. It exists so a reviewer can
see, in one place, who may do what and where each control lives in code.

---

## 1. The two gates, and why they are separate

| Gate | What it protects | Mechanism | Removable by |
|---|---|---|---|
| **Section gate** | Reaching any qualification route at all | `requireSection('program')` on every route + `mgmtSectionGate` PATH_SECTION `/api/admin/factory` → `program` (PREFIX, covers `/qualification/**`) | Config (a role/section grant) |
| **Build authorization gate** | Running any solution-build/generation work | `assertBuildAuthorizedForProject()` — a pure refusal function called at the single generation entry (`factoryGenerateIfEnabled`) | **Code change only** (mirrors `releaseGate.assertDeploymentAuthorized`) |

A **pursuit approval is not a build authorization.** Approving a bid pursuit (research/proposal effort) never
authorizes a solution build. A build needs a *separate*, named, scoped, resource-limited `build_authorizations`
row, and the generation path refuses by construction until one exists. This is what keeps the autonomous builder
parked — there is no autobuild service, and the build path is a hard refusal, not a feature flag.

## 2. Who may reach the workspace

`requireSection('program')` admits (section-level only):

- legacy `admin` / `super_admin` tokens; and
- a management token whose `mgmt_role` ∈ { `owner`, `admin`, `curriculum` } (the roles that already manage
  delivery projects — a delivery contract is program-domain work, the same section as `/api/admin/projects`).

The section gate is **role-level only**. It does **not** by itself enforce separation of duties — that is a
second, in-service check (below).

## 3. Action-by-action matrix

| Action | Route | Who | Extra control beyond the section gate |
|---|---|---|---|
| View workspace (source facts, requirement evaluation, record) | `GET /api/admin/factory/qualification/:canonicalId` | any `program` identity | Tenant-scoped via `lookupGovContractsContainer` (fail-closed 503); source is server-fetched, never browser-supplied |
| Open a qualification (pending_review) | `POST …/:canonicalId` | any `program` identity | Source **re-fetched server-side**; created record binds that snapshot + version. Source unavailable → **503**, nothing created |
| Record a non-approval decision (`needs_evidence`, `no_bid`, `pending_review`) | `POST …/:canonicalId/decision` | any `program` identity | CAS on `expectedVersion` (stale → **409**); fork-on-edit (never mutates a prior version) |
| **Approve** a pursuit (`approved_bid_pursuit`, `rfi_response`) | `POST …/:canonicalId/approve` | any `program` identity **≠ the record's reviewer** | Separation of duties: **`SelfApprovalError` → 403** if approver == reviewer. Source re-fetched + re-evaluated server-side |
| Link an opportunity to an existing gov project | `POST …/:canonicalId/link` | any `program` identity | Existence-checked, tenant-scoped, government-class-only; idempotent; one-opportunity-one-project (conflict → **409**) |
| **Authorize a build** (separate from any approval) | `POST …/:canonicalId/authorize-build` | any `program` identity | Validate-before-write: a named approver + scope + resource limit are all required, else **400**. This is the ONLY way a build becomes possible |

## 4. Approval decision states (5)

`pending_review` → `needs_evidence` → `no_bid` → `rfi_response` → `approved_bid_pursuit`.

The last two are **approvals**: they may only be recorded through `approveGovQualification`, which:

1. CAS-guards on the reviewed version (stale → 409);
2. refuses self-approval (approver == reviewer → 403);
3. **re-fetches** the OP detail by canonical id (server-authoritative — browser facts are ignored);
4. fails **closed** if the source is unavailable (503);
5. rejects a **changed source** (re-fetched `sourceSnapshotVersion` ≠ reviewed version → 409, renewed review
   required);
6. re-evaluates requirements and refuses if **any** blocks (422);
7. forks a new approved version binding the re-fetched snapshot + the approver identity.

## 5. Requirement evaluation — missing evidence never silently passes

`evaluateRequirements` (pure) marks a requirement **blocking** when:

- `applicability` is `unknown` (a first-class blocking state — never treated as "no");
- `applicability` is `not_applicable` with **no** `applicabilityEvidenceRef` (an unevidenced dismissal);
- the requirement is applicable, **binding** (`binding_solicitation_requirement` /
  `mandatory_response_instruction`), due at **submission**, and has **no** `evidenceRef`.

A delivery/award-stage obligation with no evidence is **flagged** (needs a credible plan and its own later gate)
but does **not** block a bid-pursuit approval — a future obligation must not block initial research.

## 6. Error → HTTP status mapping

| Error | Status | Meaning |
|---|---|---|
| `QualificationConflictError` | 409 | Stale `expectedVersion` (CAS) |
| `ChangedSourceError` | 409 (`changedSource:true`) | Source changed since review — renew review |
| `QualificationBlockedError` | 422 | A requirement blocks the approval |
| `SourceUnavailableError` | 503 | Source evidence unavailable — fail closed |
| `SelfApprovalError` | 403 | Reviewer may not approve their own pursuit |
| `QualificationNotFoundError` | 404 | No active record for (canonical, bidding entity) |
| `BuildNotAuthorizedError` | 400 / (403 at build path) | Missing/empty/revoked build authorization |
| `AliasConflictError` | 409 | Opportunity already linked to a different project |

## 7. Tenant / entity isolation

- Every route resolves the **fixed Government Contracts container** read-only (`lookupGovContractsContainer`);
  if it is not configured the route **fails closed (503)** and writes nothing.
- A qualification carries its own `tenant_id` / `organization_id` / `bidding_entity`. The thread is unique on
  `(canonical_opportunity_id, bidding_entity, version)`, so **two bidding entities may pursue the same
  opportunity** independently while each thread stays race-safe.
- The alias link verifies the target project is in-tenant and government-class; a cross-tenant project reads as
  **not found** (no enumeration).

## 8. Code locations

| Concern | File |
|---|---|
| Schema (3 additive tables) | `backend/src/db/ensureGovQualificationSchema.ts` |
| Qualification service (create/decision/approve/evaluate) | `backend/src/services/factory/govQualification.ts` |
| Build gate | `backend/src/services/factory/buildAuthorization.ts` |
| Build gate enforcement point | `backend/src/services/factory/factoryGenerationEntry.ts` |
| Alias mapping | `backend/src/services/factory/opportunities/govOpportunityAlias.ts` |
| Server-side source resolve (live v2 + fixtures) | `backend/src/services/factory/opportunities/opDetailClient.ts` |
| Pinned schema + Zod boundary validator | `backend/src/services/factory/opportunities/govOpportunityV1.schema.json` + `govOpportunityV1.zod.ts` |
| Trusted discovery→canonical mapping (v2 list) | `backend/src/services/factory/opportunities/opListClient.ts` |
| Routes | `backend/src/routes/admin/govQualificationRoutes.ts` |
| Workspace + journey UI | `frontend/src/pages/admin/AdminGovQualificationPage.tsx` |

---

## Phase 2 completion update (usable journey + live adapter)

### Evidence-coverage gate (a pursuit approval now needs sufficient, cited evidence)
Pursuit approval requires BOTH no blocking requirement AND `evaluateEvidenceCoverage(source, established)` sufficient:
- **Zero established requirements → blocked** (`no_requirements_established`). OP's `requirements[]` is ALWAYS empty
  (it never synthesises from a title, and the schema says an empty array is not "no requirements"), so the reviewer
  must establish the applicable, cited requirements (`requirements_json.established`, recorded via `/decision`).
- Coverage is judged from `documents.items[]`: authoritative = `role ∈ {solicitation, final_pws_sow, amendment}`
  (a `draft_pws` is not binding), reviewed = `retrieval.status === 'downloaded'`. Sufficient when the base
  solicitation + **every** amendment are downloaded — so **partial** coverage is not automatically failure (only
  non-authoritative attachments inaccessible is fine); a missing amendment → `authoritative_package_unreviewed`;
  `none_published`/no authoritative item → `no_authoritative_source`; `inaccessible`/`unknown` → `document_coverage_unknown`.
- Submission prerequisites stay separate from delivery/award obligations (the latter are flagged, not blocking).

### Server-side source-state gate (UI-bypass safe — coordinator item #6)
`approveGovQualification` resolves the source via `resolveGovOpportunityDetail` and enforces, in order:
CAS 409 → self-approval 403 → **unavailable/auth_failed/malformed → 503** → **degraded OR snapshot-unrecorded →
`SourceNotApprovableError` 409** → changed-source (honest `meta.sourceSnapshotVersion` ≠ reviewed) 409 →
evidence-coverage/blocking 422 → fork on the honest snapshot version. A direct `/approve` caller cannot bind an
approval to non-authoritative source (proven by direct-service tests).

### Production cannot approve from fixture data
`opDetailClient` returns fixtures ONLY when `env.nodeEnv !== 'production'`. In production it uses the live v2 HTTP
path (X-API-Key + scope `read:gov_opportunities`, reads `.data`, validates the pinned Zod schema, binds
`meta.sourceSnapshotVersion`) and NEVER falls back to fixtures; with no live config in production, resolution is
`unavailable` → approval 503. `OPPORTUNITY_PULSE_V2_BASE` being set is not proof the source is live/authed/
compatible — the resolver reports the actual state (`available`/`degraded`/`snapshot_unrecorded`/`unavailable`/
`auth_failed`/`malformed`), surfaced to the UI.

### Canonical id comes only from the trusted producer path
The v1 best-fit/bonfire feed exposes no canonical id; a canonical id is NEVER derived from a title/integer id.
`GET /api/admin/factory/qualification-candidates` proxies OP's v2 list (`opListClient`), which carries a real
`op:gov:<hex>` per item; rows without a valid canonical id are dropped. When v2 is unavailable it returns
`{ available:false, reason }` and the UI surfaces the gap instead of offering a start.

### Updated error → HTTP status map (additions)
| Error | Status | Meaning |
|---|---|---|
| `EvidenceInsufficientError` | 422 (`evidenceInsufficient`, `reasons[]`) | Document coverage / established requirements insufficient |
| `SourceNotApprovableError` | 409 (`sourceNotApprovable`, `reason`) | Source present but degraded or snapshot-unrecorded — renew review, not a blind retry |

### New endpoint
`GET /api/admin/factory/qualification-candidates` (program-gated, tenant-scoped) — trusted v2 candidate list for
starting a qualification.

### Named deferrals
Cannot claim LIVE integration (OP PR #3 undeployed; verified against the pinned contract with mocked fetch).
Rich requirement-authoring UX beyond the minimal cited-requirement form. `?snapshotVersion=` historical fetch
(current snapshot is bound). The v1 discovery page still lists candidates requiring qualification; the canonical
"start" flows through the v2 candidate picker.
