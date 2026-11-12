/**
 * MR1 defect 4, success metric: *"every outbound-capable site tool either calls `evaluateSend`
 * or no longer exists"*.
 *
 * ── WHAT WAS ACTUALLY THERE ─────────────────────────────────────────────────
 *
 * `send_sms_summary` and `initiate_voice_call` had **no consent check of any kind**: not
 * `evaluateSend`, not `checkLeadSendable`, not `assertConsentForSend`, not
 * `isSuppressedForChannel`, and for SMS not even the platform kill switch, which
 * `evaluateSend` reads first. `grep -c evaluateSend mayaToolsService.ts` returned 0.
 *
 * Nothing had to be built to fix it. `SendChannel` has always been
 * `'email' | 'sms' | 'voice'`, `SendRequest` has always carried `toPhone`, and
 * `consentService.ts:193-198` has always held the TCPA rule that voice or SMS without an
 * express basis is a **block**. These two tools simply walked around all of it, and the gate
 * has real data behind it: 297 phone consent rows across 150 subjects, with
 * `consent_enforcement` set to `enforce`.
 *
 * ── THE TWO CHANNELS DIVERGE ON ONE POINT, AND IT MATTERS ───────────────────
 *
 * Voice can honour a test-mode redirect, because `triggerVoiceCall` takes a destination. SMS
 * cannot: `sendSmsViaGhl` writes a custom field on a GoHighLevel CONTACT and a workflow we do
 * not own texts whatever number that contact holds, so there is nowhere to put the redirect.
 * Proceeding would text the real person while the platform believed it was in test mode, so the
 * SMS path refuses instead. That asymmetry is asserted here rather than left to be rediscovered.
 */
export {};

