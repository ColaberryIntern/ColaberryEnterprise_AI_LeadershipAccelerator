/**
 * Maya's SMS tool must not report a text it never sent (MR1, defect 4).
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * `sendSmsSummary` discarded the provider's return value: the line was a bare
 * `await sendSmsViaGhl(contactId, smsContent);` with nothing bound. `sendSmsViaGhl` ->
 * `ghlFetch` returns `{ success: false, error }` **without throwing** on any GoHighLevel
 * failure, so the surrounding `catch` never fired. Execution fell straight through to
 * `logAction(..., 'completed')` and a return of `"SMS summary sent to <phone>"`.
 *
 * Unlike the voice defect this one had not fired yet - production held zero `sms_summary_sent`
 * rows on 2026-11-12 - but the blast radius was already large. The silent branch is reachable
 * for any lead that already carries a `ghl_contact_id`, because such a lead skips the sync guard
 * above it: **8,123 leads carry one, and 2,458 of those also have a phone number.** And the
 * trigger is not a missing key, since `ghl_enabled` is `true` and `ghl_api_key` is present - it
 * is any GoHighLevel 4xx, 5xx or timeout.
 *
 * The tests are ordered by what the regression would cost: first that a rejection is reported as
 * one, then that the provider's error text does not reach the visitor, then that the working
 * path and all three pre-existing refusals are untouched.
 */
export {};

const mockSendSmsViaGhl = jest.fn();
const mockSyncLeadToGhl = jest.fn();
const mockActionLogCreate = jest.fn(async () => ({ id: 'aal-1' }));
const mockEvaluateSend = jest.fn();

jest.mock('../../models', () => ({
  Lead: { findByPk: jest.fn(), findOne: jest.fn() },
  Visitor: { findByPk: jest.fn() },
  ChatMessage: { findAll: jest.fn(async () => []) },
}));
jest.mock('../../models/AdmissionsActionLog', () => ({
  __esModule: true, default: { create: (...a: unknown[]) => mockActionLogCreate(...(a as [])) },
}));
jest.mock('../../models/AdmissionsMemory', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../models/CallContactLog', () => ({
  __esModule: true, default: { findOne: jest.fn(async () => null), create: jest.fn() },
}));
jest.mock('../../models/AdmissionsKnowledgeEntry', () => ({
  __esModule: true, default: { findAll: jest.fn(async () => []) },
}));
jest.mock('../../models/StrategyCall', () => ({ __esModule: true, default: {} }));
jest.mock('../ghlService', () => ({
  syncNewLeadToGhl: jest.fn(),
  syncLeadToGhl: (...a: unknown[]) => mockSyncLeadToGhl(...(a as [])),
  sendSmsViaGhl: (...a: unknown[]) => mockSendSmsViaGhl(...(a as [])),
}));
jest.mock('../synthflowService', () => ({ triggerVoiceCall: jest.fn() }));
jest.mock('../calendarService', () => ({ getAvailableSlots: jest.fn(), createBooking: jest.fn() }));
jest.mock('../calendarTarget', () => ({ admissionsCalendar: {} }));
jest.mock('../appointmentService', () => ({ createAppointment: jest.fn() }));
jest.mock('../emailService', () => ({ sendStrategyCallConfirmation: jest.fn() }));
jest.mock('../admissionsKnowledgeService', () => ({ findRelevantKnowledge: jest.fn() }));
jest.mock('../admissionsKnowledgeGate', () => ({
  gateKnowledgeEntries: jest.fn(() => ({ allowed: [], withheld: [] })),
}));
jest.mock('../mayaConversationSummaryService', () => ({
  generateConversationSummary: jest.fn(async () => ({ summary: 'we discussed the program' })),
  buildSmsSummaryContent: jest.fn(() => 'Here is your recap. Reply CALL to book.'),
}));
jest.mock('../mayaConversationIntelligenceService', () => ({ updateBookingState: jest.fn() }));
jest.mock('../admissionsPricing', () => ({ pricingPitchRule: () => 'Membership is monthly.' }));
jest.mock('../mayaCampaignRouter', () => ({
  addMayaInteractionTag: jest.fn(async () => undefined),
  routeLeadToCampaign: jest.fn(async () => undefined),
}));
jest.mock('../communicationLogService', () => ({ logCommunication: jest.fn(async () => undefined) }));
// The consent chokepoint. `outboundConsent` imports it dynamically, so mocking the module
// path is what intercepts it - there is no injected dep to pass.
jest.mock('../communicationSafetyService', () => ({
  evaluateSend: (...a: unknown[]) => mockEvaluateSend(...(a as [])),
}));
jest.mock('../settingsService', () => ({
  getTestOverrides: jest.fn(async () => ({ enabled: false, phone: null, email: null })),
}));

