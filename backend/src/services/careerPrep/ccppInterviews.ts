import { sequelize } from '../../config/database';
import { getSetting } from '../settingsService';
import { fetchCcppInterviews, type CcppInterview, type CcppWho } from './ccppSource';
import { questionsFromJd } from './jdQuestions';
import type { InterviewType } from './readiness';

/**
 * Career Prep: the interviews a student has logged in CCPP become their own prep rows (career_interviews, source 'real'),
 * with practice questions from the logged job description (Ali, 2026-11-25). CCPP logs them about a day ahead, so this
 * runs when the student opens Career Prep (linkCcppOnOpen), at most once per 10 minutes per student.
 *
 *   who        the enrollment's email = the CCPP login's email; `career_prep_ccpp_users` (a JSON object of enrollment id to
 *              CCPP user id) wins, for a student whose two emails differ.
 *   idempotent ccpp_interview_id is UNIQUE: a re-run updates a moved or edited interview in place and only for the same
 *              student; new ones are added only while still ahead.
 *   cancelled  removed, unless the student already has a plan for it (deleting would delete their plan): then kept.
 *   questions  written once per interview, after it is saved; a model failure leaves the interview without questions.
 *   failure    the read goes on with what is already linked; logged; tried again after 2 minutes. CCPP is never written.
 *
 * KILL SWITCH: `career_prep_ccpp_off` = true. A read error on it counts as off.
 */
export const CCPP_OFF_KEY = 'career_prep_ccpp_off';
export const CCPP_USERS_KEY = 'career_prep_ccpp_users';
const EVERY_MS = 10 * 60_000;
const AFTER_FAILURE_MS = 2 * 60_000;
const OPEN_WAIT_MS = 4000;
const RECRUITER = 1;

export interface CcppDeps { fetch?: (who: CcppWho) => Promise<CcppInterview[]>; read?: (k: string) => Promise<unknown>; questions?: typeof questionsFromJd }
export interface CcppResult { added: number; updated: number; removed: number }
const NONE: CcppResult = { added: 0, updated: 0, removed: 0 };

function log(level: 'info' | 'warn', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event, outcome: errorClass ? 'failure' : 'success', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'warn') console.warn(line); else console.log(line);
}

export const ccppType = (typeId: number | null): InterviewType => (typeId === RECRUITER ? 'recruiter' : 'technical');

/** The CCPP user id mapped to this enrollment, or null. A malformed map is ignored, never guessed at. */
export function mappedUser(raw: unknown, enrollmentId: string): number | null {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>)[enrollmentId] : undefined;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;
}

async function whoIs(enrollmentId: string, read: (k: string) => Promise<unknown>): Promise<CcppWho | null> {
  const userId = mappedUser(await read(CCPP_USERS_KEY), enrollmentId);
  if (userId) return { userId };
  const [rows] = await sequelize.query('SELECT email FROM enrollments WHERE id = :e', { replacements: { e: enrollmentId } });
  const email = (rows as Array<{ email: string | null }>)[0]?.email?.trim();
  return email ? { email } : null;
}

type Saved = { id: string; inserted: boolean };

/** Insert while still ahead, or update the linked row. Null = nothing to do (past and never linked, or another student's). */
async function save(enrollmentId: string, i: CcppInterview): Promise<Saved | null> {
  const r = { e: enrollmentId, c: i.id, company: i.company?.trim() || 'An employer', role: i.role?.trim() || 'Interview', type: ccppType(i.typeId), start: i.startsLocal, jd: i.jd?.trim().slice(0, 20_000) || null };
  const [rows] = await sequelize.query(
    `WITH x AS (SELECT CAST(:start AS TIMESTAMP) AT TIME ZONE 'America/Chicago' AS at)
     INSERT INTO career_interviews (enrollment_id, source, company, role, type, starts_at, jd_text, ccpp_interview_id)
     SELECT :e, 'real', LEFT(:company, 120), LEFT(:role, 120), :type, x.at, :jd, :c FROM x
      WHERE x.at > NOW() OR EXISTS (SELECT 1 FROM career_interviews WHERE ccpp_interview_id = :c)
     ON CONFLICT (ccpp_interview_id) WHERE ccpp_interview_id IS NOT NULL
     DO UPDATE SET company = EXCLUDED.company, role = EXCLUDED.role, type = EXCLUDED.type, starts_at = EXCLUDED.starts_at, jd_text = EXCLUDED.jd_text
       WHERE career_interviews.enrollment_id = EXCLUDED.enrollment_id
     RETURNING id, (xmax = 0) AS inserted`, { replacements: r });
  const row = (rows as Array<{ id: string; inserted: boolean }>)[0];
  return row ? { id: String(row.id), inserted: row.inserted } : null;
}