const mockEvaluateSend = jest.fn();
const mockSendSmsViaGhl = jest.fn(async () => ({ success: true }));
const mockTriggerVoiceCall = jest.fn(async () => ({ success: true, data: { call_id: 'sf-1' } }));
const mockActionLogCreate = jest.fn(async () => ({ id: 'aal-1' }));
const mockCallLogCreate = jest.fn(async () => ({ id: 'ccl-1' }));

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
  __esModule: true,
  default: {
    findOne: jest.fn(async () => null),
    create: (...a: unknown[]) => mockCallLogCreate(...(a as [])),
  },
}));
jest.mock('../../models/AdmissionsKnowledgeEntry', () => ({
  __esModule: true, default: { findAll: jest.fn(async () => []) },
}));
jest.mock('../../models/StrategyCall', () => ({ __esModule: true, default: {} }));
jest.mock('../communicationSafetyService', () => ({
  evaluateSend: (...a: unknown[]) => mockEvaluateSend(...(a as [])),
}));
jest.mock('../ghlService', () => ({
  syncNewLeadToGhl: jest.fn(),
  syncLeadToGhl: jest.fn(async () => ({ contactId: 'ghl-1', isTestMode: false })),
  sendSmsViaGhl: (...a: unknown[]) => mockSendSmsViaGhl(...(a as [])),
}));
jest.mock('../synthflowService', () => ({
  triggerVoiceCall: (...a: unknown[]) => mockTriggerVoiceCall(...(a as [])),
}));
jest.mock('../calendarService', () => ({ getAvailableSlots: jest.fn(), createBooking: jest.fn() }));
jest.mock('../calendarTarget', () => ({ admissionsCalendar: {} }));
jest.mock('../appointmentService', () => ({ createAppointment: jest.fn() }));
jest.mock('../emailService', () => ({ sendStrategyCallConfirmation: jest.fn() }));
jest.mock('../admissionsKnowledgeService', () => ({ findRelevantKnowledge: jest.fn() }));
jest.mock('../admissionsKnowledgeGate', () => ({
  gateKnowledgeEntries: jest.fn(() => ({ allowed: [], withheld: [] })),
}));
jest.mock('../mayaConversationSummaryService', () => ({
  generateConversationSummary: jest.fn(async () => ({ summary: 'a recap' })),
  buildSmsSummaryContent: jest.fn(() => 'recap body'),
}));
jest.mock('../mayaConversationIntelligenceService', () => ({ updateBookingState: jest.fn() }));
jest.mock('../admissionsPricing', () => ({ pricingPitchRule: () => 'Membership is monthly.' }));
jest.mock('../mayaCampaignRouter', () => ({
  addMayaInteractionTag: jest.fn(async () => undefined),
  routeLeadToCampaign: jest.fn(async () => undefined),
}));
jest.mock('../communicationLogService', () => ({ logCommunication: jest.fn(async () => undefined) }));
jest.mock('../settingsService', () => ({
  getTestOverrides: jest.fn(async () => ({ enabled: false, phone: null, email: null })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendSmsSummary, initiateVoiceCall } = require('../mayaToolsService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Lead, Visitor } = require('../../models');

const VISITOR = 'visitor-1';
const CONVO = 'convo-1';
const PHONE = '+15125551234';
const TEST_PHONE = '+15005550006';

const ALLOWED = { allowed: true, redirect: null, testMode: false, deliveryMode: 'live' };

let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockEvaluateSend.mockResolvedValue(ALLOWED);
  mockSendSmsViaGhl.mockResolvedValue({ success: true } as never);
  mockTriggerVoiceCall.mockResolvedValue({ success: true, data: { call_id: 'sf-1' } } as never);
  Visitor.findByPk.mockResolvedValue({ lead_id: 77 });
  Lead.findByPk.mockResolvedValue({
    id: 77, phone: PHONE, ghl_contact_id: 'ghl-1',
    getDataValue: (k: string) => (k === 'name' ? 'Dana Reyes' : undefined),
    update: jest.fn(async () => undefined),
  });
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { warnSpy.mockRestore(); logSpy.mockRestore(); });

function auditRow(actionType: string) {
  return mockActionLogCreate.mock.calls
    .map((c) => c[0] as { action_type?: string; status?: string; action_details?: Record<string, unknown> })
    .find((r) => r?.action_type === actionType);
}

describe('the gate is asked, with the right channel and source', () => {
  it('SMS asks on channel sms, as an agent, for the lead on file', async () => {
    await sendSmsSummary({}, VISITOR, CONVO);

    expect(mockEvaluateSend).toHaveBeenCalledTimes(1);
    expect(mockEvaluateSend.mock.calls[0][0]).toMatchObject({
      leadId: 77, channel: 'sms', toPhone: PHONE, source: 'agent',
    });
  });

  it('voice asks on channel voice, as an agent, for the number it was handed', async () => {
    await initiateVoiceCall({ phone: PHONE, name: 'Dana' }, VISITOR, CONVO);

    expect(mockEvaluateSend).toHaveBeenCalledTimes(1);
    expect(mockEvaluateSend.mock.calls[0][0]).toMatchObject({
      leadId: 77, channel: 'voice', toPhone: PHONE, source: 'agent',
    });
  });

  it('asks BEFORE the provider, not after', async () => {
    const order: string[] = [];
    mockEvaluateSend.mockImplementation(async () => { order.push('consent'); return ALLOWED; });
    mockTriggerVoiceCall.mockImplementation(async () => {
      order.push('provider');
      return { success: true, data: { call_id: 'sf-1' } };
    });

    await initiateVoiceCall({ phone: PHONE, name: 'Dana' }, VISITOR, CONVO);

    expect(order).toEqual(['consent', 'provider']);
  });
});

describe('a refusal stops the provider being called at all', () => {
  it('SMS: a blocked lead means no field write', async () => {
    mockEvaluateSend.mockResolvedValue({ ...ALLOWED, allowed: false, blockedReason: 'unsubscribed' });

    const res = await sendSmsSummary({}, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(mockSendSmsViaGhl).not.toHaveBeenCalled();
    expect(auditRow('sms_summary_sent')).toMatchObject({ status: 'denied' });
  });

  it('voice: a blocked lead means no dial', async () => {
    mockEvaluateSend.mockResolvedValue({ ...ALLOWED, allowed: false, blockedReason: 'unsubscribed' });

    const res = await initiateVoiceCall({ phone: PHONE, name: 'Dana' }, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(mockTriggerVoiceCall).not.toHaveBeenCalled();
    expect(mockCallLogCreate).not.toHaveBeenCalled();
    expect(auditRow('voice_call_initiated')).toMatchObject({ status: 'denied' });
  });

  it('the blocked reason is recorded for an operator but never shown to the visitor', async () => {
    // The number on a voice call is whatever the visitor typed, so it is not necessarily their
    // own record being described. Reading the reason back could disclose somebody else's.
    mockEvaluateSend.mockResolvedValue({
      ...ALLOWED, allowed: false, blockedReason: 'brand_preference_off',
    });

    const res = await initiateVoiceCall({ phone: PHONE, name: 'Dana' }, VISITOR, CONVO);

    expect(res.summary).not.toMatch(/brand_preference_off/);
    expect(auditRow('voice_call_initiated')?.action_details).toMatchObject({
      reason: 'brand_preference_off',
    });
    const logged = warnSpy.mock.calls.map((c) => String(c[0])).filter((s) => s.startsWith('{'))
      .map((s) => JSON.parse(s)).find((l) => l.event === 'maya_voice_blocked_by_consent');
    expect(logged).toBeDefined();
    expect(logged.context.reason).toBe('brand_preference_off');
  });

  it.each(['sms', 'voice'] as const)('%s: a gate that throws is not permission', async (ch) => {
    mockEvaluateSend.mockRejectedValue(new Error('settings unreachable'));

    const res = ch === 'sms'
      ? await sendSmsSummary({}, VISITOR, CONVO)
      : await initiateVoiceCall({ phone: PHONE, name: 'Dana' }, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(mockSendSmsViaGhl).not.toHaveBeenCalled();
    expect(mockTriggerVoiceCall).not.toHaveBeenCalled();
  });
});

describe('voice refuses when there is no record to check consent against', () => {
  it('no lead means no call, and the gate is not even consulted', async () => {
    // Deliberate behavior change. The number dialled is whatever the visitor typed, so with no
    // lead there is no consent record for anybody, and voice without an express basis is a
    // block under the rule the gate already enforces.
    Visitor.findByPk.mockResolvedValue(null);

    const res = await initiateVoiceCall({ phone: PHONE, name: 'Dana' }, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(res.summary).toMatch(/no contact record/i);
    expect(mockEvaluateSend).not.toHaveBeenCalled();
    expect(mockTriggerVoiceCall).not.toHaveBeenCalled();
    expect(mockCallLogCreate).not.toHaveBeenCalled();
  });
});

describe('the two channels diverge on a test-mode redirect, and both are honest', () => {
  it('voice dials the redirect number, and claims only that number', async () => {
    mockEvaluateSend.mockResolvedValue({
      ...ALLOWED, redirect: { phone: TEST_PHONE }, testMode: true, deliveryMode: 'test_redirect',
    });

    const res = await initiateVoiceCall({ phone: PHONE, name: 'Dana' }, VISITOR, CONVO);

    expect(res.success).toBe(true);
    expect((mockTriggerVoiceCall.mock.calls[0] as unknown as [{ phone: string }])[0].phone)
      .toBe(TEST_PHONE);
    expect(res.summary).toContain(TEST_PHONE);
    expect(res.summary).not.toContain(PHONE);
  });

  it('SMS refuses rather than texting the real person in test mode', async () => {
    // `sendSmsViaGhl` takes a contact id, not a number, so there is nowhere to apply a redirect.
    mockEvaluateSend.mockResolvedValue({
      ...ALLOWED, redirect: { phone: TEST_PHONE }, testMode: true, deliveryMode: 'test_redirect',
    });

    const res = await sendSmsSummary({}, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(mockSendSmsViaGhl).not.toHaveBeenCalled();
    expect(auditRow('sms_summary_sent')?.action_details).toMatchObject({
      error_class: 'RedirectUnsupported',
    });
  });
});

describe('an allowed send still works', () => {
  it('SMS proceeds and reports success', async () => {
    const res = await sendSmsSummary({}, VISITOR, CONVO);
    expect(res.success).toBe(true);
    expect(mockSendSmsViaGhl).toHaveBeenCalledTimes(1);
  });

  it('voice proceeds and reports success', async () => {
    const res = await initiateVoiceCall({ phone: PHONE, name: 'Dana' }, VISITOR, CONVO);
    expect(res.success).toBe(true);
    expect(mockTriggerVoiceCall).toHaveBeenCalledTimes(1);
  });
});
