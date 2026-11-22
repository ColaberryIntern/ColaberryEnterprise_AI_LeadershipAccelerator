/**
 * CP9.1 test helper: a stand-in for the statements roomService.ts (and zoomScopePreflight.ts) send, applying ONLY what
 * each statement says. A condition the fake implements is applied only when the SQL text carries it, so a statement
 * that loses a condition changes the outcome and the suite goes red. Postgres's behaviors the room rules depend on
 * are modeled: a row lock (SELECT ... FOR UPDATE inside a transaction) is held until that transaction ends, and a
 * consent inserted inside a transaction is invisible to every other transaction until it commits (READ COMMITTED).
 * The database clock is `fake.dbNow` (NOW()).
 */
export type Iv = { id: string; enrollment_id: string; state: string; company: string | null; position: string | null; starts_at: Date | null;
  minutes: number | null; room_provider_id: string | null; room_url: string | null; recording_consent: string | null; recording_meeting_id: string | null;
  recording_changed_at: Date | null; readback_meeting_id: string | null; readback_recording: string | null; readback_at: Date | null };
export type Consent = { id: number; interview_id: string; party: string; party_ref: string; decision: string };
type Tx = { pending: Consent[]; releases: Array<() => void> };
type Fake = ReturnType<typeof newState>;
type R = Record<string, unknown>;
type Out = [unknown[], number];

const newState = () => ({
  iv: [] as Iv[], consents: [] as Consent[], events: [] as Array<{ src: string; event: string; payload: R }>,
  items: [] as Array<{ kind: string; src: string; interview_id: string; summary: R }>,
  sql: [] as string[], dbNow: new Date('2026-11-23T14:55:00Z'), seq: 0, locks: new Map<string, Promise<void>>(),
});
const has = (sql: string, text: string) => sql.replace(/\s+/g, ' ').includes(text);
const cols = (sql: string, i: Iv) => Object.fromEntries(Object.keys(i).filter((k) => new RegExp(`\\bi\\.${k}\\b`).test(sql)).map((k) => [k, (i as R)[k]]));

async function lock(f: Fake, id: string, t: Tx): Promise<void> {
  const prev = f.locks.get(id) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const mine = new Promise<void>((r) => { release = r; });
  f.locks.set(id, prev.then(() => mine));
  await prev;
  t.releases.push(release);
}

/** Reads: the room row, the locking select, the consents (committed plus the caller's own uncommitted ones). */
async function reads(f: Fake, sql: string, r: R, t: Tx | undefined, iv: Iv | undefined): Promise<Out | null> {
  if (has(sql, 'FROM placement_interviews i WHERE i.id = :id')) {
    const mine = !has(sql, 'AND i.enrollment_id = :e') || iv?.enrollment_id === r.e;
    return [iv && mine ? [cols(sql, iv)] : [], 0];
  }
  if (has(sql, 'SELECT id FROM placement_interviews WHERE id = :id')) {
    if (has(sql, 'FOR UPDATE') && t && iv) await lock(f, iv.id, t);
    return [iv && (!has(sql, "state = 'booked'") || iv.state === 'booked') ? [{ id: iv.id }] : [], 0];
  }
  if (has(sql, 'FROM interview_consents WHERE interview_id = :id')) {
    const seen = [...f.consents, ...(t?.pending ?? [])].filter((c) => c.interview_id === r.id).sort((a, b) => a.id - b.id);
    return [seen.map(({ party, party_ref, decision }) => ({ party, party_ref, decision })), 0];
  }
  return null;
}

/** Inserts keyed by a unique rule: consents (interview, party_ref), review items (kind, source), events (source). */
function inserts(f: Fake, sql: string, r: R, t: Tx | undefined): Out | null {
  if (has(sql, 'INSERT INTO interview_consents')) {
    const clash = has(sql, 'ON CONFLICT (interview_id, party_ref) DO NOTHING')
      && [...f.consents, ...(t?.pending ?? [])].some((c) => c.interview_id === r.id && c.party_ref === r.ref);
    if (clash) return [[], 0];
    const row = { id: ++f.seq, interview_id: String(r.id), party: String(r.party), party_ref: String(r.ref), decision: String(r.decision) };
    if (t) t.pending.push(row); else f.consents.push(row);
    return [[], 1];
  }
  if (has(sql, 'INSERT INTO placement_review_items')) {
    if (!f.items.some((x) => x.src === r.src)) f.items.push({ kind: /'recording_mismatch'/.test(sql) ? 'recording_mismatch' : '?', src: String(r.src), interview_id: String(r.id), summary: JSON.parse(String(r.sum)) });
    return [[], 1];
  }
  if (has(sql, 'INSERT INTO placement_events')) {
    if (f.events.some((e) => e.src === r.src)) return [[], 0];
    f.events.push({ src: String(r.src), event: /'zoom_scope_missing'/.test(sql) ? 'zoom_scope_missing' : '?', payload: JSON.parse(String(r.payload)) });
    return [has(sql, 'RETURNING id') ? [{ id: f.events.length }] : [], 1];
  }
  return null;
}

