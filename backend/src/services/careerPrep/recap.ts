import { sequelize } from '../../config/database';
import { attemptObservationRows, type AttemptResult } from './attempts';
import { writeObservations } from './observationWriter';
import { loadPrepData, type PrepData } from './prepData';
import { buildDashboard } from './prepViews';
import type { ObservationRow } from './observationAdapters';
import type { SessionView } from './sessions';

/**
 * Career Prep v27, CP4.5: the recap after a session ends ("What changed today", shot L3-6).
 *
 * ORDER (the spec's rule): every scored attempt of the session is written as observations FIRST (the
 * writer is idempotent, so attempts already written insert nothing), and only then is the recap read,
 * from those rows. "Before" is the student's dashboard computed WITHOUT this session's observations,
 * "after" is the same dashboard WITH them, both through buildDashboard, so the recap's readiness and
 * skill numbers are exactly the dashboard's (no second formula that could drift).
 *
 * NO INVENTED DATA: a readiness or skill that cannot be computed is omitted, never 0. A session with no
 * scored attempt has no changed skills (the list is empty) and says so.
 */
export interface RecapSkill { key: string; label: string; before?: number; after: number }
export interface Recap {
  status: 'finished' | 'ended';
  minutes: number;
  attempts: number;
  firstName?: string;
  readiness?: { after: number; before?: number; interviewId?: string; company?: string };
  skills: RecapSkill[];
  streak: number;
}

/** The same data with the observations from `refs` taken out (observations and sourceRefs are parallel). */
export function withoutRefs(data: PrepData, refs: ReadonlySet<string>): PrepData {
  const keep = data.sourceRefs.map((s) => !refs.has(s.ref));
  return { ...data, observations: data.observations.filter((_, i) => keep[i]), sourceRefs: data.sourceRefs.filter((_, i) => keep[i]) };
}

/** Pure: the recap for one ended session, given all of the student's data (this session's rows included). */
export function buildRecap(data: PrepData, refs: ReadonlySet<string>, session: Pick<SessionView, 'status' | 'secondsActive'>, attempts: number, now: Date, anchorId?: string): Recap {
  const after = buildDashboard(data, now, anchorId);
  const before = buildDashboard(withoutRefs(data, refs), now, anchorId);
  const touched = new Set(data.observations.filter((_, i) => refs.has(data.sourceRefs[i].ref)).map((o) => o.skill));
  const beforeScore = new Map(before.skills.map((s) => [s.key, s.score]));
  const anchor = after.interviews.find((i) => i.id === after.anchorId);
  return {
    status: session.status === 'finished' ? 'finished' : 'ended',
    minutes: Math.round(session.secondsActive / 60),
    attempts,
    ...(data.firstName ? { firstName: data.firstName } : {}),
    ...(after.readiness ? { readiness: {
      after: after.readiness.value,
      ...(before.readiness ? { before: before.readiness.value } : {}),
      ...(anchor ? { interviewId: anchor.id, company: anchor.company } : {}),
    } } : {}),
    skills: after.skills.filter((s) => touched.has(s.key) && s.score !== undefined).map((s) => {
      const b = beforeScore.get(s.key);
      return { key: s.key, label: s.label, after: s.score as number, ...(b !== undefined ? { before: b } : {}) };
    }),
    streak: after.streak,
  };
}

export interface RecapDeps {
  write?: (rows: readonly ObservationRow[]) => Promise<number>;
  load?: (enrollmentId: string, now: Date) => Promise<PrepData>;
}

type AttemptRow = { id: string; result: AttemptResult; created_at: string | Date };

/** Write the session's scored attempts (idempotent), THEN read and build the recap. */
export async function sessionRecap(enrollmentId: string, session: SessionView, now = new Date(), deps: RecapDeps = {}): Promise<Recap> {
  const [rows] = await sequelize.query(
    `SELECT id, result, created_at FROM prep_attempts WHERE session_id = :s AND enrollment_id = :e AND status = 'done' AND result IS NOT NULL`,
    { replacements: { s: session.id, e: enrollmentId } });
  const attempts = rows as AttemptRow[];
  await (deps.write ?? writeObservations)(attempts.flatMap((a) => attemptObservationRows(enrollmentId, String(a.id), a.result, new Date(a.created_at))));
  const data = await (deps.load ?? loadPrepData)(enrollmentId, now);
  const [plans] = await sequelize.query('SELECT interview_id FROM prep_plans WHERE id = :p AND enrollment_id = :e', { replacements: { p: session.planId, e: enrollmentId } });
  const anchorId = (plans as Array<{ interview_id: string | null }>)[0]?.interview_id ?? undefined;
  return buildRecap(data, new Set(attempts.map((a) => `attempt:${a.id}`)), session, attempts.length, now, anchorId);
}
