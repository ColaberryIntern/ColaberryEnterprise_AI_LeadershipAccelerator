/**
 * rootCauseAnalyzer — Phase 16. Identify originating instability nodes
 * given an unstable target (failed mutation, severe contradiction).
 *
 * Honest behavior:
 *   1. Walk ancestors of the target up to MAX_LINEAGE_DEPTH.
 *   2. Score each ancestor with a CausalConfidenceAttribution payload:
 *        - propagation_strength    (descendants count + severity)
 *        - contradiction_density   (concentration of contradictions in the subtree)
 *        - validator_agreement     (how many validators flagged this node previously)
 *        - lineage_depth_penalty   (deeper nodes get reduced confidence)
 *        - root_cause_confidence   (composite, 0-100)
 *   3. Sort by root_cause_confidence; surface the top N.
 *
 * Per the addendum: this is HOW certain we are, not just WHICH node.
 * "Confidence attribution" is a first-class output, not a footnote.
 *
 * Per the stress-test: we surface the root + descendants for operator
 * review, but we do NOT autonomously roll back ancestors. Root-cause
 * TARGETING is shipped; root-cause REVERSING is operator-driven (Phase 17+).
 */

import type {
  OperationalLineageGraph, LineageNode,
  CausalConfidenceAttribution, RootCauseAnalysis,
  ContradictionPropagationProfile,
  ValidatorVerdict,
} from './causalityTypes';
import { ancestorsOf, descendantsOf } from './mutationLineageGraph';
import { MAX_LINEAGE_DEPTH } from './causalityTypes';

const MAX_ROOTS_TO_SURFACE = 5;
const ROOT_CONFIDENCE_FLOOR = 25;

export interface RootCauseInput {
  readonly graph: OperationalLineageGraph;
  readonly target_node_id: string;
  readonly propagation: ContradictionPropagationProfile | null;
  /** Optional per-node validator verdicts collected from prior arbitrations. */
  readonly validator_verdicts_by_node?: Readonly<Record<string, ReadonlyArray<ValidatorVerdict>>>;
}

export function analyzeRootCauses(input: RootCauseInput): RootCauseAnalysis {
  const ancestors = ancestorsOf(input.graph, input.target_node_id);
  if (ancestors.length === 0) {
    // The target itself IS the root if we can find no ancestors.
    const targetNode = input.graph.nodes.find(n => n.node_id === input.target_node_id) ?? null;
    if (!targetNode) {
      return { project_id: input.graph.project_id, target_mutation_id: input.target_node_id, identified_roots: [], built_at: new Date().toISOString() };
    }
    const attribution = scoreNode(targetNode, input.graph, input.propagation, input.validator_verdicts_by_node ?? {}, /*genDepth*/ 0);
    return {
      project_id: input.graph.project_id,
      target_mutation_id: input.target_node_id,
      identified_roots: [{
        node: targetNode,
        attribution,
        ancestry: [],
        descendants_count: descendantsOf(input.graph, targetNode.node_id).length,
        stabilization_recommendation: stabilizationRecommendation(attribution),
        rollback_targeting_suggestion: rollbackSuggestion(targetNode),
      }],
      built_at: new Date().toISOString(),
    };
  }

  // Score each ancestor.
  const scored = ancestors.map((node, idx) => ({
    node,
    attribution: scoreNode(node, input.graph, input.propagation, input.validator_verdicts_by_node ?? {}, idx + 1),
    ancestry: ancestors.slice(0, idx),     // direct path from this ancestor down to the target
    descendants_count: descendantsOf(input.graph, node.node_id).length,
  }));

  // Filter out very-low-confidence candidates and rank by confidence.
  scored.sort((a, b) => b.attribution.root_cause_confidence - a.attribution.root_cause_confidence);
  const accepted = scored
    .filter(s => s.attribution.root_cause_confidence >= ROOT_CONFIDENCE_FLOOR)
    .slice(0, MAX_ROOTS_TO_SURFACE);

  const identified_roots = accepted.map(({ node, attribution, ancestry, descendants_count }) => ({
    node,
    attribution,
    ancestry,
    descendants_count,
    stabilization_recommendation: stabilizationRecommendation(attribution),
    rollback_targeting_suggestion: rollbackSuggestion(node),
  }));

  return {
    project_id: input.graph.project_id,
    target_mutation_id: input.target_node_id,
    identified_roots,
    built_at: new Date().toISOString(),
  };
}

