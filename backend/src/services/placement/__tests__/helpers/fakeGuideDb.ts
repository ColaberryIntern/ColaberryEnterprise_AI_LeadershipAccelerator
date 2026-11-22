/**
 * CP9.1 test helper: a stand-in for the statements roomGuide.ts sends, applying ONLY what each statement says (a
 * condition is applied only when the SQL text carries it, so a statement that loses one changes the outcome). The
 * interview row lock (SELECT ... FOR UPDATE inside a transaction) is held until that transaction ends; a note inserted
 * inside a transaction is invisible to other transactions until it commits (READ COMMITTED); the notes' UNIQUE
 * (interview_id, client_key) is enforced like Postgres would, raising on a clash unless ON CONFLICT says otherwise.
 */
export type GIv = { id: string; enrollment_id: string; state: string; company: string | null; position: string | null; starts_at: Date | null; minutes: number | null };
export type GNote = { id: number; interview_id: string; client_key: string; body: string; created_at: Date };
type Tx = { pending: GNote[]; releases: Array<() => void> };
type R = Record<string, unknown>;
type Out = [unknown[], number];

export const guideState = () => ({
  iv: [] as GIv[], prep: [] as Array<{ placement_interview_id: string; enrollment_id: string; questions: unknown }>, notes: [] as GNote[],
  sql: [] as string[], seq: 0, clock: new Date('2026-11-23T15:10:00Z').getTime(), locks: new Map<string, Promise<void>>(), prepFails: false,
});
type State = ReturnType<typeof guideState>;
const has = (sql: string, text: string) => sql.replace(/\s+/g, ' ').includes(text);

async function lock(f: State, id: string, t: Tx): Promise<void> {
  const prev = f.locks.get(id) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const mine = new Promise<void>((r) => { release = r; });
  f.locks.set(id, prev.then(() => mine));
  await prev;
  t.releases.push(release);
}

const visible = (f: State, t: Tx | undefined) => [...f.notes, ...(t?.pending ?? [])];

async function readIv(f: State, sql: string, r: R, t: Tx | undefined): Promise<Out> {
  const iv = f.iv.find((i) => i.id === r.id);
  if (has(sql, 'FOR UPDATE') && t && iv) await lock(f, iv.id, t);
  return [iv ? [{ ...iv }] : [], 0];
}

function readNotes(f: State, sql: string, r: R, t: Tx | undefined): Out {
  let rows = visible(f, t).filter((n) => n.interview_id === r.id);
  if (has(sql, 'AND client_key = :key')) rows = rows.filter((n) => n.client_key === r.key);
  if (has(sql, 'COUNT(*)')) return [[{ n: String(rows.length) }], 0];
  if (has(sql, 'ORDER BY created_at, id')) rows = [...rows].sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id - b.id);
  const limit = /LIMIT (\d+)/.exec(sql);
  if (limit) rows = rows.slice(0, Number(limit[1]));
  return [rows.map(({ id, body, created_at }) => ({ id, body, created_at })), 0];
}

function insertNote(f: State, sql: string, r: R, t: Tx | undefined): Out {
  const clash = visible(f, t).some((n) => n.interview_id === r.id && n.client_key === r.key);
  if (clash && !has(sql, 'ON CONFLICT (interview_id, client_key) DO NOTHING')) throw Object.assign(new Error('duplicate key value violates unique constraint "uq_interview_notes_key"'), { name: 'SequelizeUniqueConstraintError' });
  if (clash) return [[], 0];
  const row = { id: ++f.seq, interview_id: String(r.id), client_key: String(r.key), body: String(r.body), created_at: new Date(f.clock + f.seq) };
  if (t) t.pending.push(row); else f.notes.push(row);
  return [has(sql, 'RETURNING id, body, created_at') ? [{ id: row.id, body: row.body, created_at: row.created_at }] : [], 1];
}

export function makeGuideDb() {
  const fake = guideState();
  const query = async (sql: string, opts: { replacements?: R; transaction?: Tx } = {}): Promise<Out> => {
    fake.sql.push(sql);
    const r = opts.replacements ?? {};
    const t = opts.transaction;
    if (has(sql, 'FROM placement_interviews i WHERE i.id = :id')) return readIv(fake, sql, r, t);
    if (has(sql, 'FROM career_interviews WHERE placement_interview_id = :id')) {
      if (fake.prepFails) throw Object.assign(new Error('relation does not exist'), { name: 'SequelizeDatabaseError' });
      const rows = fake.prep.filter((p) => p.placement_interview_id === r.id && (!has(sql, 'AND enrollment_id = :e') || p.enrollment_id === r.e));
      return [rows.map((p) => ({ questions: p.questions })), 0];
    }
    if (has(sql, 'FROM interview_notes WHERE interview_id = :id')) return readNotes(fake, sql, r, t);
    if (has(sql, 'INSERT INTO interview_notes')) return insertNote(fake, sql, r, t);
    throw new Error(`fakeGuideDb: unexpected statement ${sql.slice(0, 80)}`);
  };
  const transaction = async <T>(fn: (t: Tx) => Promise<T>): Promise<T> => {
    const t: Tx = { pending: [], releases: [] };
    try {
      const out = await fn(t);
      fake.notes.push(...t.pending);
      return out;
    } finally { t.releases.forEach((rel) => rel()); }
  };
  return { fake, query, transaction };
}

export const START = new Date('2026-11-23T15:00:00Z');
export const END_MS = START.getTime() + 30 * 60_000;
export const guideIv = (over: Partial<GIv> = {}): GIv => ({ id: '11111111-1111-4111-8111-111111111111', enrollment_id: 'enr-ann', state: 'booked',
  company: 'Acme', position: 'Data Analyst', starts_at: START, minutes: 30, ...over });
