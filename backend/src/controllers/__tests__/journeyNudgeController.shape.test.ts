const m = { list: jest.fn(), dismiss: jest.fn() };
jest.mock('../../services/growthJourney/execution/nudgeReadService', () => ({
  listLearnerNudges: (...a: unknown[]) => m.list(...a),
  dismissLearnerNudge: (...a: unknown[]) => m.dismiss(...a),
  LEARNER_NUDGE_FIELDS: ['id', 'title', 'href', 'purpose'],
}));
jest.mock('../../middlewares/participantAuth', () => ({
  requireParticipant: (req: { participant?: unknown }, _res: unknown, next: () => void) => {
    req.participant = { sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'participant' };
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import { learnerNudgeSchema } from '../journeyNudgeController';
import journeyNudgeRoutes from '../../routes/journeyNudgeRoutes';

/**
 * T514 - the response contract is checked at the boundary. The access suite
 * proves the service maps a row to four fields; this one proves the check in
 * the controller is load-bearing by handing it something the service could
 * only return after a code change: the row itself. A leak is a 500 and a
 * structured error line, never a body.
 */

const app = express();
app.use(express.json());
app.use(journeyNudgeRoutes);

beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  m.list.mockReset();
  m.dismiss.mockReset();
});

it('the schema is strict: exactly the four learner fields, nothing of the row', () => {
  expect(learnerNudgeSchema.safeParse({ id: 'n', title: 't', href: null, purpose: null }).success).toBe(true);
  expect(learnerNudgeSchema.safeParse({ id: 'n', title: 't', href: null, purpose: null, tenant_id: 't-col' }).success).toBe(false);
  expect(learnerNudgeSchema.safeParse({ id: 'n', title: 't' }).success).toBe(false);
});

it('a service that returned the row would be caught: 500, the error line names the contract, and the row never reaches the body', async () => {
  m.list.mockResolvedValue([{ id: 'n-1', title: 'Leak', href: null, purpose: null, tenant_id: 't-col', brand_id: 'b-ent', execution_id: 'ex-1', shown_at: null }]);
  const res = await request(app).get('/api/portal/journey-nudges');
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('t-col');
  expect(JSON.stringify(res.body)).not.toContain('ex-1');
  const line = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('growth_journey.nudges.response_shape'))!;
  // Zod's strict object reports every unrecognised key in ONE issue; the count is the contract's, not the keys'.
  expect(JSON.parse(line)).toMatchObject({ level: 'error', outcome: 'failure', context: { issues: 1 } });
});

it('the four-field shape passes through untouched', async () => {
  m.list.mockResolvedValue([{ id: 'n-1', title: 'Fine', href: '/portal/x', purpose: 'p' }]);
  const res = await request(app).get('/api/portal/journey-nudges');
  expect(res.status).toBe(200);
  expect(res.body).toEqual([{ id: 'n-1', title: 'Fine', href: '/portal/x', purpose: 'p' }]);
});
