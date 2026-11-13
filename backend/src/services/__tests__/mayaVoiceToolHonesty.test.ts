/**
 * Maya's voice tool must not report a call that was never placed (MR1, defect 4).
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * This is not a hypothetical. Measured in production on 2026-11-12:
 * `admissions_action_logs` held exactly 2 `voice_call_initiated` rows, both `status='completed'`
 * (2026-10-24 and 2026-11-06), and `call_contact_logs` held 2 `pending` rows, **both with a null
 * `synthflow_call_id`**. A null provider id means the call never reached Synthflow. Two real
 * visitors were told "you should receive a call shortly" and nothing happened.
 *
 * The mechanism: `triggerVoiceCall` returns `{ success: true, data: { skipped: true, reason } }`
 * for six different reasons it did not dial, and the handler read `result.success` alone.
 * `ENABLE_VOICE_CALLS` is `false` in production, so EVERY attempt takes that branch.
 *
 * Four things each test here is defending, in order of how much damage the regression does:
 *
 *   1. **A skipped call is reported as a failure.** Nothing else matters if she still promises.
 *   2. **The kill switch stops the promise too, not just the dial.** `kill_switch_active` is one
 *      of the six skip reasons. A platform-wide stop that leaves Maya promising calls is the
 *      opposite of what the switch is for.
 *   3. **A not-placed attempt writes NO `CallContactLog` row.** The 24h dedup matches any row for
 *      the visitor regardless of `call_status`, so a phantom row blocked the next genuine attempt
 *      for a day.
 *   4. **The working path still works.** A fix that silently disables voice calling would pass
 *      tests 1 to 3 and be a worse outcome than the bug.
 */
export {};

// Each spy declares `...args: unknown[]` rather than taking none. With a zero-parameter
// implementation jest types `mock.calls` as an array of EMPTY TUPLES, so every
// `mock.calls[0][0]` is a compile error - which the main `tsc` run does not catch, because
// `tsconfig.json` excludes test files. Only the test-file typecheck ratchet sees it, and it
// caught nine of them across three files in this change.
const mockTriggerVoiceCall = jest.fn();
const mockCallLogCreate = jest.fn(async (..._a: unknown[]) => ({ id: 'ccl-1' }));
const mockCallLogFindOne = jest.fn(async (..._a: unknown[]) => null);
const mockActionLogCreate = jest.fn(async (..._a: unknown[]) => ({ id: 'aal-1' }));
const mockEvaluateSend = jest.fn();
const mockLogCommunication = jest.fn(async (..._a: unknown[]) => undefined);
const mockAddTag = jest.fn(async (..._a: unknown[]) => undefined);
const mockRouteCampaign = jest.fn(async (..._a: unknown[]) => undefined);

