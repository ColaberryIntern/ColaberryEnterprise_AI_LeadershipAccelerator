import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * Career Prep v27, CP9.1 (kit F5 "the employer's side panel"): the interview guide (this role's questions) and the
 * employer's private notes, for the employer room page (hire.refactored.ai/room). Read and written ONLY through the
 * employer's signed room link (routes/placementRoomGuideRoutes.ts); no candidate route returns a note. Nothing here
 * reads or returns the meeting provider's link.
 *
 *   gate       the interview exists (else not_found), the link was signed for its CURRENT end time (else moved: a
 *              link from before a reschedule cannot read or write the new booking), and it is booked or held (done);
 *              anything else is not_booked. The link itself expires at the end + 2 hours (checked by the route first).
 *   questions  the role's questions = the practice questions on the learner's prep row for this interview
 *              (career_interviews.questions, made from the job description in CP3.3). [] = none on file (the page
 *              says so); null = they could not be read (logged; the notes still work).
 *   notes      one row per Save, keyed by the page's client_key (UNIQUE per interview): a double click or a retried
 *              request stores ONE note and answers the stored one (replay). At most MAX_NOTES per interview. The
 *              interview row is locked FIRST (the placement lock order), so two saves at the cap cannot both pass.
 */
export const MAX_NOTES = 50;
export const MAX_NOTE_CHARS = 2000;
export const MAX_QUESTIONS = 8;

export interface GuideNote { id: string; body: string; at: string }
export interface Guide { company: string | null; role: string | null; questions: string[] | null; notes: GuideNote[] }
export type GuideFail = { status: 'not_found' | 'moved' | 'not_booked' };
export type GuideResult = { status: 'ok'; guide: Guide } | GuideFail;
export type NoteResult = { status: 'ok'; note: GuideNote; replay: boolean; guide: Guide } | { status: 'full' } | GuideFail;

interface Row { id: string; enrollment_id: string; state: string; company: string | null; position: string | null; starts_at: Date | string | null; minutes: number | null }
interface NoteRow { id: string | number; body: string; created_at: Date | string }

const q = async <T>(sql: string, replacements: Record<string, unknown>, transaction?: Transaction): Promise<T[]> =>
  (await sequelize.query(sql, { replacements, ...(transaction ? { transaction } : {}) }))[0] as T[];

const COLS = 'i.id, i.enrollment_id, i.state, i.company, i.position, i.starts_at, i.minutes';
const loadRow = async (id: string, t?: Transaction) =>
  (await q<Row>(`SELECT ${COLS} FROM placement_interviews i WHERE i.id = :id${t ? ' FOR UPDATE' : ''}`, { id }, t))[0];

/** null = this link may read and write the guide; otherwise why not. */
export function guideGate(r: Row | undefined, endMs: number): GuideFail | null {
  if (!r) return { status: 'not_found' };
  const start = r.starts_at ? new Date(r.starts_at).getTime() : NaN;
  if (Number.isNaN(start) || start + Number(r.minutes ?? 30) * 60_000 !== endMs) return { status: 'moved' };
  if (r.state !== 'booked' && r.state !== 'done') return { status: 'not_booked' };
  return null;
}

/** Strings only, trimmed, non-empty, at most MAX_QUESTIONS; anything else in the column is ignored. */
export function cleanQuestions(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x.length > 0).slice(0, MAX_QUESTIONS);
}

async function questionsFor(r: Row): Promise<string[] | null> {
  try {
    const rows = await q<{ questions: unknown }>('SELECT questions FROM career_interviews WHERE placement_interview_id = :id AND enrollment_id = :e LIMIT 1',
      { id: r.id, e: r.enrollment_id });
    return cleanQuestions(rows[0]?.questions);
  } catch (err) {
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'placement_room_guide_questions_failed',
      outcome: 'failure', error_class: (err as Error)?.name && (err as Error).name !== 'Error' ? (err as Error).name : 'UpstreamUnavailable', context: { interview_id: r.id } }));
    return null;
  }
}

const noteOf = (n: NoteRow): GuideNote => ({ id: String(n.id), body: n.body, at: new Date(n.created_at).toISOString() });
const notesFor = async (id: string) =>
  (await q<NoteRow>(`SELECT id, body, created_at FROM interview_notes WHERE interview_id = :id ORDER BY created_at, id LIMIT ${MAX_NOTES}`, { id })).map(noteOf);

const guideOf = async (r: Row): Promise<Guide> => ({ company: r.company, role: r.position, questions: await questionsFor(r), notes: await notesFor(r.id) });

/** The guide and the notes for the employer whose link carries `endMs`. */
export async function employerGuide(id: string, endMs: number): Promise<GuideResult> {
  const r = await loadRow(id);
  const g = guideGate(r, endMs);
  return g ?? { status: 'ok', guide: await guideOf(r as Row) };
}

type Saved = { status: 'ok'; note: GuideNote; replay: boolean; row: Row } | { status: 'full' } | GuideFail;

/** Under the interview row lock: the gate, a replay of the same key, the cap, then one insert. */
async function saveLocked(id: string, endMs: number, key: string, body: string): Promise<Saved> {
  return sequelize.transaction(async (t) => {
    const r = await loadRow(id, t);
    const g = guideGate(r, endMs);
    if (g) return g;
    const same = await q<NoteRow>('SELECT id, body, created_at FROM interview_notes WHERE interview_id = :id AND client_key = :key', { id, key }, t);
    if (same[0]) return { status: 'ok' as const, note: noteOf(same[0]), replay: true, row: r as Row };
    const [{ n }] = await q<{ n: string | number }>('SELECT COUNT(*) AS n FROM interview_notes WHERE interview_id = :id', { id }, t);
    if (Number(n) >= MAX_NOTES) return { status: 'full' as const };
    const made = await q<NoteRow>(`INSERT INTO interview_notes (interview_id, client_key, body) VALUES (:id, :key, :body)
      ON CONFLICT (interview_id, client_key) DO NOTHING RETURNING id, body, created_at`, { id, key, body }, t);
    if (!made[0]) throw Object.assign(new Error('note key clashed under the row lock'), { name: 'ContractViolation' });
    return { status: 'ok' as const, note: noteOf(made[0]), replay: false, row: r as Row };
  });
}

/** Save one note (the page's key makes a repeat of the same Save a replay), then answer the whole guide. */
export async function addNote(id: string, endMs: number, key: string, body: string): Promise<NoteResult> {
  const s = await saveLocked(id, endMs, key, body);
  if (s.status !== 'ok') return s;
  return { status: 'ok', note: s.note, replay: s.replay, guide: await guideOf(s.row) };
}
