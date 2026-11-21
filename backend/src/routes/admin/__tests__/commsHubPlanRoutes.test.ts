jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
jest.mock('../../campusRoutes', () => ({ logFailure: jest.fn(), sendValidated: jest.fn() }));
jest.mock('../commsHubEventRoutes', () => ({ actorOf: () => ({ id: 'jackie-1', label: 'jackie' }) }));
jest.mock('../../../services/commsHub/messages/promotionPlan', () => ({ PLAN_KINDS: ['announcement', 'reminder', 'starting_soon', 'recording_thanks'], readPlan: jest.fn(), setPlan: jest.fn() }));
jest.mock('../../../services/commsHub/messages/approvals', () => { class MessageRuleError extends Error { constructor(m: string, public status: number, public reason: string) { super(m); } } return { MessageRuleError }; });
jest.mock('../../../services/commsHub/messages/drafting', () => { class DraftModelError extends Error {} return { DraftModelError }; });

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../commsHubPlanRoutes';
import * as plan from '../../../services/commsHub/messages/promotionPlan';
import { DraftModelError } from '../../../services/commsHub/messages/drafting';

/** CH6.4 plan routes: comms_hub only, validated, the model failing says the ticks were kept. */
const verify = jwt.verify as unknown as jest.Mock;
const EVENT = '88888888-8888-4888-8888-888888888888';
const URL = `/api/admin/comms-hub/events/${EVENT}/plan`;
const app = express(); app.use(express.json()); app.use(router);
const as = (who: Record<string, unknown> = { role: 'admin', mgmt_role: 'community_organizer' }) => { verify.mockReturnValue(who); return { Authorization: 'Bearer t' }; };
beforeEach(() => jest.clearAllMocks());

it('both routes refuse a role without comms_hub', async () => {
  const who = { role: 'admin', mgmt_role: 'revenue' };
  expect((await request(app).get(URL).set(as(who))).status).toBe(403);
  expect((await request(app).put(URL).set(as(who)).send({ kinds: [] })).status).toBe(403);
  expect(plan.setPlan).not.toHaveBeenCalled();
});

it('PUT validates the rows and passes the actor; the result comes back', async () => {
  (plan.setPlan as jest.Mock).mockResolvedValue({ plan: { event_id: EVENT, rows: [] }, result: { created: 2, existing: 0, skipped: [] } });
  const res = await request(app).put(URL).set(as()).send({ kinds: ['announcement', 'reminder'] });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ event_id: EVENT, result: { created: 2 } });
  expect(plan.setPlan).toHaveBeenCalledWith(EVENT, ['announcement', 'reminder'], { id: 'jackie-1', label: 'jackie' });
  expect((await request(app).put(URL).set(as()).send({ kinds: ['whatsapp_blast'] })).status).toBe(400);
});

it('the model failing: 502 with a sentence that says the ticks were saved', async () => {
  (plan.setPlan as jest.Mock).mockRejectedValue(new DraftModelError('The AI reply was not readable. Try again.'));
  const res = await request(app).put(URL).set(as()).send({ kinds: ['reminder'] });
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/ticks were saved/);
});
