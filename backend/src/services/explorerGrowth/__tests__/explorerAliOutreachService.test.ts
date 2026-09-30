import {
  evaluateAliOutreachEligibility,
  remainingAliCapacity,
  ALI_DAILY_CAP,
  ALI_COOLDOWN_DAYS,
  MIN_E_SCORE,
  MAX_F_SCORE,
  type AliOutreachContext,
} from '../explorerAliOutreachService';

/**
 * Plan §16.1. The narrowest gate in the system, guarding the least scalable
 * thing we send: a short personal note from a named human. Its value comes from
 * being rare and real, so most of these tests are about NOT sending.
 */

const ctx = (over: Partial<AliOutreachContext> = {}): AliOutreachContext => ({
  overlays: ['HIGH_INTENT'],
  highestSignalTier: 3,
  eScore: 40,
  fScore: 10,
  isConverted: false,
  emailEligible: true,
  daysSinceLastAliOutreach: null,
  aliSendsToday: 0,
  flagEnabled: true,
  ...over,
});

describe('the full gate', () => {
  it('passes only when every condition holds', () => {
    const v = evaluateAliOutreachEligibility(ctx());
    expect(v.eligible).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it.each([
    ['flag off', { flagEnabled: false }],
    ['no HIGH_INTENT overlay', { overlays: [] }],
    ['tier below 3', { highestSignalTier: 2 }],
    ['E too low', { eScore: MIN_E_SCORE - 1 }],
    ['F too high', { fScore: MAX_F_SCORE }],
    ['already converted', { isConverted: true }],
    ['not email eligible', { emailEligible: false }],
    ['inside the cooldown', { daysSinceLastAliOutreach: ALI_COOLDOWN_DAYS - 1 }],
    ['at the daily cap', { aliSendsToday: ALI_DAILY_CAP }],
  ])('blocks on %s alone', (_label, over) => {
    expect(evaluateAliOutreachEligibility(ctx(over)).eligible).toBe(false);
  });

  it('reports EVERY failing gate, not just the first', () => {
    // These reasons are the audit trail for why a real person was or was not
    // written to. Stopping at the first sends a debugger back per reason.
    const v = evaluateAliOutreachEligibility(
      ctx({ flagEnabled: false, overlays: [], eScore: 1, isConverted: true }),
    );
    expect(v.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it('names numbers in its reasons', () => {
    const v = evaluateAliOutreachEligibility(ctx({ eScore: 12 }));
    expect(v.reasons.join(' ')).toContain('12');
  });
});

describe('HIGH_INTENT is not sufficient on its own', () => {
  it('still refuses without a tier-3 signal behind it', () => {
    // The overlay can fire on accumulated weak activity. Ali's note is for
    // someone who did something deliberate, not someone who browsed a lot.
    const v = evaluateAliOutreachEligibility(ctx({ highestSignalTier: 2 }));
    expect(v.eligible).toBe(false);
    expect(v.reasons.join(' ')).toContain('tier');
  });

  it('accepts tier 4', () => {
    expect(evaluateAliOutreachEligibility(ctx({ highestSignalTier: 4 })).eligible).toBe(true);
  });
});

describe('boundaries', () => {
  it('E is inclusive at the threshold', () => {
    expect(evaluateAliOutreachEligibility(ctx({ eScore: MIN_E_SCORE })).eligible).toBe(true);
    expect(evaluateAliOutreachEligibility(ctx({ eScore: MIN_E_SCORE - 1 })).eligible).toBe(false);
  });

  it('F is EXCLUSIVE at the threshold — F must be strictly under', () => {
    expect(evaluateAliOutreachEligibility(ctx({ fScore: MAX_F_SCORE - 1 })).eligible).toBe(true);
    expect(evaluateAliOutreachEligibility(ctx({ fScore: MAX_F_SCORE })).eligible).toBe(false);
  });

  it('allows outreach exactly at the end of the cooldown', () => {
    expect(
      evaluateAliOutreachEligibility(ctx({ daysSinceLastAliOutreach: ALI_COOLDOWN_DAYS })).eligible,
    ).toBe(true);
    expect(
      evaluateAliOutreachEligibility(ctx({ daysSinceLastAliOutreach: ALI_COOLDOWN_DAYS - 1 }))
        .eligible,
    ).toBe(false);
  });

  it('treats never-contacted as outside the cooldown', () => {
    expect(evaluateAliOutreachEligibility(ctx({ daysSinceLastAliOutreach: null })).eligible).toBe(
      true,
    );
  });

  it('allows the last send of the day but not one more', () => {
    expect(evaluateAliOutreachEligibility(ctx({ aliSendsToday: ALI_DAILY_CAP - 1 })).eligible).toBe(
      true,
    );
    expect(evaluateAliOutreachEligibility(ctx({ aliSendsToday: ALI_DAILY_CAP })).eligible).toBe(
      false,
    );
  });
});

describe('the daily cap is SHARED across leads and Explorers', () => {
  it('is consumed by sends this learner had nothing to do with', () => {
    // Plan §11 rejected a separate Explorer campaign precisely because it would
    // split the cap. Two caps of ten are a cap of twenty that reads as ten in
    // both places.
    const v = evaluateAliOutreachEligibility(ctx({ aliSendsToday: ALI_DAILY_CAP }));
    expect(v.eligible).toBe(false);
    expect(v.reasons.join(' ')).toContain('shared across leads and Explorers');
  });

  it('reports remaining capacity against the shared total', () => {
    expect(remainingAliCapacity(0)).toBe(ALI_DAILY_CAP);
    expect(remainingAliCapacity(7)).toBe(ALI_DAILY_CAP - 7);
    expect(remainingAliCapacity(ALI_DAILY_CAP)).toBe(0);
  });

  it('never reports negative capacity', () => {
    // A negative budget reads as capacity to any caller doing arithmetic on it.
    expect(remainingAliCapacity(ALI_DAILY_CAP + 5)).toBe(0);
    expect(remainingAliCapacity(-3)).toBe(ALI_DAILY_CAP);
  });

  it('treats an unmeasurable count as no capacity', () => {
    expect(remainingAliCapacity(NaN)).toBe(0);
  });
});

describe('it fails closed on unmeasurable input', () => {
  it('refuses when a score is NaN', () => {
    // NaN answers false to every comparison, so without an explicit check it
    // would silently satisfy "not above the limit".
    const v = evaluateAliOutreachEligibility(ctx({ eScore: NaN }));
    expect(v.eligible).toBe(false);
    expect(v.reasons.join(' ')).toContain('not finite');
  });

  it('refuses when friction is NaN', () => {
    expect(evaluateAliOutreachEligibility(ctx({ fScore: NaN })).eligible).toBe(false);
  });
});
