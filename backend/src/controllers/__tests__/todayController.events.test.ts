/**
 * C107: the HTTP boundary for seen cards and banner opens, and the feed open that now also counts as an event.
 * Malformed input is a 400 before anything is written; a read-only "view as" session writes nothing.
 */
const mockRecord = jest.fn();
const mockInteract = jest.fn();
jest.mock('../../services/timeline/todayCardEvents', () => ({
  recordTodayCardEvents: (...a: unknown[]) => mockRecord(...a),
  MAX_EVENTS_PER_CALL: 30,
}));
jest.mock('../../services/timeline/todayFeedComposer', () => ({
  getTodayPage: jest.fn(),
  recordTodayInteraction: (...a: unknown[]) => mockInteract(...a),
}));

import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { handleTodayEvents, handleTodayInteract } from '../todayController';

/** A request as the handlers read it; `participant` comes from requireParticipant, so it is spelled out here. */
type FakeReq = { body?: unknown; params?: Record<string, string>; participant: { sub: string; read_only: boolean } };
function call(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>, req: FakeReq) {
  const res: { statusCode: number; body: unknown; status: (c: number) => typeof res; json: (b: unknown) => typeof res } = {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  const next = jest.fn();
  return handler(req as unknown as Request, res as unknown as Response, next).then(() => ({ res, next }));
}
const participant = (read_only = false) => ({ sub: 'enr-1', read_only });

beforeEach(() => {
  mockRecord.mockReset().mockResolvedValue(1);
  mockInteract.mockReset().mockResolvedValue({ ok: true });
  (env as { todayFeedV2Enabled: boolean }).todayFeedV2Enabled = true;
});

describe('POST /api/portal/runtime/today/events', () => {
  it('records a valid batch', async () => {
    const events = [{ ref: 'card:4f1c', event: 'seen', source: 'feed' }, { ref: 'card:4f1c', event: 'open', source: 'banner' }];
    const { res } = await call(handleTodayEvents, { body: { events }, participant: participant() });
    expect(res.statusCode).toBe(200);
    expect(mockRecord).toHaveBeenCalledWith('enr-1', events);
  });

  it.each([
    ['no body', undefined],
    ['empty list', { events: [] }],
    ['unknown event', { events: [{ ref: 'card:a', event: 'click', source: 'feed' }] }],
    ['unknown source', { events: [{ ref: 'card:a', event: 'seen', source: 'email' }] }],
    ['ref that is not a feed ref', { events: [{ ref: "card:a'; DROP TABLE x;--", event: 'seen', source: 'feed' }] }],
    ['extra field', { events: [{ ref: 'card:a', event: 'seen', source: 'feed', at: 1 }] }],
    ['over the per-call bound', { events: Array.from({ length: 31 }, (_, i) => ({ ref: `card:${i}`, event: 'seen', source: 'feed' })) }],
  ])('rejects %s with 400 and writes nothing', async (_name, body) => {
    const { res } = await call(handleTodayEvents, { body, participant: participant() });
    expect(res.statusCode).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('writes nothing for a read-only "view as" session', async () => {
    const { res } = await call(handleTodayEvents, {
      body: { events: [{ ref: 'card:a', event: 'seen', source: 'feed' }] }, participant: participant(true),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, recorded: 0 });
    expect(mockRecord).not.toHaveBeenCalled();
  });
});

describe('POST /api/portal/runtime/today/:cardRef/interact', () => {
  it('an open from the feed is also recorded as a feed open event', async () => {
    await call(handleTodayInteract, { body: { action: 'open' }, params: { cardRef: 'card:4f1c' }, participant: participant() });
    expect(mockRecord).toHaveBeenCalledWith('enr-1', [{ ref: 'card:4f1c', event: 'open', source: 'feed' }]);
    expect(mockInteract).toHaveBeenCalledWith('enr-1', 'card:4f1c', 'open');
  });

  it('other actions are not open events', async () => {
    await call(handleTodayInteract, { body: { action: 'dismiss' }, params: { cardRef: 'card:4f1c' }, participant: participant() });
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockInteract).toHaveBeenCalled();
  });
});
