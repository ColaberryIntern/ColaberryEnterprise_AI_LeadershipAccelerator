# Before / After Evaluation — Herriman WOMS

Honest comparison. Numbers that come from an actual engine run are labeled with their run; anything not yet computed from evidence is marked **NOT YET EVALUATED** rather than invented (per the no-fabrication rule).

## Baseline (BEFORE)
- **Independent assessment: 22 / 100** (external reviewer, Herriman WOMS proposal dated 2026-11-20). This is the historical number this work targets; it was produced outside this engine.
- Root causes the baseline exhibited (now each has a failing-before/passing-after test): anchor-based coverage inflation, proof check awarding 100 with no claims, 8,000-char evaluation truncation, a package that could report success on a failed render, and a per-document meter mistaken for submission readiness.

## Engine run (AFTER)
The upgraded engine computes the Rubric v1.0 score from evidence. For Herriman **as it stands today** (no authorized pricing, no signed Exhibit B, no qualified government references on file), the honest expected outcome is:

- A real per-dimension score on the content dimensions (technical responsiveness, differentiation, presentation, risk/support) that reflects the improved substantive content — **materially above the 22 baseline on those dimensions**.
- `mandatory_compliance`, `pricing_commercial`, and `evidence_past_performance` scored low / UNKNOWN because the human-owned inputs are genuinely absent.
- **`MANDATORY_BLOCKED` + `APPROVAL_BLOCKED`**, so the overall score is **PROVISIONAL** and export is disabled — exactly as designed. A provisional number is never presented as a final ≥92.

**Actual computed numbers (live post-deploy re-run, 2026-11-20, project 80b35be2):**

| Dimension | Weight | AFTER score | Signal |
|---|---:|---|---|
| Mandatory submission compliance | 20 | UNKNOWN (0) | blocked: pricing/forms/references absent |
| Technical responsiveness | 20 | 63 | substantive coverage + evaluator |
| Implementation & delivery | 15 | 60 | evaluator (method/approach) |
| Evidence & past performance | 15 | 68 | proof-backed claims (references limited) |
| Pricing & commercial completeness | 10 | UNKNOWN (0) | no authorized pricing |
| Buyer differentiation | 10 | 55 | clarity / customer-focus |
| Risk, security & support | 5 | UNKNOWN (0) | not separately measured yet (R4/R7) |
| Presentation & clarity | 5 | 78 | format + clarity |
| **Weighted total** | **100** | **41.2 — PROVISIONAL** | **hard gates: MANDATORY / PACKAGE / APPROVAL blocked** |

Per-document six-check scores from the live engine (none passing, honestly): compliance_matrix `cov100 fmt100 fact80 eval60 proof80 clarity45`; technical `cov0 fmt100 fact20 eval60 proof100 clarity65`; pilot_demo `cov100 fmt100 fact0 eval60 proof25 clarity55`. All three review runs **stopped at `open_questions`** — the engine surfaced the real missing facts rather than fabricating them. The baseline 22 and this 41.2 are on different rubrics and are not directly subtractable; the load-bearing result is that the engine now scores truthfully and refuses to fake a pass. Full scorecard: `quality-review.html` / `QUALITY_SCORECARD.html` in the delivered packet.

## What a legitimate ≥92 requires
The engine reaches ≥92 with all gates green only when the human-owned inputs exist:
1. Authorized, itemized pricing workbook (cures `pricing_commercial` + the pricing MANDATORY gate).
2. Signed required forms / Exhibit B (cures the forms MANDATORY gate).
3. The solicitation's required number of **qualified** government references (cures `evidence_past_performance` + the references MANDATORY gate).
4. A human Gold Go bound to the final package fingerprint (cures `APPROVAL_BLOCKED`).

Supplying real versions of these — never fabricated ones — is the only honest path to the target. The scorecard lists each as a named "Needs You" item with its owner.
