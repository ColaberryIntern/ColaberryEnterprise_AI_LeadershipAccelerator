import { createHash } from 'crypto';
import path from 'path';
import os from 'os';
import { assistantKey } from '../assistantInventory';
import { exportHash, exportHistory, toCall, type HistoryCall } from '../historyExport';
import { batchIdOf, importHistory, parseExport } from '../historyImport';
import { parseHistoryArgs } from '../../../../scripts/voice/history';

const K = assistantKey('m1');
const NOW = new Date('2026-11-25T12:00:00Z');
const DAY = 86_400_000;
type Raw = Record<string, unknown>;
const raw = (i: number, at: string, p: Raw = {}): Raw => ({ call_id: `call-${String(i).padStart(5, '0')}`, start_time: String(Date.parse(at)), duration: '42', call_status: 'completed', end_call_reason: null, transcript: 'PRIVATE WORDS', recording_url: 'https://r.example/secret', lead_phone_number: '+12145550100', name: 'Pat Private', ...p });

/** The vendor as observed: exclusive UTC to_date, newest first, offset snapped to the limit, no total past the end. */
function vendor(calls: Raw[], hook: (u: URL, n: number) => Response | undefined = () => undefined, assistants = ['m1']) {
  let n = 0;
  const reply = (response: unknown, status = 200) => ({ ok: status === 200, status, json: async () => ({ response }) }) as Response;
  const f = jest.fn(async (s: string) => {
    const u = new URL(s);
    const special = hook(u, n++);
    if (special) return special;
    if (u.pathname.endsWith('/assistants')) return reply({ assistants: assistants.map((m) => ({ model_id: m, name: m })), pagination: { total_records: assistants.length } });
    const g = (k: string) => u.searchParams.get(k);
    const limit = Number(g('limit'));
    const off = Math.floor(Number(g('offset')) / limit) * limit;
    const hit = calls.filter((c) => (c.model ?? 'm1') === g('model_id') && (!g('from_date') || Number(c.start_time) >= Date.parse(g('from_date') as string)) && (!g('to_date') || Number(c.start_time) < Date.parse(g('to_date') as string)));
    if (off && off >= hit.length) return reply({ calls: [] });
    return reply({ calls: hit.slice(off, off + limit), pagination: { total_records: hit.length } });
  });
  return f;
}
const fail = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response;
const pause = jest.fn(async () => undefined);
const run = (f: unknown, o: Partial<Parameters<typeof exportHistory>[1]> = {}) => exportHistory('very-secret', { from: '2026-01-01', until: '2026-11-25', now: NOW, pause, ...o }, f as never);
beforeEach(() => pause.mockClear());

describe('one record', () => {
  it('keeps metadata only', () => {
    expect(toCall(raw(1, '2026-03-01T10:00:00Z', { end_call_reason: 'Human Pick-up' }), K)).toEqual({ id: 'call-00001', assistant: K, startedAt: '2026-03-01T10:00:00.000Z', durationSeconds: 42, outcome: 'completed', endReason: 'human_pick_up', hasTranscript: true, hasRecording: true });
  });
  it.each([['no id', { call_id: null }], ['an odd id', { call_id: 'a b' }], ['no start', { start_time: null }], ['seconds', { start_time: '1795646661' }], ['no outcome', { call_status: '' }], ['an outcome of symbols', { call_status: '!!' }]])('%s cannot be kept', (_n, p) => expect(toCall(raw(1, '2026-03-01T10:00:00Z', p), K)).toBeNull());
  it('an unreadable duration is unknown, not zero', () => expect(toCall(raw(1, '2026-03-01T10:00:00Z', { duration: 'n/a' }), K)?.durationSeconds).toBeNull());
});

