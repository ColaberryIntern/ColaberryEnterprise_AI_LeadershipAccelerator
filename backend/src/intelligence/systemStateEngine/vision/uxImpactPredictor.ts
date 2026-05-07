/**
 * uxImpactPredictor — predicts the impact of an accepted suggestion on
 * structured UX metrics.
 *
 * Inputs: a suggestion + the current vision report + any behavioral signals.
 * Output: predicted deltas for workflow completion, onboarding clarity,
 * friction reduction, accessibility, and adoption.
 *
 * Pure: no I/O. Heuristic. Phase 7 may swap with an ML-driven predictor.
 *
 * Phase 6 §11.
 */
import type { VisionAnalysisReport } from './visionAnalysisEngine';

export interface SuggestionForImpact {
  readonly kind: string;
  readonly title: string;
  readonly expected_ux_impact: number;
}

export interface UXImpactPrediction {
  /** -100 to +100; positive = improves completion. */
  readonly workflow_completion_delta: number;
  /** -100 to +100; positive = clearer first-time experience. */
  readonly onboarding_delta: number;
  /** -100 to 0; negative = friction reduced (improvement). */
  readonly friction_delta: number;
  /** 0-100 (additive only — accessibility never regresses through suggestions). */
  readonly accessibility_delta: number;
  /** 0-100; expected adoption lift for the affected flow. */
  readonly adoption_delta: number;
  readonly basis: ReadonlyArray<string>;
}

export function predictUXImpact(
  suggestion: SuggestionForImpact,
  vision: VisionAnalysisReport,
  behavioral?: { friction_pressure?: number },
): UXImpactPrediction {
  const basis: string[] = [];
  let workflow = 0;
  let onboarding = 0;
  let friction = 0;
  let accessibility = 0;
  let adoption = 0;

  // Hierarchy / CTA suggestions hit conversion + onboarding.
  if (['hierarchy', 'cta', 'simplification'].includes(suggestion.kind)) {
    workflow += clamp(suggestion.expected_ux_impact);
    onboarding += clamp(suggestion.expected_ux_impact * 0.6);
    if (vision.cta.cta_score < 50) {
      basis.push('Current CTA score below 50 — clarification has measurable impact.');
      adoption += clamp(suggestion.expected_ux_impact * 0.5);
    }
  }

  if (['layout', 'simplification'].includes(suggestion.kind)) {
    if (vision.density.category === 'overloaded') {
      friction -= clamp(suggestion.expected_ux_impact);
      basis.push('Density currently overloaded — simplification reduces cognitive load.');
    }
    onboarding += clamp(suggestion.expected_ux_impact * 0.4);
  }

  if (suggestion.kind === 'workflow') {
    workflow += clamp(suggestion.expected_ux_impact);
    if (behavioral?.friction_pressure && behavioral.friction_pressure > 30) {
      friction -= clamp(suggestion.expected_ux_impact * 0.7);
      basis.push(`Behavioral friction at ${behavioral.friction_pressure} — workflow change projected to lower it.`);
    }
  }

  if (suggestion.kind === 'accessibility') {
    accessibility += clamp(suggestion.expected_ux_impact);
    workflow += clamp(suggestion.expected_ux_impact * 0.3);
    basis.push('Accessibility lift expands the addressable user base and reduces support load.');
  }

  if (suggestion.kind === 'onboarding' || suggestion.kind === 'copy') {
    onboarding += clamp(suggestion.expected_ux_impact);
    adoption += clamp(suggestion.expected_ux_impact * 0.4);
  }

  if (basis.length === 0) {
    basis.push(`${suggestion.kind} suggestion projected to improve UX by ${suggestion.expected_ux_impact}/100 (default heuristic).`);
  }

  return {
    workflow_completion_delta: clamp(workflow),
    onboarding_delta: clamp(onboarding),
    friction_delta: -Math.abs(friction),    // negative is the convention here
    accessibility_delta: clamp(accessibility),
    adoption_delta: clamp(adoption),
    basis,
  };
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(-100, Math.min(100, Math.round(n)));
}
