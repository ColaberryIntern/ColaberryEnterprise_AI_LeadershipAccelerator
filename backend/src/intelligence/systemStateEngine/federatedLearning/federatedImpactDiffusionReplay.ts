/**
 * federatedImpactDiffusionReplay — Phase 20. Analytical view over the
 * Phase 19 federation lineage + Phase 20 effectiveness tracker outputs.
 * Pure replay; no parallel persistence.
 *
 * Reuses:
 *   - Phase 19 `federationLineageTracker` for source/consumer history
 *   - Phase 20 effectiveness profiles for outcome aggregation
 */

import type {
  FederatedImpactDiffusionReplay, DiffusionReplayEntry,
} from './federatedLearningTypes';
import {
  MAX_DIFFUSION_REPLAY_ENTRIES,
} from './federatedLearningTypes';
import { readFederationLineage, readConsumptionAttributions } from '../federation/federationLineageTracker';
import { readEffectivenessProfile } from './federatedEffectivenessTracker';

export interface BuildDiffusionReplayInput {
  readonly organization_id: string;
  /** When provided, scope to a single archetype. Otherwise whole-org. */
  readonly archetype_signature?: string;
  readonly limit?: number;
}

export async function buildFederatedImpactDiffusionReplay(input: BuildDiffusionReplayInput): Promise<FederatedImpactDiffusionReplay> {
  const limit = Math.max(1, Math.min(MAX_DIFFUSION_REPLAY_ENTRIES, input.limit ?? 50));
  const lineage = readFederationLineage({ organization_id: input.organization_id });

  const archetypeNodes = lineage.nodes.filter(n => n.kind === 'archetype');
  const filtered = input.archetype_signature
    ? archetypeNodes.filter(n => n.label === input.archetype_signature)
    : archetypeNodes;

  const entries: DiffusionReplayEntry[] = [];
  for (let idx = 0; idx < filtered.length && entries.length < limit; idx++) {
    const node = filtered[idx];
    const archetype_signature = node.label;
    const attributions = readConsumptionAttributions(input.organization_id, archetype_signature);
    const effectiveness = await readEffectivenessProfile(input.organization_id, archetype_signature);

    // Source projects = inbound `shared` edges to this archetype node.
    const sourceEdges = lineage.edges.filter(e => e.to === node.node_id && e.relation === 'shared');
    const sources = sourceEdges.map(e => e.from.replace(/^source:/, ''));
    const consumers = Array.from(new Set(attributions.map(a => a.consumer_project)));
    const local_calibrations_generated = attributions.filter(a => a.calibration_generated).length;
    // Use effectiveness profile to characterize stabilization improvement / regression.
    const stabilization_improved_count = effectiveness && effectiveness.observed_stabilization_delta >= 5
      ? consumers.length : 0;
    const stabilization_regressed_count = effectiveness && effectiveness.observed_stabilization_delta <= -5
      ? consumers.length : 0;

    entries.push({
      index: idx,
      archetype_signature,
      source_project: sources[0] ?? '(unknown)',
      consumer_projects: consumers,
      local_calibrations_generated,
      stabilization_improved_count,
      stabilization_regressed_count,
      observed_at: new Date().toISOString(),
      summary: composeDiffusionSummary(archetype_signature, sources, consumers, effectiveness),
    });
  }

  return {
    organization_id: input.organization_id,
    archetype_signature: input.archetype_signature ?? null,
    entries,
    truncated: filtered.length > limit,
    built_at: new Date().toISOString(),
  };
}

function composeDiffusionSummary(
  archetype_signature: string,
  sources: ReadonlyArray<string>,
  consumers: ReadonlyArray<string>,
  effectiveness: import('./federatedLearningTypes').FederatedEffectivenessProfile | null,
): string {
  const stab = effectiveness ? `; stabilization Δ ${effectiveness.observed_stabilization_delta}` : '';
  return `${archetype_signature.slice(0, 18)}: ${sources.length} source(s) → ${consumers.length} consumer(s)${stab}`;
}

export const _MAX_DIFFUSION_REPLAY_ENTRIES_FOR_TESTS = MAX_DIFFUSION_REPLAY_ENTRIES;
