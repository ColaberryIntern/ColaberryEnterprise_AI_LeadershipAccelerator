# Gov Proposal Studio — Evidence-Driven Quality

Operator guide for the quality-correctness upgrade (PR #4264). This layer makes the Proposal Studio scorer **honest**: it no longer reports a green it cannot defend. It is the fix for the independent **22/100** review of the Herriman WOMS proposal, built so the same defects cannot escape the pipeline for *any* proposal.

## What changed (one line each)
- **Substantive coverage.** A requirement counts as covered only when its answer is a real, concrete response — not a bare `data-req` anchor, not any-nonempty-text, not "we comply." The old structural rule survives as `checkLocationCoverage` (where a requirement is addressed), reported separately.
- **Honest AI checks.** The proof check never returns 100 for "no claims found" (that is UNVERIFIED). The evaluator/proof/clarity judges read the **whole** document (windowed map-reduce), not the first 8,000 characters.
- **Package fails closed.** A failed/null PDF render blocks the package; the manifest's page counts come from the real rendered bytes.
- **Version-bound Gold.** A Gold approval is valid only for the exact version it was granted on; any edit forces re-approval.
- **Hard gates.** Submission readiness is gated by five blockers (MANDATORY / EVIDENCE / PACKAGE / APPROVAL / REVIEW_BLOCKED) that hold regardless of score. Blocked ⇒ the overall score is **provisional** and export is disabled.
- **Rubric v1.0.** An immutable, versioned 8-dimension rubric (weights sum to 100). An unknown dimension scores 0 (never dropped), so a score can never be inflated by not evaluating something.

## Roles
- **Agent (AI):** drafts, revises, runs the six checks and the rubric, assembles the package. Never invents a client, price, reference, signature, or certification.
- **Human:** supplies pricing, signatures, qualified references, the bid decision, and the final Gold Go. These are the inputs the hard gates block on.
- **Admin:** holds pricing (sealed), separation-of-duties, and master-admin gate decisions.

## Reading a score
- A number **without** a provisional badge, with zero blockers, is a real internal-rubric score.
- A **provisional** number means a hard gate is open — treat it as a ceiling, not a result. The blockers list says exactly what (and who) unblocks it.
- The internal rubric is **not** the agency's score and is never a win probability.

## Rollout / flags
Pure scoring and gate logic ship behind no runtime flag (they only make existing checks stricter and more honest; they add no new external dependency). No migration. Rollback = revert the PR. See `ARCHITECTURE.md`.

## Files
`backend/src/services/factory/proposal/`: `documentChecks.ts`, `documentChecksAI.ts`, `buildProposalPackage.ts`, `proposalPackageCore.ts`, `proposalHardGates.ts` (new), `qualityRubricV1.ts` (new). Tests under `__tests__/`.
