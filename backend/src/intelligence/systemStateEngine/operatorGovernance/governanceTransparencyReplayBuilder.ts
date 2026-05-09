/**
 * governanceTransparencyReplayBuilder — Phase 18. Composes the
 * Phase 17 attribution history + Phase 18 calibration replay into a
 * single `GovernanceTransparencyReplay` payload.
 *
 * Architectural commitment: this is an ANALYTICAL VIEW. It assembles
 * existing data; it does NOT introduce parallel persistence systems.
 * The single source of governance lineage is GovernanceAuditEntry rows
 * + in-memory attribution snapshots, both already shipped.
 */

import type {
  GovernanceTransparencyReplay, TransparencyReplayEntry,
} from './operatorGovernanceTypes';
import { TRANSPARENCY_REPLAY_MAX_ENTRIES } from './operatorGovernanceTypes';
import { buildCalibrationReplay } from './governanceCalibrationReplay';
import { buildAdaptiveWeights } from '../adaptiveGovernance/adaptiveValidatorEngine';

export interface BuildTransparencyReplayInput {
  readonly project_id: string;
  readonly limit?: number;
}

export async function buildGovernanceTransparencyReplay(input: BuildTransparencyReplayInput): Promise<GovernanceTransparencyReplay> {
  const limit = Math.max(1, Math.min(TRANSPARENCY_REPLAY_MAX_ENTRIES, input.limit ?? 50));
  const calibrationReplay = await buildCalibrationReplay({ project_id: input.project_id, limit });

  // Augment with the current adaptive weight snapshot so operators see
  // the present state alongside the historical timeline.
  const adaptive = buildAdaptiveWeights({ project_id: input.project_id });
  const adaptiveEntries: TransparencyReplayEntry[] = adaptive.attributions.map((a, idx) => ({
    index: calibrationReplay.entries.length + idx,
    kind: a.adjusted_weight !== a.prior_weight ? 'weight_change' : 'weight_change',
    summary: `${a.validator_role}: ${a.prior_weight.toFixed(2)} → ${a.adjusted_weight.toFixed(2)} (${a.adjustment_reason})`,
    recorded_at: adaptive.built_at,
    payload: { attribution: a },
  }));

  // Concat + sort newest-first; truncate.
  const allEntries = [...calibrationReplay.entries, ...adaptiveEntries].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const truncated = calibrationReplay.truncated || allEntries.length > limit;
  const finalEntries = allEntries.slice(0, limit).map((e, idx) => ({ ...e, index: idx }));

  return {
    project_id: input.project_id,
    entries: finalEntries,
    truncated,
    built_at: new Date().toISOString(),
  };
}
