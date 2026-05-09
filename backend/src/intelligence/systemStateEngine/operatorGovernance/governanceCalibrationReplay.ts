/**
 * governanceCalibrationReplay — Phase 18. Walks the audit history of
 * `governance_calibration_*` rows and produces a structured replay
 * suitable for the dashboard's transparency surface.
 *
 * Architectural commitment: this is READ-ONLY. The replay walker
 * never mutates state, never re-applies calibrations, never autonomously
 * triggers governance evolution. It assembles a timeline.
 */

import type {
  TransparencyReplayEntry, TransparencyReplayKind,
} from './operatorGovernanceTypes';
import { TRANSPARENCY_REPLAY_MAX_ENTRIES } from './operatorGovernanceTypes';

export interface BuildCalibrationReplayInput {
  readonly project_id: string;
  /** Optional limit; clamped to TRANSPARENCY_REPLAY_MAX_ENTRIES. */
  readonly limit?: number;
}

export interface CalibrationReplayResult {
  readonly project_id: string;
  readonly entries: ReadonlyArray<TransparencyReplayEntry>;
  readonly truncated: boolean;
  readonly built_at: string;
}

const REPLAY_KIND_MAP: Readonly<Record<string, TransparencyReplayKind>> = {
  governance_calibration_proposed: 'operator_intervention',
  governance_calibration_approved: 'operator_intervention',
  governance_calibration_rejected: 'operator_intervention',
  validator_drift_detected: 'drift_event',
  validator_specialization_detected: 'specialization_shift',
  validator_reliability_shifted: 'weight_change',
  causal_forecast_generated: 'forecast_recalibration',
};

export async function buildCalibrationReplay(input: BuildCalibrationReplayInput): Promise<CalibrationReplayResult> {
  const limit = Math.max(1, Math.min(TRANSPARENCY_REPLAY_MAX_ENTRIES, input.limit ?? 50));
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    const { Op } = await import('sequelize');
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);     // 14d window
    const rows: any[] = await GovernanceAuditEntry.findAll({
      where: {
        project_id: input.project_id,
        kind: { [Op.in]: Object.keys(REPLAY_KIND_MAP) },
        recorded_at: { [Op.gte]: since },
      } as any,
      order: [['recorded_at', 'DESC']],
      limit: limit + 1,        // fetch one extra to detect truncation
    });
    const truncated = rows.length > limit;
    const taken = truncated ? rows.slice(0, limit) : rows;
    const entries: TransparencyReplayEntry[] = taken.map((r, idx) => ({
      index: idx,
      kind: REPLAY_KIND_MAP[r.kind] ?? 'operator_intervention',
      summary: summaryFor(r.kind, r.payload),
      recorded_at: new Date(r.recorded_at).toISOString(),
      payload: r.payload ?? {},
    }));
    return {
      project_id: input.project_id,
      entries,
      truncated,
      built_at: new Date().toISOString(),
    };
  } catch (err: any) {
    console.warn('[governanceCalibrationReplay] read failed:', err?.message);
    return {
      project_id: input.project_id,
      entries: [],
      truncated: false,
      built_at: new Date().toISOString(),
    };
  }
}

function summaryFor(kind: string, payload: any): string {
  switch (kind) {
    case 'governance_calibration_proposed':
      return `Proposed ${payload?.calibration_type ?? 'calibration'} — awaiting operator decision.`;
    case 'governance_calibration_approved':
      return `Operator approved ${payload?.calibration_type ?? 'calibration'} (decided_by=${payload?.decided_by ?? '?'}).`;
    case 'governance_calibration_rejected':
      return `Operator rejected ${payload?.calibration_type ?? 'calibration'} (decided_by=${payload?.decided_by ?? '?'}).`;
    case 'validator_drift_detected':
      return `Drift detected on ${payload?.validator_role ?? 'validator'} → tier ${payload?.tier ?? '?'}.`;
    case 'validator_specialization_detected':
      return `Specialization shift detected on ${payload?.validator_role ?? 'validator'} for domain ${payload?.domain ?? '?'}.`;
    case 'validator_reliability_shifted':
      return `Reliability shifted: ${payload?.validator_role ?? '?'} → ${payload?.new_tier ?? '?'}.`;
    case 'causal_forecast_generated':
      return `Forecast regenerated; worst signal ${payload?.worst_signal ?? '(none)'}.`;
    default:
      return `Audit event: ${kind}`;
  }
}

export const _TRANSPARENCY_REPLAY_MAX_ENTRIES_FOR_TESTS = TRANSPARENCY_REPLAY_MAX_ENTRIES;
