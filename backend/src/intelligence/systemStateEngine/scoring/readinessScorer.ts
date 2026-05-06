/**
 * readinessScorer — single source of truth for "is this BP ready for production"
 *
 * Inputs: enriched capability + project mode.
 * Output: 0-100 readiness score with explicit dimensional breakdown.
 *
 * ALGORITHM (deterministic):
 *   1. Layer presence weighted: backend 0.5, frontend 0.3, agents 0.2
 *   2. Coverage contribution: 30% of final score
 *   3. Quality contribution: 20% of final score
 *
 * No project-level fallbacks here. Per-cap signals only. Project-wide
 * scoring lives in the engine entrypoint where it aggregates these.
 */
import type { EngineCapabilityInput, Score0to100 } from '../types/systemState.types';

export interface ReadinessBreakdown {
  readonly final: Score0to100;
  readonly layer_score: Score0to100;
  readonly coverage_score: Score0to100;
  readonly quality_score: Score0to100;
  readonly reasons: ReadonlyArray<string>;
}

const LAYER_WEIGHTS = { backend: 50, frontend: 30, agents: 20 } as const;
const FINAL_WEIGHTS = { layer: 0.5, coverage: 0.3, quality: 0.2 } as const;

export function scoreReadiness(cap: EngineCapabilityInput): ReadinessBreakdown {
  const reasons: string[] = [];

  // Layer presence — STRICT per-cap, derived from linked_*_components.
  const hasBackend = (cap.linked_backend_services || []).length > 0;
  const hasFrontend = (cap.linked_frontend_components || []).length > 0
    || !!cap.frontend_route
    || cap.is_page_bp === true;
  const hasAgents = (cap.linked_agents || []).length > 0;

  let layerScore = 0;
  if (hasBackend) { layerScore += LAYER_WEIGHTS.backend; reasons.push('backend layer present'); }
  if (hasFrontend) { layerScore += LAYER_WEIGHTS.frontend; reasons.push('frontend layer present'); }
  if (hasAgents) { layerScore += LAYER_WEIGHTS.agents; reasons.push('agents layer present'); }

  // Coverage — requirements coverage if available, else evidence completion.
  let coverageScore = 0;
  if (cap.total_requirements > 0) {
    coverageScore = Math.round((cap.matched_requirements / cap.total_requirements) * 100);
    reasons.push(`requirements coverage: ${cap.matched_requirements}/${cap.total_requirements} = ${coverageScore}%`);
  } else if (typeof cap.last_execution?.evidence_completion_pct === 'number') {
    coverageScore = cap.last_execution.evidence_completion_pct;
    reasons.push(`evidence-based completion: ${coverageScore}%`);
  } else {
    reasons.push('no coverage signals — defaulting to 0');
  }

  // Quality — derived from evidence breadth (file count + multi-layer presence).
  // We're conservative here: max 50 from heuristics. Real quality scoring
  // belongs in healthScorer.
  const totalFiles = (cap.linked_backend_services || []).length
    + (cap.linked_frontend_components || []).length
    + (cap.linked_agents || []).length;
  const layersPresent = [hasBackend, hasFrontend, hasAgents].filter(Boolean).length;

  let qualityScore = 0;
  if (totalFiles >= 8) qualityScore += 25;
  else if (totalFiles >= 4) qualityScore += 15;
  else if (totalFiles >= 1) qualityScore += 5;
  if (layersPresent >= 3) qualityScore += 25;
  else if (layersPresent === 2) qualityScore += 15;
  else if (layersPresent === 1) qualityScore += 5;
  qualityScore = Math.min(50, qualityScore);
  reasons.push(`quality estimate: ${qualityScore} (${totalFiles} files, ${layersPresent} layers)`);

  // Final composite
  const final = Math.round(
    layerScore * FINAL_WEIGHTS.layer
    + coverageScore * FINAL_WEIGHTS.coverage
    + (qualityScore * 2) * FINAL_WEIGHTS.quality   // qualityScore is 0-50, double to 0-100 for the weighted blend
  );

  return {
    final: clamp(final),
    layer_score: clamp(layerScore),
    coverage_score: clamp(coverageScore),
    quality_score: clamp(qualityScore * 2),
    reasons,
  };
}

function clamp(n: number): Score0to100 {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
