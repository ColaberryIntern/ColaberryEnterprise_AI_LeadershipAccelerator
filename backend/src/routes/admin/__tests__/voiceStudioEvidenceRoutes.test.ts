import express from 'express';
import request from 'supertest';

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireAdmin: (req: { headers: Record<string, string>; admin?: unknown }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (!req.headers['x-test-admin']) { res.status(401).json({ error: 'Unauthorized' }); return; }
    req.admin = { sub: req.headers['x-test-admin'], role: 'admin' };
    next();
  },
  requireFullAdmin: (req: { headers: Record<string, string> }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (req.headers['x-test-full'] !== 'yes') { res.status(403).json({ error: 'Forbidden' }); return; }
    next();
  },
}));

import { buildVoiceStudioEvidenceRouter, type EvidenceDeps } from '../voiceStudioEvidenceRoutes';
import { buildTimeline, redact, timelineCsv, type TimelineInput } from '../../../services/voice/studio/trustTimeline';
import { persistToolRun, toolVerdict } from '../../../services/voice/engines/voiceRuntime';
import { SessionWorker } from '../../../services/voice/session/sessionWorker';

const CID = '11111111-1111-4111-8111-111111111111';
const input = (p: Partial<TimelineInput> = {}): TimelineInput => ({
  call: { id: CID, engine: 'conversation_relay', state: 'completed', consent_ref: 'c1', created_at: '2026-11-24T20:00:00Z' },
  events: [{ id: 'e1', source: 'carrier', state: 'answered', occurred_at: '2026-11-24T20:00:05Z' }],
  tools: [
    { id: 't1', tool_name: 'next_open_strategy_slots', auth_decision: 'allowed', status: 'completed', started_at: '2026-11-24T20:00:10Z' },
    { id: 't2', tool_name: 'book_meeting', auth_decision: 'denied', status: 'refused', started_at: '2026-11-24T20:00:20Z' },
  ],
  version: { id: 'v1', version: 3, author: 'seed', approved_by: 'owner@example.com', approved_at: '2026-11-24T19:00:00Z' },
  ...p,
});
const detail = () => ({ ...input(), row: { id: CID, state: 'completed', provider_call_id_masked: 'CA****abcd' }, turns: [], usage: [], reconciliation: { logged: true, logStatus: 'delivered', transcriptState: 'present' } });

function make(enabled = true) {
  const deps = {
    findHistory: jest.fn(),
    enabled: () => enabled,
    config: () => ({ VOICE_TEST_MAX_ATTEMPTS: 3, VOICE_TEST_MAX_DURATION_SECONDS: 180, VOICE_TEST_BUDGET_USD: 5 }),
    store: {
      listCalls: jest.fn().mockResolvedValue([]),
      getCallDetail: jest.fn().mockResolvedValue(detail()),
      listEvaluations: jest.fn().mockResolvedValue([]),
      loadCosts: jest.fn().mockResolvedValue({ byProvider: [], activeCalls: 0, reservations: [], deadLetters: [] }),
    },
  };
  const a = express();
  a.use(buildVoiceStudioEvidenceRouter(() => deps as unknown as EvidenceDeps));
  a.use((_q, r) => { r.status(404).json({ error: 'fell through' }); });
  return { a, deps };
}
const A = { 'x-test-admin': 'a1' };
const P = '/api/admin/voice-studio';