async function drop(enrollmentId: string, ccppId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `DELETE FROM career_interviews c WHERE c.ccpp_interview_id = :c AND c.enrollment_id = :e
        AND NOT EXISTS (SELECT 1 FROM prep_plans p WHERE p.interview_id = c.id) RETURNING c.id`, { replacements: { c: ccppId, e: enrollmentId } });
  return (rows as unknown[]).length;
}

async function writeQuestions(id: string, i: CcppInterview, ask: typeof questionsFromJd): Promise<void> {
  if (!i.jd || i.jd.trim().length < 50) return;
  try {
    const q = await ask(i.jd.trim().slice(0, 20_000), i.role?.trim() || 'Interview', ccppType(i.typeId));
    if (q) await sequelize.query('UPDATE career_interviews SET questions = CAST(:q AS JSONB) WHERE id = :id AND questions IS NULL', { replacements: { q: JSON.stringify(q), id } });
  } catch (err) { log('warn', 'career_prep_ccpp_questions_failed', { id }, (err as Error)?.name || 'UpstreamUnavailable'); }
}

/** Link one student's CCPP interviews now. Throws when CCPP or the database fails. */
export async function linkCcppInterviews(enrollmentId: string, deps: CcppDeps = {}): Promise<CcppResult> {
  const read = deps.read ?? getSetting;
  const off = await read(CCPP_OFF_KEY);
  if (off === true || off === 'true') return NONE;
  const who = await whoIs(enrollmentId, read);
  if (!who) return NONE;
  const started = Date.now();
  const found = await (deps.fetch ?? fetchCcppInterviews)(who);
  const out = { ...NONE };
  const fresh: Array<[string, CcppInterview]> = [];
  for (const i of found) {
    if (i.cancelled) { out.removed += await drop(enrollmentId, i.id); continue; }
    const s = await save(enrollmentId, i);
    if (s?.inserted) { out.added += 1; fresh.push([s.id, i]); } else if (s) out.updated += 1;
  }
  log('info', 'career_prep_ccpp_linked', { found: found.length, ...out, duration_ms: Date.now() - started });
  // After the rows are saved, so a slow model never holds an interview back.
  for (const [id, i] of fresh) void writeQuestions(id, i, deps.questions ?? questionsFromJd);
  return out;
}

const nextAt = new Map<string, number>();

/** Called on every Career Prep read: at most once per 10 minutes per student, waits 4 s at most, never throws. */
export async function linkCcppOnOpen(enrollmentId: string, deps: CcppDeps = {}, now = Date.now()): Promise<void> {
  if ((nextAt.get(enrollmentId) ?? 0) > now) return;
  nextAt.set(enrollmentId, now + EVERY_MS);
  const work = linkCcppInterviews(enrollmentId, deps).then(() => undefined, (err) => {
    nextAt.set(enrollmentId, now + AFTER_FAILURE_MS);
    log('warn', 'career_prep_ccpp_link_failed', { message: String((err as Error)?.message ?? err).slice(0, 200) }, (err as Error)?.name || 'UpstreamUnavailable');
  });
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([work, new Promise<void>((r) => { timer = setTimeout(r, OPEN_WAIT_MS); })]);
  clearTimeout(timer);
}

/** Tests only. */
export function resetCcppThrottle(): void { nextAt.clear(); }
