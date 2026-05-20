/**
 * walkSessionService — Phase B (2026-05-20).
 *
 * Walk = an operator stepping through a set of caps one at a time,
 * marking each as reviewed / follow-up / skip. The queue is built
 * server-side from the cap table using a named filter so the URL stays
 * shareable + refresh-safe.
 *
 * Wraps Sequelize so the routes stay thin.
 */
import type { WalkFilter } from '../models/WalkSession';
import type { WalkVerdict } from '../models/WalkCapEntry';

interface CapRow {
  id: string;
  name: string;
  frontend_route: string | null;
  priority_score?: number | null;
}

/**
 * Build a cap queue for a walk. Filter semantics:
 *  - 'all':              all active caps with a frontend_route
 *  - 'pending_review':   caps with a frontend_route whose Page BP is built
 *                        but has no completed UI review (usability !== 'ready')
 *  - 'top_10':           first 10 from the operational priority queue
 *  - 'with_notes':       caps with at least one prior VisualReviewSession.notes
 *  - 'custom':           caller passes capIds explicitly (no DB query)
 */
export async function buildCapQueue(
  projectId: string,
  filter: WalkFilter,
  opts: { capIds?: string[] } = {},
): Promise<string[]> {
  if (filter === 'custom') return (opts.capIds || []).filter(Boolean);

  const { sequelize } = await import('../config/database');
  const { QueryTypes } = await import('sequelize');

  // Base set: active caps with a frontend_route. The walk is a visual
  // operation; caps without a route have nothing to navigate to.
  const baseRows = await sequelize.query<CapRow>(
    `SELECT id, name, frontend_route
       FROM capabilities
      WHERE project_id = :pid
        AND applicability_status = 'active'
        AND frontend_route IS NOT NULL
        AND frontend_route <> ''
      ORDER BY name ASC`,
    { replacements: { pid: projectId }, type: QueryTypes.SELECT },
  );

  if (filter === 'all') return baseRows.map(r => r.id);

  if (filter === 'pending_review') {
    // A cap is pending review if its usability JSON doesn't have
    // frontend === 'ready'. We approximate by checking the column directly.
    const rows = await sequelize.query<CapRow>(
      `SELECT id, name, frontend_route
         FROM capabilities
        WHERE project_id = :pid
          AND applicability_status = 'active'
          AND frontend_route IS NOT NULL
          AND frontend_route <> ''
          AND COALESCE(usability_json->>'frontend', '') <> 'ready'
        ORDER BY name ASC`,
      { replacements: { pid: projectId }, type: QueryTypes.SELECT },
    );
    return rows.map(r => r.id);
  }

  if (filter === 'top_10') {
    return baseRows.slice(0, 10).map(r => r.id);
  }

  if (filter === 'with_notes') {
    const rows = await sequelize.query<{ bp_id: string }>(
      `SELECT DISTINCT v.bp_id
         FROM visual_review_sessions v
        WHERE v.project_id = :pid
          AND v.bp_id IS NOT NULL
          AND v.notes IS NOT NULL
          AND length(trim(v.notes)) > 0`,
      { replacements: { pid: projectId }, type: QueryTypes.SELECT },
    );
    const bpIds = new Set(rows.map(r => r.bp_id));
    return baseRows.filter(r => bpIds.has(r.id)).map(r => r.id);
  }

  return baseRows.map(r => r.id);
}

export async function createWalk(input: {
  project_id: string;
  created_by: string;
  filter: WalkFilter;
  capIds?: string[];
}): Promise<{ id: string; cap_queue: string[]; filter: WalkFilter }> {
  const { default: WalkSession } = await import('../models/WalkSession');
  const { default: WalkCapEntry } = await import('../models/WalkCapEntry');

  const queue = await buildCapQueue(input.project_id, input.filter, { capIds: input.capIds });
  if (queue.length === 0) throw new Error('Cap queue is empty for the chosen filter');

  const walk = await WalkSession.create({
    project_id: input.project_id,
    created_by: input.created_by,
    started_at: new Date(),
    closed_at: null,
    cap_queue: queue,
    current_index: 0,
    filter: input.filter,
    notes_summary: null,
  } as any);

  // Pre-seed pending entries so the summary view can always render the
  // full picture regardless of how many caps the operator actually visits.
  await WalkCapEntry.bulkCreate(
    queue.map(capId => ({
      walk_session_id: (walk as any).id,
      cap_id: capId,
      verdict: 'pending' as WalkVerdict,
    })) as any,
  );

  return {
    id: (walk as any).id,
    cap_queue: queue,
    filter: input.filter,
  };
}

