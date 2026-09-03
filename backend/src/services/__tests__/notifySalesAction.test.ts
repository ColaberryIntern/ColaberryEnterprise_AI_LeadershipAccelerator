const mockSendNewLeadAlert = jest.fn();
const mockFindOne = jest.fn();
const mockLogCommunication = jest.fn();
const mockLogActivity = jest.fn();

jest.mock('../emailService', () => ({ sendNewLeadAlert: mockSendNewLeadAlert }));
jest.mock('../communicationLogService', () => ({ logCommunication: mockLogCommunication }));
jest.mock('../activityService', () => ({ logActivity: mockLogActivity }));
jest.mock('../../models', () => ({
  Campaign: {},
  CommunicationLog: { findOne: (...a: any[]) => mockFindOne(...a) },
}));

import { ACTION_HANDLERS } from '../routingActionsService';

/**
 * The honesty contract of `notify_sales`.
 *
 * This handler previously wrote an Activity row and returned `ok: true` while sending
 * nothing. That is worse than not existing: a missing handler is an absence somebody
 * notices, but a handler returning `ok` is a positive signal that is false, and every
 * dashboard and operator reading routing outcomes believed it.
 *
 * So these tests are almost entirely about the FALSE cases. "It sends when it can" is the
 * easy half.
 */

const ctx = () => ({
  lead: {
    id: 24880, name: 'Dana Whitfield', email: 'dana@northgate.example',
    company: 'Northgate Transit', phone: null, title: null,
    message: 'Riders cannot see arrival times.', source: 'ai-flotation',
  },
  source_slug: 'ai-flotation',
  entry_slug: 'workflow_intake',
  raw_payload_id: 'raw-1',
  normalized: {},
});

const notifySales = ACTION_HANDLERS.notify_sales;

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOne.mockResolvedValue(null);
  mockLogCommunication.mockResolvedValue({});
  mockLogActivity.mockResolvedValue({});
});

