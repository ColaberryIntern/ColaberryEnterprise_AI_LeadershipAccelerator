jest.mock('../../services/enrollmentService', () => ({ createExplorerEnrollment: jest.fn() }));
jest.mock('../../services/openHouseEventService', () => ({ getCurrentOpenHouseEvent: jest.fn() }));
jest.mock('../../services/openHouseRegistrationStore', () => ({ recordOpenHouseRegistration: jest.fn() }));
jest.mock('../../services/consent/captureSignupConsent', () => ({
  captureSignupConsent: jest.fn(),
  SIGNUP_CONSENT_TEXT: 'consent wording',
}));

import { Request, Response } from 'express';
import { handlePublicOpenHouseSignup } from '../openHouseController';
import { createExplorerEnrollment } from '../../services/enrollmentService';
import { getCurrentOpenHouseEvent } from '../../services/openHouseEventService';
import { recordOpenHouseRegistration } from '../../services/openHouseRegistrationStore';
import { captureSignupConsent } from '../../services/consent/captureSignupConsent';

const mkEnrollment = createExplorerEnrollment as unknown as jest.Mock;
const mkEvent = getCurrentOpenHouseEvent as unknown as jest.Mock;
const mkRecord = recordOpenHouseRegistration as unknown as jest.Mock;
const mkConsent = captureSignupConsent as unknown as jest.Mock;

const EVENT = {
  announced: true,
  event_id: '2004289439668',
  date_label: 'Thu, Nov 19, 2026',
  time_label: '6:30 PM CT',
  format_label: 'Live online event',
  seats_remaining: 394,
};

const req = (body: unknown): Request =>
  ({ body, ip: '203.0.113.7', get: (h: string) => (h.toLowerCase() === 'user-agent' ? 'TestAgent/1.0' : undefined) } as unknown as Request);

const res = () => {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r as Response & { status: jest.Mock; json: jest.Mock };
};

const body = (over: Record<string, unknown> = {}) => ({ name: 'Ada L', email: 'ada@example.com', ...over });

