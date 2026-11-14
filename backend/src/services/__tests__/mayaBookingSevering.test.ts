const mockCreateBooking = jest.fn();
const mockSendConfirmation = jest.fn();
const mockSendSmsViaGhl = jest.fn();
const mockRouteLeadToCampaign = jest.fn();
const mockGetSetting = jest.fn();
const mockKillSwitch = jest.fn();

/**
 * T9 - BOOKING STILL WORKS. This is a severing, not a regression.
 *
 * -- THE CLAIM UNDER TEST --
 *
 * `schedule_strategy_call` reached a real person FOUR separate ways, at four call sites:
 *
 *   createBooking                  a Google Calendar event with the visitor as an attendee,
 *                                  plus a 60-minute email reminder Google sends itself
 *   sendStrategyCallConfirmation   a confirmation email
 *   sendSmsViaGhl                  writes `cory_sms_composed`, which TRIGGERS a GoHighLevel
 *                                  workflow whose content is configured outside this codebase
 *   routeLeadToCampaign(...)       fire-and-forget, error swallowed, into the cron chain that
 *     .catch(() => {})             composes bodies with AI at send time
 *
 * The plan audit's prescription was to default `bookStrategyCall` to off. That was NOT applied:
 * booking works today, a visitor who asked for a meeting is not Maya reaching out, and turning
 * off a working feature is a regression dressed as safety. The gate moved to the EFFECT instead,
 * and the auditor withdrew its prescription once it saw that.
 *
 * So the whole design rests on one assertion: the first two still happen, the last two do not.
 * That is what this file proves, and it is the single test that distinguishes this change from
 * having broken the feature.
 *
 * -- IT USES THE REAL MODES, NOT MOCKED ONES, AND THAT IS THE POINT --
 *
 * `resolveMayaMode` is NOT stubbed here. The kill switch reads false and the promotion record
 * reads empty, which is exactly production, so the capability states come from the real
 * `DEFAULT_STATES` and the real `REFUSED_CAPABILITIES`. A version of this test that stubbed the
 * modes would prove the seam routes correctly when told what to do; this one proves the
 * CONFIGURATION ACTUALLY SHIPPING produces the severing.
 */