describe('export', () => {
  const many = (count: number, at = '2026-03-01T00:00:00Z') => Array.from({ length: count }, (_x, i) => raw(i, new Date(Date.parse(at) + i * 1000).toISOString()));
  it('reads every page and accounts for calls outside the range', async () => {
    const f = vendor([...many(250), raw(900, '2025-06-01T00:00:00Z'), raw(901, '2026-11-25T01:00:00Z'), raw(902, '2026-11-24T23:59:59Z')]);
    const x = await run(f);
    expect(x.errors).toEqual([]);
    expect(x.assistants).toEqual([{ key: K, declared: 253, outside: 2, exported: 251 }]);
    expect(new Set(x.calls.map((c) => c.id)).size).toBe(251);
    expect(x.calls.map((c) => c.id)).toContain('call-00902');
    expect(x.sha256).toBe(exportHash(x.calls));
    expect(JSON.stringify(x)).not.toMatch(/PRIVATE|secret|5550100|Pat/);
    for (const call of f.mock.calls as unknown as Array<[string, RequestInit]>) expect(call[1]).toMatchObject({ method: 'GET', signal: expect.any(AbortSignal) });
  });
  it('a full last page is not read past and loses nothing', async () => { expect((await run(vendor(many(200)))).calls).toHaveLength(200); });
  it('splits a window that holds too many calls, and never pages deep', async () => {
    const f = vendor([...many(4_000), ...many(4_000, '2026-03-20T00:00:00Z').map((c, i) => ({ ...c, call_id: `late-${i}` }))]);
    const x = await run(f, { from: '2026-02-20', until: '2026-03-25' });
    expect(x.errors).toEqual([]);
    expect(x.calls).toHaveLength(8_000);
    expect(Math.max(...f.mock.calls.map((c) => Number(new URL(c[0]).searchParams.get('offset'))))).toBeLessThan(5_000);
  });
  it('only the assistants asked for; an unknown one is refused', async () => {
    const f = vendor([raw(1, '2026-03-01T00:00:00Z'), raw(2, '2026-03-01T00:00:00Z', { model: 'm2' })], undefined, ['m1', 'm2']);
    expect((await run(f, { keys: [assistantKey('m2')] })).calls.map((c) => c.id)).toEqual(['call-00002']);
    await expect(run(f, { keys: ['sf-00000000'] })).rejects.toMatchObject({ name: 'ValidationError' });
  });
  it.each([['2026-02-30', '2026-03-01'], ['2026-03-01', '2026-03-01'], ['x', '2026-03-01'], ['2026-03-01', '2026-11-26']])('refuses %s to %s', async (from, until) => { await expect(run(vendor([]), { from, until })).rejects.toMatchObject({ name: 'ValidationError' }); });
  it('a record it cannot keep is a listed error, still accounted for', async () => {
    const x = await run(vendor([raw(1, '2026-03-01T00:00:00Z'), raw(2, '2026-03-02T00:00:00Z', { call_status: null })]));
    expect(x.calls).toHaveLength(1);
    expect(x.errors).toEqual([expect.objectContaining({ errorClass: 'ValidationError', callId: 'call-00002' })]);
  });
  it('a call with no start time is in no window, so the total does not add up', async () => {
    const x = await run(vendor([raw(1, '2026-03-01T00:00:00Z'), raw(2, '2026-03-02T00:00:00Z', { start_time: null })]));
    expect(x.errors).toEqual([expect.objectContaining({ errorClass: 'TotalMismatch', declared: 2, read: 1 })]);
  });
  it('a window that yields less than it declares is listed', async () => {
    const f = vendor(many(3), (u) => (u.searchParams.get('from_date') === '2026-03-02' ? undefined : undefined));
    const short = jest.fn(async (s: string) => {
      const r = await f(s);
      if (!new URL(s).searchParams.get('from_date')?.startsWith('2026-02-')) return r;
      const j = (await r.json()) as { response: { calls: Raw[]; pagination: unknown } };
      return { ok: true, status: 200, json: async () => ({ response: { ...j.response, calls: j.response.calls.slice(1) } }) } as Response;
    });
    const x = await run(short, { from: '2026-02-20', until: '2026-03-10' });
    expect(x.errors.map((e) => e.errorClass)).toEqual(['CountMismatch', 'TotalMismatch']);
  });
  it('calls arriving during the export are not an error; a shrinking total is', async () => {
    const live = many(5);
    let reads = 0;
    const grow = vendor(live, (u) => { if (u.pathname.endsWith('/calls') && !u.searchParams.get('from_date') && ++reads === 2) live.push(raw(777, '2026-11-25T11:00:00Z')); return undefined; });
    expect((await run(grow)).errors).toEqual([]);
    const live2 = many(5);
    let r2 = 0;
    const shrink = vendor(live2, (u) => { if (u.pathname.endsWith('/calls') && !u.searchParams.get('from_date') && ++r2 === 2) live2.pop(); return undefined; });
    expect((await run(shrink)).errors.map((e) => e.errorClass)).toEqual(['TotalMismatch']);
  });
  it('retries an outage at most three times, then lists it and carries on', async () => {
    let bad = 2;
    const once = vendor(many(1), (u) => (u.searchParams.get('from_date') === '2026-01-31' && bad-- > 0 ? fail(502) : undefined));
    expect((await run(once)).errors).toEqual([]);
    expect(pause).toHaveBeenCalledTimes(2);
    const tries: string[] = [];
    const x = await run(vendor(many(1), (u) => { if (u.searchParams.get('from_date') !== '2026-01-31') return undefined; tries.push('t'); return fail(502); }));
    expect(tries).toHaveLength(3);
    expect(x.errors).toEqual([expect.objectContaining({ errorClass: 'UpstreamUnavailable', from: '2026-01-31', to: '2026-03-02' }), expect.objectContaining({ errorClass: 'TotalMismatch' })]);
  });
  it('a refusal stops at once', async () => { await expect(run(vendor(many(1), (u) => (u.pathname.endsWith('/calls') ? fail(403) : undefined)))).rejects.toMatchObject({ name: 'AuthError' }); expect(pause).not.toHaveBeenCalled(); });
  it('one call claimed by two assistants is listed', async () => {
    const x = await run(vendor([raw(1, '2026-03-01T00:00:00Z'), raw(1, '2026-03-01T00:00:00Z', { model: 'm2' })], undefined, ['m1', 'm2']));
    expect(x.errors).toEqual([expect.objectContaining({ errorClass: 'DuplicateId' })]);
  });
  it('ranges longer than a window leave no gap', async () => {
    const calls = Array.from({ length: 328 }, (_x, i) => raw(i, new Date(Date.parse('2026-01-01T00:00:00Z') + i * DAY).toISOString()));
    const x = await run(vendor(calls));
    expect([x.errors, x.calls.length]).toEqual([[], 328]);
  });
});