jest.mock('../../models', () => ({
  Lead: { findByPk: jest.fn(), findOne: jest.fn() },
  Visitor: { findByPk: jest.fn() },
  ChatMessage: { findAll: jest.fn(async (..._a: unknown[]) => []) },
}));
jest.mock('../../models/AdmissionsActionLog', () => ({
  __esModule: true, default: { create: (...a: unknown[]) => mockActionLogCreate(...a) },
}));
jest.mock('../../models/AdmissionsMemory', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../models/CallContactLog', () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => mockCallLogFindOne(...a),
    create: (...a: unknown[]) => mockCallLogCreate(...a),
  },
}));
jest.mock('../../models/AdmissionsKnowledgeEntry', () => ({
  __esModule: true, default: { findAll: jest.fn(async (..._a: unknown[]) => []) },
}));
jest.mock('../../models/StrategyCall', () => ({ __esModule: true, default: {} }));
jest.mock('../synthflowService', () => ({
  triggerVoiceCall: (...a: unknown[]) => mockTriggerVoiceCall(...a),
}));
jest.mock('../ghlService', () => ({
  syncNewLeadToGhl: jest.fn(), syncLeadToGhl: jest.fn(), sendSmsViaGhl: jest.fn(),
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
  generateConversationSummary: jest.fn(async (..._a: unknown[]) => ({ summary: 'a recap' })),
  buildSmsSummaryContent: jest.fn(() => 'sms body'),
}));
jest.mock('../mayaConversationIntelligenceService', () => ({ updateBookingState: jest.fn() }));
jest.mock('../admissionsPricing', () => ({ pricingPitchRule: () => 'Membership is a monthly figure.' }));
// Both of these are fired and `.catch`-ed by production code, so a bare jest.fn() returning
// undefined would throw inside the handler rather than exercise it.
jest.mock('../mayaCampaignRouter', () => ({
  addMayaInteractionTag: (...a: unknown[]) => mockAddTag(...a),
  routeLeadToCampaign: (...a: unknown[]) => mockRouteCampaign(...a),
}));
jest.mock('../communicationLogService', () => ({
  logCommunication: (...a: unknown[]) => mockLogCommunication(...a),
}));
// The consent chokepoint. `outboundConsent` imports it dynamically, so mocking the module
// path is what intercepts it - there is no injected dep to pass.
jest.mock('../communicationSafetyService', () => ({
  evaluateSend: (...a: unknown[]) => mockEvaluateSend(...a),
}));
jest.mock('../settingsService', () => ({
  getTestOverrides: jest.fn(async (..._a: unknown[]) => ({ enabled: false, phone: null, email: null })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initiateVoiceCall } = require('../mayaToolsService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Lead, Visitor } = require('../../models');

const VISITOR = 'visitor-1';
const CONVO = 'convo-1';
const PHONE = '+15125551234';
const ARGS = { phone: PHONE, name: 'Dana Reyes', context_summary: 'asked about the program' };

/** Every reason `triggerVoiceCall` declines to dial while still returning `success: true`. */
const SKIP_REASONS = [
  'kill_switch_active',
  'feature_disabled',
  'no_phone',
  // Found by a reviewer after the first six were enumerated: synthflowService.ts:222 raises it
  // once the number has been normalised. The handler always refused it correctly, because the
  // guard is keyed on data.skipped rather than on this list - but nothing pinned that, and the
  // fallback summary told the model to offer a callback to the same unusable number.
  'invalid_phone',
  'no_api_key',
  'no_agent_id',
  'no_prompt',
] as const;

/** A promise that a call is coming. If a refusal matches this, the bug is back. */
const PROMISES_A_CALL = /initiated|placing|should receive|on the way|calling you/i;

let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockEvaluateSend.mockResolvedValue({
    allowed: true, redirect: null, testMode: false, deliveryMode: 'live',
  });
  mockCallLogFindOne.mockResolvedValue(null);
  mockCallLogCreate.mockResolvedValue({ id: 'ccl-1' } as never);
  mockLogCommunication.mockResolvedValue(undefined as never);
  mockAddTag.mockResolvedValue(undefined as never);
  mockRouteCampaign.mockResolvedValue(undefined as never);
  Visitor.findByPk.mockResolvedValue({ lead_id: 77 });
  Lead.findByPk.mockResolvedValue({
    id: 77, company: 'Acme', email: 'dana@example.com',
    getDataValue: (k: string) => (k === 'name' ? 'Dana Reyes' : undefined),
  });
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  logSpy.mockRestore();
});

/** The status string handed to AdmissionsActionLog for the voice action. */
function loggedVoiceStatus(): string | undefined {
  const call = mockActionLogCreate.mock.calls
    .map((c) => c[0] as { action_type?: string; status?: string })
    .find((r) => r?.action_type === 'voice_call_initiated');
  return call?.status;
}

describe('a skipped call is a failure, not a success', () => {
  it.each(SKIP_REASONS)('reason %s reports failure and promises nothing', async (reason) => {
    mockTriggerVoiceCall.mockResolvedValue({ success: true, data: { skipped: true, reason } });

    const res = await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(res.summary).not.toMatch(PROMISES_A_CALL);
  });

  it.each(SKIP_REASONS)('reason %s writes no CallContactLog row, so a retry is not blocked', async (reason) => {
    // The 24h dedup matches ANY row for the visitor regardless of call_status, so a row written
    // here would block the next genuine attempt for a day. That is exactly what used to happen.
    mockTriggerVoiceCall.mockResolvedValue({ success: true, data: { skipped: true, reason } });

    await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(mockCallLogCreate).not.toHaveBeenCalled();
  });

  it.each(SKIP_REASONS)('reason %s neither tags the lead nor enrols it in a campaign', async (reason) => {
    mockTriggerVoiceCall.mockResolvedValue({ success: true, data: { skipped: true, reason } });

    await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(mockAddTag).not.toHaveBeenCalled();
    expect(mockRouteCampaign).not.toHaveBeenCalled();
  });

  it('logs the action as failed, never completed', async () => {
    mockTriggerVoiceCall.mockResolvedValue({
      success: true, data: { skipped: true, reason: 'feature_disabled' },
    });

    await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(loggedVoiceStatus()).toBe('failed');
    expect(loggedVoiceStatus()).not.toBe('completed');
  });

  it('writes no CommunicationLog row, because no communication occurred', async () => {
    mockTriggerVoiceCall.mockResolvedValue({
      success: true, data: { skipped: true, reason: 'feature_disabled' },
    });

    await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(mockLogCommunication).not.toHaveBeenCalled();
  });
});

describe('the kill switch stops the promise, not just the dial', () => {
  it('does not offer a call at all when outbound calling is stopped platform-wide', async () => {
    // This is the worst of the six: the emergency stop halted the dial and the old code still
    // told the visitor a call was coming.
    mockTriggerVoiceCall.mockResolvedValue({
      success: true, data: { skipped: true, reason: 'kill_switch_active' },
    });

    const res = await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(res.summary).toMatch(/stopped/i);
    expect(res.summary).not.toMatch(PROMISES_A_CALL);
    // and it must not route her to the callback queue either, since that is also outbound
    expect(res.summary).not.toMatch(/schedule_callback/);
  });

  it('every other skip reason names the alternative that actually works', async () => {
    // An honest refusal with no route forward is a worse visit than the lie it replaced.
    const OFFERS_CALLBACK = SKIP_REASONS.filter(
      (r) => r !== 'kill_switch_active' && r !== 'no_phone' && r !== 'invalid_phone',
    );
    for (const reason of OFFERS_CALLBACK) {
      jest.clearAllMocks();
      mockTriggerVoiceCall.mockResolvedValue({ success: true, data: { skipped: true, reason } });
      const res = await initiateVoiceCall(ARGS, VISITOR, CONVO);
      expect(res.summary).toMatch(/schedule_callback|booking calendar/);
    }
  });
});

describe('a provider rejection is also a failure', () => {
  it('reports failure and writes no row when the provider returns success: false', async () => {
    mockTriggerVoiceCall.mockResolvedValue({ success: false, error: 'upstream 503' });

    const res = await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(res.summary).not.toMatch(PROMISES_A_CALL);
    expect(mockCallLogCreate).not.toHaveBeenCalled();
    expect(loggedVoiceStatus()).toBe('failed');
  });

  it('does not leak the provider error text into the summary the model relays', async () => {
    mockTriggerVoiceCall.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.4:443'));

    const res = await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(res.summary).not.toMatch(/ECONNREFUSED|10\.0\.0\.4/);
  });
});

describe('accepted but untrackable is reported as unconfirmed, not as placed', () => {
  it('returns failure when the provider accepted the request but gave no call id', async () => {
    // The completion webhook matches on provider_message_id, so without one the call cannot be
    // tracked. A call MAY be ringing, so the only honest answer is that it is unconfirmed.
    mockTriggerVoiceCall.mockResolvedValue({ success: true, data: { status: 'queued' } });

    const res = await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(res.summary).toMatch(/could not be confirmed/i);
    expect(res.summary).not.toMatch(PROMISES_A_CALL);
  });

  it('still records the attempt, because a duplicate call is worse than a duplicate row', async () => {
    mockTriggerVoiceCall.mockResolvedValue({ success: true, data: { status: 'queued' } });

    await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(mockCallLogCreate).toHaveBeenCalledTimes(1);
    expect(mockCallLogCreate.mock.calls[0][0]).toMatchObject({ synthflow_call_id: null });
    expect(loggedVoiceStatus()).toBe('failed');
  });
});

describe('the working path is untouched', () => {
  const PLACED = { success: true, data: { call_id: 'sf-call-9' } };

  it('reports success and tells the visitor a call is coming', async () => {
    mockTriggerVoiceCall.mockResolvedValue(PLACED);

    const res = await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(res.success).toBe(true);
    expect(res.summary).toMatch(PROMISES_A_CALL);
  });

  it('records the call with the provider id, logs the communication, tags and enrols', async () => {
    mockTriggerVoiceCall.mockResolvedValue(PLACED);

    await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(mockCallLogCreate).toHaveBeenCalledTimes(1);
    expect(mockCallLogCreate.mock.calls[0][0]).toMatchObject({
      synthflow_call_id: 'sf-call-9', call_status: 'pending',
    });
    expect(mockLogCommunication).toHaveBeenCalledTimes(1);
    expect(mockLogCommunication.mock.calls[0][0]).toMatchObject({ provider_message_id: 'sf-call-9' });
    expect(mockAddTag).toHaveBeenCalledTimes(1);
    expect(mockRouteCampaign).toHaveBeenCalledTimes(1);
    expect(loggedVoiceStatus()).toBe('completed');
  });

  it('still refuses with no phone number, before the provider is called at all', async () => {
    const res = await initiateVoiceCall({ ...ARGS, phone: '' }, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(mockTriggerVoiceCall).not.toHaveBeenCalled();
  });

  it('still honours the 24 hour dedup', async () => {
    mockCallLogFindOne.mockResolvedValue({ id: 'ccl-old' } as never);

    const res = await initiateVoiceCall(ARGS, VISITOR, CONVO);

    expect(res.success).toBe(false);
    expect(res.summary).toMatch(/last 24 hours/i);
    expect(mockTriggerVoiceCall).not.toHaveBeenCalled();
  });
});

describe('the failure is observable, and carries no contact detail', () => {
  it('emits one structured JSON line with an event name and an error class', async () => {
    mockTriggerVoiceCall.mockResolvedValue({
      success: true, data: { skipped: true, reason: 'feature_disabled' },
    });

    await initiateVoiceCall(ARGS, VISITOR, CONVO);

    const lines = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.startsWith('{'))
      .map((s) => JSON.parse(s));
    const notPlaced = lines.find((l) => l.event === 'maya_voice_call_not_placed');

    expect(notPlaced).toBeDefined();
    expect(notPlaced.outcome).toBe('failure');
    expect(notPlaced.error_class).toBe('VoiceProviderSkipped');
    expect(notPlaced.level).toBe('warn');
    expect(notPlaced.service).toBe('maya-site-chat');
    expect(notPlaced.context.reason).toBe('feature_disabled');
  });

  it('never writes the phone number into a log line', async () => {
    // A log line is the easiest place for a contact detail to escape the trust boundary.
    mockTriggerVoiceCall.mockResolvedValue({
      success: true, data: { skipped: true, reason: 'feature_disabled' },
    });

    await initiateVoiceCall(ARGS, VISITOR, CONVO);

    const everything = [...warnSpy.mock.calls, ...logSpy.mock.calls].map((c) => String(c[0])).join('\n');
    expect(everything).not.toContain(PHONE);
    // and neither does the audit row for a refusal
    const audit = JSON.stringify(mockActionLogCreate.mock.calls);
    expect(audit).not.toContain(PHONE);
  });
});
