/**
 * OH1h (T2) + agent comms (2026-11-22) - delivering reply rows.
 *  - A Maya campaign reply ('maya_reply:') and an agent reply ('agent_reply:<slug>:') go out AS THE
 *    AGENT: From "Maya" <maya@colaberry.com>, Reply-To maya@reply.colaberry.ai, recorded with
 *    agent_name for the agent dashboard.
 *  - A Maya campaign reply whose identity cannot be resolved falls back to the old sender with her
 *    reply-to; an agent reply with no identity is refused (no other sender exists for it).
 *  - Every other row is delivered exactly as before (no reply-to, no record).
 */
const mockSend = jest.fn();
const mockAgentSend = jest.fn();
const mockLogComm = jest.fn();
const mockActivity = jest.fn();
const mockIdentityForSlug = jest.fn();
const mockResolveIdentity = jest.fn();
jest.mock('../../../config/env', () => ({ env: { mandrillInboundDomain: 'reply.colaberry.ai' } }));
jest.mock('../../emailService', () => ({ sendPreRenderedEmail: (...a: unknown[]) => mockSend(...a) }));
jest.mock('../../agents/email/agentEmailTransport', () => ({ sendAgentEmail: (...a: unknown[]) => mockAgentSend(...a) }));
jest.mock('../../agents/email/agentEmailIdentity', () => ({
  identityForSlug: (...a: unknown[]) => mockIdentityForSlug(...a),
  resolveAgentEmailIdentity: (...a: unknown[]) => mockResolveIdentity(...a),
}));
// A real mockLedger: the second call with the same businessEventId is 'skipped' (already sent), like the
// UNIQUE index in Postgres.
const mockLedger = new Set<string>();
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (k: { businessEventId: string }, fn: () => Promise<{ ok: boolean; messageId?: string }>) => {
    if (mockLedger.has(k.businessEventId)) return { outcome: 'skipped' };
    const r = await fn();
    if (r.ok) mockLedger.add(k.businessEventId);
    return r.ok ? { outcome: 'sent', messageId: r.messageId } : { outcome: 'failed', errorClass: (r as any).errorClass || 'X', error: (r as any).error || 'no' };
  },
}));
jest.mock('../../communicationLogService', () => ({ logCommunication: (...a: unknown[]) => mockLogComm(...a) }));
jest.mock('../../activityService', () => ({ logActivity: (...a: unknown[]) => mockActivity(...a) }));

import { deliverOutboundRow, isMayaReplyRow } from '../mayaOutboundDelivery';

const MAYA = { agentName: 'Maya', slug: 'maya', displayName: 'Maya', fromAddress: 'maya@colaberry.com', fromHeader: '"Maya" <maya@colaberry.com>', replyTo: 'maya@reply.colaberry.ai' };
const base = {
  id: 'row-1', channel: 'email', recipient_address: 'sam@example.com', subject: 'Re: See you Thursday',
  body: '<p>Yes, it is recorded.</p>', correlation_id: 'c-1', decided_by: 'ali@colaberry.com',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLedger.clear();
  mockSend.mockResolvedValue({ ok: true, messageId: 'mid-old' });
  mockAgentSend.mockResolvedValue({ ok: true, messageId: 'mid-1' });
  mockLogComm.mockResolvedValue({});
  mockActivity.mockResolvedValue({});
  mockResolveIdentity.mockResolvedValue(MAYA);
  mockIdentityForSlug.mockResolvedValue(MAYA);
});

it('a Maya campaign reply goes out AS Maya and is recorded on the lead with agent_name', async () => {
  const row = { ...base, composed_by: 'maya_reply:7', recipient_ref: 'lead:7' } as any;
  expect(isMayaReplyRow(row)).toBe(true);
  await expect(deliverOutboundRow(row)).resolves.toEqual({ providerRef: 'mid-1' });
  expect(mockResolveIdentity).toHaveBeenCalledWith('Maya');
  expect(mockAgentSend).toHaveBeenCalledWith({ identity: MAYA, to: 'sam@example.com', subject: 'Re: See you Thursday', html: '<p>Yes, it is recorded.</p>', inReplyTo: null });
  expect(mockSend).not.toHaveBeenCalled();
  expect(mockLogComm).toHaveBeenCalledWith(expect.objectContaining({
    lead_id: 7, direction: 'outbound', status: 'sent', provider_message_id: 'mid-1',
    metadata: expect.objectContaining({ maya_reply: true, agent_name: 'Maya', outbound_approval_id: 'row-1' }),
  }));
  expect(mockActivity).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 7, type: 'email_sent' }));
});

it('a Maya campaign reply with no resolvable identity falls back to the old sender with her reply-to', async () => {
  mockResolveIdentity.mockResolvedValue(null);
  const row = { ...base, composed_by: 'maya_reply:7', recipient_ref: 'lead:7' } as any;
  await expect(deliverOutboundRow(row)).resolves.toEqual({ providerRef: 'mid-old' });
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ replyTo: '"Maya at Colaberry" <maya@reply.colaberry.ai>' }));
});

