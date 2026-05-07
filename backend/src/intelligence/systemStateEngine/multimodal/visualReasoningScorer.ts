/**
 * visualReasoningScorer — combines a multimodal LLM analysis with the
 * heuristic Phase 6 vision report into a single trusted score.
 *
 * The blend is confidence-weighted: when the LLM is high-confidence, its
 * scores get more weight; when low-confidence, the heuristic baseline
 * dominates. This avoids over-trusting hallucinated scores and avoids
 * over-trusting heuristics when the model has clear evidence.
 *
 * Pure: takes both reports, returns a `BlendedReasoningScore`.
 *
 * Phase 7 §1.
 */
import type { MultimodalVisionAnalysis } from './visionResponseNormalizer';
import type { VisionAnalysisReport } from '../vision/visionAnalysisEngine';

export interface BlendedReasoningScore {
  readonly cognition_score: number;
  readonly visual_hierarchy_score: number;
  readonly cta_prominence_score: number;
  readonly aesthetic_harmony_score: number;
  readonly workflow_intuitiveness_score: number;
  readonly accessibility_score: number;
  readonly llm_weight: number;          // 0-1
  readonly heuristic_weight: number;    // 0-1
  readonly basis: string;
}

export function blendReasoningScores(
  multimodal: MultimodalVisionAnalysis,
  heuristic: VisionAnalysisReport | null,
): BlendedReasoningScore {
  // LLM weight: confidence/100, but floored at 0.2 (we always honor some
  // model signal when present) and dropped to 0 when source is rule_based
  // / cached-stub.
  let llmWeight = 0;
  if (multimodal.source === 'llm' || multimodal.source === 'cached') {
    llmWeight = Math.max(0.2, multimodal.confidence / 100);
  }
  // No heuristic? trust whatever we got from multimodal alone.
  if (!heuristic) {
    return {
      cognition_score: multimodal.cognition_score,
      visual_hierarchy_score: multimodal.visual_hierarchy_score,
      cta_prominence_score: multimodal.cta_prominence_score,
      aesthetic_harmony_score: multimodal.aesthetic_harmony_score,
      workflow_intuitiveness_score: multimodal.workflow_intuitiveness_score,
      accessibility_score: multimodal.accessibility_score,
      llm_weight: llmWeight,
      heuristic_weight: 0,
      basis: `LLM-only blend (no heuristic available); confidence ${multimodal.confidence}/100`,
    };
  }
  const heuristicWeight = 1 - llmWeight;

  const blend = (a: number, b: number) => Math.round(a * llmWeight + b * heuristicWeight);

  // Heuristic doesn't have aesthetic_harmony or workflow_intuitiveness — for
  // those dimensions we lean entirely on the LLM (or 0 when LLM missing).
  return {
    cognition_score: blend(multimodal.cognition_score, heuristic.cognition_score),
    visual_hierarchy_score: blend(multimodal.visual_hierarchy_score, heuristic.hierarchy.hierarchy_score),
    cta_prominence_score: blend(multimodal.cta_prominence_score, heuristic.cta.cta_score),
    aesthetic_harmony_score: multimodal.aesthetic_harmony_score,        // LLM-only
    workflow_intuitiveness_score: multimodal.workflow_intuitiveness_score, // LLM-only
    accessibility_score: blend(
      multimodal.accessibility_score,
      // Convert heuristic accessibility signals to a score
      Math.max(0, 100 - (heuristic.dom_semantic.missing_aria_labels.length * 8 + heuristic.hierarchy.competing_primaries * 5)),
    ),
    llm_weight: Math.round(llmWeight * 100) / 100,
    heuristic_weight: Math.round(heuristicWeight * 100) / 100,
    basis: `Confidence-weighted blend: LLM ${Math.round(llmWeight * 100)}% / heuristic ${Math.round(heuristicWeight * 100)}%`,
  };
}