function claim(f: Fake, sql: string, iv: Iv): Out {
  if (!has(sql, 'recording_meeting_id IS DISTINCT FROM room_provider_id OR recording_consent IS NULL')) throw new Error('fakeRoomDb: claim lost its condition');
  const lease = Number(/INTERVAL '(\d+) seconds'/.exec(sql)?.[1] ?? NaN);
  const lapsed = iv.recording_consent === 'pending' && !!iv.recording_changed_at && iv.recording_changed_at.getTime() < f.dbNow.getTime() - lease * 1000;
  const ok = (!has(sql, "state = 'booked'") || iv.state === 'booked') && (!has(sql, 'room_provider_id IS NOT NULL') || iv.room_provider_id !== null)
    && (!has(sql, "recording_consent IS DISTINCT FROM 'declined'") || iv.recording_consent !== 'declined')
    && (iv.recording_meeting_id !== iv.room_provider_id || iv.recording_consent === null || lapsed);
  if (!ok) return [[], 0];
  Object.assign(iv, { recording_consent: 'pending', recording_meeting_id: iv.room_provider_id, recording_changed_at: f.dbNow });
  return [[{ room_provider_id: iv.room_provider_id }], 1];
}

/** The UPDATEs of placement_interviews: decline, claim, finish (with or without the read-back), the join's read-back. */
function updates(f: Fake, sql: string, r: R, iv: Iv): Out | null {
  if (has(sql, "SET recording_consent = 'declined'")) {
    if (!has(sql, "recording_consent IS DISTINCT FROM 'declined'") || iv.recording_consent !== 'declined') Object.assign(iv, { recording_consent: 'declined', recording_changed_at: f.dbNow });
    return [[], 1];
  }
  if (has(sql, "SET recording_consent = 'pending'")) return claim(f, sql, iv);
  if (has(sql, 'SET recording_consent = :state')) {
    const ok = (!has(sql, 'recording_meeting_id = :m') || iv.recording_meeting_id === r.m) && (!has(sql, "recording_consent = 'pending'") || iv.recording_consent === 'pending');
    if (ok) Object.assign(iv, { recording_consent: r.state, recording_changed_at: f.dbNow },
      has(sql, 'readback_recording = :seen') ? { readback_meeting_id: r.m, readback_recording: r.seen ?? null, readback_at: f.dbNow } : {});
    return [[], ok ? 1 : 0];
  }
  if (has(sql, 'SET readback_meeting_id = :m, readback_recording = :seen')) {
    const ok = (!has(sql, 'room_provider_id = :m') || iv.room_provider_id === r.m) && (!has(sql, 'readback_recording IS NULL') || iv.readback_recording === null)
      && (!has(sql, "recording_consent IS DISTINCT FROM 'pending'") || iv.recording_consent !== 'pending');
    if (ok) Object.assign(iv, { readback_meeting_id: r.m, readback_recording: r.seen, readback_at: f.dbNow });
    return [[], ok ? 1 : 0];
  }
  return null;
}

export function makeRoomDb() {
  const fake = newState();
  async function query(sql: string, o: { replacements?: R; transaction?: Tx } = {}): Promise<Out> {
    fake.sql.push(sql);
    const r = o.replacements ?? {};
    const iv = fake.iv.find((x) => x.id === r.id);
    const out = (await reads(fake, sql, r, o.transaction, iv)) ?? inserts(fake, sql, r, o.transaction)
      ?? (has(sql, 'UPDATE placement_interviews') ? (iv ? updates(fake, sql, r, iv) : [[], 0] as Out) : null);
    if (!out) throw new Error(`fakeRoomDb: unexpected SQL ${sql.slice(0, 90)}`);
    return out;
  }
  async function transaction<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
    const t: Tx = { pending: [], releases: [] };
    try {
      const out = await fn(t);
      fake.consents.push(...t.pending); // commit: now visible to everyone
      return out;
    } finally {
      t.releases.forEach((rel) => rel());
    }
  }
  return { fake, query, transaction };
}

export const ivRow = (over: Partial<Iv> = {}): Iv => ({ id: '11111111-1111-4111-8111-111111111111', enrollment_id: 'enr-ann', state: 'booked', company: 'Acme',
  position: 'Data Analyst', starts_at: new Date('2026-11-23T15:00:00Z'), minutes: 30, room_provider_id: 'zm-1', room_url: 'https://zoom.example/j/SECRET',
  recording_consent: null, recording_meeting_id: null, recording_changed_at: null, readback_meeting_id: 'zm-1', readback_recording: 'off', readback_at: null, ...over });
