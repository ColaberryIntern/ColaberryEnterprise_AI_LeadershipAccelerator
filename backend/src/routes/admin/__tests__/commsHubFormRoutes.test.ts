jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
const mockCohorts = jest.fn();
jest.mock('../../../models/Cohort', () => ({ __esModule: true, default: { findAll: (...a: unknown[]) => mockCohorts(...a) } }));
const mockDescribe = jest.fn();
jest.mock('../../../services/commsHub/eventDescribe', () => {
  const actual = jest.requireActual('../../../services/commsHub/eventDescribe');
  return { ...actual, describeEvent: (...a: unknown[]) => mockDescribe(...a) };
});

import jwt from 'jsonwebtoken';
import router from '../commsHubFormRoutes';
import { DescribeRefusedError } from '../../../services/commsHub/eventDescribe';

/** CH3.2 form helper routes: cohort list and Write with AI, gated and Zod-first, with plain errors. */
const verify = jwt.verify as unknown as jest.Mock;
async function call(method: string, path: string, body?: unknown, who: Record<string, unknown> = { role: 'admin', mgmt_role: 'community_organizer' }) {
  const layer = (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  const req: any = { method: method.toUpperCase(), headers: { authorization: 'Bearer t' }, body, params: {}, query: {} };
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  verify.mockReturnValue(who);
  for (const s of layer.route.stack) { let go = false; await s.handle(req, res, () => { go = true; }); if (!go) break; }
  return res;
}
const row = (o: Record<string, unknown>) => ({ get: (k: string) => o[k] });
let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('CH3.2 GET /api/admin/comms-hub/cohorts', () => {
  it('lists cohorts newest first with a date-only start', async () => {
    mockCohorts.mockResolvedValue([row({ id: '77777777-7777-4777-8777-777777777777', name: 'November 2026', status: 'open', start_date: '2026-11-03' })]);
    const res = await call('get', '/api/admin/comms-hub/cohorts');
    expect(res.body).toEqual({ cohorts: [{ id: '77777777-7777-4777-8777-777777777777', name: 'November 2026', status: 'open', start_date: '2026-11-03' }] });
    expect(mockCohorts.mock.calls[0][0].order).toEqual([['start_date', 'DESC']]);
  });
  it('a database failure is a plain 500', async () => {
    mockCohorts.mockRejectedValue(new Error('pg down'));
    const res = await call('get', '/api/admin/comms-hub/cohorts');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/pg down/);
  });
});

describe('CH3.2 POST /api/admin/comms-hub/events/describe', () => {
  it('returns the description', async () => {
    mockDescribe.mockResolvedValue('Builders demo live.');
    const res = await call('post', '/api/admin/comms-hub/events/describe', { title: 'Demo Tuesday' });
    expect(res.body).toEqual({ description: 'Builders demo live.' });
  });
  it('a bad body is 400 before the model is called', async () => {
    const res = await call('post', '/api/admin/comms-hub/events/describe', { title: '', surprise: 1 });
    expect(res.statusCode).toBe(400);
    expect(mockDescribe).not.toHaveBeenCalled();
  });
  it('an all-forbidden draft is 422 with the reason; a model outage is 502 in plain words', async () => {
    mockDescribe.mockRejectedValueOnce(new DescribeRefusedError('The AI draft only had dates, links or prices in it. Try again, or write it yourself.'));
    expect((await call('post', '/api/admin/comms-hub/events/describe', { title: 'X' })).statusCode).toBe(422);
    mockDescribe.mockRejectedValueOnce(new Error('ECONNRESET'));
    const r = await call('post', '/api/admin/comms-hub/events/describe', { title: 'X' });
    expect(r.statusCode).toBe(502);
    expect(r.body.error).not.toMatch(/ECONNRESET/);
  });
  it('both routes refuse a role without comms_hub', async () => {
    const who = { role: 'admin', mgmt_role: 'revenue' };
    expect((await call('get', '/api/admin/comms-hub/cohorts', undefined, who)).statusCode).toBe(403);
    expect((await call('post', '/api/admin/comms-hub/events/describe', { title: 'X' }, who)).statusCode).toBe(403);
  });
});
