/**
 * causalStabilizationEngine — Phase 16. Composes the lineage graph +
 * propagation profile + root-cause analysis + causal trust map into a
 * StabilizationPriorityScore per node, then maps each priority to a
 * recommended action.
 *
 * Per the addendum: stabilization must prioritize highest propagation
 * risk + contradiction density + validator consensus + trust decay
 * impact. Score formula:
 *
 *   score = propagation_risk × 0.30
 *         + contradiction_density × 0.25
 *         + validator_consensus × 0.20
 *         + trust_decay_impact × 0.25
 *
 * Per the stress-test: this engine TARGETS roots, but autonomous
 * rollback still hits leaves. Operator can manually trigger ancestry
 * rollback via the existing endpoints. The recommended_actions surface
 * is operator-facing.
 *
 * The engine ALSO surfaces a classification (localized / branching /
 * cascading / recurrent / isolated / suppressed) per anchor subject.
 */

import type {
  OperationalLineageGraph, ContradictionPropagationProfile,
  RootCauseAnalysis, CausalTrustPropagationMap,
  StabilizationPriorityScore, CausalStabilizationPlan,
  OperationalSpreadClassification, LineageNode,
  ValidationArbitrationResult,
} from './causalityTypes';
import { descendantsOf } from './mutationLineageGraph';

const HIGH_SCORE_THRESHOLD = 70;
const MODERATE_SCORE_THRESHOLD = 45;

export interface BuildStabilizationPlanInput {
  readonly graph: OperationalLineageGraph;
  readonly propagation: ContradictionPropagationProfile;
  readonly trust_map: CausalTrustPropagationMap;
  readonly root_cause: RootCauseAnalysis;
  /** Optional: most-recent arbitration result per node (validator_consensus signal). */
  readonly arbitrations_by_node?: Readonly<Record<string, ValidationArbitrationResult>>;
  /** Subjects already contained — Phase 15 containment snapshot can pass these. */
  readonly already_contained_subjects?: ReadonlyArray<string>;
  /** Subjects whose intent class has been operator-frozen. */
  readonly frozen_subjects?: ReadonlyArray<string>;
  /** Subjects observed in the prior window — for "recurrent" classification. */
  readonly prior_window_subjects?: ReadonlyArray<string>;
}

export function buildStabilizationPlan(input: BuildStabilizationPlanInput): CausalStabilizationPlan {
  const trustEntryById = new Map(input.trust_map.entries.map(e => [e.node_id, e] as const));
  const propagationBySubject = new Map(input.propagation.hotspots.map(h => [h.subject_id, h] as const));
  const alreadyContained = new Set(input.already_contained_subjects ?? []);
  const frozen = new Set(input.frozen_subjects ?? []);
  const priorSubjects = new Set(input.prior_window_subjects ?? []);
  const arbitrations = input.arbitrations_by_node ?? {};

  const priorities: StabilizationPriorityScore[] = input.graph.nodes.map(node => {
    const descendants = descendantsOf(input.graph, node.node_id);
    const errorDescendants = descendants.filter(d => d.severity === 'error').length;
    const propagation_risk = clamp(descendants.length * 10 + errorDescendants * 15);

    const subj = node.subject_id ?? '';
    const hotspot = subj ? propagationBySubject.get(subj) : undefined;
    const contradiction_density = clamp((hotspot?.count ?? 0) * 12);

    const arbitration = arbitrations[node.node_id];
    const validator_consensus = arbitration ? arbitration.consensus_confidence : 50;

    const trustEntry = trustEntryById.get(node.node_id);
    const trust_decay_impact = trustEntry ? trustEntry.inherited_trust_decay : 0;

    const score = clamp(
      propagation_risk * 0.30 +
      contradiction_density * 0.25 +
      validator_consensus * 0.20 +
      trust_decay_impact * 0.25,
    );

    const classification = classify(node, descendants, alreadyContained, frozen, priorSubjects);

    return {
      node_id: node.node_id,
      score,
      propagation_risk,
      contradiction_density,
      validator_consensus,
      trust_decay_impact,
      classification,
    };
  });

  // Sort highest-score first; produce recommended actions.
  priorities.sort((a, b) => b.score - a.score);
  const rootIds = new Set(input.root_cause.identified_roots.map(r => r.node.node_id));

  const recommended_actions = priorities.map(p => {
    if (p.classification === 'isolated' || p.classification === 'suppressed') {
      return { node_id: p.node_id, action: 'noop' as const, reason: `${p.classification} — no further action` };
    }
    if (p.score >= HIGH_SCORE_THRESHOLD && rootIds.has(p.node_id)) {
      return { node_id: p.node_id, action: 'contain_root' as const, reason: `Score ${p.score} ≥ ${HIGH_SCORE_THRESHOLD}; identified as root` };
    }
    if (p.score >= HIGH_SCORE_THRESHOLD) {
      return { node_id: p.node_id, action: 'contain_descendants' as const, reason: `Score ${p.score} ≥ ${HIGH_SCORE_THRESHOLD}` };
    }
    if (p.score >= MODERATE_SCORE_THRESHOLD) {
      return { node_id: p.node_id, action: 'monitor' as const, reason: `Score ${p.score} between ${MODERATE_SCORE_THRESHOLD} and ${HIGH_SCORE_THRESHOLD}` };
    }
    return { node_id: p.node_id, action: 'noop' as const, reason: `Score ${p.score} below moderate threshold` };
  });

  return {
    project_id: input.graph.project_id,
    priorities,
    recommended_actions,
    built_at: new Date().toISOString(),
  };
}

function classify(
  node: LineageNode,
  descendants: ReadonlyArray<LineageNode>,
  alreadyContained: Set<string>,
  frozen: Set<string>,
  priorSubjects: Set<string>,
): OperationalSpreadClassification {
  const subj = node.subject_id ?? '';
  if (subj && frozen.has(subj)) return 'suppressed';
  if (subj && alreadyContained.has(subj)) return 'isolated';
  if (subj && priorSubjects.has(subj)) return 'recurrent';
  if (descendants.length >= 4) return 'cascading';
  if (descendants.length >= 2) return 'branching';
  return 'localized';
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export const _HIGH_SCORE_THRESHOLD_FOR_TESTS = HIGH_SCORE_THRESHOLD;
export const _MODERATE_SCORE_THRESHOLD_FOR_TESTS = MODERATE_SCORE_THRESHOLD;
