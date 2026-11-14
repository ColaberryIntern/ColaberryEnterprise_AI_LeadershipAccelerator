const mockResolveMode = jest.fn();
const mockCreateBooking = jest.fn();
const mockSendConfirmation = jest.fn();
const mockSendSms = jest.fn();
const mockRouteCampaign = jest.fn();
const mockRender = jest.fn();
const mockEnqueue = jest.fn();

jest.mock('../mayaPromotion', () => ({
  ...jest.requireActual('../mayaPromotion'),
  resolveMayaMode: (...a: unknown[]) => mockResolveMode(...a),
}));
jest.mock('../../calendarService', () => ({ createBooking: (...a: unknown[]) => mockCreateBooking(...a) }));
jest.mock('../../emailService', () => ({
  sendStrategyCallConfirmation: (...a: unknown[]) => mockSendConfirmation(...a),
  renderAdmissionsDocument: (...a: unknown[]) => mockRender(...a),
}));
jest.mock('../../ghlService', () => ({ sendSmsViaGhl: (...a: unknown[]) => mockSendSms(...a) }));
jest.mock('../../mayaCampaignRouter', () => ({ routeLeadToCampaign: (...a: unknown[]) => mockRouteCampaign(...a) }));
jest.mock('../mayaOutboundQueue', () => ({ enqueueOutbound: (...a: unknown[]) => mockEnqueue(...a) }));

import {
  bookCalendarEvent, enrolLeadInCampaign, queueAdmissionsDocument, sendBookingConfirmation,
  sendSmsToContact,
} from '../deliverOrQueue';

/**
 * T4(b) - the seam's own behaviour, exercised against the REAL module.
 *
 * -- WHY THIS FILE EXISTS, WHICH IS WORTH RECORDING --
 *
 * It was written because a mutation SURVIVED. The seam's SMS path was changed to throw when
 * `sendSmsViaGhl` reports a failure by return value, and the mutation that removed that throw
 * was aimed at `mayaSmsToolHonesty.test.ts` - which mocks the seam. Eleven tests passed against
 * a broken seam, and the instrument, not the code, was what failed.
 *
 * The gap it exposed was real: every suite that touches these effects stubs them, so nothing
 * executed the live branch. This file does.
 */

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockResolveMode.mockResolvedValue({ mode: 'live', reason: 'test' });
  mockCreateBooking.mockResolvedValue({ eventId: 'e1', meetLink: 'https://meet.example/x', startTime: new Date() });
  mockSendConfirmation.mockResolvedValue('msg-1');
  mockSendSms.mockResolvedValue({ success: true });
  mockRouteCampaign.mockResolvedValue({ success: true, summary: 'enrolled' });
  mockRender.mockReturnValue({ subject: 'Your Program Overview', html: '<p>real bytes</p>' });
  mockEnqueue.mockResolvedValue({ id: 'row-1', idempotencyKey: 'k1', deduped: false });
});
afterEach(() => jest.restoreAllMocks());

const asMode = (mode: string) => mockResolveMode.mockResolvedValue({ mode, reason: 'test' });

const booking = () => bookCalendarEvent({
  name: 'Dana', email: 'dana@example.com', company: 'Acme', phone: '555',
  slotStart: '2026-12-01T18:00:00Z', timezone: 'America/Chicago',
  calendar: { kind: 'admissions', calendarId: 'cal-1', ownerEmail: null },
});

describe('T4(b) off means the provider is never called', () => {
  it.each([
    ['bookCalendarEvent', () => booking(), () => mockCreateBooking],
    ['sendBookingConfirmation', () => sendBookingConfirmation({ to: 'd@e.com', name: 'Dana', scheduledAt: new Date(), timezone: 'America/Chicago', meetLink: '' }), () => mockSendConfirmation],
    ['sendSmsToContact', () => sendSmsToContact('c1', 'hello'), () => mockSendSms],
    ['enrolLeadInCampaign', () => enrolLeadInCampaign(42, 'general', 'v1', 'c1'), () => mockRouteCampaign],
  ] as Array<[string, () => Promise<{ outcome: string }>, () => jest.Mock]>)(
    '%s refuses and touches nothing',
    async (_name, run, provider) => {
      asMode('off');
      const result = await run();
      expect(result.outcome).toBe('refused');
      expect(provider()).not.toHaveBeenCalled();
    },
  );
});

