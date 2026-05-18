import { decidePromotedStatus } from '../../services/verification/verificationOrchestrator';

describe('decidePromotedStatus — verifier status -> operator-facing status', () => {
  test('verified_complete + high confidence promotes to "verified"', () => {
    expect(decidePromotedStatus('unmatched', 'verified_complete', 0.9)).toBe('verified');
    expect(decidePromotedStatus('unmatched', 'verified_complete', 0.75)).toBe('verified');
  });

  test('verified_complete + below-threshold confidence does NOT promote', () => {
    expect(decidePromotedStatus('unmatched', 'verified_complete', 0.74)).toBeNull();
    expect(decidePromotedStatus('unmatched', 'verified_complete', 0.5)).toBeNull();
  });

  test('verified_partial + high confidence promotes to "matched"', () => {
    expect(decidePromotedStatus('unmatched', 'verified_partial', 0.85)).toBe('matched');
    expect(decidePromotedStatus('unmatched', 'verified_partial', 0.7)).toBe('matched');
  });

  test('verified_partial + below-threshold confidence does NOT promote', () => {
    expect(decidePromotedStatus('unmatched', 'verified_partial', 0.69)).toBeNull();
  });

  test('not_verified never promotes regardless of confidence', () => {
    expect(decidePromotedStatus('unmatched', 'not_verified', 0.99)).toBeNull();
  });

  describe('downgrade guard', () => {
    test('protects "verified" against partial verdicts', () => {
      // Already-verified requirement: a partial verdict cannot demote.
      // The function returns the current 'verified' status (unchanged).
      expect(decidePromotedStatus('verified', 'verified_partial', 0.85)).toBe('verified');
    });

    test('protects "verified" against not_verified', () => {
      expect(decidePromotedStatus('verified', 'not_verified', 0.5)).toBe('verified');
    });

    test('"verified" stays "verified" when verifier agrees', () => {
      expect(decidePromotedStatus('verified', 'verified_complete', 0.9)).toBe('verified');
    });

    test('protects "matched" against zero-result verdicts', () => {
      // Matched (set manually via artifact link) survives a not_verified
      // verifier reading — manual linkage outranks the heuristic. Function
      // returns currentStatus so the orchestrator's `if (promoted !== current)`
      // guard no-ops the write.
      expect(decidePromotedStatus('matched', 'not_verified', 0.3)).toBe('matched');
    });

    test('"matched" can be upgraded to "verified" by strong verdict', () => {
      expect(decidePromotedStatus('matched', 'verified_complete', 0.9)).toBe('verified');
    });

    test('"matched" stays put when verifier returns "verified_partial" + medium conf', () => {
      // 'matched' is a protected status. A partial verdict would normally
      // suggest 'matched' (no change). Function returns the candidate
      // ('matched') — which matches current — caller would no-op.
      expect(decidePromotedStatus('matched', 'verified_partial', 0.8)).toBe('matched');
    });
  });

  describe('typical first-time flips (the verifier-blindness fix)', () => {
    test('REQ-085-style: unmatched + verified_complete + 0.85 -> verified', () => {
      // This is the case yesterday's batch-closure run was working around
      // manually: a requirement the codebase *does* implement, but the
      // verifier was blind to it. Smart verifier now flips it.
      expect(decidePromotedStatus('unmatched', 'verified_complete', 0.85)).toBe('verified');
    });

    test('REQ-087-style: unmatched + verified_partial + 0.72 -> matched', () => {
      // The endpoint-name-different-but-equivalent case. Promotes to
      // 'matched' rather than 'verified' because the verifier is partial.
      expect(decidePromotedStatus('unmatched', 'verified_partial', 0.72)).toBe('matched');
    });
  });
});
