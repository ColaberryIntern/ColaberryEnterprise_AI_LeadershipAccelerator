/**
 * "Call me now" → voice consent capture.
 *
 * WHY THIS EXISTS. `consent_enforcement` has been `enforce` since 2026-06-23 and
 * the consent table held zero granted express records, so `evaluateConsent` for
 * voice answered `no_express_consent` for everyone and the gate refused the very
 * call the person had just asked for. In production: 30 blocked callbacks across
 * 27 distinct people, and zero callbacks placed in August.
 *
 * The two ways a "fix" for that can look right and not be:
 *   1. Writing the grant AFTER the gate. A row appears, every table-level
 *      assertion passes, and THIS caller is still refused — only the next one
 *      gets through. So the ordering is asserted behaviourally below, with a fake
 *      gate that actually reads what was written.
 *   2. Writing the grant keyed on the EMAIL. A voice send looks consent up by
 *      phone (`subjectCandidates`), so an email-keyed row is invisible to it:
 *      exists, reads correct, changes nothing.
 */

import { normalizePhone, subjectCandidates } from '../consentService';
import { resolveConsentSubject, CALLBACK_CONSENT_TEXT, CALLBACK_CONSENT_TTL_DAYS } from '../consent/captureSignupConsent';

const recordConsentMock = jest.fn();
jest.mock('../consentService', () => {
  const actual = jest.requireActual('../consentService');
  return { ...actual, recordConsent: (...a: unknown[]) => recordConsentMock(...a) };
});

jest.mock('../externalLeadIngestService', () => ({ ingestExternalLead: jest.fn() }));
jest.mock('../communicationSafetyService', () => ({ evaluateSend: jest.fn() }));
jest.mock('../synthflowService', () => ({ triggerVoiceCall: jest.fn() }));
// Must resolve a promise: the service calls `logCommunication(...).catch(...)`.
jest.mock('../communicationLogService', () => ({ logCommunication: jest.fn(() => Promise.resolve()) }));
jest.mock('../../models', () => ({ CommunicationLog: { findOne: jest.fn() } }));

import { ingestExternalLead } from '../externalLeadIngestService';
import { evaluateSend } from '../communicationSafetyService';
import { triggerVoiceCall } from '../synthflowService';
import { CommunicationLog } from '../../models';
import { requestInstantCallback } from '../callbackRequestService';

const mockIngest = ingestExternalLead as jest.Mock;
const mockEvaluateSend = evaluateSend as jest.Mock;
const mockTriggerCall = triggerVoiceCall as jest.Mock;
const mockFindOne = (CommunicationLog as unknown as { findOne: jest.Mock }).findOne;

const PAYLOAD = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '(555) 012-3456',
  source: 'training_site',
} as any;

