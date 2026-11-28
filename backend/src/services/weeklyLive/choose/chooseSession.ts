import { QueryTypes, type Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import { allWeeks } from '../../../data/canonicalCourse';
import LiveSession from '../../../models/LiveSession';

/**
 * Choose -> session (Basecamp WL4.1). Choosing a topic plans the class in the Accelerator sessions
 * system, inside the batch of the air month, so Present, QR, Edit and Attendance work unchanged.
 *
 * Rules:
 *  - One session per plan. The plan stores the session id; choosing again reuses it, never adds a row.
 *  - A class already scheduled on the air date in that batch (made by hand before Studio existed, like
 *    the Nov 30 Ep 2) is ADOPTED: linked to the plan, never retitled or retagged. Only a row Studio
 *    created is retitled when a different topic is chosen. (Assumption logged in the session log: a
 *    promoted title must not change because someone pressed Choose.)
 *  - Every Weekly Live uses Ali's personal Zoom room. No Zoom API call is made, ever: the room is a
 *    standing meeting and editing it would break every class that shares it.
 *  - All of it runs in one transaction under one advisory lock, so two Choose clicks cannot make two
 *    rows and a failure leaves no half-made session.
 *
 * Failure modes: no batch for the month -> 409 before anything is written; the linked session was
 * deleted -> a new one is adopted or created; a database error rolls the whole choose back.
 */
const CHOOSE_LOCK_KEY = 4406004;
const CLASS_START = '18:30';
const CLASS_END = '19:30';
/** Ali's personal meeting room (Basecamp WL0 contract). Overridable for a sandbox, never edited by API. */
export const ROOM_ID = process.env.WEEKLY_LIVE_ZOOM_ROOM_ID || '8563379136';
export const roomLink = (id: string = ROOM_ID): string => `https://colaberry.zoom.us/j/${id}`;

/** "Agent Skills (build 3 skills)" -> "Agent Skills"; "Claude Code Workflows + Automation" -> "Claude Code Workflows". */
export function shortTheme(theme: string): string {
  return theme.split(/\s+\+\s+|\s*\(/)[0].trim();
}

/** "Stop Doing It Nightly (Week 8 · Claude Code Workflows)", the format of the classes already in the batch. */
export function sessionTitle(topicTitle: string, week: number): string {
  const def = allWeeks().find((w) => w.week_number === week);
  if (!def) throw new RangeError(`week must be 1..12, got ${week}`);
  return `${topicTitle.trim()} (Week ${week} · ${shortTheme(def.theme)})`;
}

export type SessionOrigin = 'created' | 'adopted';
export interface ChosenSession { sessionId: string; title: string; origin: SessionOrigin; created: boolean; }
interface Linked { live_session_id: string | null; session_origin: SessionOrigin | null; air_date: string; }
interface Picked { title: string; week: number; }

const q = <T extends object>(sql: string, replacements: Record<string, unknown>, transaction: Transaction) =>
  sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT, transaction });

async function tagWeek(transaction: Transaction, sessionId: string, week: number, overwrite: boolean): Promise<void> {
  await sequelize.query(
    `INSERT INTO weekly_live_session_weeks (session_id, week, source) VALUES (:sessionId, :week, 'studio')
     ON CONFLICT (session_id) DO ${overwrite ? "UPDATE SET week = EXCLUDED.week, source = 'studio'" : 'NOTHING'}`,
    { replacements: { sessionId, week }, transaction },
  );
}

async function link(transaction: Transaction, planId: string, sessionId: string, origin: SessionOrigin): Promise<void> {
  await sequelize.query('UPDATE weekly_live_plans SET live_session_id = :sessionId, session_origin = :origin, updated_at = NOW() WHERE id = :planId',
    { replacements: { planId, sessionId, origin }, transaction });
}

/** The plan's own session when it still exists and is not cancelled. A Studio row is brought in line with the pick. */
async function reuse(transaction: Transaction, plan: Linked, pick: Picked): Promise<ChosenSession | null> {
  if (!plan.live_session_id) return null;
  const [row] = await q<{ id: string; title: string }>(
    "SELECT id, title FROM live_sessions WHERE id = :id AND status <> 'cancelled' FOR UPDATE", { id: plan.live_session_id }, transaction);
  if (!row) return null;
  if (plan.session_origin !== 'created') return { sessionId: row.id, title: row.title, origin: 'adopted', created: false };
  const title = sessionTitle(pick.title, pick.week);
  if (title !== row.title) await sequelize.query('UPDATE live_sessions SET title = :title WHERE id = :id', { replacements: { id: row.id, title }, transaction });
  await tagWeek(transaction, row.id, pick.week, true);
  return { sessionId: row.id, title, origin: 'created', created: false };
}

/** A class already on the air date in the batch, Open Houses excluded. */
async function findOnDate(transaction: Transaction, cohortId: string, airDate: string): Promise<{ id: string; title: string } | null> {
  const [row] = await q<{ id: string; title: string }>(
    `SELECT id, title FROM live_sessions
     WHERE cohort_id = :cohortId AND session_date = :airDate AND status <> 'cancelled'
       AND open_house_event_id IS NULL AND title NOT ILIKE 'Open House%'
     ORDER BY start_time, session_number LIMIT 1 FOR UPDATE`, { cohortId, airDate }, transaction);
  return row || null;
}

async function create(transaction: Transaction, cohortId: string, airDate: string, pick: Picked): Promise<ChosenSession> {
  const [{ next }] = await q<{ next: number }>('SELECT COALESCE(MAX(session_number), 0) + 1 AS next FROM live_sessions WHERE cohort_id = :cohortId', { cohortId }, transaction);
  const title = sessionTitle(pick.title, pick.week);
  const row = await LiveSession.create({
    cohort_id: cohortId, session_number: Number(next), title, session_date: airDate, start_time: CLASS_START, end_time: CLASS_END,
    session_type: 'core', status: 'scheduled', guest_access: true, meeting_provider: 'zoom', meeting_link: roomLink(), zoom_meeting_id: ROOM_ID,
  }, { transaction });
  await tagWeek(transaction, row.id, pick.week, true);
  return { sessionId: row.id, title, origin: 'created', created: true };
}

/**
 * Mark the topic chosen and make sure the plan has its session, atomically. `markChosen` is the plan
 * store's guarded UPDATE; when it refuses (the plan moved on), nothing is written and null comes back.
 */
export async function chooseWithSession(
  planId: string, topicId: string, cohortId: string,
  markChosen: (t: Transaction) => Promise<boolean>,
): Promise<ChosenSession | null> {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(:k)', { replacements: { k: CHOOSE_LOCK_KEY }, transaction });
    const [plan] = await q<Linked>("SELECT live_session_id, session_origin, to_char(air_date, 'YYYY-MM-DD') AS air_date FROM weekly_live_plans WHERE id = :planId FOR UPDATE", { planId }, transaction);
    const [pick] = await q<Picked>('SELECT title, week FROM weekly_live_topics WHERE id = :topicId AND plan_id = :planId', { topicId, planId }, transaction);
    if (!plan || !pick) return null;
    if (!(await markChosen(transaction))) return null;
    const kept = await reuse(transaction, plan, pick);
    if (kept) return kept;
    const found = await findOnDate(transaction, cohortId, plan.air_date);
    if (found) {
      await link(transaction, planId, found.id, 'adopted');
      await tagWeek(transaction, found.id, pick.week, false);
      return { sessionId: found.id, title: found.title, origin: 'adopted', created: false };
    }
    const made = await create(transaction, cohortId, plan.air_date, pick);
    await link(transaction, planId, made.sessionId, 'created');
    return made;
  });
}
