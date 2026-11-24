import { evaluateVoicePolicy, PolicyFacts } from '../voicePolicy';

// 2026-11-24 is CST (UTC-6). 16:00Z = 10:00 Central.
const at = (utc: string) => new Date(`2026-11-24T${utc}:00.000Z`);
const base: PolicyFacts = {
  mode: 'legacy', killSwitch: 'off', voiceEnabled: true, pathAllowed: true, destinationE164: '+15555550123',
  exemption: null, consent: 'granted', suppressed: false, recipientTimezone: 'America/Chicago', now: at('18:00'),
};
const v = (o: Partial<PolicyFacts>) => evaluateVoicePolicy({ ...base, ...o });

describe('voicePolicy: ordered, fail-closed verdicts', () => {
  it('allows a consented, unsuppressed call inside hours (happy path)', () => expect(v({})).toEqual({ ok: true }));

  it.each([
    [{ killSwitch: 'on' as const }, 'kill_switch_active'],
    [{ killSwitch: 'unreadable' as const }, 'kill_switch_unreadable'],
    [{ voiceEnabled: false }, 'feature_disabled'],
    [{ pathAllowed: false }, 'path_not_allowed'],
    [{ destinationE164: null }, 'invalid_destination'],
    [{ destinationE164: '5555550123' }, 'invalid_destination'],
    [{ suppressed: null }, 'suppression_unknown'],
    [{ suppressed: true }, 'suppressed'],
    [{ consent: 'missing' as const }, 'consent_missing'],
    [{ consent: 'revoked' as const }, 'consent_revoked'],
    [{ consent: 'expired' as const }, 'consent_expired'],
    [{ consent: 'unknown' as const }, 'consent_unknown'],
    [{ consent: 'staff_internal' as const }, 'consent_missing'],
  ])('%j blocks with %s', (o, reason) => expect(v(o)).toEqual({ ok: false, reason }));

  it('kill switch outranks everything, including a staff exemption', () => {
    expect(v({ killSwitch: 'on', exemption: 'staff' })).toEqual({ ok: false, reason: 'kill_switch_active' });
    expect(v({ voiceEnabled: false, exemption: 'staff' })).toEqual({ ok: false, reason: 'feature_disabled' });
    expect(v({ suppressed: true, exemption: 'staff' })).toEqual({ ok: false, reason: 'suppressed' });
  });

  it('staff with internal-alert consent are exempt from call hours (as voiceDialGuard is today)', () => {
    expect(v({ exemption: 'staff', consent: 'staff_internal', now: at('05:00') })).toEqual({ ok: true });
    expect(v({ exemption: 'staff', consent: 'granted', now: at('05:00') })).toEqual({ ok: true });
  });

  it.each([
    ['revoked', 'consent_revoked'], ['expired', 'consent_expired'], ['missing', 'consent_missing'], ['unknown', 'consent_unknown'],
  ] as const)('staff are NOT exempt from consent: %s blocks with %s (directive section 5; verifier VS1.5 attempt 1)', (consent, reason) => {
    expect(v({ exemption: 'staff', consent })).toEqual({ ok: false, reason });
  });

  it.each([['GRANTED'], [''], ['pending'], [undefined], [null]])(
    'an unexpected consent value %j fails closed (allowlist; verifier VS1.5 attempt 2)', (consent) => {
      expect(v({ consent: consent as never })).toEqual({ ok: false, reason: 'consent_unknown' });
      expect(v({ consent: consent as never, exemption: 'staff' })).toEqual({ ok: false, reason: 'consent_unknown' });
    });

  it.each([[undefined], ['no'], [0]])('an unexpected suppression value %j fails closed', (suppressed) => {
    expect(v({ suppressed: suppressed as never })).toEqual({ ok: false, reason: 'suppression_unknown' });
  });

  it('an unexpected kill-switch value fails closed', () => {
    expect(v({ killSwitch: undefined as never })).toEqual({ ok: false, reason: 'kill_switch_unreadable' });
  });

  it('a test destination still needs consent and hours (no blanket exemption)', () => {
    expect(v({ exemption: 'test', consent: 'missing' })).toEqual({ ok: false, reason: 'consent_missing' });
    expect(v({ exemption: 'test', now: at('03:00') })).toEqual({ ok: false, reason: 'outside_call_hours' });
  });
});

describe('voicePolicy: the legacy Central window, edges and DST (boundary)', () => {
  it.each([
    ['15:59', false], ['16:00', true], ['01:59', true], ['02:00', false],
  ])('at %sZ (Central = UTC-6 in November) allowed=%s', (t, ok) => {
    // 01:59Z on the 25th is 19:59 on the 24th Central (last open minute); 02:00Z is 20:00 (closed).
    const now = t < '12:00' ? new Date(`2026-11-25T${t}:00.000Z`) : at(t);
    expect(v({ now }).ok).toBe(ok);
  });

  it('follows DST: 10:00 Central is 15:00Z in summer (CDT, UTC-5)', () => {
    expect(v({ now: new Date('2026-07-15T15:00:00.000Z') }).ok).toBe(true);
    expect(v({ now: new Date('2026-07-15T14:59:00.000Z') }).ok).toBe(false);
  });

  it('on the fall-back day (2026-11-01) the window is computed in local time', () => {
    expect(v({ now: new Date('2026-11-01T16:00:00.000Z') }).ok).toBe(true); // 10:00 CST
    expect(v({ now: new Date('2026-11-01T15:59:00.000Z') }).ok).toBe(false);
  });
});

describe('voicePolicy: direct mode adds the recipient local window (stricter wins)', () => {
  it('unknown or invalid recipient timezone fails closed', () => {
    expect(v({ mode: 'direct', recipientTimezone: null })).toEqual({ ok: false, reason: 'recipient_timezone_unknown' });
    expect(v({ mode: 'direct', recipientTimezone: 'Mars/Olympus' })).toEqual({ ok: false, reason: 'recipient_timezone_unknown' });
  });

  it('blocks a Pacific recipient at 8:30 local even though Central is 10:30', () => {
    expect(v({ mode: 'direct', recipientTimezone: 'America/Los_Angeles', now: at('16:30') })).toEqual({ ok: false, reason: 'outside_recipient_hours' });
  });

  it('blocks an Eastern recipient at 8:15 PM local even though Central is 7:15 PM', () => {
    expect(v({ mode: 'direct', recipientTimezone: 'America/New_York', now: new Date('2026-11-25T01:15:00.000Z') })).toEqual({ ok: false, reason: 'outside_recipient_hours' });
  });

  it('allows when both windows hold, and legacy mode ignores the recipient zone (unchanged behavior)', () => {
    expect(v({ mode: 'direct', recipientTimezone: 'America/New_York', now: at('18:00') }).ok).toBe(true);
    expect(v({ mode: 'legacy', recipientTimezone: null }).ok).toBe(true);
  });

  it('is deterministic for the same facts (idempotent)', () => {
    expect(v({ mode: 'direct' })).toEqual(v({ mode: 'direct' }));
  });
});
