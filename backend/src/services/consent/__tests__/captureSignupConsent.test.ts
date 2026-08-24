const recordConsentMock = jest.fn();
jest.mock('../../consentService', () => ({
  recordConsent: (...a: unknown[]) => recordConsentMock(...a),
}));

import { captureSignupConsent, SIGNUP_CONSENT_TEXT } from '../captureSignupConsent';

beforeEach(() => {
  recordConsentMock.mockReset();
  recordConsentMock.mockResolvedValue({ id: 'c1' });
});

describe('an affirmative tick records express consent', () => {
  it.each([true, 'true', 'on'])('accepts %p as a yes', async (v) => {
    const ok = await captureSignupConsent({
      email: 'a@b.com',
      marketingOptIn: v as any,
      source: 'enrollment_form',
    });
    expect(ok).toBe(true);
    expect(recordConsentMock).toHaveBeenCalledTimes(1);
  });

  it('records express_written — the basis that lifts a learner off the default rule', async () => {
    await captureSignupConsent({
      email: 'a@b.com',
      marketingOptIn: true,
      source: 'open_house',
    });
    expect(recordConsentMock.mock.calls[0][0]).toMatchObject({
      subjectType: 'email',
      channel: 'email',
      status: 'granted',
      basis: 'express_written',
      source: 'open_house',
    });
  });

  it('stores WHAT they agreed to, not just that they agreed', async () => {
    // "They consented" is unfalsifiable without knowing the wording on screen.
    await captureSignupConsent({
      email: 'a@b.com',
      marketingOptIn: true,
      source: 'free_signup',
      consentText: SIGNUP_CONSENT_TEXT,
      ipAddress: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
    });
    expect(recordConsentMock.mock.calls[0][0].evidence).toMatchObject({
      consent_text: SIGNUP_CONSENT_TEXT,
      ip_address: '203.0.113.7',
      user_agent: 'Mozilla/5.0',
      captured_via: 'signup_checkbox',
    });
  });
});

describe('an unticked box records NOTHING — it is not a revocation', () => {
  it.each([false, 'false', undefined, null, '', 'yes please'])(
    'writes no record for %p',
    async (v) => {
      const ok = await captureSignupConsent({
        email: 'a@b.com',
        marketingOptIn: v as any,
        source: 'enrollment_form',
      });
      expect(ok).toBe(false);
      expect(recordConsentMock).not.toHaveBeenCalled();
    },
  );

  it('never writes a revoked record for a missing tick', async () => {
    // Recording `revoked` would be WORSE than silence: it would suppress a
    // person who simply did not tick a box, losing a contact we are currently
    // permitted to reach under the default rule.
    await captureSignupConsent({
      email: 'a@b.com',
      marketingOptIn: false,
      source: 'enrollment_form',
    });
    const revoked = recordConsentMock.mock.calls.filter(
      (c) => c[0]?.status === 'revoked',
    );
    expect(revoked).toEqual([]);
  });
});

describe('it can never break a signup', () => {
  it('returns false rather than throwing when recording fails', async () => {
    // recordConsent is swallow-safe and returns null. A person must still get
    // their account; their consent state simply stays what it was.
    recordConsentMock.mockResolvedValue(null);
    await expect(
      captureSignupConsent({ email: 'a@b.com', marketingOptIn: true, source: 'x' }),
    ).resolves.toBe(false);
  });

  it('ignores a missing email rather than recording against an empty subject', async () => {
    const ok = await captureSignupConsent({
      email: '',
      marketingOptIn: true,
      source: 'enrollment_form',
    });
    expect(ok).toBe(false);
    expect(recordConsentMock).not.toHaveBeenCalled();
  });
});

describe('the wording is shared', () => {
  it('names what the email is actually about, and how to stop it', () => {
    // Consent is to a specific thing. Vague wording is weak consent.
    expect(SIGNUP_CONSENT_TEXT).toMatch(/Colaberry/);
    expect(SIGNUP_CONSENT_TEXT).toMatch(/unsubscribe/i);
  });
});
