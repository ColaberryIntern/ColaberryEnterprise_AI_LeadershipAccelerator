import { sequelize } from '../../config/database';
import { centralDate } from './readiness';
import type { Segment } from './planBuilder';

/**
 * Career Prep v27, CP4.3: timed sessions (prep_sessions).
 *
 *   start    today's day of the student's active plan becomes a session. RESUMABLE and IDEMPOTENT: if
 *            a running or paused session for that plan already started today (Central), it is returned
 *            instead of a second one, so a double click or a page reload never makes two.
 *   update   keyed by segment index: marking segment i done twice changes nothing. seconds_active only
 *            grows (a late, smaller report is ignored) and is capped at the wall time since the start,
 *            so a client cannot claim more practice than really happened.
 *   finish / end   set the final status once; a second call is a no-op.
 *
 * The enrollment always comes from the caller (the session token); another student's session is "not found".
 */
export type SessionStatus = 'running' | 'paused' | 'finished' | 'ended' | 'abandoned';
export interface SessionSegment extends Segment { state: 'pending' | 'done'; doneAt?: string }
export interface SessionView { id: string; planId: string; status: SessionStatus; startedAt: string; secondsActive: number; segments: SessionSegment[] }
export class NotFoundError extends Error { constructor() { super('not found'); this.name = 'NotFoundError'; } }

type Row = { id: string; plan_id: string; status: SessionStatus; started_at: string | Date; seconds_active: number; segments: SessionSegment[] };
const view = (r: Row): SessionView => ({ id: String(r.id), planId: String(r.plan_id), status: r.status, startedAt: new Date(r.started_at).toISOString(), secondsActive: Number(r.seconds_active), segments: r.segments });

export async function startSession(enrollmentId: string, planId: string, now = new Date()): Promise<{ session: SessionView; resumed: boolean }> {
  const [plans] = await sequelize.query(`SELECT id, days FROM prep_plans WHERE id = :p AND enrollment_id = :e AND status = 'active'`, { replacements: { p: planId, e: enrollmentId } });
  const plan = (plans as Array<{ id: string; days: Array<{ date: string; segments: Segment[] }> }>)[0];
  if (!plan) throw new NotFoundError();
  return sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:k))', { replacements: { k: `prep_sessions:${enrollmentId}` }, transaction });
    const [open] = await sequelize.query(
      `SELECT id, plan_id, status, started_at, seconds_active, segments FROM prep_sessions
        WHERE enrollment_id = :e AND plan_id = :p AND status IN ('running','paused') ORDER BY started_at DESC LIMIT 1`,
      { replacements: { e: enrollmentId, p: planId }, transaction });
    const existing = (open as Row[])[0];
    if (existing && centralDate(new Date(existing.started_at)) === centralDate(now)) return { session: view(existing), resumed: true };
    const today = centralDate(now);
    const day = plan.days.find((d) => d.date === today) ?? plan.days[0];
    const segments: SessionSegment[] = day.segments.map((s) => ({ ...s, state: 'pending' }));
    const [made] = await sequelize.query(
      `INSERT INTO prep_sessions (plan_id, enrollment_id, started_at, segments, status) VALUES (:p, :e, :now, CAST(:s AS JSONB), 'running')
       RETURNING id, plan_id, status, started_at, seconds_active, segments`,
      { replacements: { p: planId, e: enrollmentId, now, s: JSON.stringify(segments) }, transaction });
    return { session: view((made as Row[])[0]), resumed: false };
  });
}

export interface SessionUpdate { action: 'segment_done' | 'pause' | 'resume' | 'finish' | 'end'; segmentIndex?: number; secondsActive: number }

/** Pure: apply one update to a session row. Same update twice = same result. */
export function applyUpdate(s: SessionView, u: SessionUpdate, now: Date): SessionView {
  if (s.status === 'finished' || s.status === 'ended' || s.status === 'abandoned') return s;
  const wall = Math.max(0, Math.floor((now.getTime() - Date.parse(s.startedAt)) / 1000));
  const secondsActive = Math.min(wall, Math.max(s.secondsActive, Math.floor(u.secondsActive)));
  const segments = s.segments.map((seg, i) => (u.action === 'segment_done' && i === u.segmentIndex && seg.state !== 'done'
    ? { ...seg, state: 'done' as const, doneAt: now.toISOString() } : seg));
  const status: SessionStatus = u.action === 'pause' ? 'paused' : u.action === 'resume' ? 'running' : u.action === 'finish' ? 'finished' : u.action === 'end' ? 'ended' : s.status;
  return { ...s, secondsActive, segments, status };
}

export async function updateSession(enrollmentId: string, id: string, u: SessionUpdate, now = new Date()): Promise<SessionView> {
  return sequelize.transaction(async (transaction) => {
    const [rows] = await sequelize.query(
      `SELECT id, plan_id, status, started_at, seconds_active, segments FROM prep_sessions WHERE id = :id AND enrollment_id = :e FOR UPDATE`,
      { replacements: { id, e: enrollmentId }, transaction });
    const current = (rows as Row[])[0];
    if (!current) throw new NotFoundError();
    if (u.segmentIndex !== undefined && (u.segmentIndex < 0 || u.segmentIndex >= current.segments.length)) throw new NotFoundError();
    const next = applyUpdate(view(current), u, now);
    const ended = (next.status === 'finished' || next.status === 'ended') && current.status !== next.status;
    await sequelize.query(
      `UPDATE prep_sessions SET status = :status, seconds_active = :secs, segments = CAST(:segs AS JSONB)${ended ? ', ended_at = :now' : ''} WHERE id = :id`,
      { replacements: { status: next.status, secs: next.secondsActive, segs: JSON.stringify(next.segments), now, id }, transaction });
    return next;
  });
}

export async function currentSession(enrollmentId: string, planId: string): Promise<SessionView | null> {
  const [rows] = await sequelize.query(
    `SELECT id, plan_id, status, started_at, seconds_active, segments FROM prep_sessions
      WHERE enrollment_id = :e AND plan_id = :p AND status IN ('running','paused') ORDER BY started_at DESC LIMIT 1`,
    { replacements: { e: enrollmentId, p: planId } });
  const r = (rows as Row[])[0];
  return r ? view(r) : null;
}
