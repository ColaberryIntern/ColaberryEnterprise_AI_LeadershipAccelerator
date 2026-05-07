/**
 * cognitiveReplayStore — read API for the persistent cognitive memory.
 *
 * Powers the replay UI (Phase 8 §12) and the autonomous regression detector's
 * "did this route already regress recently" check.
 */
import { Op } from 'sequelize';

export interface ReplayQuery {
  readonly project_id: string;
  readonly kinds?: ReadonlyArray<string>;
  readonly severity?: 'info' | 'warning' | 'error';
  readonly since_ms?: number;             // age in ms; default 24h
  readonly limit?: number;
}

export interface ReplayEntry {
  readonly id: string;
  readonly event_id: string;
  readonly kind: string;
  readonly severity: string | null;
  readonly payload: any;
  readonly emitted_at: string;
}

export async function readReplay(query: ReplayQuery): Promise<ReplayEntry[]> {
  try {
    const { default: CognitionEvent } = await import('../../../models/CognitionEvent');
    const since = new Date(Date.now() - (query.since_ms ?? 24 * 60 * 60 * 1000));
    const where: any = { project_id: query.project_id, emitted_at: { [Op.gte]: since } };
    if (query.kinds && query.kinds.length > 0) where.kind = { [Op.in]: query.kinds };
    if (query.severity) where.severity = query.severity;
    const rows = await CognitionEvent.findAll({
      where,
      order: [['emitted_at', 'ASC']],
      limit: query.limit ?? 500,
    });
    return rows.map((r: any): ReplayEntry => ({
      id: r.id,
      event_id: r.event_id,
      kind: r.kind,
      severity: r.severity,
      payload: r.payload,
      emitted_at: new Date(r.emitted_at).toISOString(),
    }));
  } catch (err: any) {
    console.warn('[cognitiveReplayStore] read failed:', err?.message);
    return [];
  }
}

/** Convenience: count events by kind in a window. */
export async function countEventsByKind(projectId: string, windowMs: number = 24 * 60 * 60 * 1000): Promise<Record<string, number>> {
  try {
    const { default: CognitionEvent } = await import('../../../models/CognitionEvent');
    const since = new Date(Date.now() - windowMs);
    const rows = await CognitionEvent.findAll({
      where: { project_id: projectId, emitted_at: { [Op.gte]: since } },
      attributes: ['kind'],
      raw: true,
    });
    const counts: Record<string, number> = {};
    for (const r of rows as Array<{ kind: string }>) {
      counts[r.kind] = (counts[r.kind] || 0) + 1;
    }
    return counts;
  } catch (err: any) {
    console.warn('[cognitiveReplayStore] countEventsByKind failed:', err?.message);
    return {};
  }
}