describe('trust timeline (pure)', () => {
  it('orders entries, names the actor type and verdict, and shows denied actions', () => {
    const t = buildTimeline(input());
    expect(t.map((e) => [e.actorType, e.action, e.verdict])).toEqual([
      ['human', 'approved_version', 'allowed'],
      ['deterministic_service', 'call_requested', 'observed'],
      ['carrier', 'state_answered', 'observed'],
      ['ai', 'tool_next_open_strategy_slots', 'allowed'],
      ['ai', 'tool_book_meeting', 'denied'],
    ]);
    expect(t[4].detail).toContain('was refused');
  });

  it('redacts emails and phone numbers but keeps dates; a blocked call reads denied', () => {
    expect(buildTimeline(input())[0].actor).toBe('[redacted email]');
    expect(redact('call +1 555 555 0100 on 2026-11-24')).toBe('call [redacted number] on 2026-11-24');
    const blocked = buildTimeline(input({ call: { ...input().call, state: 'blocked' } }));
    expect(blocked.find((e) => e.action === 'call_requested')?.verdict).toBe('denied');
  });

  it('redacts detail text too, on screen and in the CSV; an unknown decision is never "allowed"', () => {
    const t = buildTimeline(input({
      version: { id: 'v1', version: 3, author: 'writer@example.com', approved_by: 'x', approved_at: '2026-11-24T19:00:00Z' },
      tools: [{ id: 't9', tool_name: 'call_5555550100_now', auth_decision: 'mystery', status: 'completed', started_at: '2026-11-24T20:00:10Z' }],
    }));
    for (const s of [JSON.stringify(t.map((e) => e.detail)), timelineCsv(t)]) {
      expect(s).not.toContain('writer@example.com');
      expect(s).not.toContain('5555550100');
    }
    expect(t.find((e) => e.actorType === 'ai')?.verdict).toBe('observed');
  });

  it('CSV neutralizes a formula and doubles quotes', () => {
    const csv = timelineCsv([{ ...buildTimeline(input())[1], detail: '=HYPERLINK("x")' }]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
  });
});

describe('a mock call tool event, end to end into the timeline', () => {
  it('session worker, then persistToolRun, then timeline: one allowed and one refused tool', async () => {
    expect(toolVerdict({ committed: false, errorClass: 'TimeoutError' })).toEqual({ decision: 'allowed', status: 'failed' });
    expect(toolVerdict({ committed: false, errorClass: 'ValidationError' })).toEqual({ decision: 'denied', status: 'refused' });
    const rows: TimelineInput['tools'] = [];
    const pending: Promise<unknown>[] = [];
    const worker = new SessionWorker({
      now: () => 0, log: () => undefined, reconcile: async () => undefined,
      recordTool: (id, rec) => {
        pending.push(persistToolRun(id, rec, async (_sql, r) => {
          rows.push({ id: String(r.key), tool_name: String(r.name), auth_decision: String(r.decision), status: String(r.status), started_at: '2026-11-24T20:00:10Z' });
        }));
      },
    });
    const o = worker.open(CID, 'v1');
    if (!o.ok) throw new Error('session refused');
    o.handle.toolStarted('ok', 'next_open_strategy_slots');
    o.handle.toolFinished('ok', false);
    o.handle.toolStarted('no', 'book_meeting');
    o.handle.toolFinished('no', false, 'UnknownTool');
    await Promise.all(pending);
    const t = buildTimeline(input({ tools: rows })).filter((e) => e.actorType === 'ai');
    expect(t.map((e) => [e.action, e.verdict]).sort()).toEqual([['tool_book_meeting', 'denied'], ['tool_next_open_strategy_slots', 'allowed']]);
    o.handle.close('test_done');
  });
});

describe('evidence API (VS3.5)', () => {
  it('is absent with the flag off and needs an admin', async () => {
    expect((await request(make(false).a).get(`${P}/calls`).set(A)).body).toEqual({ error: 'fell through' });
    for (const p of ['calls', `calls/${CID}`, 'quality', 'costs']) expect((await request(make().a).get(`${P}/${p}`)).status).toBe(401);
  });

  it('filters reach the store; bad filters are 400', async () => {
    const { a, deps } = make();
    await request(a).get(`${P}/calls?days=30&engine=conversation_relay&state=completed&test=true`).set(A);
    expect(deps.store.listCalls).toHaveBeenCalledWith({ days: 30, engine: 'conversation_relay', state: 'completed', testMode: true, limit: 50 });
    for (const q of ['days=999', 'engine=x', 'limit=0', 'evil=1']) expect((await request(a).get(`${P}/calls?${q}`).set(A)).status).toBe(400);
  });

  it('detail carries the timeline without the approver email; unknown is 404', async () => {
    const { a, deps } = make();
    const r = await request(a).get(`${P}/calls/${CID}`).set(A);
    expect(r.body.timeline).toHaveLength(5);
    expect(JSON.stringify(r.body)).not.toContain('owner@example.com');
    deps.store.getCallDetail.mockResolvedValueOnce(null);
    expect((await request(a).get(`${P}/calls/${CID}`).set(A)).status).toBe(404);
  });

  it('export respects RBAC and redaction', async () => {
    const { a } = make();
    expect((await request(a).get(`${P}/calls/${CID}/timeline.csv`).set(A)).status).toBe(403);
    const r = await request(a).get(`${P}/calls/${CID}/timeline.csv`).set({ ...A, 'x-test-full': 'yes' });
    expect(r.status).toBe(200);
    expect(r.text).toContain('[redacted email]');
    expect(r.text).not.toContain('owner@example.com');
  });

  it('quality returns the rubric; costs return caps; a failure is a stable class with no message', async () => {
    const { a, deps } = make();
    const q = await request(a).get(`${P}/quality`).set(A);
    expect(q.body.rubric.reduce((s: number, d: { weight: number }) => s + d.weight, 0)).toBe(100);
    expect((await request(a).get(`${P}/costs`).set(A)).body.caps).toEqual({ testAttemptsPerRun: 3, testMaxSeconds: 180, testBudgetUsd: 5 });
    deps.store.loadCosts.mockRejectedValueOnce(Object.assign(new Error('secret'), { name: 'ConnectionError' }));
    const f = await request(a).get(`${P}/costs`).set(A);
    expect([f.status, f.body]).toEqual([500, { error: 'ConnectionError' }]);
  });
});

describe('history lookup (VS5.3)', () => {
  const P = '/api/admin/voice-studio/history/abc-123456';
  it('finds one call by the previous vendor id, says so when there is none, and validates', async () => {
    const { a, deps } = make();
    deps.findHistory.mockResolvedValueOnce({ provider: 'synthflow', providerCallId: 'abc-123456' }).mockResolvedValueOnce(null).mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'DatabaseError' }));
    const ok = await request(a).get(P).set(A);
    expect([ok.status, ok.body.call.providerCallId]).toEqual([200, 'abc-123456']);
    expect((await request(a).get(P).set(A)).status).toBe(404);
    expect((await request(a).get(P).set(A)).status).toBe(500);
    expect((await request(a).get('/api/admin/voice-studio/history/a%20b').set(A)).status).toBe(400);
    expect(deps.findHistory).toHaveBeenCalledTimes(3);
  });
  it('needs an admin, and is absent while the console is off', async () => {
    const on = make();
    expect((await request(on.a).get(P)).status).toBe(401);
    const off = make(false);
    expect((await request(off.a).get(P).set(A)).body.error).toBe('fell through');
    expect(on.deps.findHistory).not.toHaveBeenCalled();
  });
});
