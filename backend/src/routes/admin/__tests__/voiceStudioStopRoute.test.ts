/** VS3.4 stop button at the endpoint: auth, flag, id validation and every outcome. */
import express from 'express';
import request from 'supertest';

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireAdmin: (req: { headers: Record<string, string>; admin?: unknown }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (!req.headers['x-test-admin']) { res.status(401).json({ error: 'Unauthorized' }); return; }
    req.admin = { sub: 'admin-1', role: 'admin' };
    next();
  },
  requireFullAdmin: (_q: unknown, _r: unknown, next: () => void) => next(),
}));

import { buildVoiceStudioRouter } from '../voiceStudioRoutes';
import type { StopDeps } from '../../../services/voice/testlab/stopTestCall';

const CID = '11111111-1111-4111-8111-111111111111';
const A = { 'x-test-admin': 'yes' };

function make(row: Awaited<ReturnType<StopDeps['lookup']>>, enabled = true) {
  const hangup = jest.fn().mockResolvedValue(undefined);
  const stop: StopDeps = { lookup: jest.fn().mockResolvedValue(row), hangup, log: jest.fn() };
  const a = express();
  a.use(buildVoiceStudioRouter((() => ({})) as never, () => enabled, () => stop));
  a.use((_q, r) => { r.status(404).json({ error: 'fell through' }); });
  return { post: (id = CID) => request(a).post(`/api/admin/voice-studio/tests/${id}/stop`), stop, hangup };
}
const live = { provider_call_id: 'CA1', state: 'session_active', test_mode: true };

it('401 without an admin, and nothing is looked up or hung up', async () => {
  const m = make(live);
  expect((await m.post()).status).toBe(401);
  expect(m.stop.lookup).not.toHaveBeenCalled();
  expect(m.hangup).not.toHaveBeenCalled();
});

it('absent while test mode is off', async () => {
  expect((await make(live, false).post().set(A)).body).toEqual({ error: 'fell through' });
});

it('400 for a malformed id', async () => {
  const m = make(live);
  expect((await m.post('nope').set(A)).status).toBe(400);
  expect(m.stop.lookup).not.toHaveBeenCalled();
});

it('200 hangs up an in-progress test call', async () => {
  const m = make(live);
  const r = await m.post().set(A);
  expect([r.status, r.body]).toEqual([200, { stopped: true }]);
  expect(m.hangup).toHaveBeenCalledWith('CA1');
});

it.each([['a customer call', { ...live, test_mode: false }], ['an ended call', { ...live, state: 'completed' }], ['a call not dialed yet', { ...live, provider_call_id: null }]])('409 for %s, never a hang-up', async (_n, row) => {
  const m = make(row);
  expect((await m.post().set(A)).status).toBe(409);
  expect(m.hangup).not.toHaveBeenCalled();
});

it('404 for an unknown call; 500 with a stable class when the lookup fails', async () => {
  expect((await make(null).post().set(A)).status).toBe(404);
  const m = make(live);
  (m.stop.lookup as jest.Mock).mockRejectedValue(Object.assign(new Error('secret'), { name: 'ConnectionError' }));
  const r = await m.post().set(A);
  expect([r.status, r.body]).toEqual([500, { error: 'DatabaseError' }]);
});