describe('handlePublicOpenHouseSignup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mkEnrollment.mockResolvedValue({ enrollment: { id: 'enr-1' }, created: true, cohort_id: 'c1' });
    mkEvent.mockResolvedValue(EVENT);
    mkRecord.mockResolvedValue({ created: true, registration_id: 'reg-1' });
    mkConsent.mockResolvedValue(undefined);
  });
  afterEach(() => (process.stdout.write as unknown as jest.Mock).mockRestore());

  it('creates the account, records the registration and echoes the event back', async () => {
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, jest.fn());

    expect(r.status).toHaveBeenCalledWith(201);
    const payload = r.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.created).toBe(true);
    expect(payload.registered).toBe(true);
    expect(payload.event).toEqual({
      event_id: '2004289439668',
      date_label: 'Thu, Nov 19, 2026',
      time_label: '6:30 PM CT',
      format_label: 'Live online event',
      seats_remaining: 394,
    });
    expect(mkRecord).toHaveBeenCalledWith(expect.objectContaining({
      eventId: '2004289439668', email: 'ada@example.com', enrollmentId: 'enr-1', source: 'landing_page',
    }));
  });

  it('never uses the word barred for a licensed career school', async () => {
    // 40 TAC 807.172(d): no "free" in advertising without written TWC approval.
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, jest.fn());
    expect(JSON.stringify(r.json.mock.calls[0][0])).not.toMatch(/\bfree\b/i);
  });

  it('answers 200, not 201, for someone who already had an account', async () => {
    mkEnrollment.mockResolvedValue({ enrollment: { id: 'enr-1' }, created: false, cohort_id: 'c1' });
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json.mock.calls[0][0].created).toBe(false);
  });

  it('still registers an existing account holder — they are new to THIS event', async () => {
    mkEnrollment.mockResolvedValue({ enrollment: { id: 'enr-1' }, created: false, cohort_id: 'c1' });
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, jest.fn());
    expect(mkRecord).toHaveBeenCalled();
    expect(r.json.mock.calls[0][0].registered).toBe(true);
  });

  it('reports registered:true for a repeat signup the store declined', async () => {
    // created:false from the store means "already on the list", which is still
    // registered as far as the visitor is concerned.
    mkRecord.mockResolvedValue({ created: false, registration_id: null });
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, jest.fn());
    expect(r.json.mock.calls[0][0].registered).toBe(true);
  });

  it('still creates the account when no Open House is announced, and does not claim a seat', async () => {
    mkEvent.mockResolvedValue({ announced: false });
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, jest.fn());

    expect(mkEnrollment).toHaveBeenCalled();
    expect(mkRecord).not.toHaveBeenCalled();
    const payload = r.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.registered).toBe(false);
    expect(payload.event).toBeNull();
  });

  it('still creates the account when CCPP is unreachable', async () => {
    mkEvent.mockRejectedValue(new Error('CCPP down'));
    const next = jest.fn();
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, next);

    expect(next).not.toHaveBeenCalled();
    expect(r.json.mock.calls[0][0]).toMatchObject({ ok: true, registered: false, event: null });
  });

  it('reports registered:false rather than failing the signup when the attendee write breaks', async () => {
    // The account and the welcome email have already happened by this point, so
    // a 500 here would invite the visitor to sign up all over again.
    mkRecord.mockRejectedValue(new Error('unique index gone'));
    const next = jest.fn();
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, next);

    expect(next).not.toHaveBeenCalled();
    expect(r.json.mock.calls[0][0]).toMatchObject({ ok: true, registered: false });
  });

  it('still answers successfully when consent capture throws', async () => {
    mkConsent.mockRejectedValue(new Error('consent table locked'));
    const next = jest.fn();
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, next);
    expect(next).not.toHaveBeenCalled();
    expect(r.json.mock.calls[0][0].ok).toBe(true);
  });

  it('takes the IP and user agent from the request, never from the body', async () => {
    const r = res();
    await handlePublicOpenHouseSignup(req(body({ marketing_opt_in: true })), r, jest.fn());
    expect(mkConsent).toHaveBeenCalledWith(expect.objectContaining({
      ipAddress: '203.0.113.7', userAgent: 'TestAgent/1.0', consentText: 'consent wording',
    }));
  });

  it('rejects a body trying to supply its own provenance', async () => {
    // Accepting these on a public route would make a consent record forgeable.
    for (const forged of [{ ip_address: '1.2.3.4' }, { user_agent: 'Someone else' }, { marketing_consent_text: 'wording we never showed' }]) {
      const r = res();
      await handlePublicOpenHouseSignup(req(body(forged)), r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(400);
      expect(mkEnrollment).not.toHaveBeenCalled();
    }
  });

  it('rejects a missing or malformed email with 400 and creates nothing', async () => {
    for (const bad of [{ name: 'A' }, { name: 'A', email: 'not-an-email' }, { email: 'a@b.com' }]) {
      jest.clearAllMocks();
      const r = res();
      await handlePublicOpenHouseSignup(req(bad), r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(400);
      expect(mkEnrollment).not.toHaveBeenCalled();
    }
  });

  it('tags the lead with a truthful source when the page forgot to send one', async () => {
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, jest.fn());
    expect(mkEnrollment).toHaveBeenCalledWith(expect.objectContaining({
      utm_source: 'open_house_signup', utm_campaign: 'open_house',
    }));
  });

  it('keeps the page’s own UTMs when it does send them', async () => {
    const r = res();
    await handlePublicOpenHouseSignup(req(body({ utm_source: 'fb', utm_campaign: 'nov_oh' })), r, jest.fn());
    expect(mkEnrollment).toHaveBeenCalledWith(expect.objectContaining({
      utm_source: 'fb', utm_campaign: 'nov_oh',
    }));
  });

  it('passes an unexpected failure to the error handler instead of swallowing it', async () => {
    mkEnrollment.mockRejectedValue(new Error('database on fire'));
    const next = jest.fn();
    const r = res();
    await handlePublicOpenHouseSignup(req(body()), r, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'database on fire' }));
    expect(r.json).not.toHaveBeenCalled();
  });
});
