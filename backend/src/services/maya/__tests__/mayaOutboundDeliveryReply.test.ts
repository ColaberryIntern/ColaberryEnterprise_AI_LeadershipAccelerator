/**
 * OH1h (T2) - delivering a Maya REPLY row: it carries Maya's reply-to on the inbound domain and is recorded on the
 * lead (communication log + activity). Every other row is delivered exactly as before (no reply-to, no record).
 */
const mockSend = jest.fn();
const mockLogComm = jest.fn();
const mockActivity = jest.fn();
jest.mock('../../../config/env', () => ({ env: { mandrillInboundDomain: 'reply.colaberry.ai' } }));
jest.mock('../../emailService', () => ({ sendPreRenderedEmail: (...a: unknown[]) => mockSend(...a) }));
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (_k: unknown, fn: () => Promise<{ ok: boolean; messageId?: string }>) => {
    const r = await fn();
    return r.ok ? { outcome: 'sent', messageId: r.messageId } : { outcome: 'failed', errorClass: 'X', error: 'no' };
  },
}));
jest.mock('../../communicationLogService', () => ({ logCommunication: (...a: unknown[]) => mockLogComm(...a) }));
jest.mock('../../activityService', () => ({ logActivity: (...a: unknown[]) => mockActivity(...a) }));

import { deliverOutboundRow, isMayaReplyRow } from '../mayaOutboundDelivery';

const base = {
  id: 'row-1', channel: 'email', recipient_address: 'sam@example.com', subject: 'Re: See you Thursday',
  body: '<p>Yes, it is recorded.</p>', correlation_id: 'c-1', decided_by: 'ali@colaberry.com',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockResolvedValue({ ok: true, messageId: 'mid-1' });
  mockLogComm.mockResolvedValue({});
  mockActivity.mockResolvedValue({});
});

it('a reply row gets Maya\'s reply-to and is recorded on the lead', async () => {
  const row = { ...base, composed_by: 'maya_reply:7', recipient_ref: 'lead:7' } as any;
  expect(isMayaReplyRow(row)).toBe(true);
  await expect(deliverOutboundRow(row)).resolves.toEqual({ providerRef: 'mid-1' });
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ replyTo: '"Maya at Colaberry" <maya@reply.colaberry.ai>' }));
  expect(mockLogComm).toHaveBeenCalledWith(expect.objectContaining({
    lead_id: 7, direction: 'outbound', status: 'sent', provider_message_id: 'mid-1',
    metadata: expect.objectContaining({ maya_reply: true, outbound_approval_id: 'row-1' }),
  }));
  expect(mockActivity).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 7, type: 'email_sent' }));
});

it('a recording failure never turns a delivered message into a failed one', async () => {
  mockLogComm.mockRejectedValue(new Error('db'));
  const row = { ...base, composed_by: 'maya_reply:7', recipient_ref: 'lead:7' } as any;
  await expect(deliverOutboundRow(row)).resolves.toEqual({ providerRef: 'mid-1' });
});

it('any other row is delivered exactly as before: no reply-to, nothing recorded', async () => {
  const row = { ...base, composed_by: 'maya_email:explorer_welcome', recipient_ref: 'enr-1' } as any;
  await deliverOutboundRow(row);
  expect(mockSend.mock.calls[0][0]).not.toHaveProperty('replyTo');
  expect(mockLogComm).not.toHaveBeenCalled();
});

it('a failed send records nothing and throws', async () => {
  mockSend.mockResolvedValue({ ok: false, error: 'rejected', errorClass: 'ProviderRejected' });
  const row = { ...base, composed_by: 'maya_reply:7', recipient_ref: 'lead:7' } as any;
  await expect(deliverOutboundRow(row)).rejects.toThrow();
  expect(mockLogComm).not.toHaveBeenCalled();
});
