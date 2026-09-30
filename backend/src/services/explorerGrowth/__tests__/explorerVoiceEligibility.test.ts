import {
  evaluateVoiceEligibility,
  isValidE164,
  MAX_F_SCORE_VOICE,
  MIN_SIGNAL_TIER_VOICE,
  MAX_ATTEMPTS_LIFETIME,
  MIN_DAYS_BETWEEN_ATTEMPTS,
  MIN_HOURS_SINCE_ANY_CONTACT,
  type VoiceEligibilityContext,
} from '../explorerVoiceEligibility';
import {
  resolveLearnerTimezone,
  isWithinLocalBusinessHours,
  mayCallNow,
} from '../explorerTimezoneService';

/**
 * Plan §16.2 demands a "fail-closed test per condition", and this is the one
 * gate in the system with legal exposure behind it. Every other channel's worst
 * case is an unwanted email; this one's is an unconsented automated call.
 *
 * So the tests are per-condition rather than in aggregate, and the last block
 * asserts the property that matters most: no combination of missing or
 * unreadable data produces `eligible: true`.
 */

// A Tuesday, 2pm Chicago.
const TUE_2PM_CT = new Date('2026-09-08T19:00:00Z');

const ctx = (over: Partial<VoiceEligibilityContext> = {}): VoiceEligibilityContext => ({
  autoDialFlagOn: true,
  voiceCallsEnabled: true,
  killSwitchEngaged: false,
  overlays: ['HIGH_INTENT'],
  highestSignalTier: 4,
  fScore: 5,
  isConverted: false,
  phoneE164: '+13125551234',
  voiceConsent: { status: 'granted', basis: 'express_written' },
  isUnsubscribedOrDnc: false,
  timezone: { storedTimezone: 'America/Chicago' },
  now: TUE_2PM_CT,
  attemptsLifetime: 0,
  daysSinceLastAttempt: null,
  hoursSinceAnyContact: 200,
  hasOpenSupportCase: false,
  hasUnresolvedFriction: false,
  ...over,
});

describe('the fully-satisfied gate', () => {
  it('passes only when all fourteen conditions hold', () => {
    const v = evaluateVoiceEligibility(ctx());
    expect(v.eligible).toBe(true);
    expect(v.reasons).toEqual([]);
  });
});

describe('fail-closed, one condition at a time (§16.2)', () => {
  it.each([
    ['auto-dial flag off', { autoDialFlagOn: false }],
    ['platform voice off', { voiceCallsEnabled: false }],
    ['kill switch engaged', { killSwitchEngaged: true }],
    ['no HIGH_INTENT', { overlays: [] }],
    ['tier 3 is not enough for voice', { highestSignalTier: 3 }],
    ['friction at the limit', { fScore: MAX_F_SCORE_VOICE }],
    ['converted', { isConverted: true }],
    ['no phone', { phoneE164: null }],
    ['phone not E.164', { phoneE164: '312-555-1234' }],
    ['no consent record', { voiceConsent: null }],
    ['consent revoked', { voiceConsent: { status: 'revoked', basis: 'express_written' } }],
    ['consent basis merely implied', { voiceConsent: { status: 'granted', basis: 'implied' } }],
    ['unsubscribed or DNC', { isUnsubscribedOrDnc: true }],
    ['timezone unknown', { timezone: {} }],
    ['at the lifetime attempt cap', { attemptsLifetime: MAX_ATTEMPTS_LIFETIME }],
    ['inside the attempt cooldown', { daysSinceLastAttempt: MIN_DAYS_BETWEEN_ATTEMPTS - 1 }],
    ['contacted too recently', { hoursSinceAnyContact: MIN_HOURS_SINCE_ANY_CONTACT - 1 }],
    ['contact recency unknown', { hoursSinceAnyContact: null }],
    ['open support case', { hasOpenSupportCase: true }],
    ['unresolved friction', { hasUnresolvedFriction: true }],
  ])('blocks on %s', (_label, over) => {
    expect(evaluateVoiceEligibility(ctx(over)).eligible).toBe(false);
  });
});

describe('consent is narrower than email consent', () => {
  it.each(['express_written', 'double_opt_in'])('accepts basis %s', (basis) => {
    expect(evaluateVoiceEligibility(ctx({ voiceConsent: { status: 'granted', basis } })).eligible)
      .toBe(true);
  });

  it.each(['implied', 'legitimate_interest', 'opt_out', 'soft_opt_in', ''])(
    'refuses basis %j, which may satisfy email but not a robocall',
    (basis) => {
      const v = evaluateVoiceEligibility(ctx({ voiceConsent: { status: 'granted', basis } }));
      expect(v.eligible).toBe(false);
      expect(v.reasons.join(' ')).toContain('basis');
    },
  );
});