describe('reading an export back', () => {
  const call: HistoryCall = { id: 'call-00001', assistant: K, startedAt: '2026-03-01T10:00:00.000Z', durationSeconds: 1, outcome: 'completed', endReason: null, hasTranscript: false, hasRecording: false };
  const file = (calls: unknown[], p: object = {}) => JSON.stringify({ version: 1, from: '2026-01-01', until: '2026-11-25', assistants: [], errors: [], calls, sha256: exportHash(calls as HistoryCall[]), ...p });
  it('accepts its own output', () => expect(parseExport(file([call])).calls).toHaveLength(1));
  it.each<[string, string]>([
    ['not JSON', '{'], ['another document', '{}'], ['empty', file([])], ['an extra field', file([{ ...call, transcript: 'x' }])], ['a missing field', file([{ ...call, outcome: undefined }])],
    ['a call twice', file([call, call])], ['an edited file', file([call], { sha256: 'f'.repeat(64) })], ['a negative duration', file([{ ...call, durationSeconds: -1 }])], ['null', 'null'], ['a null call', file([null])],
  ])('refuses %s', (_n, j) => expect(() => parseExport(j)).toThrow(expect.objectContaining({ name: 'ValidationError' })));
  it('applying needs a retention period, before the database is touched', async () => {
    const s = { transaction: jest.fn() };
    for (const retentionDays of [undefined, 0, -1, 1.5, NaN]) await expect(importHistory(s as never, parseExport(file([call])), { tenantId: 't', apply: true, retentionDays })).rejects.toMatchObject({ name: 'ValidationError' });
    expect(s.transaction).not.toHaveBeenCalled();
  });
  it('the batch id is a UUID fixed by the content', () => {
    const h = createHash('sha256').update('x').digest('hex');
    expect(batchIdOf(h)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(batchIdOf(h)).toBe(batchIdOf(h));
  });
});

describe('the command', () => {
  const out = path.join(os.tmpdir(), 'h.json');
  const id = '12345678-1234-5123-8123-123456789012';
  it.each([[['export', out, '--from', '2026-01-01', '--until', '2026-02-01', '--only', K]], [['import', out]], [['import', out, '--apply', '--retention-days', '90']], [['verify', out]], [['rollback', id, '--apply']], [['purge']], [['find', 'abc-123456']]])('%j', (a) => expect(parseHistoryArgs(a).ok).toBe(true));
  it.each([[[]], [['constructor']], [['export', out]], [['export', path.join(__dirname, 'h.json'), '--from', 'a', '--until', 'b']], [['import']], [['import', out, '--apply']], [['import', out, '--retention-days', '0']], [['import', out, '--force']], [['verify', out, '--apply']], [['rollback', 'all']], [['purge', 'x']], [['import', out, '--retention-days']], [['import', out, '--apply', '--apply']]])('refuses %j', (a) => expect(parseHistoryArgs(a).ok).toBe(false));
});
