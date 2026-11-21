// The database stand-in: the backfill cursor row, and the newest event in inbox_events (which PUSHES also write).
type Replacements = { to?: string | Date };
const db: { next: Date | null; newestEvent: string | null } = { next: null, newestEvent: null };
const mockQuery = jest.fn(async (sql: string, o?: { replacements?: Replacements }) => {
  if (sql.includes('FROM inbox_backfill_state')) return [db.next ? [{ next_since: db.next }] : [], 0];
  if (sql.includes('INSERT INTO inbox_backfill_state')) {
    const to = new Date(o?.replacements?.to as string | Date);
    if (!db.next || to > db.next) db.next = to; // GREATEST: never backwards
    return [[], 1];
  }
  if (sql.includes('FROM inbox_events')) return [[{ at: db.newestEvent }], 1];
  throw new Error(`unexpected SQL: ${sql.slice(0, 60)}`);
});
jest.mock('../../../config/database', () => ({ sequelize: { query: (s: string, o?: { replacements?: Replacements }) => mockQuery(s, o) } }));
const mockAccept = jest.fn();
jest.mock('../inboxEvents', () => ({ acceptInboxEvent: (...a: unknown[]) => mockAccept(...a), DISPATCH_ERROR: 'InboxDispatchError' }));
const mockSchedule = jest.fn();
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: (...a: unknown[]) => mockSchedule(...a) } }));

import { CURSOR_OVERLAP_MS, planNextSince, RETRY_WAITS_MS, runInboxBackfill, startInboxBackfill } from '../inboxBackfill';
import { verifyInboxSignature } from '../inboxSignature';
import { InboxEventSchema } from '../inboxEventSchema';

/**
 * CP6.2 (kit F3 "Backfill"): missed events come back through the same idempotent path. fetch is a spy (nothing leaves
 * the process); the sleeps between attempts are recorded, not waited. NOW is OUR clock; the upstream's clock is in
 * the events' received_at and its Date header, deliberately different here (skew) so a test fails if ours is used.
 */
const SECRET = ['backfill', 'secret'].join('-');
const BASE = 'https://inbox-manager.example';
const NOW = new Date('2026-11-21T18:00:00Z');
const SINCE = new Date('2026-11-21T12:00:00Z');
const ev = (id: string, at: string, over: Record<string, unknown> = {}) => ({ event_id: id, message_id: `<${id}@x>`, type: 'email.classified', to_address: 'ann@gmail.com', received_at: at, ...over });
const reply = (status: number, body: unknown, date: string | null = null) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: (k: string) => (k.toLowerCase() === 'date' ? date : null) } }) as unknown as Response;
let sleeps: number[] = [];
const deps = (fetchImpl: jest.Mock) => ({ fetch: fetchImpl as unknown as typeof fetch, sleep: async (ms: number) => { sleeps.push(ms); }, now: () => NOW });
const ok = (events: unknown[], date: string | null = null) => jest.fn().mockResolvedValue(reply(200, { events }, date));
const sinceOf = (f: jest.Mock) => decodeURIComponent(String(f.mock.calls[0][0]).split('since=')[1]);
const minus = (iso: string, ms: number) => new Date(Date.parse(iso) - ms);

beforeEach(() => {
  process.env.INBOX_MANAGER_API_BASE = `${BASE}/`;
  process.env.INBOX_INTEGRATION_SECRET = SECRET;
  sleeps = [];
  db.next = SINCE; db.newestEvent = null;
  mockQuery.mockClear();
  mockAccept.mockReset().mockResolvedValue({ duplicate: false });
  mockSchedule.mockReset();
  for (const k of ['log', 'warn', 'error'] as const) jest.spyOn(console, k).mockImplementation(() => undefined);
});
afterEach(() => { delete process.env.INBOX_MANAGER_API_BASE; delete process.env.INBOX_INTEGRATION_SECRET; jest.restoreAllMocks(); });