describe('the call window is the learner’s, not ours (§35 D-3)', () => {
  it('refuses when the timezone cannot be resolved', () => {
    // The mitigation D-3 requires. A guessed zone that is three hours out is a
    // 6am call to a stranger, and the call connects either way — nothing in the
    // outcome records that we guessed.
    const v = evaluateVoiceEligibility(ctx({ timezone: {} }));
    expect(v.eligible).toBe(false);
    expect(v.reasons.join(' ')).toContain('timezone unknown');
  });

  it('refuses a US learner whose state spans two zones', () => {
    // Florida, Texas, Kansas and friends. A state-level guess is a coin flip.
    const v = evaluateVoiceEligibility(ctx({ timezone: { country: 'US', region: 'FL' } }));
    expect(v.eligible).toBe(false);
    expect(v.reasons.join(' ')).toContain('more than one timezone');
  });

  it('accepts a state that sits wholly in one zone', () => {
    expect(
      evaluateVoiceEligibility(ctx({ timezone: { country: 'US', region: 'IL' } })).eligible,
    ).toBe(true);
  });

  it('refuses at 7am local even on a weekday', () => {
    // 12:00Z is 07:00 in Chicago.
    const early = new Date('2026-09-08T12:00:00Z');
    expect(evaluateVoiceEligibility(ctx({ now: early })).eligible).toBe(false);
  });

  it('refuses on a Saturday inside business hours', () => {
    // Legal, and still wrong.
    const sat = new Date('2026-09-12T19:00:00Z');
    expect(evaluateVoiceEligibility(ctx({ now: sat })).eligible).toBe(false);
  });
});

describe('it reports every failing gate, not the first', () => {
  it('lists them all for a learner failing many', () => {
    // "Why did this learner get a call" needs the complete set of reasons.
    const v = evaluateVoiceEligibility(
      ctx({
        autoDialFlagOn: false,
        overlays: [],
        phoneE164: null,
        voiceConsent: null,
        timezone: {},
        hasOpenSupportCase: true,
      }),
    );
    expect(v.reasons.length).toBeGreaterThanOrEqual(6);
  });
});

describe('no combination of missing data ever produces a pass', () => {
  it('refuses an entirely empty context', () => {
    const empty = {
      autoDialFlagOn: false, voiceCallsEnabled: false, killSwitchEngaged: true,
      overlays: [], highestSignalTier: 0, fScore: NaN, isConverted: false,
      phoneE164: null, voiceConsent: null, isUnsubscribedOrDnc: false,
      timezone: {}, now: TUE_2PM_CT,
      attemptsLifetime: 0, daysSinceLastAttempt: null, hoursSinceAnyContact: null,
      hasOpenSupportCase: false, hasUnresolvedFriction: false,
    } as VoiceEligibilityContext;

    expect(evaluateVoiceEligibility(empty).eligible).toBe(false);
  });

  it('refuses when friction is unmeasurable', () => {
    // NaN answers false to every comparison, so without an explicit check it
    // would silently satisfy "below the limit".
    const v = evaluateVoiceEligibility(ctx({ fScore: NaN }));
    expect(v.eligible).toBe(false);
    expect(v.reasons.join(' ')).toContain('not finite');
  });
});

describe('E.164 validation', () => {
  it.each(['+13125551234', '+442071838750', '+919876543210'])('accepts %s', (p) => {
    expect(isValidE164(p)).toBe(true);
  });

  it.each(['3125551234', '+0123456789', '+1 312 555 1234', '', null, undefined, '+1312555123456789'])(
    'rejects %j',
    (p) => {
      expect(isValidE164(p as any)).toBe(false);
    },
  );
});

describe('timezone resolution refuses rather than guessing', () => {
  it('prefers a stored zone over inference', () => {
    const r = resolveLearnerTimezone({ storedTimezone: 'Europe/London', country: 'US', region: 'IL' });
    expect(r).toMatchObject({ known: true, timezone: 'Europe/London', source: 'profile' });
  });

  it('refuses a stored zone it cannot interpret', () => {
    // Worse than none: it looks authoritative and would pass into a call window.
    expect(resolveLearnerTimezone({ storedTimezone: 'Mars/Olympus' }).known).toBe(false);
  });

  it('refuses a US learner with no region', () => {
    expect(resolveLearnerTimezone({ country: 'US' }).known).toBe(false);
  });

  it('resolves a single-zone country', () => {
    expect(resolveLearnerTimezone({ country: 'IN' })).toMatchObject({ timezone: 'Asia/Kolkata' });
  });

  it('refuses a multi-zone country', () => {
    expect(resolveLearnerTimezone({ country: 'AU' }).known).toBe(false);
    expect(resolveLearnerTimezone({ country: 'BR' }).known).toBe(false);
  });

  it('refuses with nothing at all', () => {
    expect(resolveLearnerTimezone({}).known).toBe(false);
  });

  it('handles DST through Intl rather than a stored offset', () => {
    // 19:00Z is 14:00 CDT in September and 13:00 CST in January. An offset
    // captured once is wrong for half the year, in the direction of calling early.
    expect(isWithinLocalBusinessHours('America/Chicago', new Date('2026-09-08T19:00:00Z'))).toBe(true);
    expect(isWithinLocalBusinessHours('America/Chicago', new Date('2026-01-06T13:30:00Z'))).toBe(false);
  });

  it('mayCallNow refuses on an unknown zone without consulting the clock', () => {
    expect(mayCallNow({}, TUE_2PM_CT).allowed).toBe(false);
  });
});