it('an agent reply to a sender with no lead goes out as the agent and is recorded with agent_name, lead null', async () => {
  const row = { ...base, composed_by: 'agent_reply:maya:<m1@x.com>', recipient_ref: 'email:sam@example.com' } as any;
  await expect(deliverOutboundRow(row)).resolves.toEqual({ providerRef: 'mid-1' });
  expect(mockIdentityForSlug).toHaveBeenCalledWith('maya');
  expect(mockAgentSend.mock.calls[0][0].identity.fromHeader).toBe('"Maya" <maya@colaberry.com>');
  expect(mockAgentSend.mock.calls[0][0].identity.replyTo).toBe('maya@reply.colaberry.ai');
  expect(mockAgentSend.mock.calls[0][0].inReplyTo).toBe('<m1@x.com>');
  expect(mockIdentityForSlug).toHaveBeenCalledTimes(1); // resolved once, reused for the record
  expect(mockLogComm).toHaveBeenCalledWith(expect.objectContaining({
    lead_id: null, from_address: 'maya@colaberry.com', provider_message_id: 'mid-1',
    metadata: expect.objectContaining({ agent_name: 'Maya', agent_reply: true, outbound_approval_id: 'row-1' }),
  }));
  expect(mockActivity).not.toHaveBeenCalled();
});

it('an agent reply whose agent has no identity is refused, never sent as someone else', async () => {
  mockIdentityForSlug.mockResolvedValue(null);
  const row = { ...base, composed_by: 'agent_reply:ghost:<m1@x.com>', recipient_ref: 'email:sam@example.com' } as any;
  await expect(deliverOutboundRow(row)).rejects.toThrow(/ContractViolation/);
  expect(mockSend).not.toHaveBeenCalled();
  expect(mockAgentSend).not.toHaveBeenCalled();
});

it('a recording failure never turns a delivered message into a failed one', async () => {
  mockLogComm.mockRejectedValue(new Error('db'));
  for (const composed_by of ['maya_reply:7', 'agent_reply:maya:<m1@x.com>']) {
    const row = { ...base, id: `row-${composed_by}`, composed_by, recipient_ref: 'lead:7' } as any;
    await expect(deliverOutboundRow(row)).resolves.toEqual({ providerRef: 'mid-1' });
  }
});

it('any other row is delivered exactly as before: no reply-to, nothing recorded', async () => {
  const row = { ...base, composed_by: 'maya_email:explorer_welcome', recipient_ref: 'enr-1' } as any;
  await deliverOutboundRow(row);
  expect(mockSend.mock.calls[0][0]).not.toHaveProperty('replyTo');
  expect(mockAgentSend).not.toHaveBeenCalled();
  expect(mockLogComm).not.toHaveBeenCalled();
});

it('a failed send records nothing and throws', async () => {
  mockAgentSend.mockResolvedValue({ ok: false, error: 'rejected', errorClass: 'ProviderRejected' });
  const row = { ...base, composed_by: 'maya_reply:7', recipient_ref: 'lead:7' } as any;
  await expect(deliverOutboundRow(row)).rejects.toThrow();
  expect(mockLogComm).not.toHaveBeenCalled();
});

it('approving twice delivers once: the second is settled from the mockLedger, nothing sent or recorded again', async () => {
  for (const [composed_by, ref] of [['agent_reply:maya:<m1@x.com>', 'email:sam@example.com'], ['maya_reply:7', 'lead:7']]) {
    jest.clearAllMocks();
    mockAgentSend.mockResolvedValue({ ok: true, messageId: 'mid-1' });
    mockResolveIdentity.mockResolvedValue(MAYA);
    mockIdentityForSlug.mockResolvedValue(MAYA);
    const row = { ...base, id: `row-${composed_by}`, composed_by, recipient_ref: ref } as any;
    await expect(deliverOutboundRow(row)).resolves.toEqual({ providerRef: 'mid-1' });
    await expect(deliverOutboundRow(row)).resolves.toEqual({ providerRef: null });
    expect(mockAgentSend).toHaveBeenCalledTimes(1);
    expect(mockLogComm).toHaveBeenCalledTimes(1);
  }
});

it('nothing after a delivered agent reply can fail it, even if the identity lookup would now fail', async () => {
  mockIdentityForSlug.mockResolvedValueOnce(MAYA).mockRejectedValue(new Error('db down'));
  mockLogComm.mockRejectedValue(new Error('db down'));
  const row = { ...base, composed_by: 'agent_reply:maya:<m1@x.com>', recipient_ref: 'email:sam@example.com' } as any;
  await expect(deliverOutboundRow(row)).resolves.toEqual({ providerRef: 'mid-1' });
});