jest.mock('../../models', () => ({
  Lead: { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  Visitor: { findByPk: jest.fn(async () => null) },
  ChatMessage: { findAll: jest.fn(async () => []) },
}));
jest.mock('../../models/AdmissionsActionLog', () => ({
  __esModule: true, default: { create: jest.fn(async () => ({})) },
}));
jest.mock('../../models/AdmissionsMemory', () => ({ __esModule: true, default: { findOne: jest.fn(async () => null) } }));
jest.mock('../../models/CallContactLog', () => ({
  __esModule: true, default: { findOne: jest.fn(async () => null), create: jest.fn(async () => ({})) },
}));
jest.mock('../../models/AdmissionsKnowledgeEntry', () => ({
  __esModule: true, default: { findAll: jest.fn(async () => []) },
}));
jest.mock('../../models/StrategyCall', () => ({
  __esModule: true, default: { findOne: jest.fn(async () => null), create: jest.fn(async () => ({})) },
}));

// The four providers. NONE of them is behind a stub that decides anything: each is a plain spy,
// so "was it called" is the only question this file asks of them.
jest.mock('../calendarService', () => ({
  getAvailableSlots: jest.fn(),
  createBooking: (...a: unknown[]) => mockCreateBooking(...a),
}));
jest.mock('../emailService', () => ({
  sendStrategyCallConfirmation: (...a: unknown[]) => mockSendConfirmation(...a),
  renderAdmissionsDocument: jest.fn(() => null),
}));
jest.mock('../ghlService', () => ({
  syncNewLeadToGhl: jest.fn(),
  syncLeadToGhl: jest.fn(async () => ({ contactId: 'ghl-1', isTestMode: false })),
  sendSmsViaGhl: (...a: unknown[]) => mockSendSmsViaGhl(...a),
}));
jest.mock('../mayaCampaignRouter', () => ({
  addMayaInteractionTag: jest.fn(async () => undefined),
  routeLeadToCampaign: (...a: unknown[]) => mockRouteLeadToCampaign(...a),
}));

jest.mock('../calendarTarget', () => ({
  admissionsCalendar: () => ({ kind: 'admissions', calendarId: 'cal-admissions', ownerEmail: null }),
}));
jest.mock('../appointmentService', () => ({ createAppointment: jest.fn(async () => ({})) }));
jest.mock('../synthflowService', () => ({ triggerVoiceCall: jest.fn() }));
jest.mock('../admissionsKnowledgeService', () => ({ findRelevantKnowledge: jest.fn() }));
jest.mock('../admissionsKnowledgeGate', () => ({ gateKnowledgeEntries: jest.fn(() => ({ allowed: [], withheld: [] })) }));
jest.mock('../mayaConversationSummaryService', () => ({
  generateConversationSummary: jest.fn(async () => ({ summary: 'a recap' })),
  buildSmsSummaryContent: jest.fn(() => 'recap body'),
}));
// MUST RESOLVE A PROMISE. The caller fires this and attaches `.catch`, so a bare `jest.fn()`
// returning undefined throws inside production code rather than testing it - and the throw
// surfaces as "Cannot read properties of undefined (reading 'catch')" from a line nowhere near
// the mock. `mayaSendDocumentGovernance.test.ts` carries the same note for the same reason.
jest.mock('../mayaConversationIntelligenceService', () => ({
  updateBookingState: jest.fn(async () => undefined),
}));
jest.mock('../admissionsPricing', () => ({ pricingPitchRule: () => 'Membership is monthly.' }));
jest.mock('../communicationLogService', () => ({ logCommunication: jest.fn(async () => undefined) }));
jest.mock('../communicationSafetyService', () => ({
  evaluateSend: jest.fn(async () => ({ allowed: true, redirect: null, testMode: false, deliveryMode: 'live' })),
}));

// PRODUCTION'S OWN ANSWERS, not stubs that decide the outcome:
//   kill switch  off   (so it does not short-circuit everything to `off`)
//   promotions   empty (so DEFAULT_STATES and REFUSED_CAPABILITIES decide)
jest.mock('../launchSafety', () => ({ isKillSwitchActiveStrict: () => mockKillSwitch() }));
jest.mock('../settingsService', () => ({
  getSetting: (...a: unknown[]) => mockGetSetting(...a),
  setSetting: jest.fn(async () => undefined),
  getTestOverrides: jest.fn(async () => ({})),
}));
jest.mock('../maya/mayaOutboundQueue', () => ({ enqueueOutbound: jest.fn(async () => ({ id: 'r1', idempotencyKey: 'k', deduped: false })) }));

import { scheduleStrategyCall } from '../mayaToolsService';
import { Lead } from '../../models';
import { DEFAULT_STATES, REFUSED_CAPABILITIES, resolveMayaMode } from '../maya/mayaPromotion';

const VISITOR = 'visitor-1';
const CONVO = 'convo-1';

const ARGS = {
  slot_start: '2026-12-01T18:00:00Z',
  name: 'Dana Whitfield',
  email: 'dana@example.com',
  phone: '+15550001111',
  company: 'Acme',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockKillSwitch.mockResolvedValue(false);
  mockGetSetting.mockResolvedValue(null);
  mockCreateBooking.mockResolvedValue({
    eventId: 'evt-1', meetLink: 'https://meet.example/abc', startTime: new Date(ARGS.slot_start),
  });
  mockSendConfirmation.mockResolvedValue('msg-1');
  mockSendSmsViaGhl.mockResolvedValue({ success: true });
  mockRouteLeadToCampaign.mockResolvedValue({ success: true, summary: 'enrolled' });
  (Lead.findOne as jest.Mock).mockResolvedValue({ id: 42, ghl_contact_id: 'ghl-contact-1' });
  (Lead.findByPk as jest.Mock).mockResolvedValue({ id: 42, ghl_contact_id: 'ghl-contact-1' });
});
afterEach(() => jest.restoreAllMocks());

