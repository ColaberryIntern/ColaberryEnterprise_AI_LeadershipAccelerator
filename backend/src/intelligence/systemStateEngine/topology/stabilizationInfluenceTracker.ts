/**
 * stabilizationInfluenceTracker — Phase 22. Within-partition tracker
 * for which recovered namespaces likely stabilized which downstream
 * namespaces.
 *
 * Architectural commitment:
 *   - Attribution is DETERMINISTIC: a recovery on namespace X stabilizes
 *     X's currently-tracked downstream namespaces in the declared graph.
 *   - No emergent stabilization discovery, no learned influence.
 *   - Bounded ring buffer per partition.
 */

import type { StabilizationInfluencePath, TopologyReplayAttribution } from './topologyTypes';
import { MAX_STABILIZATION_INFLUENCE_PATHS_PER_PARTITION } from './topologyTypes';
import { buildPropagationAttribution } from './runtimePropagationTopology';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

const partitionPaths = new Map<string, StabilizationInfluencePath[]>();

export interface RecordStabilizationInput {
  readonly organization_id: string;
  readonly originating_namespace: string;
  readonly recovery_kind: StabilizationInfluencePath['recovery_kind'];
}

export function recordStabilization(input: RecordStabilizationInput): StabilizationInfluencePath {
  const attribution: TopologyReplayAttribution = buildPropagationAttribution({
    organization_id: input.organization_id,
    originating_namespace: input.originating_namespace,
    propagation_kind: 'stabilization_flow',
  });

  const path: StabilizationInfluencePath = {
    originating_namespace: input.originating_namespace,
    stabilized_namespaces: attribution.impacted_namespaces,
    recovery_kind: input.recovery_kind,
    observed_at: new Date().toISOString(),
    attribution,
  };

  let list = partitionPaths.get(input.organization_id);
  if (!list) {
    list = [];
    partitionPaths.set(input.organization_id, list);
  }
  list.push(path);
  if (list.length > MAX_STABILIZATION_INFLUENCE_PATHS_PER_PARTITION) list.shift();

  try {
    publishCognitiveEvent({
      kind: 'continuity.amplified',
      project_id: 'system',
      severity: 'info',
      payload: {
        organization_id: input.organization_id,
        originating_namespace: input.originating_namespace,
        stabilized_count: attribution.impacted_namespaces.length,
        recovery_kind: input.recovery_kind,
      },
    });
  } catch { /* noop */ }

  return path;
}

export function listStabilizationPaths(organization_id: string): ReadonlyArray<StabilizationInfluencePath> {
  return [...(partitionPaths.get(organization_id) ?? [])].reverse();
}

export function _resetStabilizationForTests(): void {
  partitionPaths.clear();
}
