# Final Handoff — Gov Proposal Studio, Herriman R1/R2/R3

**Final status: `BLOCKED_NEEDS_HUMAN`** for the >=92 / submission-ready objective, and `QUALITY_NOT_MET` on the internal score pending the next content lever. **No pass is claimed.** The autonomous engineering that genuinely improves the proposal has been done and verified; the remaining gap is human-owned inputs (see `HUMAN_INPUTS_REQUIRED.md`) plus one more drafting-layer lever (below).

## What shipped (reviewable PRs, merged where noted)

| PR | What | State |
|---|---|---|
| #4284 (R1) | Stop submission-instructions (REQ-003/004) leaking into the Technical Proposal | merged + deployed |
| #4289 (R2) | Route the 27 functional (scope) requirements INTO the Technical Proposal (the substance lever) | merged + deployed |
| R3 (this PR) | `isNonTechnicalAdministrativeRequirement` — keep the City's evaluation process (review panel/scoring), procurement/contractual mechanics, residual submission rules, and packaging/format OUT of the Technical Proposal | reviewable; not merged/deployed |

**Code paths changed:** `backend/src/services/factory/proposal/documentChecks.ts` (classifiers), `govProposalDocuments.ts` (`deriveProposalDocuments` routing), tests in `__tests__/documentChecks.test.ts` and `__tests__/govProposalDocuments.test.ts`. Docs in `docs/gov-proposal-quality/`.

## Before / after evidence (real exported bytes)

- **R2 export** (`Colaberry_Herriman_WOMS_Proposal_R2_substantive_2026-11-21.zip`): technical PDF carried 49 sections; **26 of 49 were administrative** (review panel, no-late, procurement). Technical coverage scored 0; internal weighted score 44.8 provisional; independent baseline 27.
- **R1 proof:** the technical PDF no longer opens with "REQ-003: submit one PDF by email" (0 occurrences).
- **R2 proof:** the technical document now names GIS, Bluestakes, Madison AI, LAMA, SpryPoint, SCADA (17,199 chars) — it answers the real functional requirements.
- **R3 proof (classifier, pre-regeneration):** on the stored Herriman requirements, 15 administrative clauses (REQ-005/006/007/008/009/013/014/015/017/018/019/020/021/041/049) are now kept out of the Technical Proposal, while REQ-010 ("Describe the Proposer's understanding") and every scope requirement stay. Regeneration through the deployed R3 engine will reflect this.

## Honest status against the plan's acceptance (§4)

| Dimension | Weight | Gating | Reachable autonomously? |
|---|---|---|---|
| Mandatory compliance | 20 (>=90) | signed Exhibit B, pricing, verified references, amendment ack | **No — human** |
| Technical responsiveness | 20 (>=90) | substance now present (R2/R3); per-requirement coverage crediting is the next lever | Partially |
| Implementation & delivery | 15 (>=90) | named owners, dated schedule, UAT/cutover commitments | **No — human (owners/dates)** |
| Evidence & past performance | 15 (>=85) | qualifying government references | **No — human** |
| Pricing & commercial | 10 (>=90) | authorized pricing | **No — human** |
| Buyer differentiation | 10 | content-driven | Partially |
| Risk, security & support | 5 | approved security/SLA | Partially (claims must stay approved) |
| Presentation & clarity | 5 | R1/R3 remove filler | Yes |

**>=92 with all four >=90 gates is mathematically unreachable without the human inputs.** This is not a weakened rubric — the weights and thresholds are unchanged; the blocked dimensions are honestly reported, not excluded from the denominator.

## Remaining engineering lever (next, no human input needed)

**Per-requirement substantive-coverage crediting.** The whole-document drafter produces substantive content in one `content_html` blob; `checkCoverage` credits a requirement only when its *section* carries a substantive answer, so technical coverage reads 0 even though the prose is real. The fix is structured, per-requirement drafting (plan §5.2 answer-contract) so the engine can trace each requirement to its answer. This moves the technical-responsiveness score honestly; it does not change the human-gated ceiling.

## Precise user actions

1. Merge the R3 PR (merge is the operator's click). On merge, the deploy authorized for this workstream runs and the proposal is regenerated into a DRAFT in Downloads.
2. To move past ~65/100 toward a submit-ready >=92, provide the consolidated human inputs in `HUMAN_INPUTS_REQUIRED.md`.
3. Decide whether to proceed with the per-requirement coverage-crediting lever (next autonomous PR).

Nothing here is submission-ready. Export is a preview, never a submission; no automatic send to the City.
