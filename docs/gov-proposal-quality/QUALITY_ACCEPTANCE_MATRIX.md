# Quality Acceptance Matrix

Honest status for each release (R0–R7) and regression test (T01–T18). `DONE` = implemented + tested in this PR. `PARTIAL` = core implemented, named extension deferred. `FOLLOW-UP` = not in this PR, tracked. `N/A` = not applicable to this code path. Nothing here is marked done that is not backed by a committed test or code path.

## Releases
| R | Scope | Status | Notes |
|---|---|---|---|
| R0 | Recon, rubric config, quality-run record | **DONE (record type) / PARTIAL (persistence)** | `qualityRubricV1.ts` has the immutable rubric + `QualityRunRecord` type + evidence scorer. A dedicated DB table for run records is FOLLOW-UP; records serialize into the report today. |
| R1 | Mandatory compliance + submission manifest | **PARTIAL** | The hard-gate engine (`proposalHardGates.ts`) consumes manifest state and blocks correctly (T01/T02/T03/T17). Exhaustive automated manifest EXTRACTION from the RFP is FOLLOW-UP; forms/refs/pricing are already modeled as human needs. |
| R2 | Substantive coverage, not anchor coverage | **DONE** | `checkCoverage` is substantive; `checkLocationCoverage` preserves the structural signal separately. T04. |
| R3 | Independent evaluator + full-content read | **DONE (full-content + proof) / PARTIAL (proposal-level synthesis)** | 8,000-char truncation removed (map-reduce, T05); proof zero-claims ⇒ UNVERIFIED (T06); three independent judges retained. Proposal-level 3-pass agency-rubric synthesis is FOLLOW-UP. |
| R4 | Technical/implementation specificity | **PARTIAL** | Boilerplate no longer earns coverage; thin/generic answers are flagged. Full buyer-problem→proof chain generation is FOLLOW-UP. |
| R5 | Commercial completeness + records | **FOLLOW-UP** | The hard gate blocks honestly on missing pricing/references; the workbook reconciliation engine is FOLLOW-UP. No fabricated pricing/references by design. |
| R6 | Immutable package integrity + re-audit | **DONE (fail-closed + fresh bytes + version-bound Gold) / N/A (ZIP re-audit on P6)** | Render fails closed (T09); manifest page count from fresh bytes (T13); Gold version-bound (T18). The P6 manifest path emits no ZIP, so ZIP byte re-audit (T10) belongs to the separate `submissionPackage` path — FOLLOW-UP there. |
| R7 | Decision-focused UX + trust timeline | **FOLLOW-UP** | Backend truth (gates, provisional, footprint) is in place and serialized in the report; the Studio UX surfaces are FOLLOW-UP. |

## Regression tests
| T | Scenario | Result | Where |
|---|---|---|---|
| T01 | Missing signed exhibit | **BLOCKED ✓** | `proposalHardGates.test.ts` |
| T02 | Missing priced offer | **BLOCKED ✓** | `proposalHardGates.test.ts` |
| T03 | Fewer than required eligible references | **BLOCKED ✓** | `proposalHardGates.test.ts` |
| T04 | Generic section + correct `data-req` anchor | **NOT covered ✓** | `documentChecks.test.ts` |
| T05 | Obligation after char 8,000 | **Evaluated ✓** | `documentChecksAI.test.ts` |
| T06 | Proof returns zero claims | **UNVERIFIED, not 100 ✓** | `documentChecksAI.test.ts` |
| T07 | Contradiction / unsupported assertion | **PARTIAL** — proof flags unbacked claims; cross-document contradiction detection FOLLOW-UP | `documentChecksAI.ts` |
| T08 | Changed addendum after analysis | **PARTIAL** — new version invalidates Gold; explicit source-hash re-analysis trigger FOLLOW-UP | `proposalPackageCore.ts` |
| T09 | PDF render throws/null | **Package fails, no success manifest ✓** | `buildProposalPackage.test.ts` |
| T10 | Final ZIP corrupt / re-audit | **N/A** to P6 manifest path (no ZIP emitted); FOLLOW-UP on `submissionPackage` | — |
| T11 | Price edited after Gold Go | **PARTIAL** — version-bound Gold forces re-approval; pricing RBAC unchanged (existing) | `proposalPackageCore.ts` |
| T12 | Non-admin attempts pricing/Gold | **EXISTING** server RBAC, unchanged here | routes |
| T13 | Valid package, bytes verified | **DONE** — page count from fresh rendered bytes ✓ | `buildProposalPackage.test.ts` |
| T14 | Re-run same snapshot | **PARTIAL** — deterministic checks are pure/stable; AI variability traced via judge runs | `documentChecks.ts` |
| T15 | Malicious instructions in RFP | **EXISTING** `sanitizeProposalHtml` allowlist, unchanged here | `govProposalDocumentDraftAI.ts` |
| T16 | Utah municipal solicitation | **N/A by design** — no Texas rules imposed; forms/refs are solicitation-driven | — |
| T17 | 95-quality doc + missing mandatory form | **Still BLOCKED ✓** | `proposalHardGates.test.ts` |
| T18 | Final document edited without re-scoring | **Stale, re-approval required ✓** | `proposalPackageCore.test.ts` |

## The honesty self-check
> "Could the same defects that produced 22/100 still escape this pipeline?"

The specific ones — anchor-coverage, proof-100-on-zero-claims, 8,000-char truncation, silent-success package, score/readiness conflation — now fail a committed test. The remaining PARTIAL/FOLLOW-UP items are named here, not hidden, and none of them re-open a silent green.
