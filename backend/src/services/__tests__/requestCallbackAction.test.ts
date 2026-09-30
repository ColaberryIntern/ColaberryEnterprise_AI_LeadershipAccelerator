const mockRequestInstantCallback = jest.fn();
const mockLogActivity = jest.fn();

jest.mock('../callbackRequestService', () => ({ requestInstantCallback: mockRequestInstantCallback }));
jest.mock('../activityService', () => ({ logActivity: mockLogActivity }));
jest.mock('../emailService', () => ({ sendNewLeadAlert: jest.fn() }));
jest.mock('../communicationLogService', () => ({ logCommunication: jest.fn() }));
jest.mock('../../models', () => ({ Campaign: {}, CommunicationLog: { findOne: jest.fn() } }));

import { ACTION_HANDLERS } from '../routingActionsService';

/**
 * "Call me now", triggered from a public form.
 *
 * This action exists because the public site cannot reach the service-token callback
 * endpoint, and putting that token in a browser would let anyone on the internet make our
 * number dial strangers. So the call rides the ingest path that is already rate limited.
 *
 * The contract is the same one notify_sales earned the hard way: dial, or say why not. A
 * `skipped` from the voice layer is NOT a success.
 */
const requestCallback = ACTION_HANDLERS.request_callback;

const ctx = (over: Record<string, any> = {}) => ({
  lead: {
    id: 24930, name: 'Dana Whitfield', email: 'dana@northgate.example',
    phone: '+15550100', company: 'Northgate Transit', role: 'Head of Operations',
    message: 'Dispatchers rebuild the same spreadsheet every morning.',
    ...(over.lead || {}),
  },
  source_slug: 'ai-flotation',
  entry_slug: 'call_me_now',
  raw_payload_id: 'raw-99',
  normalized: over.normalized || {},
});

beforeEach(() => {
  jest.clearAllMocks();
  mockLogActivity.mockResolvedValue({});
});

describe('request_callback', () => {
  it('reports ok when the call is placed', async () => {
    mockRequestInstantCallback.mockResolvedValue({ status: 'call_initiated', call_id: 'c-1', deduped: false });

    const result = await requestCallback({ type: 'request_callback' }, ctx() as any);

    expect(result).toEqual({ ok: true, detail: { status: 'call_initiated', call_id: 'c-1', deduped: false } });
  });

  it('treats a deduplicated call as ok', async () => {
    // They pressed twice inside the window. One call is the right answer, not a failure.
    mockRequestInstantCallback.mockResolvedValue({ status: 'deduplicated', call_id: 'c-1', deduped: true });

    expect(await requestCallback({ type: 'request_callback' }, ctx() as any))
      .toMatchObject({ ok: true, detail: { status: 'deduplicated' } });
  });

  it('reports FAILURE when the voice layer skipped', async () => {
    // The important one. `skipped` means no phone rang - feature disabled, no agent
    // configured, or no prompt built. Reporting that as ok is the defect this whole
    // file was rewritten to remove.
    mockRequestInstantCallback.mockResolvedValue({ status: 'skipped', reason: 'no_prompt' });

    expect(await requestCallback({ type: 'request_callback' }, ctx() as any))
      .toEqual({ ok: false, error: 'skipped:no_prompt' });
  });

  it('reports failure when the safety pipeline blocked it', async () => {
    mockRequestInstantCallback.mockResolvedValue({ status: 'blocked', reason: 'unsubscribed' });
    expect(await requestCallback({ type: 'request_callback' }, ctx() as any))
      .toEqual({ ok: false, error: 'blocked:unsubscribed' });
  });

  it('reports failure when the provider failed', async () => {
    mockRequestInstantCallback.mockResolvedValue({ status: 'failed', reason: 'upstream_500' });
    expect(await requestCallback({ type: 'request_callback' }, ctx() as any))
      .toEqual({ ok: false, error: 'failed:upstream_500' });
  });

  describe('what it refuses to attempt', () => {
    it('refuses without a phone number', async () => {
      const result = await requestCallback({ type: 'request_callback' }, ctx({ lead: { phone: '' } }) as any);
      expect(result).toEqual({ ok: false, error: 'no_phone' });
      expect(mockRequestInstantCallback).not.toHaveBeenCalled();
    });

    it('refuses without an email, which is how the lead is resolved', async () => {
      const result = await requestCallback({ type: 'request_callback' }, ctx({ lead: { email: '  ' } }) as any);
      expect(result).toEqual({ ok: false, error: 'no_email' });
      expect(mockRequestInstantCallback).not.toHaveBeenCalled();
    });
  });

  it('passes the source through, because it picks the agent AND the prompt', async () => {
    mockRequestInstantCallback.mockResolvedValue({ status: 'call_initiated', call_id: 'c' });
    await requestCallback({ type: 'request_callback' }, ctx() as any);

    expect(mockRequestInstantCallback).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'ai-flotation' }),
      'raw-99',
    );
  });

  it("carries their own words, including from where the normalizer actually puts them", async () => {
    mockRequestInstantCallback.mockResolvedValue({ status: 'call_initiated', call_id: 'c' });
    await requestCallback(
      { type: 'request_callback' },
      ctx({ lead: { message: '' }, normalized: { metadata: { message: 'what they typed' } } }) as any,
    );

    expect(mockRequestInstantCallback).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'what they typed' }),
      expect.anything(),
    );
  });

  it('takes the phone from the normalized payload when the lead column is empty', async () => {
    mockRequestInstantCallback.mockResolvedValue({ status: 'call_initiated', call_id: 'c' });
    await requestCallback(
      { type: 'request_callback' },
      ctx({ lead: { phone: '' }, normalized: { phone: '+15550199' } }) as any,
    );

    expect(mockRequestInstantCallback).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+15550199' }),
      expect.anything(),
    );
  });
});