describe('runInboxBackfill: request and storing', () => {
  it('not configured (either env unset, as shipped): no fetch, no database, and the schedule is never registered', async () => {
    for (const k of ['INBOX_MANAGER_API_BASE', 'INBOX_INTEGRATION_SECRET']) {
      const keep = process.env[k]; delete process.env[k];
      const f = jest.fn();
      expect(await runInboxBackfill(deps(f))).toEqual({ status: 'not_configured' });
      expect(startInboxBackfill()).toBe(false);
      expect(f).not.toHaveBeenCalled();
      process.env[k] = keep;
    }
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
  });
  it('asks since the stored next_since, signed, with a 20 s timeout; events go oldest first through acceptInboxEvent', async () => {
    const f = ok([ev('b', '2026-11-21T13:00:00Z'), ev('a', '2026-11-21T12:30:00Z')]);
    expect(await runInboxBackfill(deps(f))).toEqual({ status: 'done', fetched: 2, accepted: 2, duplicates: 0, storedUnprocessed: 0, invalid: 0, stoppedAt: null });
    const [url, init] = f.mock.calls[0] as [string, { headers: Record<string, string>; signal: AbortSignal }];
    expect(url).toBe(`${BASE}/api/events?since=${encodeURIComponent(SINCE.toISOString())}`);
    expect(verifyInboxSignature({ secret: SECRET, timestamp: init.headers['X-Timestamp'], signature: init.headers['X-Signature'], body: url.split('?')[1], now: NOW })).toEqual({ ok: true });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(mockAccept.mock.calls.map((c) => (c[0] as { event_id: string }).event_id)).toEqual(['a', 'b']);
  });
  it('no completed pass yet: asks for the last 14 days', async () => {
    db.next = null;
    const f = ok([]);
    await runInboxBackfill(deps(f));
    expect(sinceOf(f)).toBe('2026-11-07T18:00:00.000Z');
  });
  it('a PUSHED event newer than the cursor does not move it (no outage gap is skipped)', async () => {
    db.newestEvent = '2026-11-21T17:55:00Z';
    const f = ok([]);
    await runInboxBackfill(deps(f));
    expect(sinceOf(f)).toBe(SINCE.toISOString());
  });
  it('re-running over the same events adds nothing (the same idempotent insert): duplicates counted', async () => {
    mockAccept.mockResolvedValue({ duplicate: true });
    expect(await runInboxBackfill(deps(ok([ev('a', '2026-11-21T12:30:00Z')])))).toMatchObject({ accepted: 0, duplicates: 1 });
  });
  it('carried (2): a stored event whose DISPATCH failed counts as stored; later events still go and the cursor moves', async () => {
    mockAccept.mockRejectedValueOnce(Object.assign(new Error('recordArrival down'), { name: 'InboxDispatchError' }));
    const r = await runInboxBackfill(deps(ok([ev('a', '2026-11-21T12:30:00Z'), ev('b', '2026-11-21T13:00:00Z')])));
    expect(r).toMatchObject({ accepted: 1, storedUnprocessed: 1, stoppedAt: null });
    expect(mockAccept).toHaveBeenCalledTimes(2);
    expect(db.next).toEqual(minus('2026-11-21T13:00:00Z', CURSOR_OVERLAP_MS));
  });
  it('a failure to STORE stops at that event and the cursor does not move', async () => {
    mockAccept.mockResolvedValueOnce({ duplicate: false }).mockRejectedValueOnce(Object.assign(new Error('db'), { name: 'SequelizeConnectionError' }));
    const r = await runInboxBackfill(deps(ok([ev('c', '2026-11-21T14:00:00Z'), ev('a', '2026-11-21T12:30:00Z'), ev('b', '2026-11-21T13:00:00Z')])));
    expect(r).toMatchObject({ accepted: 1, stoppedAt: 'b' });
    expect(mockAccept).toHaveBeenCalledTimes(2);
    expect(db.next).toEqual(SINCE);
  });
});

describe('runInboxBackfill: the cursor runs on the UPSTREAM clock', () => {
  it('carried (3): after a completed pass, next = newest received_at minus the overlap, never our clock', async () => {
    await runInboxBackfill(deps(ok([ev('a', '2026-11-21T13:00:00Z')], 'Sat, 21 Nov 2026 19:30:00 GMT')));
    expect(db.next).toEqual(minus('2026-11-21T13:00:00Z', CURSOR_OVERLAP_MS));
    expect(db.next).not.toEqual(NOW);
  });
  it('an empty page moves it to the upstream Date header minus the overlap; with no Date header it stays', async () => {
    await runInboxBackfill(deps(ok([])));
    expect(db.next).toEqual(SINCE);
    await runInboxBackfill(deps(ok([], 'Sat, 21 Nov 2026 16:40:00 GMT')));
    expect(db.next).toEqual(minus('2026-11-21T16:40:00Z', CURSOR_OVERLAP_MS));
  });
  it('upstream down: the cursor stays', async () => {
    await runInboxBackfill(deps(jest.fn().mockRejectedValue(new TypeError('fetch failed'))));
    expect(db.next).toEqual(SINCE);
  });
  it('a FULL page (oldest first) sets next to its newest event itself, so the next pass moves forward', async () => {
    const page = Array.from({ length: 500 }, (_, i) => ev(`e${i}`, new Date(Date.parse('2026-11-21T13:00:00Z') + i * 1000).toISOString()));
    await runInboxBackfill(deps(ok(page)));
    const f = ok([]);
    await runInboxBackfill(deps(f));
    expect(sinceOf(f)).toBe('2026-11-21T13:08:19.000Z');
  });
  it('carried (1): a FULL page that is not oldest-first is a ContractViolation: nothing stored, the cursor stays', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const page = Array.from({ length: 500 }, (_, i) => ev(`e${i}`, new Date(Date.parse('2026-11-21T13:00:00Z') + (499 - i) * 1000).toISOString()));
    expect(await runInboxBackfill(deps(ok(page)))).toEqual({ status: 'unavailable', attempts: 1, errorClass: 'ContractViolation' });
    expect(mockAccept).not.toHaveBeenCalled();
    expect(db.next).toEqual(SINCE);
    expect(JSON.parse(String(err.mock.calls[0][0]))).toMatchObject({ level: 'error', event: 'inbox_backfill_page_out_of_order', error_class: 'ContractViolation' });
  });
  it('P3a: a full page all on ONE timestamp equal to since cannot progress by time: logged as stalled for CP7', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const page = Array.from({ length: 500 }, (_, i) => ev(`s${i}`, SINCE.toISOString()));
    await runInboxBackfill(deps(ok(page)));
    expect(db.next).toEqual(SINCE);
    expect(err.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/inbox_backfill_stalled/);
  });
  it('planNextSince (pure): a short page out of order is fine (we sort it); the newest wins', () => {
    const events = [ev('b', '2026-11-21T13:00:00Z'), ev('a', '2026-11-21T12:30:00Z')].map((e) => InboxEventSchema.parse(e));
    const p = planNextSince(events, 2, SINCE.toISOString(), null);
    expect(p).toEqual({ ok: true, next: minus('2026-11-21T13:00:00Z', CURSOR_OVERLAP_MS), stalled: false });
    expect(planNextSince([], 0, SINCE.toISOString(), 'not a date')).toEqual({ ok: true, next: null, stalled: false });
  });
});

