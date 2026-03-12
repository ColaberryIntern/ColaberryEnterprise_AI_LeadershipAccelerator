// ─── Strategic State Store ───────────────────────────────────────────────────
// Persists metric snapshots for trend analysis using existing KPISnapshot model.
// Captures every 15 minutes via cron.

import { snapshotKPIs, getKPIHistory } from '../reporting/kpiService';
import { getStrategicMetrics } from './metricCollector';

const SCOPE_TYPE = 'system' as const;
const SCOPE_ID = 'strategic-intelligence';
const SCOPE_NAME = 'Strategic Intelligence';

// ─── Capture Snapshot ───────────────────────────────────────────────────────

export async function captureStrategicSnapshot(): Promise<void> {
  try {
    const metrics = await getStrategicMetrics();

    // snapshotKPIs expects (scopeType, scopeId, scopeName, period, computedBy)
    // It stores the metrics as KPI definitions with values
    await snapshotKPIs(
      SCOPE_TYPE,
      SCOPE_ID,
      SCOPE_NAME,
      'daily',
      'strategic-intelligence-collector',
    );

    // Also store the full strategic metrics as a raw snapshot
    // Use the KPISnapshot model directly for the complete picture
    const KPISnapshot = (await import('../../models/KPISnapshot')).default;
    await KPISnapshot.create({
      scope_type: SCOPE_TYPE,
      scope_id: SCOPE_ID,
      scope_name: SCOPE_NAME,
      period: 'custom',
      metrics: metrics as any,
      computed_by: 'strategic-intelligence-collector',
    } as any);

    console.log('[StrategicStateStore] Snapshot captured');
  } catch (err: any) {
    console.error('[StrategicStateStore] Snapshot capture failed:', err.message);
  }
}

// ─── Read Snapshot History ──────────────────────────────────────────────────

export async function getSnapshotHistory(days: number = 7): Promise<any[]> {
  try {
    const KPISnapshot = (await import('../../models/KPISnapshot')).default;
    const { Op } = await import('sequelize');

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshots = await KPISnapshot.findAll({
      where: {
        scope_type: SCOPE_TYPE,
        scope_id: SCOPE_ID,
        period: 'custom',
        created_at: { [Op.gte]: since },
      },
      order: [['created_at', 'ASC']],
      raw: true,
    });

    return snapshots;
  } catch (err: any) {
    console.error('[StrategicStateStore] Failed to read snapshot history:', err.message);
    return [];
  }
}

// ─── Get Latest Snapshot ────────────────────────────────────────────────────

export async function getLatestSnapshot(): Promise<any | null> {
  try {
    const KPISnapshot = (await import('../../models/KPISnapshot')).default;

    const snapshot = await KPISnapshot.findOne({
      where: {
        scope_type: SCOPE_TYPE,
        scope_id: SCOPE_ID,
        period: 'custom',
      },
      order: [['created_at', 'DESC']],
      raw: true,
    });

    return snapshot;
  } catch (err: any) {
    console.error('[StrategicStateStore] Failed to read latest snapshot:', err.message);
    return null;
  }
}
