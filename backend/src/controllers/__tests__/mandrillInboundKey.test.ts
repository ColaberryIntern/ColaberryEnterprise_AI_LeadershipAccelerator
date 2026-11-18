/**
 * OH1h: Mandrill signs each webhook with its OWN key. Production's MANDRILL_WEBHOOK_KEY is the
 * outbound tracking webhook's key, so every reply since 2026-07-29 was rejected 401
 * ("Invalid webhook signature" on Mandrill's own record). The inbound route now prefers
 * MANDRILL_INBOUND_WEBHOOK_KEY. Real HMAC-SHA1 signatures, not a mocked check.
 */
import crypto from 'crypto';

jest.mock('../../config/env', () => ({
  env: {
    mandrillWebhookKey: 'outbound-tracking-key',
    mandrillInboundWebhookKey: 'inbound-route-key',
    mandrillWebhookUrl: 'https://enterprise.colaberry.ai/api/webhook/mandrill',
    mandrillInboundDomain: 'reply.colaberry.ai',
    emailFrom: 'ali@colaberry.com',
  },
}));
jest.mock('../../services/workforce/ticketReplyService', () => ({ handleTicketReplyEmail: jest.fn().mockResolvedValue({ handled: true, reason: 'approve' }) }));
jest.mock('../../services/interactionService', () => ({ recordWebhookOutcome: jest.fn() }));
jest.mock('../../models', () => ({
  Lead: { findOne: jest.fn().mockResolvedValue(null) },
  InteractionOutcome: { create: jest.fn() },
  CampaignLead: { findOne: jest.fn() },
  CampaignSimulation: { findOne: jest.fn() },
  CampaignSimulationStep: { findOne: jest.fn() },
  CommunicationLog: { findOne: jest.fn() },
}));
jest.mock('../../services/activityService', () => ({ logActivity: jest.fn() }));
jest.mock('../../services/communicationLogService', () => ({ logCommunication: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/testing/campaignSimulator', () => ({ respondAsLead: jest.fn() }));
jest.mock('../../services/unsubscribeEnforcementService', () => ({ processOptOut: jest.fn() }));
jest.mock('../../models/ScheduledEmail', () => ({ __esModule: true, default: {} }));

import { handleTicketReplyEmail } from '../../services/workforce/ticketReplyService';
import { handleMandrillInbound } from '../mandrillWebhookController';

const INBOUND_URL = 'https://enterprise.colaberry.ai/api/webhook/mandrill/inbound';

function sign(key: string, params: Record<string, string>): string {
  let data = INBOUND_URL;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  return crypto.createHmac('sha1', key).update(data).digest('base64');
}

function call(body: Record<string, string>, signature: string) {
  const req: any = { body, headers: { 'x-mandrill-signature': signature }, protocol: 'https', get: () => 'enterprise.colaberry.ai', originalUrl: '/api/webhook/mandrill/inbound' };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() };
  return { req, res };
}

const body = {
  mandrill_events: JSON.stringify([{ event: 'inbound', msg: { email: 'ticket-11111111-1111-1111-1111-111111111111-a1b2c3d4@reply.colaberry.ai', from_email: 'ali@colaberry.com', subject: 'Re: x', text: 'Approved.' } }]),
};

beforeEach(() => jest.clearAllMocks());

describe('inbound signature key', () => {
  it('accepts a reply signed with the inbound webhook key', async () => {
    const { req, res } = call(body, sign('inbound-route-key', body));
    await handleMandrillInbound(req, res);
    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(handleTicketReplyEmail).toHaveBeenCalled();
  });
  it('rejects a reply signed with the outbound tracking key once the inbound key is set', async () => {
    const { req, res } = call(body, sign('outbound-tracking-key', body));
    await handleMandrillInbound(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(handleTicketReplyEmail).not.toHaveBeenCalled();
  });
});