// Required through the ORIGINAL module path, not the new one, so this also proves the MR1 split
// kept the re-export intact. Every existing caller and test mock uses this path.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendSmsSummary } = require('../mayaToolsService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Lead, Visitor } = require('../../models');

const VISITOR = 'visitor-1';
const CONVO = 'convo-1';
const PHONE = '+15125551234';

/**
 * The exact shape of the old success summary. A rejection must never produce it.
 *
 * Deliberately NOT a bare `/\bsent\b/`: the honest refusal reads "The text could not be sent",
 * which contains the word. Matching on the vocabulary failed a correct refusal, which is a
 * useful reminder that the assertion has to test the CLAIM.
 */
const CLAIMS_IT_SENT = /^SMS summary sent to/i;

/** A refusal has to say so out loud, not merely omit the claim. */
const STATES_THE_FAILURE = /could not|not sent|unable/i;

let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockEvaluateSend.mockResolvedValue({
    allowed: true, redirect: null, testMode: false, deliveryMode: 'live',
  });
  mockActionLogCreate.mockResolvedValue({ id: 'aal-1' } as never);
  Visitor.findByPk.mockResolvedValue({ lead_id: 77 });
  Lead.findByPk.mockResolvedValue({
    id: 77,
    phone: PHONE,
    ghl_contact_id: 'ghl-123',
    getDataValue: (k: string) => (k === 'name' ? 'Dana Reyes' : undefined),
    update: jest.fn(async () => undefined),
  });
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => { warnSpy.mockRestore(); logSpy.mockRestore(); });

function loggedSmsStatus(): string | undefined {
  const row = mockActionLogCreate.mock.calls
    .map((c) => c[0] as { action_type?: string; status?: string })
    .find((r) => r?.action_type === 'sms_summary_sent');
  return row?.status;
}

