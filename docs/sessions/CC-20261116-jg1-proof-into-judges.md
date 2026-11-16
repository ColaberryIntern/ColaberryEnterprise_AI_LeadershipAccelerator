# Session CC-20261116-jg1 — wire dossier proof into the judges + label Rebuild vs Rejudge

## Why
Follow-on to the proposal-gap bridge. The drafter grounds on the dossier (facts, references,
personnel, case studies, company docs). The JUDGES did not: runProposalDocumentChecks called
runAiChecks with `backingRefs: []` hardcoded, so the proof judge was always told "(no backing
provided)" and marked every substantive claim unbacked, tanking the proof score even after the
dossier was filled. The original design comment on AiCheckInput.backingRefs already said it should
carry "approved library facts, references" — it was just never wired.

Because runReviewCycle's judging step calls the SAME runProposalDocumentChecks (runReviewCycle.ts
line 166), fixing backingRefs in that one function fixes BOTH rejudge (run-checks) and the in-cycle
judge. Rejudge now re-scores the current draft against the dossier; rebuild (review-cycle) redrafts
from the dossier. The user asked to make that distinction explicit in the UI too.

## What shipped (backend + frontend, one PR)
Backend (the substantive fix):
- proposalGrounding.ts — new pure `groundingToBackingRefs(g)`: flattens the citable proof (approved
  facts, references, personnel, anonymized case studies with the verified/reported label) into
  compact backing lines. Mirrors groundingToPromptText's guardrails. Source excerpts are NOT backing
  (an excerpt cannot assert a hard specific).
- proposalProofBacking.ts (NEW) — `collectProofBacking(deliveryProjectId)`: resolves the tenant from
  the delivery project's latest qualification (exactly like runReviewCycle.gather), loads the SAME
  approved facts/references/personnel/case studies via the same loaders, flattens with
  groundingToBackingRefs. Total + best-effort per source: any failure yields [] so scoring never
  breaks; no embedding retrieval, so it is cheap on every check iteration.
- runProposalDocumentChecks.ts — `backingRefs: []` -> `backingRefs: await collectProofBacking(...)`.
  Single source of truth: the judge sees what the drafter sees, by construction, so new dossier
  content is picked up on both rejudge and rebuild and nothing drifts.

Frontend (make the two actions explicit):
- ReviewGatesView.tsx DocGatePanel — the single "Re-run checks" button becomes two: "Rejudge"
  (reviewApi.runChecks, re-score the current draft) and "Rebuild" (reviewApi.runReviewCycle, redraft
  from the dossier), with a one-line helper explaining the difference. Reviewer-only (interns get no
  reviewApi, or a read-only one inside the disabled fieldset), so the read-only parity is preserved.
  All-ASCII copy: no em-dash, no emoji, so the frozen typography/copy baselines do not move.

## Verification (real CI gates)
- Backend tsc clean (only the known local-only maxmind TS2307 in enrichVisitorGeo.ts).
- jest.ci full proposal suite 73 suites / 617 tests, incl. new proposalProofBacking and the
  groundingToBackingRefs cases on proposalGrounding; documentChecksAI still green.
- Frontend tsc 0 errors. studioParity 56/56 (no button named Approve; read-only intern parity).
- frontendCopyLint + frontendTypographyLint 42/42 (baselines unchanged).

## State
- Branch workstream/gov-proof-into-judges off origin/main. PR to open. Merge is the human's click;
  no deploy before merge. Backend + frontend, so deploy will be backend + nginx (registry mode) once
  merged.
- Not verified: a live rejudge-with-filled-dossier round-trip in prod (needs dossier content + an
  eyeball). Behaviorally, a claim a real reference/case study supports now scores backed instead of
  being flagged "Unbacked claim".