function scoreNode(
  node: LineageNode,
  graph: OperationalLineageGraph,
  propagation: ContradictionPropagationProfile | null,
  verdicts_by_node: Readonly<Record<string, ReadonlyArray<ValidatorVerdict>>>,
  generationsFromTarget: number,
): CausalConfidenceAttribution {
  const descendants = descendantsOf(graph, node.node_id);
  const evidence: string[] = [];

  // 1. Propagation strength: more descendants, more error/warning severity → stronger.
  const errorDescendants = descendants.filter(d => d.severity === 'error').length;
  const warningDescendants = descendants.filter(d => d.severity === 'warning').length;
  const propagation_strength = clamp(descendants.length * 8 + errorDescendants * 12 + warningDescendants * 5);
  if (propagation_strength >= 50) evidence.push(`${descendants.length} descendants (${errorDescendants} error, ${warningDescendants} warning).`);

  // 2. Contradiction density: are contradictions clustered around this subject?
  let contradiction_density = 0;
  if (propagation && node.subject_id) {
    const matchingHotspot = propagation.hotspots.find(h => h.subject_id === node.subject_id);
    contradiction_density = clamp((matchingHotspot?.count ?? 0) * 10);
    if (contradiction_density >= 40) evidence.push(`Hotspot ${node.subject_id} carries ${matchingHotspot?.count ?? 0} contradictions in window.`);
  }

  // 3. Validator agreement: how many validators previously flagged this node?
  const verdicts = verdicts_by_node[node.node_id] ?? [];
  const flagged = verdicts.filter(v => v.recommendation === 'reject' || v.recommendation === 'rollback' || v.recommendation === 'contain').length;
  const validator_agreement = verdicts.length === 0 ? 50 : Math.round((flagged / verdicts.length) * 100);
  if (verdicts.length > 0 && validator_agreement >= 60) evidence.push(`${flagged}/${verdicts.length} validators flagged this node.`);

  // 4. Depth penalty: deeper-than-target ancestors are less likely to be the
  //    true root (recency bias is honest here — the platform's evidence is
  //    fresher for nearer ancestors). Penalty = generations × 8 (so a 5-gen
  //    ancestor loses 40 points).
  const lineage_depth_penalty = Math.min(MAX_LINEAGE_DEPTH * 8, generationsFromTarget * 8);
  if (lineage_depth_penalty > 0) evidence.push(`Depth penalty: -${lineage_depth_penalty} (generation ${generationsFromTarget}).`);

  // Composite: weighted blend with depth penalty subtracted.
  const composite =
    propagation_strength * 0.35 +
    contradiction_density * 0.30 +
    validator_agreement * 0.25 +
    (node.severity === 'error' ? 10 : node.severity === 'warning' ? 5 : 0);
  const root_cause_confidence = clamp(composite - lineage_depth_penalty);

  return {
    node_id: node.node_id,
    root_cause_confidence,
    supporting_evidence: evidence,
    propagation_strength,
    contradiction_density,
    validator_agreement,
    lineage_depth_penalty,
  };
}

function stabilizationRecommendation(attribution: CausalConfidenceAttribution): string {
  if (attribution.root_cause_confidence >= 70) {
    return 'Contain root + descendants via containMutationCascade(intent).';
  }
  if (attribution.root_cause_confidence >= 50) {
    return 'Monitor root and its descendants; trigger containment if validator agreement rises.';
  }
  return 'Insufficient confidence — review evidence before acting.';
}

function rollbackSuggestion(node: LineageNode): string {
  if (node.kind !== 'mutation') {
    return 'Non-mutation root; no direct rollback target. Trigger containment instead.';
  }
  const id = node.node_id;
  return `POST /api/portal/project/governance/mutation/${id}/rollback (operator-confirmed).`;
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export const _ROOT_CONFIDENCE_FLOOR_FOR_TESTS = ROOT_CONFIDENCE_FLOOR;
export const _MAX_ROOTS_TO_SURFACE_FOR_TESTS = MAX_ROOTS_TO_SURFACE;
