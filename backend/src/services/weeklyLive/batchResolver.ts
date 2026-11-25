import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { CLASS_TZ } from './curriculumMap';

/**
 * Air date -> the cohort batch of that month (Basecamp WL2.4, Ali 2026-11-24: "Nov 30 -> Cohort -
 * November 2026"). Choosing a topic plans the session inside that batch, so the resolver must be
 * exact: it looks the cohort up by its name and NEVER creates one. A month with no cohort is a 409
 * that names the cohort somebody has to create first.
 *
 * The month is the air date's calendar month in Central time. A date string (YYYY-MM-DD) is taken as
 * the calendar day it says; a timestamp is converted to Central first, so a 9 PM Central class on
 * Nov 30 (03:00 UTC on Dec 1) still lands in November.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type BatchResult =
  | { ok: true; cohortId: string; cohortName: string }
  | { ok: false; status: 409; error: string; cohortName: string }
  | { ok: false; status: 400; error: string };

/** Pure: the cohort name for an air date, or null when the date is not a real date. */
export function batchNameFor(airDate: string | Date): string | null {
  let y: number; let m: number;
  if (typeof airDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(airDate)) {
    [y, m] = airDate.split('-').map(Number);
    const d = Number(airDate.slice(8));
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  } else {
    const at = airDate instanceof Date ? airDate : new Date(airDate);
    if (Number.isNaN(at.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLASS_TZ, year: 'numeric', month: '2-digit' }).formatToParts(at);
    y = Number(parts.find((p) => p.type === 'year')?.value);
    m = Number(parts.find((p) => p.type === 'month')?.value);
  }
  return `Cohort - ${MONTHS[m - 1]} ${y}`;
}

export async function resolveBatch(airDate: string | Date): Promise<BatchResult> {
  const cohortName = batchNameFor(airDate);
  if (!cohortName) return { ok: false, status: 400, error: `Not a valid air date: ${String(airDate)}` };
  const rows = await sequelize.query<{ id: string; name: string }>(
    'SELECT id, name FROM cohorts WHERE name = :name ORDER BY created_at NULLS LAST, id LIMIT 1',
    { replacements: { name: cohortName }, type: QueryTypes.SELECT },
  );
  if (!rows.length) {
    return { ok: false, status: 409, cohortName, error: `No cohort named "${cohortName}". Create it in the Accelerator first; Studio never creates a cohort.` };
  }
  return { ok: true, cohortId: rows[0].id, cohortName: rows[0].name };
}
