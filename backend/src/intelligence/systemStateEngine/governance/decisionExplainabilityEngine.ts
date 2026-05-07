/**
 * decisionExplainabilityEngine — answers "why did pressure escalate at
 * 14:32?" by composing two sources:
 *   - cognitiveReplayStore.readReplay() — minute-granular events, ~24h
 *   - SystemStateSnapshot — sparser state-at-T (24h full / hourly 7d /
 *     daily 90d retention)
 *
 * For a target event id (or time window), returns:
 *   - the anchor event itself
 *   - state snapshots immediately before + after the anchor
 *   - related events (same project, ±5 min window, ranked by relevance)
 *   - a human-readable narrative summarizing the chain
 *
 * Phase 12 §A.5.
 */

export interface ExplanationChain {
  readonly anchor_event: { id: string; kind: string; emitted_at: string; payload: any } | null;
  readonly state_before: any | null;            // SystemStateSnapshot row at or before anchor
  readonly state_after: any | null;             // SystemStateSnapshot row at or after anchor
  readonly related_events: ReadonlyArray<{ id: string; kind: string; emitted_at: string; severity?: string; payload: any }>;
  readonly narrative: string;
  readonly generated_at: string;
}

const RELATED_WINDOW_MS = 5 * 60 * 1000;
const RELATED_LIMIT = 20;

export async function explainDecision(opts: {
  project_id: string;
  event_id?: string;
  /** Alternative anchor — explain what happened around this timestamp. */
  at?: Date;
}): Promise<ExplanationChain> {
  const generated_at = new Date().toISOString();
  let anchor: { id: string; kind: string; emitted_at: string; payload: any } | null = null;
  let anchorTime: number | null = null;

  // Try event id first, fall back to timestamp anchor
  if (opts.event_id) {
    anchor = await loadEventById(opts.event_id);
    if (anchor) anchorTime = new Date(anchor.emitted_at).getTime();
  }
  if (!anchorTime && opts.at) {
    anchorTime = opts.at.getTime();
  }
  if (!anchorTime) {
    return { anchor_event: null, state_before: null, state_after: null, related_events: [], narrative: 'No anchor event or timestamp provided.', generated_at };
  }

  const [related_events, state_before, state_after] = await Promise.all([
    loadRelatedEvents(opts.project_id, anchorTime),
    loadStateSnapshotAtOrBefore(opts.project_id, anchorTime),
    loadStateSnapshotAtOrAfter(opts.project_id, anchorTime),
  ]);

  const narrative = buildNarrative({ anchor, related_events, state_before, state_after });

  return {
    anchor_event: anchor,
    state_before,
    state_after,
    related_events,
    narrative,
    generated_at,
  };
}

async function loadEventById(eventId: string): Promise<ExplanationChain['anchor_event'] | null> {
  try {
    const { default: CognitionEvent } = await import('../../../models/CognitionEvent');
    const row: any = await CognitionEvent.findByPk(eventId);
    if (!row) return null;
    return {
      id: row.id,
      kind: row.kind,
      emitted_at: row.emitted_at instanceof Date ? row.emitted_at.toISOString() : row.emitted_at,
      payload: row.payload,
    };
  } catch (err: any) {
    console.warn('[decisionExplainabilityEngine] event load failed:', err?.message);
    return null;
  }
}

async function loadRelatedEvents(projectId: string, anchorTime: number): Promise<Array<{ id: string; kind: string; emitted_at: string; severity?: string; payload: any }>> {
  try {
    const { Op } = await import('sequelize');
    const { default: CognitionEvent } = await import('../../../models/CognitionEvent');
    const min = new Date(anchorTime - RELATED_WINDOW_MS);
    const max = new Date(anchorTime + RELATED_WINDOW_MS);
    const rows: any[] = await CognitionEvent.findAll({
      where: { project_id: projectId, emitted_at: { [Op.between]: [min, max] } },
      order: [['emitted_at', 'ASC']],
      limit: RELATED_LIMIT,
    });
    return rows.map(r => ({
      id: r.id,
      kind: r.kind,
      emitted_at: r.emitted_at instanceof Date ? r.emitted_at.toISOString() : r.emitted_at,
      severity: r.severity,
      payload: r.payload,
    }));
  } catch (err: any) {
    console.warn('[decisionExplainabilityEngine] related events load failed:', err?.message);
    return [];
  }
}

async function loadStateSnapshotAtOrBefore(projectId: string, anchorTime: number): Promise<any | null> {
  try {
    const { Op } = await import('sequelize');
    const { default: SystemStateSnapshot } = await import('../../../models/SystemStateSnapshot');
    const cutoff = new Date(anchorTime);
    return await SystemStateSnapshot.findOne({
      where: { project_id: projectId, generated_at: { [Op.lte]: cutoff } },
      order: [['generated_at', 'DESC']],
    });
  } catch { return null; }
}

async function loadStateSnapshotAtOrAfter(projectId: string, anchorTime: number): Promise<any | null> {
  try {
    const { Op } = await import('sequelize');
    const { default: SystemStateSnapshot } = await import('../../../models/SystemStateSnapshot');
    const cutoff = new Date(anchorTime);
    return await SystemStateSnapshot.findOne({
      where: { project_id: projectId, generated_at: { [Op.gt]: cutoff } },
      order: [['generated_at', 'ASC']],
    });
  } catch { return null; }
}

function buildNarrative(opts: { anchor: ExplanationChain['anchor_event']; related_events: ExplanationChain['related_events']; state_before: any | null; state_after: any | null }): string {
  if (!opts.anchor) return 'No anchor event resolved — cannot construct narrative.';
  const parts: string[] = [];
  parts.push(`At ${opts.anchor.emitted_at}, event "${opts.anchor.kind}" fired.`);
  if (opts.related_events.length > 0) {
    const distinctKinds = Array.from(new Set(opts.related_events.map(e => e.kind)));
    parts.push(`In the surrounding ±5 min window, ${opts.related_events.length} related event(s) of kinds [${distinctKinds.slice(0, 6).join(', ')}] were observed.`);
  }
  if (opts.state_before && opts.state_after) {
    const before: any = opts.state_before;
    const after: any = opts.state_after;
    const healthBefore = before.health_score ?? before.healthScore;
    const healthAfter = after.health_score ?? after.healthScore;
    if (typeof healthBefore === 'number' && typeof healthAfter === 'number') {
      const delta = healthAfter - healthBefore;
      parts.push(`Health score moved from ${healthBefore} → ${healthAfter} (Δ${delta >= 0 ? '+' : ''}${delta}).`);
    }
  }
  return parts.join(' ');
}
