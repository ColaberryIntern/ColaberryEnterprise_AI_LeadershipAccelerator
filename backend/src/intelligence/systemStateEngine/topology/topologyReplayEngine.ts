/**
 * topologyReplayEngine — Phase 22. Bounded reconstructive view that
 * assembles `TopologyVisibilityReplay` for a partition.
 *
 * Architectural commitment:
 *   - Read-only — composes data from cognitionTopologyGraph,
 *     topologyFragmentationDetector, runtimeDependencyTopology,
 *     runtimePropagationTopology, stabilizationInfluenceTracker,
 *     topologyForecastEngine.
 *   - Bounded by per-source caps that are already enforced upstream.
 */

import type { TopologyVisibilityReplay } from './topologyTypes';
import { buildCognitionTopologyGraph } from './cognitionTopologyGraph';
import { buildTopologyFragmentationProfile } from './topologyFragmentationDetector';
import { buildRuntimeDependencyProfile } from './runtimeDependencyTopology';
import { listRecentPropagationReplays } from './runtimePropagationTopology';
import { listStabilizationPaths } from './stabilizationInfluenceTracker';
import { buildTopologyForecast } from './topologyForecastEngine';

export interface BuildVisibilityInput {
  readonly organization_id: string;
  readonly recent_propagations_limit?: number;
  readonly recent_stabilizations_limit?: number;
}

export function buildTopologyVisibilityReplay(input: BuildVisibilityInput): TopologyVisibilityReplay {
  const propLimit = Math.max(1, Math.min(50, input.recent_propagations_limit ?? 10));
  const stabLimit = Math.max(1, Math.min(50, input.recent_stabilizations_limit ?? 10));
  return {
    organization_id: input.organization_id,
    partition_id: input.organization_id,
    graph: buildCognitionTopologyGraph(input.organization_id),
    fragmentation: buildTopologyFragmentationProfile(input.organization_id),
    dependencies: buildRuntimeDependencyProfile(input.organization_id),
    recent_propagations: listRecentPropagationReplays(input.organization_id).slice(0, propLimit),
    recent_stabilizations: listStabilizationPaths(input.organization_id).slice(0, stabLimit),
    forecast: buildTopologyForecast({ organization_id: input.organization_id }),
    built_at: new Date().toISOString(),
  };
}
