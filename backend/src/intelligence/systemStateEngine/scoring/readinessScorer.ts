/**
 * readinessScorer — single source of truth for "is this BP ready for production"
 *
 * Inputs: enriched capability + project mode.
 * Output: 0-100 readiness score with explicit dimensional breakdown.
 *
 * ALGORITHM (deterministic):
 *   1. Layer presence weighted by cap kind:
 *        service:   backend 0.5, frontend 0.3, agents 0.2
 *        page:      frontend 1.0 (backend + agents N/A)
 *        agent:     agents 0.6, backend 0.4 (agent IS the backend)
 *        component: frontend 1.0 (lives inside another page)
 *   2. Coverage contribution: 30% of final score
 *   3. Quality contribution: 20% of final score
 *
 * Added 2026-05-19: kind-aware weights so a Page isn't penalized for
 * lacking backend (it shouldn't have one), an agent isn't penalized for
 * lacking frontend, etc. Pre-fix every cap was scored against the same
 * service template and pages/agents/components all looked under-built.
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
  /**
   * Indicates the remaining gap is bounded by operator-judgment work
   * (UI review / verification), not by missing system work. The score
   * may stay below 100 but the system isn't blocked — the operator is.
   * Added 2026-05-19.
   */
  readonly operator_bounded?: boolean;
}

interface LayerExpectation {
  backend: number;
  frontend: number;
  agents: number;
}

const FINAL_WEIGHTS = { layer: 0.5, coverage: 0.3, quality: 0.2 } as const;

/**
 * Per-kind expected layer weights. Sum to 100. Layers NOT applicable to
 * a kind get weight 0 — the cap isn't penalized for missing them.
 */
function getExpectedLayers(kind: string | undefined): LayerExpectation {
  switch (kind) {
    case 'page':      return { backend: 0, frontend: 100, agents: 0 };
    case 'agent':     return { backend: 40, frontend: 0, agents: 60 };
    case 'component': return { backend: 0, frontend: 100, agents: 0 };
    case 'service':
    default:          return { backend: 50, frontend: 30, agents: 20 };
  }
}