describe('a provider rejection is reported as a failure', () => {
  it('returns failure and claims nothing when GoHighLevel rejects the write', async () => {
    mockSendSmsViaGhl.mockResolvedValue({ success: false, error: 'GHL API key not configured' });

    const res = await sendSmsSummary({}, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(res.summary).not.toMatch(CLAIMS_IT_SENT);
    expect(res.summary).toMatch(STATES_THE_FAILURE);
  });

  it('logs the action as failed, never completed', async () => {
    mockSendSmsViaGhl.mockResolvedValue({ success: false, error: 'upstream 503' });

    await sendSmsSummary({}, VISITOR, CONVO);

    expect(loggedSmsStatus()).toBe('failed');
    expect(loggedSmsStatus()).not.toBe('completed');
  });

  it('does not put the provider error text in the summary the model relays', async () => {
    // It can carry a URL, a contact id or an upstream payload.
    mockSendSmsViaGhl.mockResolvedValue({
      success: false, error: 'POST https://rest.gohighlevel.com/v1/contacts/abc123 -> 401',
    });

    const res = await sendSmsSummary({}, VISITOR, CONVO);

    expect(res.summary).not.toMatch(/gohighlevel|abc123|401/i);
  });

  it('keeps the provider error where an operator can find it', async () => {
    mockSendSmsViaGhl.mockResolvedValue({ success: false, error: 'upstream 503' });

    await sendSmsSummary({}, VISITOR, CONVO);

    const line = warnSpy.mock.calls.map((c) => String(c[0])).filter((s) => s.startsWith('{'))
      .map((s) => JSON.parse(s)).find((l) => l.event === 'maya_sms_not_sent');
    expect(line).toBeDefined();
    expect(line.outcome).toBe('failure');
    expect(line.error_class).toBe('SmsProviderRejected');
    expect(line.context.provider_error).toBe('upstream 503');
  });

  it('a missing or malformed provider answer is also a failure, not a send', async () => {
    for (const answer of [undefined, null, {}, { success: undefined }]) {
      jest.clearAllMocks();
      mockSendSmsViaGhl.mockResolvedValue(answer as never);
      const res = await sendSmsSummary({}, VISITOR, CONVO);
      expect(res.success).toBe(false);
      expect(res.summary).not.toMatch(CLAIMS_IT_SENT);
      expect(res.summary).toMatch(STATES_THE_FAILURE);
    }
  });

  it('a thrown provider error is still caught, and still leaks nothing', async () => {
    mockSendSmsViaGhl.mockRejectedValue(new Error('connect ETIMEDOUT 10.0.0.9:443'));

    const res = await sendSmsSummary({}, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(res.summary).not.toMatch(/ETIMEDOUT|10\.0\.0\.9/);
    expect(loggedSmsStatus()).toBe('failed');
  });
});

describe('the working path is untouched', () => {
  it('reports success and logs completed when the provider accepts', async () => {
    mockSendSmsViaGhl.mockResolvedValue({ success: true, data: { ok: true } });

    const res = await sendSmsSummary({}, VISITOR, CONVO);

    expect(res.success).toBe(true);
    expect(res.summary).toMatch(CLAIMS_IT_SENT);
    expect(loggedSmsStatus()).toBe('completed');
  });

  it('still refuses with no lead on file', async () => {
    Visitor.findByPk.mockResolvedValue(null);
    const res = await sendSmsSummary({}, VISITOR, CONVO);
    expect(res.success).toBe(false);
    expect(mockSendSmsViaGhl).not.toHaveBeenCalled();
  });

  it('still refuses with no phone number on file', async () => {
    Lead.findByPk.mockResolvedValue({
      id: 77, phone: null, ghl_contact_id: 'ghl-123',
      getDataValue: () => 'Dana', update: jest.fn(),
    });
    const res = await sendSmsSummary({}, VISITOR, CONVO);
    expect(res.success).toBe(false);
    expect(res.summary).toMatch(/phone/i);
    expect(mockSendSmsViaGhl).not.toHaveBeenCalled();
  });

  it('still refuses when no messaging contact can be established', async () => {
    Lead.findByPk.mockResolvedValue({
      id: 77, phone: PHONE, ghl_contact_id: null,
      getDataValue: () => 'Dana', update: jest.fn(async () => undefined),
    });
    mockSyncLeadToGhl.mockResolvedValue({ contactId: null, isTestMode: false });

    const res = await sendSmsSummary({}, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(mockSendSmsViaGhl).not.toHaveBeenCalled();
  });
});

describe('the refusal is observable and carries no contact detail', () => {
  it('never writes the phone number into a log line', async () => {
    mockSendSmsViaGhl.mockResolvedValue({ success: false, error: 'upstream 503' });

    await sendSmsSummary({}, VISITOR, CONVO);

    const everything = [...warnSpy.mock.calls, ...logSpy.mock.calls]
      .map((c) => String(c[0])).join('\n');
    expect(everything).not.toContain(PHONE);
    // and neither does the refusal audit row
    expect(JSON.stringify(mockActionLogCreate.mock.calls)).not.toContain(PHONE);
  });
});
