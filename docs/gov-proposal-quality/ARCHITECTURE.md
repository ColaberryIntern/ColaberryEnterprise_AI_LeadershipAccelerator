# Architecture — Quality Upgrade

Additive evolution of the existing Proposal Studio (P3 checks / P6 package). No new external dependency, no migration, no `sequelize.sync({alter})`, no production write for tests. Every change is a pure function or a tightened branch in an existing service.

## Data flow (unchanged shape, honest contents)
```
RFP source ─► blueprint ─► documents ─► per-document review
                                           │
            runProposalDocumentChecks.ts ──┤  (renders for real page count, persists version)
                                           ├─► runDocumentChecks (documentChecks.ts)   [deterministic: coverage*, location, format, fact]
                                           └─► runAiChecks (documentChecksAI.ts)        [evaluator, proof*, clarity — whole-doc map-reduce]
                                           │
                                           ▼
                         CheckRunResult { scores, findings, passes, pageCount,
                                          locationCoverage, coverageFootprint, unverifiedChecks }
                                           │
            assembleProposalPackage ───────┤  (buildProposalPackage.ts — render FAILS CLOSED, manifest from fresh bytes)
                                           │   gold bound to current version (goldApprovedForVersion)
                                           ▼
        evaluateSubmissionReadiness (proposalHardGates.ts) ─► 5 hard gates ─► provisional? export disabled?
                                           │
          computeRubricScore (qualityRubricV1.ts) ─► Rubric v1.0 score (unknown ⇒ 0) ─► QualityRunRecord
```
`*` = the behavior fixed in this PR.

## Reused (unchanged) services
`renderProposalPdf.ts` (throws on failure; real page count), `govProposalReviewStore.ts` (version persistence + gate order + SoD), `govProposalSignatures.ts`, `proposalGrounding.ts`, `submissionPackage.ts` (currency-leak guard), `proposalReviewConfig.ts` (weights/thresholds).

## New modules
- `proposalHardGates.ts` — pure five-gate submission-readiness evaluator.
- `qualityRubricV1.ts` — immutable rubric config, quality-run record type, evidence-based scorer.

## Changed modules (surgical)
- `documentChecks.ts` — substantive `checkCoverage` + boilerplate/specificity helpers + `checkLocationCoverage`; `runDocumentChecks` carries the new optional signals.
- `documentChecksAI.ts` — `plainText` (no truncation) + windowed `windows()` map-reduce; proof zero-claims ⇒ UNVERIFIED.
- `buildProposalPackage.ts` — render loop fails closed + fresh-byte manifest; Gold via `goldApprovedForVersion`.
- `proposalPackageCore.ts` — `goldApprovedForVersion` pure helper.
- `proposalReviewTypes.ts` — optional `locationCoverage` / `coverageFootprint` / `unverifiedChecks` on `CheckRunResult`.

## Security & tenancy
No change to RBAC, tenant scoping, or the price-seal. The HTML sanitizer allowlist (`sanitizeProposalHtml`) is unchanged and still neutralizes prompt-injection content before storage/render. Pricing stays admin-only; the hard gates expose only a non-sensitive "pricing needs approval" status to restricted roles.

## Rollback
Revert PR #4264. No migration to unwind; the changes only make existing checks stricter, so reverting restores prior (less strict) behavior with no data impact.
