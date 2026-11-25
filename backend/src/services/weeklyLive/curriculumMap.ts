import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { allWeeks } from '../../data/canonicalCourse';

/**
 * The curriculum map (Basecamp WL2.4): the 12 weeks of the course, which ones the Weekly Live has
 * taught, when, and how long ago. The topic generator (WL3.3) reads coveredInLast4 to skip weeks the
 * last four sessions already covered; the Studio page shows the rest.
 *
 * Coverage comes from weekly_live_session_weeks (one week tag per live session) joined to the
 * session's date. Dates are calendar days in Central time (the class is Mondays 6:30 PM Central), so
 * "days ago" never shifts by one around midnight UTC.
 */
export const CLASS_TZ = 'America/Chicago';

export interface CoverageRow { week: number; date: string; sessionId: string; title: string; }
export interface MapWeek {
  week: number;
  theme: string;
  intensive: string;
  timesCovered: number;
  lastCovered: string | null;
  lastTitle: string | null;
  daysAgo: number | null;
  coveredInLast4: boolean;
}
export interface CurriculumMap { asOf: string; recentWeeks: number[]; weeks: MapWeek[]; }

/** Today's calendar date in Central, YYYY-MM-DD. */
export function centralDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLASS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

const DAY_MS = 86_400_000;
const dayNumber = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};
export const daysBetween = (from: string, to: string): number => dayNumber(to) - dayNumber(from);

/** Pure: build the map from coverage rows as of a date. Rows after asOf are ignored. */
export function buildCurriculumMap(rows: CoverageRow[], asOf: string): CurriculumMap {
  const past = rows.filter((r) => r.date <= asOf).sort((a, b) => b.date.localeCompare(a.date) || a.sessionId.localeCompare(b.sessionId));
  const recentWeeks = past.slice(0, 4).map((r) => r.week);
  const weeks = allWeeks().map((w): MapWeek => {
    const mine = past.filter((r) => r.week === w.week_number);
    const last = mine[0] || null;
    return {
      week: w.week_number,
      theme: w.theme,
      intensive: w.intensive.title,
      timesCovered: mine.length,
      lastCovered: last ? last.date : null,
      lastTitle: last ? last.title : null,
      daysAgo: last ? daysBetween(last.date, asOf) : null,
      coveredInLast4: recentWeeks.includes(w.week_number),
    };
  });
  return { asOf, recentWeeks, weeks };
}

export async function loadCoverage(): Promise<CoverageRow[]> {
  const rows = await sequelize.query<{ week: number; date: string; session_id: string; title: string }>(
    `SELECT w.week, to_char(s.session_date, 'YYYY-MM-DD') AS date, s.id AS session_id, s.title
       FROM weekly_live_session_weeks w JOIN live_sessions s ON s.id = w.session_id`,
    { type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({ week: Number(r.week), date: r.date, sessionId: r.session_id, title: r.title }));
}

export async function curriculumMap(asOf: string = centralDate()): Promise<CurriculumMap> {
  return buildCurriculumMap(await loadCoverage(), asOf);
}

/** Tag a session with the week it taught. Re-tagging the same session changes the week, never adds a row. */
export async function tagSessionWeek(sessionId: string, week: number, source = 'studio'): Promise<void> {
  if (!Number.isInteger(week) || week < 1 || week > 12) throw new RangeError(`week must be 1..12, got ${week}`);
  await sequelize.query(
    `INSERT INTO weekly_live_session_weeks (session_id, week, source) VALUES (:sessionId, :week, :source)
     ON CONFLICT (session_id) DO UPDATE SET week = EXCLUDED.week, source = EXCLUDED.source`,
    { replacements: { sessionId, week, source } },
  );
}

export interface HistorySession { date?: string; week?: number; title?: string; }
export interface ImportResult { batch: string; tagged: number; alreadyTagged: number; unmatched: string[]; }

/**
 * One-time import of docs/live-sessions/history.json (the plan-live-session skill's log). Each entry
 * is matched to the live session on the same date whose title starts with the entry's title. Rows
 * are inserted ON CONFLICT DO NOTHING, so a rerun tags nothing twice and never overwrites a Studio
 * tag. Every row carries the batch id, so the import can be undone with
 *   DELETE FROM weekly_live_session_weeks WHERE import_batch = '<batch>'.
 */
export async function importHistory(sessions: HistorySession[], batch: string): Promise<ImportResult> {
  const result: ImportResult = { batch, tagged: 0, alreadyTagged: 0, unmatched: [] };
  for (const h of sessions) {
    const label = `${h.date || '?'} ${h.title || '?'}`;
    if (!h.date || !h.title || !Number.isInteger(h.week) || (h.week as number) < 1 || (h.week as number) > 12) { result.unmatched.push(`${label} (missing date, title or week)`); continue; }
    const match = await sequelize.query<{ id: string }>(
      `SELECT id FROM live_sessions WHERE session_date = :date AND title ILIKE :title ORDER BY start_time LIMIT 1`,
      { replacements: { date: h.date, title: `${h.title.replace(/[%_\\]/g, (c) => `\\${c}`)}%` }, type: QueryTypes.SELECT },
    );
    if (!match.length) { result.unmatched.push(`${label} (no live session on that date with that title)`); continue; }
    const inserted = await sequelize.query<{ session_id: string }>(
      `INSERT INTO weekly_live_session_weeks (session_id, week, source, import_batch) VALUES (:id, :week, 'history', :batch)
       ON CONFLICT (session_id) DO NOTHING RETURNING session_id`,
      { replacements: { id: match[0].id, week: h.week, batch }, type: QueryTypes.SELECT },
    );
    if (inserted.length) result.tagged += 1; else result.alreadyTagged += 1;
  }
  return result;
}
