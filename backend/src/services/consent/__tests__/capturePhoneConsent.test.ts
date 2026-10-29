/**
 * The phone grant collected by a public form.
 *
 * ── WHY THESE ASSERT THE ROW AND NOT THE CALL ───────────────────────────────
 *
 * `recordConsent` is mocked and everything above it is real, so each test reads
 * the row that would actually be written. That matters because the failures worth
 * catching here are all of the same shape: a record that EXISTS, reads
 * `status='granted'` and `basis='express_written'`, passes any assertion anyone
 * would think to write against the table — and authorises nothing, because it was
 * keyed on the wrong identifier or filed under the wrong channel. Mocking
 * `captureSignupConsent` and checking that the helper called it twice would prove
 * none of that; it would prove the helper has a loop.
 *
 * The two concrete ways this can look right and be wrong:
 *   1. KEYED ON THE EMAIL. A voice or SMS send resolves consent by phone
 *      (`subjectCandidates`), so an email-keyed row is invisible to the gate.
 *   2. ONE CHANNEL, NOT TWO. The wording on screen names calls AND texts, so a
 *      single grant would be a record of an agreement nobody made.
 */

import { normalizePhone } from '../../consentService';
import { PHONE_CONSENT_TEXT } from '../captureSignupConsent';

const recordConsentMock = jest.fn();
jest.mock('../../consentService', () => {
  const actual = jest.requireActual('../../consentService');
  return { ...actual, recordConsent: (...a: unknown[]) => recordConsentMock(...a) };
});

import { capturePhoneConsent, readPhoneConsent, PHONE_CONSENT_CHANNELS } from '../capturePhoneConsent';

const PHONE = '(214) 555-0100';
const EMAIL = 'dana@example.com';

/** Every row the helper wrote in this test, in call order. */
const rows = () => recordConsentMock.mock.calls.map((c) => c[0]);

beforeEach(() => {
  recordConsentMock.mockReset();
  recordConsentMock.mockImplementation(async () => ({ id: 'row' }));
});

describe('capturePhoneConsent — what it writes', () => {
  it('writes BOTH voice and sms, and nothing else', async () => {
    const written = await capturePhoneConsent({
      phone: PHONE, email: EMAIL, phoneConsent: true, source: 'strategy_call',
    });

    expect(written).toBe(2);
    expect(rows().map((r) => r.channel).sort()).toEqual(['sms', 'voice']);
    // No email row. The email permission is a different question with different
    // wording, asked by a different box.
    expect(rows().some((r) => r.channel === 'email')).toBe(false);
  });

  it('keys every row on the NORMALIZED PHONE, never the email', async () => {
    await capturePhoneConsent({
      phone: PHONE, email: EMAIL, phoneConsent: true, source: 'strategy_call',
    });

    for (const row of rows()) {
      expect(row.subjectType).toBe('phone');
      expect(row.subjectId).toBe(normalizePhone(PHONE));
      expect(row.subjectId).not.toBe(EMAIL);
    }
  });

  it('records the exact wording shown, as evidence', async () => {
    await capturePhoneConsent({
      phone: PHONE, phoneConsent: true, source: 'contact_form',
    });

    for (const row of rows()) {
      expect(row.evidence.consent_text).toBe(PHONE_CONSENT_TEXT);
    }
  });

  it('cannot weaken the basis, because it never sets one', async () => {
    // `captureSignupConsent` hard-codes `express_written`, which is what lifts a
    // number off the default and is one of the two bases that unlock voice and
    // SMS. A caller able to pass its own basis could file a grant the gate reads
    // as insufficient while the row still says `granted`.
    await capturePhoneConsent({ phone: PHONE, phoneConsent: true, source: 's' });

    for (const row of rows()) {
      expect(row.basis).toBe('express_written');
      expect(row.status).toBe('granted');
    }
  });

  it('passes the source and correlation id through for traceability', async () => {
    await capturePhoneConsent({
      phone: PHONE, phoneConsent: true, source: 'lead_form:strategy_call',
      correlationId: 'abc-123', ipAddress: '203.0.113.9', userAgent: 'jest',
    });

    for (const row of rows()) {
      expect(row.source).toBe('lead_form:strategy_call');
      expect(row.evidence.correlation_id).toBe('abc-123');
      expect(row.evidence.ip_address).toBe('203.0.113.9');
      expect(row.evidence.user_agent).toBe('jest');
    }
  });

  it('writes a STANDING grant — no expiry', async () => {
    // Unlike CALLBACK_CONSENT_TEXT, which lapses after 30 days because the
    // affirmative act there is a bounded request to be called. This is a ticked
    // box granting ongoing permission, so an expiry would silently revoke
    // something the person did not time-limit.
    await capturePhoneConsent({ phone: PHONE, phoneConsent: true, source: 's' });
    for (const row of rows()) expect(row.expiresAt).toBeNull();
  });
});

