/**
 * federationVisibilityReplay — Phase 20. Analytical lineage view over
 * Phase 19 federation lineage + Phase 20 effectiveness data.
 *
 * Architectural commitment: ANALYTICAL VIEW only. Reuses existing
 * lineage + audit + attribution data — no parallel persistence.
 */

import type {
  FederationVisibilityReplay, VisibilityReplayEntry,
} from './federatedLearningTypes';
import {
  VISIBILITY_REPLAY_DEFAULT_WINDOW_HOURS,
  VISIBILITY_REPLAY_MAX_WINDOW_HOURS,
} from './federatedLearningTypes';
import { readFederationLineage, readConsumptionAttributions } from '../federation/federationLineageTracker';
import { readEffectivenessProfile } from './federatedEffectivenessTracker';

export interface BuildVisibilityReplayInput {
  readonly organization_id: string;
  readonly window_hours?: number;
}

export async function buildFederationVisibilityReplay(input: BuildVisibilityReplayInput): Promise<FederationVisibilityReplay> {
  const window_hours = Math.max(1, Math.min(VISIBILITY_REPLAY_MAX_WINDOW_HOURS, input.window_hours ?? VISIBILITY_REPLAY_DEFAULT_WINDOW_HOURS));
  const window_end = new Date();
  const window_start = new Date(window_end.getTime() - window_hours * 60 * 60 * 1000);

  const lineage = readFederationLineage({ organization_id: input.organization_id });
  const archetypeNodes = lineage.nodes.filter(n => n.kind === 'archetype');

  const entries: VisibilityReplayEntry[] = [];
  for (let idx = 0; idx < archetypeNodes.length; idx++) {
    const node = archetypeNodes[idx];
    const archetype_signature = node.label;
    const attributions = readConsumptionAttributions(input.organization_id, archetype_signature);

    // Filter attributions to the window.
    const inWindow = attributions.filter(a => {
      const t = new Date(a.recorded_at).getTime();
      return t >= window_start.getTime() && t <= window_end.getTime();
    });
    if (inWindow.length === 0 && attributions.length > 0) continue;     // skip archetypes with no recent activity if any history exists

    const visible_to_projects = Array.from(new Set(inWindow.map(a => a.consumer_project)));
    const consumed_by_projects = Array.from(new Set(inWindow.filter(a => a.applied_locally).map(a => a.consumer_project)));
    const local_calibrations_generated = inWindow
      .filter(a => a.calibration_generated)
      .map(a => ({ project: a.consumer_project, proposal_id: a.calibration_generated!.proposal_id }));

    const effectiveness = await readEffectivenessProfile(input.organization_id, archetype_signature);
    const stabilization_change_summary = effectiveness
      ? `stabilization Δ ${effectiveness.observed_stabilization_delta} (${effectiveness.recovery_success_rate}% recovery)`
      : 'no effectiveness data yet';
    const governance_drift_summary = effectiveness && effectiveness.anomaly_frequency >= 30
      ? `anomaly frequency ${effectiveness.anomaly_frequency}% — drift signal`
      : 'no governance drift detected';

    entries.push({
      index: idx,
      archetype_signature,
      visible_to_projects,
      consumed_by_projects,
      local_calibrations_generated,
      stabilization_change_summary,
      governance_drift_summary,
      observed_at: new Date().toISOString(),
    });
  }

  return {
    organization_id: input.organization_id,
    entries,
    truncated: false,
    window_start: window_start.toISOString(),
    window_end: window_end.toISOString(),
    built_at: new Date().toISOString(),
  };
}

export const _VISIBILITY_REPLAY_DEFAULT_WINDOW_HOURS_FOR_TESTS = VISIBILITY_REPLAY_DEFAULT_WINDOW_HOURS;
export const _VISIBILITY_REPLAY_MAX_WINDOW_HOURS_FOR_TESTS = VISIBILITY_REPLAY_MAX_WINDOW_HOURS;