describe('T4(b) shadow composes and delivers nothing', () => {
  it('reaches no provider and queues nothing', async () => {
    asMode('shadow');
    const result = await sendSmsToContact('c1', 'hello');
    expect(result.outcome).toBe('shadowed');
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe('T4(b) live delivers, and a provider rejection is NOT a delivery', () => {
  it('books the calendar event and returns it', async () => {
    const result = await booking();
    expect(result.outcome).toBe('delivered');
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
    expect(result.value).toMatchObject({ eventId: 'e1' });
  });

  it('sends the booking confirmation', async () => {
    const result = await sendBookingConfirmation({
      to: 'd@e.com', name: 'Dana', scheduledAt: new Date(), timezone: 'America/Chicago', meetLink: '',
    });
    expect(result.outcome).toBe('delivered');
    expect(mockSendConfirmation).toHaveBeenCalledTimes(1);
  });

  it('sends the SMS when the provider accepts it', async () => {
    const result = await sendSmsToContact('c1', 'hello');
    expect(result.outcome).toBe('delivered');
    expect(mockSendSms).toHaveBeenCalledWith('c1', 'hello');
  });

  it('THE MUTATION THAT SURVIVED - a {success:false} RETURN is a failure, not a send', async () => {
    // `sendSmsViaGhl` does not throw on a GoHighLevel rejection; it returns `{ success: false,
    // error }`. `smsTool.ts` carries a long comment about the defect that caused once already:
    // the rejection was logged as a completed send and the visitor was told it went. If this
    // test ever reports `delivered`, that defect is back.
    mockSendSms.mockResolvedValue({ success: false, error: 'upstream 503' });
    const result = await sendSmsToContact('c1', 'hello');
    expect(result.outcome).toBe('failed');
    // The provider's reason reaches the operator...
    expect(result.detail).toContain('upstream 503');
    // ...and never the person.
    expect(result.message).not.toContain('503');
    expect(result.message).not.toMatch(/sent/i);
  });

  it('a thrown provider error is a failure too, with its reason kept for the operator', async () => {
    mockCreateBooking.mockRejectedValue(new Error('calendar unreachable'));
    const result = await booking();
    expect(result.outcome).toBe('failed');
    expect(result.detail).toContain('calendar unreachable');
    expect(result.message).not.toContain('calendar unreachable');
  });
});

describe('T4(b) review queues the RENDERED bytes', () => {
  it('stores what the renderer produced, not a summary of it', async () => {
    asMode('review');
    const result = await queueAdmissionsDocument({
      to: 'dana@example.com', name: 'Dana', documentType: 'program_overview',
      documentUrl: 'https://x/y.pdf', recipientRef: 'lead:42',
      correlationId: 'c1', visitorId: 'v1',
    });
    expect(result.outcome).toBe('queued');
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      body: '<p>real bytes</p>',
      subject: 'Your Program Overview',
      recipientRef: 'lead:42',
      capability: 'sendDocument',
      idempotencyKey: 'maya-doc-program_overview-v1',
    }));
  });

  it('tells the person a human checks it, rather than implying it was sent', async () => {
    asMode('review');
    const result = await queueAdmissionsDocument({
      to: 'dana@example.com', name: 'Dana', documentType: 'program_overview',
      documentUrl: 'https://x/y.pdf', recipientRef: 'lead:42', correlationId: 'c1', visitorId: 'v1',
    });
    expect(result.message).toMatch(/checks every message before it goes out/i);
    expect(result.message).not.toMatch(/\bsent\b/i);
  });

  it('refuses rather than queueing an empty row when there is no document', async () => {
    asMode('review');
    mockRender.mockReturnValue(null);
    const result = await queueAdmissionsDocument({
      to: 'dana@example.com', name: 'Dana', documentType: 'program_overview',
      recipientRef: 'lead:42', correlationId: 'c1', visitorId: 'v1',
    });
    expect(result.outcome).toBe('refused');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