describe('capturePhoneConsent — what it refuses to write', () => {
  it.each([
    ['false', false],
    ['undefined', undefined],
    ['null', null],
    ['the empty string', ''],
    // A checkbox that was rendered but never touched must not count, and neither
    // must a stray truthy-looking value from the wire.
    ['the string "no"', 'no'],
    ['the string "1"', '1'],
    ['the number 1', 1 as unknown as boolean],
  ])('writes NOTHING when the tick is %s', async (_label, choice) => {
    const written = await capturePhoneConsent({
      phone: PHONE, email: EMAIL, phoneConsent: choice as never, source: 's',
    });

    expect(written).toBe(0);
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it.each([
    ['boolean true', true],
    ['the string "true"', 'true'],
    ['the string "on"', 'on'],
  ])('accepts %s, because that is what real forms send', async (_label, choice) => {
    const written = await capturePhoneConsent({
      phone: PHONE, phoneConsent: choice as never, source: 's',
    });
    expect(written).toBe(2);
  });

  it.each([
    ['missing', undefined],
    ['blank', ''],
    ['whitespace', '   '],
    // Under 7 digits is not a telephone number. A grant keyed on "555" can never
    // be matched by anything, so writing it would be worse than writing nothing:
    // it would look like permission in the table.
    ['too short', '555'],
    ['punctuation only', '()- '],
  ])('writes NOTHING when the number is %s', async (_label, phone) => {
    const written = await capturePhoneConsent({
      phone, email: EMAIL, phoneConsent: true, source: 's',
    });

    expect(written).toBe(0);
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it('does not fall back to the email key when there is no usable number', async () => {
    // The dangerous shape: no phone, but an email in hand, and a helper that
    // "helpfully" records SOMETHING. That row would be invisible to every voice
    // and SMS send while reading as a valid express grant.
    await capturePhoneConsent({ phone: null, email: EMAIL, phoneConsent: true, source: 's' });
    expect(recordConsentMock).not.toHaveBeenCalled();
  });
});

describe('capturePhoneConsent — failure posture', () => {
  it('never throws when the write fails, and reports zero', async () => {
    recordConsentMock.mockImplementation(async () => null);

    await expect(
      capturePhoneConsent({ phone: PHONE, phoneConsent: true, source: 's' }),
    ).resolves.toBe(0);
  });

  it('never throws when the write REJECTS', async () => {
    recordConsentMock.mockImplementation(async () => {
      throw new Error('connection terminated');
    });

    await expect(
      capturePhoneConsent({ phone: PHONE, phoneConsent: true, source: 's' }),
    ).resolves.toBe(0);
  });

  it('still records the second channel when the first one fails', async () => {
    // One bad channel must not cost the person the other half of the permission
    // they gave in a single tick.
    let call = 0;
    recordConsentMock.mockImplementation(async () => {
      call += 1;
      if (call === 1) throw new Error('transient');
      return { id: 'row' };
    });

    const written = await capturePhoneConsent({
      phone: PHONE, phoneConsent: true, source: 's',
    });

    expect(written).toBe(1);
    expect(recordConsentMock).toHaveBeenCalledTimes(PHONE_CONSENT_CHANNELS.length);
  });

  it('survives a malformed input object', async () => {
    await expect(
      capturePhoneConsent(undefined as never),
    ).resolves.toBe(0);
  });
});

describe('capturePhoneConsent — replay', () => {
  it('writes the same row again on a replay, and that is the intended behaviour', async () => {
    // `consent_records` is an append-only ledger and `getCurrentConsent` resolves
    // permission with ORDER BY captured_at DESC LIMIT 1, so a second identical
    // grant leaves the effective permission unchanged. This test pins the claim
    // made in the helper's docblock rather than asserting a dedup that does not
    // exist and would lose history if it did.
    const input = { phone: PHONE, email: EMAIL, phoneConsent: true, source: 's' } as const;

    await capturePhoneConsent(input);
    const first = rows();
    recordConsentMock.mockClear();
    await capturePhoneConsent(input);
    const second = rows();

    expect(second).toHaveLength(first.length);
    expect(second.map((r) => [r.subjectType, r.subjectId, r.channel, r.status]))
      .toEqual(first.map((r) => [r.subjectType, r.subjectId, r.channel, r.status]));
  });
});

describe('readPhoneConsent', () => {
  it('reads the checkbox off a request body', () => {
    expect(readPhoneConsent({ phone_consent: true })).toBe(true);
    expect(readPhoneConsent({ phone_consent: 'on' })).toBe('on');
  });

  it('returns undefined rather than inventing a value', () => {
    expect(readPhoneConsent({})).toBeUndefined();
    expect(readPhoneConsent(null)).toBeUndefined();
    expect(readPhoneConsent('nonsense')).toBeUndefined();
    expect(readPhoneConsent(undefined)).toBeUndefined();
  });
});
