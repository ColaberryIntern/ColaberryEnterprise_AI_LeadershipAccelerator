/**
 * OH1o: an approved Explorer Growth email goes through the one delivery function, and is refused
 * there - before the provider is touched - when any guard blocks it.
 */
const mockSendOnce = jest.fn();
const mockBlock = jest.fn();
const mockRecord = jest.fn();

jest.mock('../../email/idempotentSend', () => ({ sendOnce: (...a: any[]) => mockSendOnce(...a) }));
jest.mock('../../emailService', () => ({ sendPreRenderedEmail: jest.fn(async () => ({ ok: true, messageId: 'm1' })) }));
jest.mock('../../../config/env', () => ({ env: { mandrillInboundDomain: 'reply.colaberry.ai' } }));
jest.mock('../../explorerGrowth/send/explorerSendGuards', () => {
  class ExplorerSendBlockedError extends Error {
    constructor(public block: string) { super(`Explorer email not sent: ${block}`); this.name = `ExplorerSendBlocked:${block}`; }
  }
  return {
    ExplorerSendBlockedError,
    explorerSendBlock: (...a: any[]) => mockBlock(...a),
    recordExplorerSend: (...a: any[]) => mockRecord(...a),
  };
});

import { deliverOutboundRow } from '../mayaOutboundDelivery';

const row: any = {
  id: 'q1', channel: 'email', composed_by: 'explorer_growth:d1', recipient_ref: 'lead:42', recipient_address: 'dana@example.com',
  correlation_id: 'se1', subject: 'S', body: '<p>Hi</p>', decided_by: 'ali@colaberry.com',
};

beforeEach(() => { mockSendOnce.mockReset(); mockBlock.mockReset(); mockRecord.mockReset(); });

describe('deliverOutboundRow for an Explorer Growth email', () => {
  it('refuses before the provider when a guard blocks, naming the guard', async () => {
    mockBlock.mockResolvedValue('within_24h');
    await expect(deliverOutboundRow(row)).rejects.toMatchObject({ name: 'ExplorerSendBlocked:within_24h' });
    expect(mockSendOnce).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
  });
  it('sends when every guard passes, with replies threading back to Maya, and records the send', async () => {
    mockBlock.mockResolvedValue(null);
    mockSendOnce.mockImplementation(async (_m: any, fn: () => Promise<any>) => { await fn(); return { outcome: 'sent', messageId: 'm1' }; });
    await deliverOutboundRow(row);
    expect(mockSendOnce).toHaveBeenCalledTimes(1);
    const { sendPreRenderedEmail } = jest.requireMock('../../emailService');
    expect(sendPreRenderedEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: '"Maya at Colaberry" <maya@reply.colaberry.ai>' }));
    expect(mockRecord).toHaveBeenCalledWith(row, 'm1');
  });
  it('a non-Explorer row never consults the Explorer guards', async () => {
    mockSendOnce.mockResolvedValue({ outcome: 'sent', messageId: 'm2' });
    await deliverOutboundRow({ ...row, composed_by: 'site_chat:sendDocument' });
    expect(mockBlock).not.toHaveBeenCalled();
  });
});
