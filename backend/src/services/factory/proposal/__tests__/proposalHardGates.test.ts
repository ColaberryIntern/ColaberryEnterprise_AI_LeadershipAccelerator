/**
 * proposalHardGates — the pure submission-readiness gate. Proves the five hard blockers hold regardless of numeric
 * score, that required positive confirmations block when absent (no silent green), and that a high-quality document
 * cannot clear a missing mandatory form (T17).
 */
import { evaluateSubmissionReadiness, blockingGates, type SubmissionReadinessInput } from '../proposalHardGates';

// A fully submission-ready state: every required confirmation true, no negative signal.
const ready = (over: Partial<SubmissionReadinessInput> = {}): SubmissionReadinessInput => ({
  missingRequiredForms: [], pricingProvided: true, requiredReferenceCount: 3, eligibleReferenceCount: 3,
  pageLimitViolations: [], unresolvedFatalContradictions: 0, sourceVersionValid: true,
  unapprovedInventedClaims: 0, unsupportedGuarantees: 0,
  packageOk: true, goldOnFinalFingerprint: true, separationOfDutiesOk: true,
  essentialEvaluatorRan: true, materialRequirementsReviewed: true, unresolvedReviewerDisagreement: false,
  ...over,
});

describe('evaluateSubmissionReadiness', () => {
  it('fully ready: nothing blocks, export is enabled, score is not provisional', () => {
    const r = evaluateSubmissionReadiness(ready());
    expect(r.blocked).toBe(false);
    expect(r.exportEnabled).toBe(true);
    expect(r.provisional).toBe(false);
    expect(r.blockers).toEqual([]);
  });

  it('no silent green: an EMPTY input blocks on every required confirmation', () => {
    const r = evaluateSubmissionReadiness({});
    expect(r.blocked).toBe(true);
    expect(r.exportEnabled).toBe(false);
    expect(blockingGates(r).sort()).toEqual(['APPROVAL_BLOCKED', 'MANDATORY_BLOCKED', 'PACKAGE_BLOCKED', 'REVIEW_BLOCKED']);
  });

  it('T01: a missing signed exhibit is MANDATORY_BLOCKED regardless of score', () => {
    const r = evaluateSubmissionReadiness(ready({ missingRequiredForms: ['Exhibit B'] }));
    expect(r.blocked).toBe(true);
    expect(r.blockers.some((b) => b.gate === 'MANDATORY_BLOCKED' && /Exhibit B/.test(b.reason))).toBe(true);
    expect(r.exportEnabled).toBe(false);
  });

  it('T02: no priced offer is MANDATORY_BLOCKED', () => {
    const r = evaluateSubmissionReadiness(ready({ pricingProvided: false }));
    expect(r.blockers.some((b) => b.gate === 'MANDATORY_BLOCKED' && /priced offer/i.test(b.reason))).toBe(true);
  });

  it('T03: fewer eligible references than the solicitation requires is MANDATORY_BLOCKED', () => {
    const r = evaluateSubmissionReadiness(ready({ requiredReferenceCount: 3, eligibleReferenceCount: 1 }));
    expect(r.blockers.some((b) => b.gate === 'MANDATORY_BLOCKED' && /1 of 3/.test(b.reason))).toBe(true);
  });

  it('T17: a high-quality (all-docs-passing) proposal with a missing mandatory form is STILL blocked', () => {
    // The gate is independent of per-document scores: passing documents do not cure a missing mandatory form.
    const r = evaluateSubmissionReadiness(ready({ missingRequiredForms: ['Execution of Offer'] }));
    expect(r.blocked).toBe(true);
    expect(r.provisional).toBe(true);
  });

  it('EVIDENCE_BLOCKED on an unapproved invented claim or unsupported guarantee', () => {
    expect(evaluateSubmissionReadiness(ready({ unapprovedInventedClaims: 1 })).blockers.some((b) => b.gate === 'EVIDENCE_BLOCKED')).toBe(true);
    expect(evaluateSubmissionReadiness(ready({ unsupportedGuarantees: 2 })).blockers.some((b) => b.gate === 'EVIDENCE_BLOCKED')).toBe(true);
  });

  it('PACKAGE_BLOCKED when the package is not assembled/verified, carrying its reasons', () => {
    const r = evaluateSubmissionReadiness(ready({ packageOk: false, packageBlocking: ['render_failed:technical.pdf'] }));
    expect(r.blockers.some((b) => b.gate === 'PACKAGE_BLOCKED' && /render_failed/.test(b.reason))).toBe(true);
  });

  it('APPROVAL_BLOCKED without Gold on the final fingerprint, and on a separation-of-duties failure', () => {
    expect(evaluateSubmissionReadiness(ready({ goldOnFinalFingerprint: false })).blockers.some((b) => b.gate === 'APPROVAL_BLOCKED')).toBe(true);
    expect(evaluateSubmissionReadiness(ready({ separationOfDutiesOk: false })).blockers.some((b) => b.gate === 'APPROVAL_BLOCKED')).toBe(true);
  });

  it('REVIEW_BLOCKED when the essential evaluator did not run or a reviewer disagreement is unresolved', () => {
    expect(evaluateSubmissionReadiness(ready({ essentialEvaluatorRan: false })).blockers.some((b) => b.gate === 'REVIEW_BLOCKED')).toBe(true);
    expect(evaluateSubmissionReadiness(ready({ unresolvedReviewerDisagreement: true })).blockers.some((b) => b.gate === 'REVIEW_BLOCKED')).toBe(true);
  });
});
