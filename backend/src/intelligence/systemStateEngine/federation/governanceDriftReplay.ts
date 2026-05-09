/**
 * governanceDriftReplay — Phase 19. Time-series replay over Phase 17 +
 * Phase 18 audit history. Pure analytical view; no parallel persistence.
 *
 * Maps audit kinds to `DriftReplayKind`s and orders entries newest-first
 * within a configurable window.
 */

import type {
  GovernanceDriftReplay, GovernanceDriftEntry, DriftReplayKind,
} from './federationTypes';
import { MAX_DRIFT_REPLAY_ENTRIES } from './federationTypes';

const AUDIT_KIND_TO_DRIFT_KIND: Readonly<Record<string, DriftReplayKind>> = {
  validator_drift_detected: 'specialization_drift',
  validator_specialization_detected: 'specialization_drift',
  validator_reliability_shifted: 'specialization_drift',
  specialization_routing_updated: 'routing_volatility',
  governance_calibration_proposed: 'calibration_instability',
  governance_calibration_approved: 'calibration_instability',
  governance_calibration_rejected: 'calibration_instability',
  forecast_calibration_updated: 'calibration_instability',
  recovery_step_executed: 'recovery_pattern_drift',
  governance_topology_changed: 'topology_instability',
};

export interface BuildDriftReplayInput {
  readonly project_id: string;
  readonly window_hours?: number;
  readonly limit?: number;
}

export async function buildGovernanceDriftReplay(input: BuildDriftReplayInput): Promise<GovernanceDriftReplay> {
  const window_hours = Math.max(1, Math.min(720, input.window_hours ?? 168));     // 1h to 30d, default 7d
  const limit = Math.max(1, Math.min(MAX_DRIFT_REPLAY_ENTRIES, input.limit ?? 50));
  const window_end = new Date();
  const window_start = new Date(window_end.getTime() - window_hours * 60 * 60 * 1000);

  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    const { Op } = await import('sequelize');
    const rows: any[] = await GovernanceAuditEntry.findAll({
      where: {
        project_id: input.project_id,
        kind: { [Op.in]: Object.keys(AUDIT_KIND_TO_DRIFT_KIND) },
        recorded_at: { [Op.gte]: window_start },
      } as any,
      order: [['recorded_at', 'DESC']],
      limit: limit + 1,        // fetch one extra to detect truncation
    });
    const truncated = rows.length > limit;
    const taken = truncated ? rows.slice(0, limit) : rows;

    // Compute baseline averages within the window so we can express
    // each entry's delta_from_baseline.
    const baseline = computeBaselineCounts(rows, AUDIT_KIND_TO_DRIFT_KIND);

    const entries: GovernanceDriftEntry[] = taken.map((r, idx) => {
      const drift_kind = AUDIT_KIND_TO_DRIFT_KIND[r.kind] ?? 'governance_fragmentation';
      const baselineCount = baseline.get(drift_kind) ?? 0;
      const delta = baselineCount > 0 ? Math.round((1 / baselineCount) * 100) : 0;
      return {
        index: idx,
        kind: drift_kind,
        observed_at: new Date(r.recorded_at).toISOString(),
        summary: summaryFor(r.kind, r.payload),
        severity: severityFor(r.kind),
        delta_from_baseline: delta,
        source_audit_kind: r.kind,
      };
    });

    // Worst kind = the kind with the most entries in the window.
    const counts = new Map<DriftReplayKind, number>();
    for (const e of entries) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    let worst: DriftReplayKind | null = null;
    let worstCount = 0;
    for (const [k, c] of counts.entries()) {
      if (c > worstCount) { worst = k; worstCount = c; }
    }

    return {
      project_id: input.project_id,
      entries,
      window_start: window_start.toISOString(),
      window_end: window_end.toISOString(),
      worst_kind: worst,
      truncated,
      built_at: new Date().toISOString(),
    };
  } catch (err: any) {
    console.warn('[governanceDriftReplay] read failed:', err?.message);
    return {
      project_id: input.project_id,
      entries: [],
      window_start: window_start.toISOString(),
      window_end: window_end.toISOString(),
      worst_kind: null,
      truncated: false,
      built_at: new Date().toISOString(),
    };
  }
}

function computeBaselineCounts(rows: any[], map: Readonly<Record<string, DriftReplayKind>>): Map<DriftReplayKind, number> {
  const out = new Map<DriftReplayKind, number>();
  for (const r of rows) {
    const drift = map[r.kind];
    if (!drift) continue;
    out.set(drift, (out.get(drift) ?? 0) + 1);
  }
  return out;
}

function summaryFor(kind: string, payload: any): string {
  switch (kind) {
    case 'validator_drift_detected':
      return `Validator drift: ${payload?.validator_role ?? '?'} → ${payload?.tier ?? '?'}.`;
    case 'specialization_routing_updated':
      return `Routing updated for intent ${payload?.target_intent ?? '?'}; stability ${payload?.stability_tier ?? '?'}.`;
    case 'governance_calibration_proposed':
      return `Calibration proposed: ${payload?.calibration_type ?? '?'}.`;
    case 'governance_calibration_approved':
      return `Calibration approved: ${payload?.calibration_type ?? '?'} (decided_by=${payload?.decided_by ?? '?'}).`;
    case 'governance_calibration_rejected':
      return `Calibration rejected: ${payload?.calibration_type ?? '?'} (decided_by=${payload?.decided_by ?? '?'}).`;
    case 'forecast_calibration_updated':
      return `Forecast calibration updated.`;
    case 'recovery_step_executed':
      return `Recovery step ${payload?.step_index ?? '?'} (${payload?.kind ?? '?'}) → ${payload?.action ?? '?'}.`;
    case 'governance_topology_changed':
      return `Governance topology changed.`;
    default:
      return `Audit event: ${kind}`;
  }
}

function severityFor(kind: string): 'info' | 'warning' | 'error' {
  if (kind === 'validator_drift_detected') return 'warning';
  if (kind === 'governance_calibration_rejected') return 'warning';
  if (kind === 'governance_topology_changed') return 'info';
  return 'info';
}

export const _MAX_DRIFT_REPLAY_ENTRIES_FOR_TESTS = MAX_DRIFT_REPLAY_ENTRIES;
