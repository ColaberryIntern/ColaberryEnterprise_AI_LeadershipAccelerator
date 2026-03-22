export interface AdvanceDecision {
  decision: 'auto_advanced' | 'soft_complete' | 'blocked';
  reason: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Decide what happens after verification
// ---------------------------------------------------------------------------

export function evaluateAdvance(
  verificationConfidence: number,
  verificationStatus: string,
  semanticStatus: string | null
): AdvanceDecision {
  // Use the higher signal between verification and semantic
  const effectiveConfidence = verificationConfidence;

  if (effectiveConfidence >= 0.85) {
    return {
      decision: 'auto_advanced',
      reason: `Verification confidence ${Math.round(effectiveConfidence * 100)}% exceeds auto-advance threshold (85%). Requirement is well-implemented.`,
      confidence: effectiveConfidence,
    };
  }

  if (effectiveConfidence >= 0.60) {
    // Boost toward auto-advance if semantic says aligned
    if (semanticStatus === 'semantic_aligned') {
      return {
        decision: 'auto_advanced',
        reason: `Verification confidence ${Math.round(effectiveConfidence * 100)}% is moderate, but semantic analysis confirms alignment. Auto-advancing.`,
        confidence: effectiveConfidence,
      };
    }

    return {
      decision: 'soft_complete',
      reason: `Verification confidence ${Math.round(effectiveConfidence * 100)}% is moderate (60-85%). Marking as soft-complete with follow-up recommended.`,
      confidence: effectiveConfidence,
    };
  }

  return {
    decision: 'blocked',
    reason: `Verification confidence ${Math.round(effectiveConfidence * 100)}% is below threshold (60%). Additional work needed before advancing.`,
    confidence: effectiveConfidence,
  };
}