export function scoreReadiness(cap: EngineCapabilityInput): ReadinessBreakdown {
  const reasons: string[] = [];
  const kind = cap.kind || 'service';
  const expected = getExpectedLayers(kind);

  // Layer presence — STRICT per-cap, derived from linked_*_components.
  const hasBackend = (cap.linked_backend_services || []).length > 0;
  const hasFrontend = (cap.linked_frontend_components || []).length > 0
    || !!cap.frontend_route
    || cap.is_page_bp === true;
  const hasAgents = (cap.linked_agents || []).length > 0;

  // Layer score: sum of expected weights for layers that are present.
  // Layers with expected=0 (N/A for this kind) contribute nothing either
  // way — neither bonus nor penalty.
  let layerScore = 0;
  if (hasBackend && expected.backend > 0) {
    layerScore += expected.backend;
    reasons.push(`backend layer present (weight ${expected.backend} for kind=${kind})`);
  } else if (expected.backend > 0) {
    reasons.push(`backend layer MISSING (would add ${expected.backend} for kind=${kind})`);
  }
  if (hasFrontend && expected.frontend > 0) {
    layerScore += expected.frontend;
    reasons.push(`frontend layer present (weight ${expected.frontend} for kind=${kind})`);
  } else if (expected.frontend > 0) {
    reasons.push(`frontend layer MISSING (would add ${expected.frontend} for kind=${kind})`);
  }
  if (hasAgents && expected.agents > 0) {
    layerScore += expected.agents;
    reasons.push(`agents layer present (weight ${expected.agents} for kind=${kind})`);
  } else if (expected.agents > 0) {
    reasons.push(`agents layer MISSING (would add ${expected.agents} for kind=${kind})`);
  }

  // Coverage — requirements coverage if available, else evidence completion.
  let coverageScore = 0;
  if (cap.total_requirements > 0) {
    coverageScore = Math.round((cap.matched_requirements / cap.total_requirements) * 100);
    reasons.push(`requirements coverage: ${cap.matched_requirements}/${cap.total_requirements} = ${coverageScore}%`);
  } else if (typeof cap.last_execution?.evidence_completion_pct === 'number') {
    coverageScore = cap.last_execution.evidence_completion_pct;
    reasons.push(`evidence-based completion: ${coverageScore}%`);
  } else {
    // No coverage signal applies. For pages, coverage isn't a meaningful
    // metric (they're measured by ui_review). Default to 100 so the
    // absence of requirements doesn't drag the score down.
    if (kind === 'page' || kind === 'component') {
      coverageScore = 100;
      reasons.push(`coverage N/A for kind=${kind} (defaulting to 100)`);
    } else {
      reasons.push('no coverage signals — defaulting to 0');
    }
  }

  // Quality — derived from evidence breadth.
  // For pages/components: just need frontend components.
  // For agents: just need agent files.
  // For services: multi-layer + file count.
  const totalFiles = (cap.linked_backend_services || []).length
    + (cap.linked_frontend_components || []).length
    + (cap.linked_agents || []).length;

  let qualityScore = 0;
  if (kind === 'page' || kind === 'component') {
    // Quality = is there frontend evidence?
    const feCount = (cap.linked_frontend_components || []).length + (cap.frontend_route ? 1 : 0);
    if (feCount >= 3) qualityScore = 50;
    else if (feCount >= 1) qualityScore = 35;
    else qualityScore = 0;
    reasons.push(`quality (kind=${kind}): ${qualityScore} (${feCount} frontend signals)`);
  } else if (kind === 'agent') {
    const agentCount = (cap.linked_agents || []).length;
    const backendCount = (cap.linked_backend_services || []).length;
    if (agentCount >= 2 || (agentCount >= 1 && backendCount >= 2)) qualityScore = 50;
    else if (agentCount >= 1) qualityScore = 35;
    else qualityScore = 0;
    reasons.push(`quality (kind=${kind}): ${qualityScore} (${agentCount} agent / ${backendCount} backend files)`);
  } else {
    // service: multi-layer + file count heuristic
    const layersPresent = [hasBackend, hasFrontend, hasAgents].filter(Boolean).length;
    if (totalFiles >= 8) qualityScore += 25;
    else if (totalFiles >= 4) qualityScore += 15;
    else if (totalFiles >= 1) qualityScore += 5;
    if (layersPresent >= 3) qualityScore += 25;
    else if (layersPresent === 2) qualityScore += 15;
    else if (layersPresent === 1) qualityScore += 5;
    qualityScore = Math.min(50, qualityScore);
    reasons.push(`quality (kind=service): ${qualityScore} (${totalFiles} files, ${layersPresent} layers)`);
  }

  // Final composite. Quality is 0-50 internally; double for the 0-100 blend.
  const final = Math.round(
    layerScore * FINAL_WEIGHTS.layer
    + coverageScore * FINAL_WEIGHTS.coverage
    + (qualityScore * 2) * FINAL_WEIGHTS.quality
  );

  // Operator-bounded: a page or component is fully built when it has
  // frontend + verified UI review. If the system signals show all the
  // building work is done but ui_review categories haven't been verified,
  // the cap is operator-bounded — score gap is operator's to close.
  let operator_bounded = false;
  if ((kind === 'page' || kind === 'component') && hasFrontend) {
    const categoryScores = cap.ui_element_map?.category_scores || {};
    const verifiedCount = Object.values(categoryScores).filter((c: any) => c?.verified).length;
    const expectedCategories = 5;  // layout/accessibility/responsiveness/interaction/content
    if (verifiedCount < expectedCategories && final < 100) {
      operator_bounded = true;
      reasons.push(`operator-bounded: ${verifiedCount}/${expectedCategories} ui_review categories verified`);
    }
  }

  return {
    final: clamp(final),
    layer_score: clamp(layerScore),
    coverage_score: clamp(coverageScore),
    quality_score: clamp(qualityScore * 2),
    reasons,
    operator_bounded,
  };
}

function clamp(n: number): Score0to100 {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
