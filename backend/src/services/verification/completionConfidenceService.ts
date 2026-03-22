import { VerificationResult } from './requirementVerificationService';
import { CodeAnalysis } from './codeAnalysisService';

export interface ConfidenceResult {
  confidence_score: number;
  factors: {
    code_presence: number;
    structural_alignment: number;
    requirement_coverage: number;
  };
}

// ---------------------------------------------------------------------------
// Compute weighted confidence
// ---------------------------------------------------------------------------

export function computeConfidence(
  verification: VerificationResult,
  analysis: CodeAnalysis,
  hasArtifact: boolean
): ConfidenceResult {
  // Factor 1: Code presence (0-1)
  // Based on how many files match the requirement
  const code_presence = Math.min(1.0, verification.matched_files.length / 3);

  // Factor 2: Structural alignment (0-1)
  // Does the repo have the structural patterns needed?
  let structural_alignment = 0;
  if (analysis.structural_signals.length > 0) {
    structural_alignment = Math.min(1.0, analysis.structural_signals.length / 4);
  }
  // Boost if the repo has tests
  if (analysis.structural_signals.includes('has_tests')) {
    structural_alignment = Math.min(1.0, structural_alignment + 0.2);
  }

  // Factor 3: Requirement coverage (0-1)
  // From verification confidence (keyword match ratio)
  const requirement_coverage = verification.confidence_score;

  // Artifact bonus: if there's a linked artifact, boost slightly
  const artifactBonus = hasArtifact ? 0.05 : 0;

  // Weighted combination
  const confidence_score = Math.min(1.0, Math.round(
    (code_presence * 0.4 + structural_alignment * 0.3 + requirement_coverage * 0.3 + artifactBonus) * 100
  ) / 100);

  return {
    confidence_score,
    factors: {
      code_presence: Math.round(code_presence * 100) / 100,
      structural_alignment: Math.round(structural_alignment * 100) / 100,
      requirement_coverage: Math.round(requirement_coverage * 100) / 100,
    },
  };
}