describe('notify_sales', () => {
  it('reports ok when the alert actually went out', async () => {
    mockSendNewLeadAlert.mockResolvedValue({ sent: true, messageId: 'msg-1', to: 'ali@colaberry.com' });

    const result = await notifySales({ type: 'notify_sales' }, ctx() as any);

    expect(result).toEqual({ ok: true, detail: { channel: 'email', sent: true, to: 'ali@colaberry.com', message_id: 'msg-1' } });
    expect(mockSendNewLeadAlert).toHaveBeenCalledTimes(1);
  });

  it('reports FAILURE, with the reason, when nothing was sent', async () => {
    // The whole point. The old handler returned ok:true here.
    mockSendNewLeadAlert.mockResolvedValue({ sent: false, reason: 'smtp_not_configured' });

    const result = await notifySales({ type: 'notify_sales' }, ctx() as any);

    expect(result).toEqual({ ok: false, error: 'smtp_not_configured' });
  });

  it('reports failure when there is nobody configured to tell', async () => {
    mockSendNewLeadAlert.mockResolvedValue({ sent: false, reason: 'no_recipient_configured' });
    expect(await notifySales({ type: 'notify_sales' }, ctx() as any))
      .toEqual({ ok: false, error: 'no_recipient_configured' });
  });

  it('reports failure when the send threw', async () => {
    mockSendNewLeadAlert.mockResolvedValue({ sent: false, reason: 'send_failed:TimeoutError' });
    expect(await notifySales({ type: 'notify_sales' }, ctx() as any))
      .toEqual({ ok: false, error: 'send_failed:TimeoutError' });
  });

  it('treats an already-notified lead as ok, not as a failure', async () => {
    // The one non-send that is a correct outcome: the human was told the first time.
    // Raising a failure alarm on every replay would train people to ignore the alarm.
    mockFindOne.mockResolvedValue({ id: 'existing' });
    mockSendNewLeadAlert.mockResolvedValue({ sent: false, reason: 'already_notified' });

    const result = await notifySales({ type: 'notify_sales' }, ctx() as any);

    expect(result).toEqual({ ok: true, detail: { channel: 'email', sent: false, reason: 'already_notified' } });
  });

  it('passes the already-notified fact to the sender, read from the audit log', async () => {
    // Keyed on the audit log rather than memory, so a restart cannot re-send.
    mockFindOne.mockResolvedValue({ id: 'existing' });
    mockSendNewLeadAlert.mockResolvedValue({ sent: false, reason: 'already_notified' });

    await notifySales({ type: 'notify_sales' }, ctx() as any);

    expect(mockSendNewLeadAlert).toHaveBeenCalledWith(expect.objectContaining({ alreadyNotified: true }));
  });

  describe("carrying the prospect's own words", () => {
    // Found in production, not in review. Lead 24920 arrived through the live form with a
    // written message, and the alert said "They did not write a message." The ingest
    // normalizer files free-text under metadata.message and leaves the lead column empty,
    // so reading only ctx.lead.message drops the most useful line in the email.
    const withMessage = (leadMessage: any, normalized: Record<string, any>) => ({
      ...ctx(),
      lead: { ...ctx().lead, message: leadMessage },
      normalized,
    });

    it('prefers the message on the lead when it is there', async () => {
      mockSendNewLeadAlert.mockResolvedValue({ sent: true, to: 'a@b.test' });
      await notifySales({ type: 'notify_sales' }, withMessage('on the lead', { message: 'normalized' }) as any);
      expect(mockSendNewLeadAlert).toHaveBeenCalledWith(
        expect.objectContaining({ lead: expect.objectContaining({ message: 'on the lead' }) }),
      );
    });

    it('falls back to the normalized message', async () => {
      mockSendNewLeadAlert.mockResolvedValue({ sent: true, to: 'a@b.test' });
      await notifySales({ type: 'notify_sales' }, withMessage('', { message: 'normalized words' }) as any);
      expect(mockSendNewLeadAlert).toHaveBeenCalledWith(
        expect.objectContaining({ lead: expect.objectContaining({ message: 'normalized words' }) }),
      );
    });

    it('falls back to normalized.metadata.message, which is where the form actually puts it', async () => {
      mockSendNewLeadAlert.mockResolvedValue({ sent: true, to: 'a@b.test' });
      await notifySales(
        { type: 'notify_sales' },
        withMessage('', { message: '', metadata: { message: 'what they typed' } }) as any,
      );
      expect(mockSendNewLeadAlert).toHaveBeenCalledWith(
        expect.objectContaining({ lead: expect.objectContaining({ message: 'what they typed' }) }),
      );
    });

    it('does not invent a message when there genuinely is none', async () => {
      mockSendNewLeadAlert.mockResolvedValue({ sent: true, to: 'a@b.test' });
      await notifySales({ type: 'notify_sales' }, withMessage('', { message: '', metadata: {} }) as any);
      const sent = mockSendNewLeadAlert.mock.calls[0][0];
      expect(sent.lead.message).toBeFalsy();
    });
  });

  it('refuses a channel it cannot actually send to', async () => {
    // Slack is V2 and does not exist. Claiming to have sent to it would be the original
    // defect wearing a different label.
    const result = await notifySales({ type: 'notify_sales', channel: 'slack' }, ctx() as any);

    expect(result).toEqual({ ok: false, error: 'unsupported_channel:slack' });
    expect(mockSendNewLeadAlert).not.toHaveBeenCalled();
  });

  it('lets a routing rule direct its own recipient and convert link', async () => {
    mockSendNewLeadAlert.mockResolvedValue({ sent: true, messageId: 'm', to: 'build@aiflotation.com' });

    await notifySales(
      { type: 'notify_sales', to: 'build@aiflotation.com', convert_url: 'https://x.test/c/24880' },
      ctx() as any,
    );

    expect(mockSendNewLeadAlert).toHaveBeenCalledWith(expect.objectContaining({
      recipients: 'build@aiflotation.com',
      convertUrl: 'https://x.test/c/24880',
    }));
  });

  it('records the outcome either way', async () => {
    mockSendNewLeadAlert.mockResolvedValue({ sent: false, reason: 'smtp_not_configured' });
    await notifySales({ type: 'notify_sales' }, ctx() as any);

    expect(mockLogCommunication).toHaveBeenCalledWith(expect.objectContaining({
      status: 'blocked', error_message: 'smtp_not_configured',
    }));
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('NOT sent'),
    }));
  });

  it('still reports a delivered alert when the audit write fails', async () => {
    // A failed log must not turn a delivered alert into a reported failure.
    mockSendNewLeadAlert.mockResolvedValue({ sent: true, messageId: 'm', to: 'a@b.test' });
    mockLogCommunication.mockRejectedValue(new Error('db down'));

    const result = await notifySales({ type: 'notify_sales' }, ctx() as any);

    expect(result).toMatchObject({ ok: true });
  });
});