export async function getWalk(walkId: string): Promise<any | null> {
  const { default: WalkSession } = await import('../models/WalkSession');
  const { default: WalkCapEntry } = await import('../models/WalkCapEntry');
  const { sequelize } = await import('../config/database');
  const { QueryTypes } = await import('sequelize');

  const walk: any = await WalkSession.findByPk(walkId);
  if (!walk) return null;

  const entries: any = await WalkCapEntry.findAll({
    where: { walk_session_id: walkId },
  });
  const entriesByCap = new Map<string, any>(entries.map((e: any) => [e.cap_id, e]));

  // Load cap details for every queued cap so the UI can render names + routes
  // without an extra round trip.
  const caps = await sequelize.query<any>(
    `SELECT id, name, frontend_route,
            COALESCE(usability_json->>'frontend', '') AS usability_frontend
       FROM capabilities
      WHERE id = ANY(:ids)`,
    { replacements: { ids: walk.cap_queue }, type: QueryTypes.SELECT },
  );
  const capsById = new Map(caps.map(c => [c.id, c]));

  return {
    id: walk.id,
    project_id: walk.project_id,
    created_by: walk.created_by,
    started_at: new Date(walk.started_at).toISOString(),
    closed_at: walk.closed_at ? new Date(walk.closed_at).toISOString() : null,
    filter: walk.filter,
    current_index: walk.current_index,
    cap_queue: walk.cap_queue,
    caps: walk.cap_queue.map((id: string, idx: number) => {
      const cap = capsById.get(id) || { id, name: '(missing)', frontend_route: null };
      const entry = entriesByCap.get(id) || { verdict: 'pending' };
      return {
        index: idx,
        cap_id: id,
        name: cap.name,
        frontend_route: cap.frontend_route,
        usability_frontend: cap.usability_frontend || null,
        verdict: entry.verdict,
        cap_level_note: entry.cap_level_note || null,
        visual_review_session_id: entry.visual_review_session_id || null,
        visited_at: entry.visited_at ? new Date(entry.visited_at).toISOString() : null,
        decided_at: entry.decided_at ? new Date(entry.decided_at).toISOString() : null,
      };
    }),
    counts: countByVerdict(entries),
  };
}

function countByVerdict(entries: any[]): Record<WalkVerdict, number> {
  const c: Record<WalkVerdict, number> = { pending: 0, reviewed: 0, follow_up: 0, skip: 0 };
  for (const e of entries) {
    const v = (e.verdict || 'pending') as WalkVerdict;
    if (v in c) c[v] += 1;
  }
  return c;
}

export async function setIndex(walkId: string, index: number): Promise<void> {
  const { default: WalkSession } = await import('../models/WalkSession');
  const walk: any = await WalkSession.findByPk(walkId);
  if (!walk) throw new Error('Walk not found');
  const clamped = Math.max(0, Math.min(index, walk.cap_queue.length - 1));
  await WalkSession.update(
    { current_index: clamped } as any,
    { where: { id: walkId } },
  );
  // Mark the cap at this index as visited if not already.
  const capId = walk.cap_queue[clamped];
  if (capId) {
    const { default: WalkCapEntry } = await import('../models/WalkCapEntry');
    const entry: any = await WalkCapEntry.findOne({ where: { walk_session_id: walkId, cap_id: capId } });
    if (entry && !entry.visited_at) {
      await WalkCapEntry.update(
        { visited_at: new Date() } as any,
        { where: { id: entry.id } },
      );
    }
  }
}

export async function setVerdict(input: {
  walk_id: string;
  cap_id: string;
  verdict: WalkVerdict;
  cap_level_note?: string | null;
}): Promise<void> {
  const { default: WalkCapEntry } = await import('../models/WalkCapEntry');
  const patch: any = {
    verdict: input.verdict,
    decided_at: new Date(),
  };
  if (typeof input.cap_level_note === 'string') {
    patch.cap_level_note = input.cap_level_note.slice(0, 8000) || null;
  }
  await WalkCapEntry.update(patch, {
    where: { walk_session_id: input.walk_id, cap_id: input.cap_id },
  });
}

export async function linkVisualReviewSession(input: {
  walk_id: string;
  cap_id: string;
  visual_review_session_id: string;
}): Promise<void> {
  const { default: WalkCapEntry } = await import('../models/WalkCapEntry');
  await WalkCapEntry.update(
    { visual_review_session_id: input.visual_review_session_id } as any,
    { where: { walk_session_id: input.walk_id, cap_id: input.cap_id } },
  );
}

export async function closeWalk(walkId: string): Promise<void> {
  const { default: WalkSession } = await import('../models/WalkSession');
  await WalkSession.update(
    { closed_at: new Date() } as any,
    { where: { id: walkId } },
  );
}

export async function listProjectWalks(projectId: string, opts: { limit?: number } = {}): Promise<any[]> {
  const { default: WalkSession } = await import('../models/WalkSession');
  const rows: any = await WalkSession.findAll({
    where: { project_id: projectId },
    order: [['started_at', 'DESC']],
    limit: opts.limit ?? 25,
  });
  return rows.map((r: any) => ({
    id: r.id,
    started_at: new Date(r.started_at).toISOString(),
    closed_at: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    filter: r.filter,
    cap_count: Array.isArray(r.cap_queue) ? r.cap_queue.length : 0,
    current_index: r.current_index,
  }));
}