describe('runInboxBackfill: failures', () => {
  it('upstream down: exactly 3 attempts (waits 2 s, 10 s), then UpstreamUnavailable logged, and NOTHING written', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(await runInboxBackfill(deps(f))).toEqual({ status: 'unavailable', attempts: 3, errorClass: 'UpstreamUnavailable' });
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([...RETRY_WAITS_MS]);
    expect(mockAccept).not.toHaveBeenCalled();
    expect(err.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/inbox_backfill_gave_up.*UpstreamUnavailable/);
  });
  it('a 503 then a 429 then success: retried, then applied', async () => {
    const f = jest.fn().mockResolvedValueOnce(reply(503, {})).mockResolvedValueOnce(reply(429, {})).mockResolvedValueOnce(reply(200, { events: [ev('a', '2026-11-21T12:30:00Z')] }));
    expect(await runInboxBackfill(deps(f))).toMatchObject({ status: 'done', accepted: 1 });
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('a 401 is not retried (AuthError); a timeout is classified TimeoutError per attempt', async () => {
    expect(await runInboxBackfill(deps(jest.fn().mockResolvedValue(reply(401, {}))))).toEqual({ status: 'unavailable', attempts: 1, errorClass: 'AuthError' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await runInboxBackfill(deps(jest.fn().mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))));
    expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('inbox_backfill_attempt_failed') && l.includes('TimeoutError'))).toHaveLength(3);
  });
  it('a response that is not the agreed shape writes nothing (ContractViolation); bad events inside a good page are skipped', async () => {
    expect(await runInboxBackfill(deps(jest.fn().mockResolvedValue(reply(200, [ev('a', '2026-11-21T12:30:00Z')]))))).toMatchObject({ status: 'unavailable', errorClass: 'ContractViolation' });
    expect(mockAccept).not.toHaveBeenCalled();
    expect(await runInboxBackfill(deps(ok([ev('a', '2026-11-21T12:30:00Z'), { event_id: 'junk' }])))).toMatchObject({ accepted: 1, invalid: 1 });
  });
  it('every attempt logs start and end with status and duration (host only, never the secret)', async () => {
    const lines: string[] = [];
    for (const k of ['log', 'warn'] as const) jest.spyOn(console, k).mockImplementation((...a: unknown[]) => { lines.push(String(a[0])); });
    await runInboxBackfill(deps(jest.fn().mockResolvedValueOnce(reply(503, {})).mockResolvedValueOnce(reply(200, { events: [] }))));
    const ends = lines.filter((l) => l.includes('inbox_backfill_request_end')).map((l) => JSON.parse(l).context);
    expect(ends.map((c) => c.status)).toEqual([503, 200]);
    expect(ends.every((c) => typeof c.duration_ms === 'number' && c.host === 'inbox-manager.example')).toBe(true);
    expect(lines.filter((l) => l.includes('inbox_backfill_request_start'))).toHaveLength(2);
    expect(lines.join('\n')).not.toContain(SECRET);
  });
});

describe('startInboxBackfill', () => {
  it('configured: registers the hourly pass once', () => {
    expect(startInboxBackfill()).toBe(true);
    expect(startInboxBackfill()).toBe(false);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0]).toBe('20 * * * *');
  });
});
