/**
 * governanceTopologyBuilder — Phase 18. Pure builder that assembles a
 * structured `GovernanceTopologyMap` payload from existing engine data.
 *
 * Architectural commitment (per Phase 18 stress-test):
 *   - This is a STRUCTURED DATA MODEL, NOT a graph rendering library.
 *   - The frontend renders the result as styled lists/badges/sections.
 *   - No force-directed graph layout, no reactive simulation, no heavy
 *     visualization framework.
 *   - Inputs come from Phase 17 (drift, specialization, adaptive weights)
 *     + Phase 18 (routing decisions). Topology nodes are validators,
 *     specialization zones, trust clusters, stabilization hubs, and
 *     bottlenecks.
 */

import type {
  ValidatorRole,
} from '../causality/causalityTypes';
import { VALIDATOR_ROLES } from '../causality/distributedValidationHarness';
import type {
  GovernanceTopologyMap, TopologyNode, TopologyEdge,
} from './operatorGovernanceTypes';
import { TOPOLOGY_MAX_NODES } from './operatorGovernanceTypes';
import { buildDriftProfile } from '../adaptiveGovernance/validatorDriftDetector';
import { buildSpecializationMap } from '../adaptiveGovernance/validatorSpecializationAnalyzer';
import { buildAdaptiveWeights } from '../adaptiveGovernance/adaptiveValidatorEngine';
import { isRoutingSuppressed } from './specializationRoutingEngine';
import { MUTATION_INTENT_CLASSES } from '../mutation/mutationTypes';

export interface BuildTopologyInput {
  readonly project_id: string;
}

export function buildGovernanceTopology(input: BuildTopologyInput): GovernanceTopologyMap {
  const drift = buildDriftProfile(input.project_id);
  const specialization = buildSpecializationMap(input.project_id);
  const adaptive = buildAdaptiveWeights({ project_id: input.project_id });
  const driftByRole = new Map(drift.signals.map(s => [s.validator_role, s] as const));

  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];

  // 1. Validator nodes
  for (const role of VALIDATOR_ROLES) {
    const driftSig = driftByRole.get(role)!;
    const adaptiveAttribution = adaptive.attributions.find(a => a.validator_role === role);
    nodes.push({
      node_id: `validator:${role}`,
      kind: 'validator',
      label: role,
      metadata: {
        drift_tier: driftSig.tier,
        adaptive_weight: adaptiveAttribution?.adjusted_weight ?? 1.0,
        prior_weight: adaptiveAttribution?.prior_weight ?? 1.0,
        recommended_action: driftSig.recommended_action,
      },
    });
  }

  // 2. Specialization zones (one per intent class with at least one strong/weak entry).
  for (const intent of MUTATION_INTENT_CLASSES) {
    const strongest = specialization.strongest_per_domain[intent];
    const weakest = specialization.weakest_per_domain[intent];
    if (!strongest && !weakest) continue;
    const zoneId = `zone:${intent}`;
    nodes.push({
      node_id: zoneId,
      kind: 'specialization_zone',
      label: `${intent} zone`,
      metadata: { strongest, weakest },
    });
    if (strongest) {
      edges.push({
        from: `validator:${strongest}`,
        to: zoneId,
        relation: 'specializes_in',
        strength: 80,
      });
    }
    if (weakest && weakest !== strongest) {
      edges.push({
        from: `validator:${weakest}`,
        to: zoneId,
        relation: 'specializes_in',
        strength: 30,
      });
    }
  }

  // 3. Bottlenecks: validators with drift tier 'unstable' or 'drifting' AND
  //    a weight ≥ 1.0 (still influential). These are the riskiest spots.
  const identified_bottlenecks: string[] = [];
  for (const role of VALIDATOR_ROLES) {
    const sig = driftByRole.get(role)!;
    const adaptiveAttribution = adaptive.attributions.find(a => a.validator_role === role);
    if ((sig.tier === 'unstable' || sig.tier === 'drifting') && (adaptiveAttribution?.adjusted_weight ?? 1.0) >= 1.0) {
      const bottleneckId = `bottleneck:${role}`;
      nodes.push({
        node_id: bottleneckId,
        kind: 'bottleneck',
        label: `${role} bottleneck`,
        metadata: { tier: sig.tier, weight: adaptiveAttribution?.adjusted_weight, signals: sig.signals },
      });
      identified_bottlenecks.push(bottleneckId);
      edges.push({ from: `validator:${role}`, to: bottleneckId, relation: 'depends_on', strength: 70 });
    }
  }

  // 4. Stabilization hubs: validators with drift tier 'stable' + adjusted_weight ≥ 1.1.
  const identified_hubs: string[] = [];
  for (const role of VALIDATOR_ROLES) {
    const sig = driftByRole.get(role)!;
    const adaptiveAttribution = adaptive.attributions.find(a => a.validator_role === role);
    if (sig.tier === 'stable' && (adaptiveAttribution?.adjusted_weight ?? 1.0) >= 1.1) {
      const hubId = `hub:${role}`;
      nodes.push({
        node_id: hubId,
        kind: 'stabilization_hub',
        label: `${role} hub`,
        metadata: { weight: adaptiveAttribution?.adjusted_weight },
      });
      identified_hubs.push(hubId);
      edges.push({ from: `validator:${role}`, to: hubId, relation: 'stabilizes', strength: 80 });
    }
  }

  // 5. Trust cluster (one per project — aggregate of all validators + their
  //    interaction with arbitration). Single node, all validators connect.
  const trustClusterId = `trust_cluster:${input.project_id}`;
  nodes.push({
    node_id: trustClusterId,
    kind: 'trust_cluster',
    label: `${input.project_id} trust cluster`,
    metadata: { worst_drift_tier: drift.worst_tier, routing_suppressed: isRoutingSuppressed(input.project_id) },
  });
  for (const role of VALIDATOR_ROLES) {
    edges.push({
      from: `validator:${role}`,
      to: trustClusterId,
      relation: 'influences',
      strength: 50,
    });
  }

  // 6. Arbitration node (singleton — represents the arbitration consensus surface).
  const arbId = `arbitration:${input.project_id}`;
  nodes.push({
    node_id: arbId,
    kind: 'arbitration',
    label: `${input.project_id} arbitration`,
    metadata: {},
  });
  for (const role of VALIDATOR_ROLES) {
    edges.push({
      from: `validator:${role}`,
      to: arbId,
      relation: 'depends_on',
      strength: 60,
    });
  }

  // Truncate at TOPOLOGY_MAX_NODES if needed (sanity guard — currently
  // we'd never approach this with ~5 validators + 7 intents + N hubs).
  const truncated = nodes.length > TOPOLOGY_MAX_NODES;
  const finalNodes = truncated ? nodes.slice(0, TOPOLOGY_MAX_NODES) : nodes;

  return {
    project_id: input.project_id,
    nodes: finalNodes,
    edges,
    identified_bottlenecks,
    identified_hubs,
    built_at: new Date().toISOString(),
  };
}

export const _TOPOLOGY_MAX_NODES_FOR_TESTS = TOPOLOGY_MAX_NODES;
