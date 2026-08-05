/**
 * handleMandrillInbound's new ticket-reply branch — verifies the security properties this
 * change adds: a ticket-<id>@ recipient only ever reaches ticketReplyService with a REAL,
 * cryptographically valid Mandrill signature (computed here with the actual HMAC-SHA1
 * algorithm, not mocked, so this proves the real verifyMandrillSignature logic works against
 * the URL this handler actually derives — not just that some check ran) — and that a wrong
 * signature is rejected before ticketReplyService is ever called, regardless of allowlist.
 * Also confirms the branch is scoped: non-ticket-addressed mail falls through unaffected.
 */
import crypto from 'crypto';

jest.mock('../../config/env', () => ({
  env: {
    mandrillWebhookKey: 'test-webhook-key',
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
import { Lead } from '../../models';
import { handleMandrillInbound } from '../mandrillWebhookController';

const ticketReplyMock = handleTicketReplyEmail as jest.Mock;
const leadFindOne = Lead.findOne as jest.Mock;

const WEBHOOK_KEY = 'test-webhook-key';
const INBOUND_URL = 'https://enterprise.colaberry.ai/api/webhook/mandrill/inbound';

/** Computes a REAL Mandrill-style signature so the "valid signature" test exercises the
 *  actual verification algorithm, not a mocked stand-in for it. */
function realMandrillSignature(url: string, params: Record<string, string>): string {
  let signedData = url;
  for (const key of Object.keys(params).sort()) signedData += key + params[key];
  return crypto.createHmac('sha1', WEBHOOK_KEY).update(signedData).digest('base64');
}

function mockReqRes(body: Record<string, string>, signature: string) {
  const req: any = {
    body,
    headers: { 'x-mandrill-signature': signature },
    protocol: 'https',
    get: () => 'enterprise.colaberry.ai',
    originalUrl: '/api/webhook/mandrill/inbound',
  };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() };
  return { req, res };
}

function ticketReplyEvent(overrides: Record<string, any> = {}) {
  return JSON.stringify([{
    event: 'inbound',
    msg: { email: 'ticket-11111111-1111-1111-1111-111111111111-a1b2c3d4@reply.colaberry.ai', from_email: 'ali@colaberry.com', subject: 'Re: [Approval needed] X', text: 'Approved.', ...overrides },
  }]);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ticket-reply routing', () => {
  it('a valid signature + ticket-addressed reply is delegated to ticketReplyService with the ticket ID and reply token parsed from the recipient', async () => {
    const body = { mandrill_events: ticketReplyEvent() };
    const signature = realMandrillSignature(INBOUND_URL, body);
    const { req, res } = mockReqRes(body, signature);

    await handleMandrillInbound(req, res);

    expect(ticketReplyMock).toHaveBeenCalledWith({
      ticketId: '11111111-1111-1111-1111-111111111111',
      replyToken: 'a1b2c3d4',
      fromEmail: 'ali@colaberry.com',
      rawBody: 'Approved.',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('an invalid signature is rejected before ticketReplyService is ever called, even for an otherwise well-formed ticket reply', async () => {
    const body = { mandrill_events: ticketReplyEvent() };
    const { req, res } = mockReqRes(body, 'not-a-real-signature');

    await handleMandrillInbound(req, res);

    expect(ticketReplyMock).not.toHaveBeenCalled();
  });

  it('mail not addressed to a ticket-<id>@ local part falls through to the existing Lead pipeline, untouched by this change', async () => {
    const body = { mandrill_events: ticketReplyEvent({ email: 'someone@reply.colaberry.ai' }) };
    const signature = realMandrillSignature(INBOUND_URL, body);
    const { req, res } = mockReqRes(body, signature);

    await handleMandrillInbound(req, res);

    expect(ticketReplyMock).not.toHaveBeenCalled();
    expect(leadFindOne).toHaveBeenCalledWith({ where: { email: 'ali@colaberry.com' } });
  });

  it('a malformed ticket ID in the local part (not a UUID) does not match and falls through to the Lead pipeline', async () => {
    const body = { mandrill_events: ticketReplyEvent({ email: 'ticket-not-a-uuid@reply.colaberry.ai' }) };
    const signature = realMandrillSignature(INBOUND_URL, body);
    const { req, res } = mockReqRes(body, signature);

    await handleMandrillInbound(req, res);

    expect(ticketReplyMock).not.toHaveBeenCalled();
  });

  it('a valid ticket UUID with no reply-token suffix does not match — the token is required at the routing level, not just inside the service', async () => {
    const body = { mandrill_events: ticketReplyEvent({ email: 'ticket-11111111-1111-1111-1111-111111111111@reply.colaberry.ai' }) };
    const signature = realMandrillSignature(INBOUND_URL, body);
    const { req, res } = mockReqRes(body, signature);

    await handleMandrillInbound(req, res);

    expect(ticketReplyMock).not.toHaveBeenCalled();
  });
});

describe('Lead-reply signature enforcement (P0-7 hardening)', () => {
  // Previously an invalid Mandrill signature was rejected only on the ticket-<id>@ path;
  // ordinary Lead-reply mail (auto-unsubscribe, AI auto-reply send, voice call to Ali) was
  // processed even when the signature check failed. These prove the whole request is now
  // rejected before ANY inbound event is processed, regardless of which path it would take.
  it('an invalid signature on non-ticket-addressed mail is rejected before the Lead pipeline runs', async () => {
    const body = { mandrill_events: ticketReplyEvent({ email: 'someone@reply.colaberry.ai' }) };
    const { req, res } = mockReqRes(body, 'not-a-real-signature');

    await handleMandrillInbound(req, res);

    expect(leadFindOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('a valid signature on non-ticket-addressed mail still reaches the Lead pipeline', async () => {
    const body = { mandrill_events: ticketReplyEvent({ email: 'someone@reply.colaberry.ai' }) };
    const signature = realMandrillSignature(INBOUND_URL, body);
    const { req, res } = mockReqRes(body, signature);

    await handleMandrillInbound(req, res);

    expect(leadFindOne).toHaveBeenCalledWith({ where: { email: 'ali@colaberry.com' } });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
