/**
 * ghlConversationLogService — logs outbound campaign emails into a GHL
 * contact's Conversations feed (InternalComment write, v2 API), per Kes's
 * explicit spec for the Valentine Obiora / alumni win-back GHL gap.
 *
 * Covers: disabled/not-configured skip, idempotent dedupe on an
 * already-logged CommunicationLog row, self-heal contact resolution when
 * ghl_contact_id is missing, a hard failure (alertable, not silent) when no
 * contact can be resolved at all, and that a GHL outage never throws —
 * callers use this fire-and-forget and must never see an unhandled
 * rejection block/delay the email send it's attached to.
 */
jest.mock('../settingsService', () => ({ getSetting: jest.fn() }));
jest.mock('../ghlService', () => ({ syncLeadToGhl: jest.fn() }));
jest.mock('../../models', () => ({
  Lead: { findByPk: jest.fn() },
  CommunicationLog: { findByPk: jest.fn() },
}));
jest.mock('../aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

import { logEmailConversationToGhl } from '../ghlConversationLogService';
import { getSetting } from '../settingsService';
import { syncLeadToGhl } from '../ghlService';
import { Lead, CommunicationLog } from '../../models';

const mockGetSetting = getSetting as jest.Mock;
const mockSyncLeadToGhl = syncLeadToGhl as jest.Mock;
const mockLeadFindByPk = Lead.findByPk as jest.Mock;
const mockCommLogFindByPk = CommunicationLog.findByPk as jest.Mock;

function mockResponse(status: number, body: any) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const BASE_PARAMS = {
  leadId: 42,
  communicationLogId: 'comm-log-1',
  subject: 'Last Chance to Enroll in the AI Program, Valentine',
  htmlBody: '<p>Hi Valentine, enrollment is closing soon.</p>',
  campaignName: 'Alumni Win-Back — Group A',
  sentAt: new Date('2026-07-31T17:15:00Z'),
};

describe('logEmailConversationToGhl', () => {
  const originalFetch = global.fetch;
  const originalEnvKey = process.env.GHL_CONVERSATIONS_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    // Tests must be hermetic regardless of what's in the developer's real
    // .env — resolveGhlConversationsApiKey() falls back to this env var,
    // so a real local key would otherwise silently defeat the
    // not-configured / not-yet-resolved-contact assertions below.
    delete process.env.GHL_CONVERSATIONS_API_KEY;
  });

  afterAll(() => {
    if (originalEnvKey === undefined) delete process.env.GHL_CONVERSATIONS_API_KEY;
    else process.env.GHL_CONVERSATIONS_API_KEY = originalEnvKey;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('boundary: skipped when ghl_conversation_log_enabled is off (no network call)', async () => {
    mockGetSetting.mockResolvedValueOnce(false); // ghl_conversation_log_enabled
    const mockFetch = jest.fn();
    global.fetch = mockFetch as any;

    const result = await logEmailConversationToGhl(BASE_PARAMS);

    expect(result).toEqual({ logged: false, skipped: 'disabled' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('boundary: skipped when enabled but no conversations API key is configured', async () => {
    mockGetSetting.mockResolvedValueOnce(true).mockResolvedValueOnce(''); // enabled, key
    const result = await logEmailConversationToGhl(BASE_PARAMS);
    expect(result).toEqual({ logged: false, skipped: 'not_configured' });
  });

  it('idempotency: skipped when the CommunicationLog row was already logged', async () => {
    mockGetSetting.mockResolvedValueOnce(true).mockResolvedValueOnce('test-key');
    mockCommLogFindByPk.mockResolvedValue({ metadata: { ghl_conversation_logged: true } });

    const result = await logEmailConversationToGhl(BASE_PARAMS);

    expect(result).toEqual({ logged: false, skipped: 'already_logged' });
  });

  it('happy path: lead already has a GHL contact — writes InternalComment and marks the log row', async () => {
    mockGetSetting.mockResolvedValueOnce(true).mockResolvedValueOnce('test-key');
    const commLogUpdate = jest.fn().mockResolvedValue(undefined);
    mockCommLogFindByPk.mockResolvedValue({ metadata: null, update: commLogUpdate });
    mockLeadFindByPk.mockResolvedValue({ id: 42, ghl_contact_id: 'ghl-contact-123' });
    const mockFetch = jest.fn().mockResolvedValue(mockResponse(200, { id: 'msg-1' }));
    global.fetch = mockFetch as any;

    const result = await logEmailConversationToGhl(BASE_PARAMS);

    expect(result).toEqual({ logged: true });
    expect(mockSyncLeadToGhl).not.toHaveBeenCalled(); // already had a contact — no self-heal needed
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://services.leadconnectorhq.com/conversations/messages');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ contactId: 'ghl-contact-123', type: 'InternalComment' });
    expect(body.message).toContain('Subject: Last Chance to Enroll in the AI Program, Valentine');
    expect(commLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ ghl_conversation_logged: true }) })
    );
  });

  it('self-heal: lead has no GHL contact yet — syncs to GHL first, then logs', async () => {
    mockGetSetting.mockResolvedValueOnce(true).mockResolvedValueOnce('test-key');
    mockCommLogFindByPk.mockResolvedValue({ metadata: null, update: jest.fn().mockResolvedValue(undefined) });
    mockLeadFindByPk.mockResolvedValue({ id: 42, ghl_contact_id: null });
    mockSyncLeadToGhl.mockResolvedValue({ contactId: 'ghl-contact-456', isTestMode: false });
    global.fetch = jest.fn().mockResolvedValue(mockResponse(200, { id: 'msg-2' })) as any;

    const result = await logEmailConversationToGhl(BASE_PARAMS);

    expect(mockSyncLeadToGhl).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), undefined, false, true);
    expect(result).toEqual({ logged: true });
  });

  it('failure path: no resolvable GHL contact is a hard, alertable failure — not a silent skip', async () => {
    mockGetSetting.mockResolvedValueOnce(true).mockResolvedValueOnce('test-key');
    mockCommLogFindByPk.mockResolvedValue({ metadata: null, update: jest.fn() });
    mockLeadFindByPk.mockResolvedValue({ id: 42, ghl_contact_id: null });
    mockSyncLeadToGhl.mockResolvedValue({ contactId: null, isTestMode: false, error: 'not found' });
    const mockFetch = jest.fn();
    global.fetch = mockFetch as any;

    const result = await logEmailConversationToGhl(BASE_PARAMS);

    expect(result).toEqual({ logged: false, error: 'contact_unresolved' });
    expect(mockFetch).not.toHaveBeenCalled(); // never attempts a write with no contact id
  });

  it('failure path: a GHL outage (persistent 500s) resolves cleanly with an error, never throws', async () => {
    mockGetSetting.mockResolvedValueOnce(true).mockResolvedValueOnce('test-key');
    const commLogUpdate = jest.fn();
    mockCommLogFindByPk.mockResolvedValue({ metadata: null, update: commLogUpdate });
    mockLeadFindByPk.mockResolvedValue({ id: 42, ghl_contact_id: 'ghl-contact-123' });
    global.fetch = jest.fn().mockResolvedValue(mockResponse(500, { message: 'server error' })) as any;

    await expect(logEmailConversationToGhl(BASE_PARAMS)).resolves.toMatchObject({ logged: false });
    expect(commLogUpdate).not.toHaveBeenCalled(); // not marked logged — a real failure, not swallowed
  }, 10000);
});