/** A stand-in for the real gate: allows only what has actually been granted. */
function gateBackedBy(granted: Set<string>) {
  return jest.fn(async ({ channel, toPhone }: { channel: string; toPhone?: string }) => {
    const key = `${channel}:phone:${normalizePhone(toPhone)}`;
    return granted.has(key)
      ? { allowed: true, redirect: null, testMode: false, deliveryMode: 'live' }
      : { allowed: false, redirect: null, testMode: false, blockedReason: 'consent_no_express_consent', deliveryMode: 'blocked' };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  recordConsentMock.mockResolvedValue({ id: 'c1' });
  mockIngest.mockResolvedValue({ id: 42, created_at: new Date(), was_duplicate: false });
  mockFindOne.mockResolvedValue(null);
  mockTriggerCall.mockResolvedValue({ success: true, data: { call_id: 'call_1' } });
  mockEvaluateSend.mockResolvedValue({ allowed: true, redirect: null, testMode: false, deliveryMode: 'live' });
});

describe('the subject a consent row is keyed on must match what a send looks it up by', () => {
  // resolveConsentSubject and subjectCandidates are two halves of the same rule.
  // If they ever disagree, consent silently stops working with no error anywhere.
  it.each(['email', 'sms', 'voice'] as const)('agrees with subjectCandidates for %s', (channel) => {
    const ids = { email: 'ada@example.com', phone: PAYLOAD.phone };
    const written = resolveConsentSubject(channel, ids);
    const looked = subjectCandidates({ channel, ...ids });

    expect(written).not.toBeNull();
    expect(looked).toContainEqual({
      subject_type: written!.subjectType,
      subject_id: written!.subjectId,
    });
  });

  it('keys voice on the phone, never the email', () => {
    expect(resolveConsentSubject('voice', { email: 'ada@example.com', phone: PAYLOAD.phone }))
      .toEqual({ subjectType: 'phone', subjectId: normalizePhone(PAYLOAD.phone) });
  });

  it('records NOTHING rather than falling back to the email key when the phone is missing', () => {
    // An email-keyed voice row would be invisible to the gate — worse than absent,
    // because it looks like coverage.
    expect(resolveConsentSubject('voice', { email: 'ada@example.com', phone: null })).toBeNull();
  });
});

describe('requesting a callback records voice consent', () => {
  it('writes an express voice grant keyed on the phone, with the factual wording', async () => {
    await requestInstantCallback(PAYLOAD, 'corr-1');

    expect(recordConsentMock).toHaveBeenCalledTimes(1);
    const arg = recordConsentMock.mock.calls[0][0];
    expect(arg).toMatchObject({
      subjectType: 'phone',
      channel: 'voice',
      status: 'granted',
      basis: 'express_written',
      source: 'training_site:request_callback',
    });
    expect(arg.evidence.consent_text).toBe(CALLBACK_CONSENT_TEXT);
    expect(arg.subjectType).not.toBe('email');

    // Derived, never hardcoded. What the row is keyed on must be exactly what a
    // send of this payload would look up - asserting a guessed literal here
    // would pass while the two silently diverged, which is the whole bug.
    expect(arg.subjectId).toBe(normalizePhone(PAYLOAD.phone));
    expect(subjectCandidates({ channel: 'voice', phone: PAYLOAD.phone })).toContainEqual({
      subject_type: arg.subjectType,
      subject_id: arg.subjectId,
    });
  });

  it('bounds the grant so a request cannot become a standing telemarketing licence', async () => {
    const before = Date.now();
    await requestInstantCallback(PAYLOAD, 'corr-1');
    const after = Date.now();

    const { expiresAt } = recordConsentMock.mock.calls[0][0];
    expect(expiresAt).toBeInstanceOf(Date);

    // expiresAt is computed DURING the call, so it lands in [before, after] plus
    // the TTL. An exact window, not a float tolerance.
    const ttlMs = CALLBACK_CONSENT_TTL_DAYS * 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + ttlMs);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + ttlMs);
  });

  it('grants a bounded permission, never an open-ended one', async () => {
    await requestInstantCallback(PAYLOAD, 'corr-1');
    // A null expiry would be a standing telemarketing licence created by a single
    // button press - the original consent bug inverted.
    expect(recordConsentMock.mock.calls[0][0].expiresAt).not.toBeNull();
  });
});

describe('ORDERING: the call that was just requested must go out', () => {
  it('places THIS call, not merely the next one', async () => {
    // The gate reads a store the consent write populates. If the write moved
    // after evaluateSend, the gate would see an empty store and refuse — which is
    // exactly the production bug, and exactly what a naive "was a row created?"
    // test fails to catch.
    const granted = new Set<string>();
    recordConsentMock.mockImplementation(async (input: any) => {
      granted.add(`${input.channel}:${input.subjectType}:${input.subjectId}`);
      return { id: 'c1' };
    });
    mockEvaluateSend.mockImplementation(gateBackedBy(granted));

    const result = await requestInstantCallback(PAYLOAD, 'corr-1');

    expect(result.status).toBe('call_initiated');
    expect(mockTriggerCall).toHaveBeenCalledTimes(1);
    expect(result.reason).toBeUndefined();
  });

  it('would refuse without the grant — proving the test above is not vacuous', async () => {
    // Same fake gate, but nothing ever written. If this passes AND the test above
    // passes, the gate is genuinely reading the grant rather than always allowing.
    const granted = new Set<string>();
    recordConsentMock.mockResolvedValue(null);
    mockEvaluateSend.mockImplementation(gateBackedBy(granted));

    const result = await requestInstantCallback(PAYLOAD, 'corr-1');

    expect(result.status).toBe('blocked');
    expect(mockTriggerCall).not.toHaveBeenCalled();
  });

  it('writes the consent strictly before consulting the gate', async () => {
    await requestInstantCallback(PAYLOAD, 'corr-1');

    expect(recordConsentMock.mock.invocationCallOrder[0])
      .toBeLessThan(mockEvaluateSend.mock.invocationCallOrder[0]);
  });
});

describe('consent capture can never cost someone their callback', () => {
  it('still places the call when the consent write throws', async () => {
    recordConsentMock.mockRejectedValue(new Error('consent table unreachable'));

    const result = await requestInstantCallback(PAYLOAD, 'corr-1');

    expect(result.status).toBe('call_initiated');
    expect(mockTriggerCall).toHaveBeenCalledTimes(1);
  });
});