describe('T9 the shipped configuration is the one being tested', () => {
  it('resolves bookStrategyCall LIVE with nothing promoted', async () => {
    expect(DEFAULT_STATES.bookStrategyCall).toBe('live');
    expect(await resolveMayaMode('bookStrategyCall')).toMatchObject({ mode: 'live' });
  });

  it.each(REFUSED_CAPABILITIES.map((c) => [c]))('resolves %s OFF, by refusal rather than by default', async (cap) => {
    expect(await resolveMayaMode(cap)).toMatchObject({ mode: 'off', reason: 'capability_refused' });
  });
});

describe('T9 booking keeps working', () => {
  it('writes the calendar event, with the visitor as the attendee', async () => {
    const out = await scheduleStrategyCall(ARGS, VISITOR, CONVO);
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
    expect(mockCreateBooking.mock.calls[0][0]).toMatchObject({
      name: 'Dana Whitfield', email: 'dana@example.com', slotStart: ARGS.slot_start,
    });
    // On the admissions calendar, as C90 requires.
    expect(mockCreateBooking.mock.calls[0][1]).toMatchObject({ calendarId: 'cal-admissions' });
    expect(out.success).toBe(true);
  });

  it('sends the confirmation email, carrying the Meet link', async () => {
    await scheduleStrategyCall(ARGS, VISITOR, CONVO);
    expect(mockSendConfirmation).toHaveBeenCalledTimes(1);
    expect(mockSendConfirmation.mock.calls[0][0]).toMatchObject({
      to: 'dana@example.com', meetLink: 'https://meet.example/abc',
    });
  });

  it('still tells the visitor the call is booked', async () => {
    const out = await scheduleStrategyCall(ARGS, VISITOR, CONVO);
    expect(out.summary).toMatch(/book|confirm|scheduled/i);
  });
});

describe('T9 and the two excluded side effects are severed', () => {
  it('fires NO GoHighLevel SMS, which was never a message we composed', async () => {
    // `sendSmsViaGhl` writes a record that triggers a GHL workflow. We never see what that
    // workflow sends, so there is no version of "hold it for Ali" available for it.
    await scheduleStrategyCall(ARGS, VISITOR, CONVO);
    expect(mockSendSmsViaGhl).not.toHaveBeenCalled();
  });

  it('enrols the lead in NO campaign, so the cron chain is never entered', async () => {
    // This was `routeLeadToCampaign(...).catch(() => {})`: fire-and-forget with the error
    // swallowed, straight into the chain that composes each body with AI at send time.
    await scheduleStrategyCall(ARGS, VISITOR, CONVO);
    expect(mockRouteLeadToCampaign).not.toHaveBeenCalled();
  });

  it('and does not fail the booking because of either refusal', async () => {
    // The refusals must be quiet. If a severed side effect made the whole tool report failure,
    // the visitor would be told their call was not booked when it was.
    const out = await scheduleStrategyCall(ARGS, VISITOR, CONVO);
    expect(out.success).toBe(true);
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  });
});

describe('T9 the kill switch still beats booking, which is the one thing above the exception', () => {
  it('writes no calendar event and sends no confirmation when the switch is on', async () => {
    mockKillSwitch.mockResolvedValue(true);
    await scheduleStrategyCall(ARGS, VISITOR, CONVO);
    expect(mockCreateBooking).not.toHaveBeenCalled();
    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });

  it('and an UNREADABLE switch also stops it, rather than assuming it is clear', async () => {
    mockKillSwitch.mockRejectedValue(new TypeError('settings unreachable'));
    await scheduleStrategyCall(ARGS, VISITOR, CONVO);
    expect(mockCreateBooking).not.toHaveBeenCalled();
    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });
});
