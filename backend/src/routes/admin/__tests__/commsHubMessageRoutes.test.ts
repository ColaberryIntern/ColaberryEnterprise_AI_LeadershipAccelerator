jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
jest.mock('../../campusRoutes', () => ({ logFailure: jest.fn(), sendValidated: jest.fn() }));
jest.mock('../commsHubEventRoutes', () => ({ actorOf: () => ({ id: 'jackie-1', label: 'jackie' }) }));
jest.mock('../../../services/commsHub/messages/approvals', () => {
  class MessageRuleError extends Error { constructor(m: string, public status: number, public reason: string, public problems: string[] = []) { super(m); } }
  return { MessageRuleError, cancelMessage: jest.fn(), rejectMessage: jest.fn(), submitForApproval: jest.fn(), undoApproval: jest.fn() };
});
jest.mock('../../../services/commsHub/messages/drafting', () => { class DraftModelError extends Error {} return { DraftModelError, createDraftMessage: jest.fn(), editDraft: jest.fn(), regenerateDrafts: jest.fn() }; });
jest.mock('../../../services/commsHub/delivery/messageLifecycle', () => ({ retryFailedDeliveries: jest.fn() }));
jest.mock('../../../services/commsHub/messages/messageService', () => ({ approveAndSchedule: jest.fn(), destinationOptions: jest.fn(), listMessages: jest.fn(), messageView: jest.fn(async (id: string) => ({ id })), setDestinations: jest.fn(), setSendTime: jest.fn() }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../commsHubMessageRoutes';
import * as approvals from '../../../services/commsHub/messages/approvals';
import * as drafting from '../../../services/commsHub/messages/drafting';
import * as svc from '../../../services/commsHub/messages/messageService';
import * as lifecycle from '../../../services/commsHub/delivery/messageLifecycle';

/** CH6.5 Compose routes: comms_hub only, validated, refusals carry the validator's problems, every answer is the message as it now is. */
const verify = jwt.verify as unknown as jest.Mock;
const M = '99999999-9999-4999-8999-999999999999';
const BASE = '/api/admin/comms-hub/messages';
const app = express(); app.use(express.json()); app.use(router);
const as = (who: Record<string, unknown> = { role: 'admin', mgmt_role: 'community_organizer' }) => { verify.mockReturnValue(who); return { Authorization: 'Bearer t' }; };
beforeEach(() => jest.clearAllMocks());

it('every route refuses a role without comms_hub', async () => {
  const who = { role: 'admin', mgmt_role: 'revenue' };
  const calls = [
    request(app).get(BASE).set(as(who)), request(app).post(BASE).set(as(who)).send({}), request(app).get(`${BASE}/destination-options`).set(as(who)),
    request(app).get(`${BASE}/${M}`).set(as(who)),
    ...['regenerate', 'drafts', 'submit', 'approve', 'reject', 'undo', 'cancel', 'retry'].map((a) => request(app).post(`${BASE}/${M}/${a}`).set(as(who)).send({})),
    request(app).put(`${BASE}/${M}/destinations`).set(as(who)).send({}), request(app).put(`${BASE}/${M}/send-time`).set(as(who)).send({}),
  ];
  for (const c of calls) expect((await c).status).toBe(403);
  expect(svc.approveAndSchedule).not.toHaveBeenCalled();
  expect(lifecycle.retryFailedDeliveries).not.toHaveBeenCalled();
});

it('create: 201 with the message; kind and tone are validated', async () => {
  (drafting.createDraftMessage as jest.Mock).mockResolvedValue({ message: { id: M } });
  const res = await request(app).post(BASE).set(as()).send({ event_id: '88888888-8888-4888-8888-888888888888', kind: 'reminder', tone: 'friendly', notes: 'Bring a question.', include: { join_link: false } });
  expect([res.status, res.body.message.id]).toEqual([201, M]);
  expect((drafting.createDraftMessage as jest.Mock).mock.calls[0][0]).toMatchObject({ kind: 'reminder', tone: 'friendly', include: { join_link: false } });
  expect((await request(app).post(BASE).set(as()).send({ subject: 'x', kind: 'blast' })).status).toBe(400);
  expect((await request(app).post(BASE).set(as()).send({ subject: 'x', kind: 'update', tone: 'shouty' })).status).toBe(400);
});

it('approve: refused with the validator problems as a list', async () => {
  (svc.approveAndSchedule as jest.Mock).mockRejectedValue(new approvals.MessageRuleError('Fix the drafts before approving.', 409, 'draft_invalid', ['The community post must say the date: Tuesday, December 1.']));
  const res = await request(app).post(`${BASE}/${M}/approve`).set(as());
  expect(res.status).toBe(409);
  expect(res.body).toEqual({ error: 'Fix the drafts before approving.', reason: 'draft_invalid', problems: ['The community post must say the date: Tuesday, December 1.'] });
});

it('writes answer with the message as it now is; bad bodies are 400', async () => {
  expect((await request(app).post(`${BASE}/${M}/regenerate`).set(as()).send({ instruction: 'shorter' })).body).toEqual({ message: { id: M } });
  expect(drafting.regenerateDrafts).toHaveBeenCalledWith(M, 'shorter', { id: 'jackie-1', label: 'jackie' });
  expect((await request(app).post(`${BASE}/${M}/regenerate`).set(as()).send({ instruction: 'louder' })).status).toBe(400);
  expect((await request(app).put(`${BASE}/${M}/send-time`).set(as()).send({ send_at: 'tomorrow' })).status).toBe(400);
  await request(app).put(`${BASE}/${M}/send-time`).set(as()).send({ send_at: null });
  expect(svc.setSendTime).toHaveBeenCalledWith(M, null, { id: 'jackie-1', label: 'jackie' });
  await request(app).post(`${BASE}/${M}/reject`).set(as()).send({ note: 'Say the time once.' });
  expect(approvals.rejectMessage).toHaveBeenCalledWith(M, { id: 'jackie-1', label: 'jackie' }, 'Say the time once.');
});

it('CH7.2 retry: retries the failed destinations and answers with the message; a refusal says why', async () => {
  (lifecycle.retryFailedDeliveries as jest.Mock).mockResolvedValueOnce({ id: M });
  const ok = await request(app).post(`${BASE}/${M}/retry`).set(as());
  expect([ok.status, ok.body]).toEqual([200, { message: { id: M } }]);
  expect(lifecycle.retryFailedDeliveries).toHaveBeenCalledWith(M, { id: 'jackie-1', label: 'jackie' });
  (lifecycle.retryFailedDeliveries as jest.Mock).mockRejectedValueOnce(new approvals.MessageRuleError('There is nothing left to retry.', 409, 'nothing_to_retry'));
  const no = await request(app).post(`${BASE}/${M}/retry`).set(as());
  expect([no.status, no.body.reason]).toEqual([409, 'nothing_to_retry']);
  expect((await request(app).post(`${BASE}/not-an-id/retry`).set(as())).status).toBe(400);
});
