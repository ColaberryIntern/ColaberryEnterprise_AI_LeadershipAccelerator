import { VerificationResult } from './requirementVerificationService';
import { SemanticResult } from './semanticVerificationService';

export interface MergedResult {
  status: 'not_started' | 'partial' | 'complete';
  confidence_score: number;
  reasoning: string;
  missing_elements: string[];
  merge_case: string;
}

// ---------------------------------------------------------------------------
// Status mapping helpers
// ---------------------------------------------------------------------------

function ruleStatusToScore(status: string): number {
  if (status === 'complete') return 1;
  if (status === 'partial') return 0.5;
  return 0;
}

function semanticStatusToScore(status: string): number {
  if (status === 'semantic_aligned') return 1;
  if (status === 'semantic_partial') return 0.5;
  return 0;
}

// ---------------------------------------------------------------------------
// Merge V1 rule-based + V2 semantic results
// ---------------------------------------------------------------------------

export function mergeVerificationResults(
  ruleBased: VerificationResult,
  semantic: SemanticResult
): MergedResult {
  const ruleScore = ruleStatusToScore(ruleBased.status);
  const semScore = semanticStatusToScore(semantic.semantic_status);

  // CASE 4: Semantic unknown → fallback to rule-based
  if (semantic.semantic_status === 'unknown') {
    return {
      status: ruleBased.status,
      confidence_score: ruleBased.confidence_score,
      reasoning: `${ruleBased.reasoning} (semantic analysis unavailable)`,
      missing_elements: ruleBased.missing_elements,
      merge_case: 'semantic_unknown_fallback',
    };
  }

  // CASE 1: Both agree
  if (
    (ruleScore >= 0.8 && semScore >= 0.8) ||
    (ruleScore <= 0.2 && semScore <= 0.2) ||
    (ruleScore > 0.2 && ruleScore < 0.8 && semScore > 0.2 && semScore < 0.8)
  ) {
    const finalStatus = semScore >= 0.8 ? 'complete' : semScore <= 0.2 ? 'not_started' : 'partial';
    const finalConfidence = Math.max(ruleBased.confidence_score, semantic.semantic_confidence);

    return {
      status: finalStatus,
      confidence_score: Math.round(finalConfidence * 100) / 100,
      reasoning: `Rule-based and semantic analysis agree. ${semantic.semantic_reasoning}`,
      missing_elements: [
        ...new Set([...ruleBased.missing_elements, ...semantic.missing_elements]),
      ].slice(0, 5),
      merge_case: 'both_agree',
    };
  }

  // CASE 2: Rule says fail, semantic says pass
  if (ruleScore <= 0.2 && semScore >= 0.8) {
    return {
      status: 'partial',
      confidence_score: Math.round(Math.min(0.6, semantic.semantic_confidence * 0.7) * 100) / 100,
      reasoning: `Rule-based found no keyword match, but semantic analysis detected implementation. ${semantic.semantic_reasoning}`,
      missing_elements: ruleBased.missing_elements,
      merge_case: 'rule_fail_semantic_pass',
    };
  }

  // CASE 3: Rule says pass, semantic says fail
  if (ruleScore >= 0.8 && semScore <= 0.2) {
    return {
      status: 'partial',
      confidence_score: Math.round(Math.max(0.3, ruleBased.confidence_score * 0.5) * 100) / 100,
      reasoning: `Keyword matching found files, but semantic analysis found gaps. ${semantic.semantic_reasoning}`,
      missing_elements: semantic.missing_elements,
      merge_case: 'rule_pass_semantic_fail',
    };
  }

  // Default: mixed signals → weighted average, lean toward semantic
  const weightedConfidence = ruleBased.confidence_score * 0.3 + semantic.semantic_confidence * 0.7;
  const finalStatus = weightedConfidence >= 0.6 ? 'partial' : 'not_started';

  return {
    status: finalStatus,
    confidence_score: Math.round(weightedConfidence * 100) / 100,
    reasoning: `Mixed signals. Rule: ${ruleBased.status} (${ruleBased.confidence_score}). Semantic: ${semantic.semantic_status} (${semantic.semantic_confidence}). ${semantic.semantic_reasoning}`,
    missing_elements: [
      ...new Set([...ruleBased.missing_elements, ...semantic.missing_elements]),
    ].slice(0, 5),
    merge_case: 'mixed_weighted',
  };
}
