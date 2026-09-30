/**
 * capeLifecycleModePolicyService — CAPE Phase 6 (design doc §10 "Lifecycle
 * mixes", §12 "Learner-stage policies", §16 Phase 6) admin CRUD over the 5
 * versioned lifecycle-mode mix rows. Reuses `LifecycleMode` from
 * capeLifecycleModeService.ts (Phase 5's already-shipped classifier) as the
 * single source of truth for the 5 valid modes — this service does not
 * reclassify learners, it only stores/versions the recommended mix percentage
 * an admin can view and edit for each mode.
 *
 * Same "insert-new-version" contract as capeSkillDefinitionsService.ts /
 * capeGovernancePolicyService.ts: an edit never mutates a row in place, it
 * flips the current row's `is_current` to false and inserts a new row at
 * `version+1`. An identical-mix PUT is a no-op.
 *
 * NOT consumed by any live ranking/selection logic in this phase (see
 * execution-contract.md Out-of-scope) — a governable, versioned, view+edit
 * surface only. Wiring a mode's mix into actual Today Plan/ranker slot
 * selection is left for a future phase.
 */
import { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import CapeLifecycleModePolicy from '../../models/CapeLifecycleModePolicy';
import type { LifecycleMode } from './capeLifecycleModeService';
import { UpdateLifecycleModeMixInput } from '../../schemas/capeSchema';

export const ALL_LIFECYCLE_MODES: LifecycleMode[] = [
  'foundation', 'experienced_cold_start', 'active_builder', 'architect_track', 'returning_after_absence',
];

export class LifecycleModePolicyNotFoundError extends Error {
  status = 404;
  constructor(mode: string) { super(`no current lifecycle-mode policy for "${mode}"`); this.name = 'LifecycleModePolicyNotFoundError'; }
}

export async function listCurrentLifecycleModePolicies(): Promise<CapeLifecycleModePolicy[]> {
  return CapeLifecycleModePolicy.findAll({ where: { is_current: true }, order: [['mode', 'ASC']] });
}

export async function getLifecycleModePolicyHistory(mode: LifecycleMode): Promise<CapeLifecycleModePolicy[]> {
  return CapeLifecycleModePolicy.findAll({ where: { mode }, order: [['version', 'ASC']] });
}

function mixUnchanged(current: Record<string, number>, next: Record<string, number>): boolean {
  const currentKeys = Object.keys(current).sort();
  const nextKeys = Object.keys(next).sort();
  if (currentKeys.length !== nextKeys.length || currentKeys.some((k, i) => k !== nextKeys[i])) return false;
  return currentKeys.every((k) => Math.abs(current[k] - next[k]) < 1e-9);
}

/**
 * Update one mode's mix. No-op (returns the unchanged current row,
 * `versioned: false`) if the new mix is identical (same keys, same values) to
 * the current one; otherwise inserts version+1 and flips the prior row's
 * is_current, in a single transaction. Throws LifecycleModePolicyNotFoundError
 * if `mode` has no current row (should never happen post-schema-init, since
 * all 5 modes are seeded — a genuine data-integrity signal if it does).
 */
export async function updateLifecycleModeMix(
  mode: LifecycleMode,
  patch: UpdateLifecycleModeMixInput,
  adminId?: string,
): Promise<{ policy: CapeLifecycleModePolicy; versioned: boolean }> {
  const current = await CapeLifecycleModePolicy.findOne({ where: { mode, is_current: true } });
  if (!current) throw new LifecycleModePolicyNotFoundError(mode);

  if (mixUnchanged(current.mix, patch.mix) && (patch.reason === undefined || patch.reason === current.reason)) {
    return { policy: current, versioned: false };
  }

  return sequelize.transaction(async (t: Transaction) => {
    await current.update({ is_current: false }, { transaction: t });
    const next = await CapeLifecycleModePolicy.create({
      mode,
      version: current.version + 1,
      is_current: true,
      mix: patch.mix,
      reason: patch.reason !== undefined ? patch.reason : current.reason,
      created_by: adminId ?? null,
    }, { transaction: t });
    return { policy: next, versioned: true };
  });
}
