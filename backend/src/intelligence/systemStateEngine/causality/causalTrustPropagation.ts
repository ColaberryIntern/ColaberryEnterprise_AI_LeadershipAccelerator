/**
 * causalTrustPropagation — Phase 16. Pure function: given a lineage
 * graph and a per-node own-trust score, compute the inherited trust
 * decay each node carries because of its ancestors.
 *
 * Hard caps (per the addendum):
 *   - depth cap MAX_LINEAGE_DEPTH = 5 — ancestors deeper than this don't
 *     contribute to the decay
 *   - decay factor TRUST_DECAY_PER_GENERATION = 0.5 — each generation
 *     halves the contribution
 *
 * The honest behavior:
 *   inherited_decay = sum_over_ancestors_within_cap(
 *     (100 - ancestor.own_trust) * decay^generation
 *   ), clamped to [0, 100]
 *
 *   effective_trust = own_trust * (1 - inherited_decay/100)
 *
 * Bounded depth + decay factor = no runaway propagation. A single
 * unstable mutation 5 generations back contributes at most
 * (100-trust) * 0.5^5 = (100-trust)/32 to its descendants.
 */

import type {
  OperationalLineageGraph, LineageNode,
  CausalTrustPropagationEntry, CausalTrustPropagationMap,
} from './causalityTypes';
import { MAX_LINEAGE_DEPTH, TRUST_DECAY_PER_GENERATION } from './causalityTypes';
import { ancestorsOf } from './mutationLineageGraph';

export interface BuildTrustPropagationInput {
  readonly graph: OperationalLineageGraph;
  /** Per-node own-trust resolver — for mutations, callers pass the
   *  Phase 15 mutationTrustCalibrator result. For non-mutation nodes,
   *  resolver may return null (treated as 70 cold-start). */
  readonly resolveOwnTrust: (node: LineageNode) => number | null;
}

export function buildTrustPropagationMap(input: BuildTrustPropagationInput): CausalTrustPropagationMap {
  const entries: CausalTrustPropagationEntry[] = [];
  let worst = 0;
  for (const node of input.graph.nodes) {
    const ownTrust = input.resolveOwnTrust(node) ?? 70;
    const ancestry = ancestorsOf(input.graph, node.node_id);
    let inheritedDecay = 0;
    // Walk ancestors; the index in the array is its generation distance,
    // since ancestorsOf returns nearest-first BFS order.
    for (let gen = 0; gen < ancestry.length && gen < MAX_LINEAGE_DEPTH; gen++) {
      const ancestor = ancestry[gen];
      const ancestorTrust = input.resolveOwnTrust(ancestor) ?? 70;
      const ancestorWeakness = Math.max(0, 100 - ancestorTrust);
      const decayFactor = Math.pow(TRUST_DECAY_PER_GENERATION, gen + 1);
      inheritedDecay += ancestorWeakness * decayFactor;
    }
    inheritedDecay = Math.min(100, Math.round(inheritedDecay));
    if (inheritedDecay > worst) worst = inheritedDecay;
    const effective = Math.max(0, Math.round(ownTrust * (1 - inheritedDecay / 100)));
    const intent = node.kind === 'mutation' ? ((node.payload as any)?.mutation_class ?? null) : null;
    entries.push({
      node_id: node.node_id,
      mutation_intent: intent,
      own_trust_score: ownTrust,
      inherited_trust_decay: inheritedDecay,
      effective_trust: effective,
      ancestry_depth: Math.min(ancestry.length, MAX_LINEAGE_DEPTH),
    });
  }
  return {
    project_id: input.graph.project_id,
    entries,
    worst_inherited_decay: worst,
    built_at: new Date().toISOString(),
  };
}

export const _TRUST_DECAY_PER_GENERATION_FOR_TESTS = TRUST_DECAY_PER_GENERATION;
export const _MAX_LINEAGE_DEPTH_FOR_TESTS = MAX_LINEAGE_DEPTH;
