import { decideForLearner } from '../decideForLearner';
import { hoursSinceLastBrainPick } from '../brainCadence';
import {
  BRAIN_PICK_MIN_HOURS,
  CONTACT_WINDOW_DAYS,
  MAX_CONTACTS_PER_WINDOW,
  MIN_HOURS_BETWEEN_CONTACTS,
  evaluateContact,
  hoursBetweenDecisionDates,
} from '../contactPolicy';
import type { Candidate, ContactPolicyInput, GovernorContext } from '../types';

/**
 * OH1j: one brain pick per person per 72 hours, counted on SHADOW picks (draft rows), and
 * nothing at all while the Open House countdown is live. The existing contact policy
 * constants are untouched.
 */

const NOW = new Date('2026-11-18T08:00:00Z');

const allow: ContactPolicyInput = {
  channelEligible: true,
  consent: { verdict: 'allow', reason: 'express_consent', hasRecord: true },
  recentContactCount: 0,
  hoursSinceLastContact: null,
};

function ctx(over: Partial<GovernorContext> = {}): GovernorContext {
  return {
    enrollment_id: 'e-1',
    primary_state: 'ACTIVATING',
    overlays: [],
    scores: { e: 20, i: 0, f: 0 },
    affinities: [],
    readout: { lastEngagementAt: new Date(NOW.getTime() - 20 * 86_400_000), recentIntentTier: 0 } as any,
    days_in_current_state: 10,
    contactability: { email: { eligible: true }, in_app: { eligible: true } },
    hardStop: { converted: false, unsubscribed: false, dnc: false, consentRevoked: false, killSwitch: false, campaignInactive: false },
    asOf: NOW,
    ...over,
  };
}

const opts = (policy: ContactPolicyInput) => ({
  policyInputFor: (_c: Candidate) => policy,
  profileTimestamps: { created_at: new Date(NOW.getTime() - 30 * 86_400_000), scores_computed_at: new Date(NOW.getTime() - 3_600_000) },
});

describe('the existing contact policy constants are unchanged', () => {
  it('3 per 7 days, 48 h apart; brain cadence 72 h', () => {
    expect(MAX_CONTACTS_PER_WINDOW).toBe(3);
    expect(CONTACT_WINDOW_DAYS).toBe(7);
    expect(MIN_HOURS_BETWEEN_CONTACTS).toBe(48);
    expect(BRAIN_PICK_MIN_HOURS).toBe(72);
  });
});

describe('evaluateContact: the brain cadence', () => {
  const email = { channel: 'email' as const };

  it('blocks an email 48 h after the last brain pick', () => {
    expect(evaluateContact(email, { ...allow, hoursSinceLastBrainPick: 48 })).toEqual({
      allowed: false, reason: 'brain_cadence (48h < 72h)',
    });
  });

  it('allows at exactly 72 h, and when there has never been a pick', () => {
    expect(evaluateContact(email, { ...allow, hoursSinceLastBrainPick: 72 }).allowed).toBe(true);
    expect(evaluateContact(email, { ...allow, hoursSinceLastBrainPick: null }).allowed).toBe(true);
  });

  it('ignores the field when the caller does not track brain picks (Growth Journey)', () => {
    expect(evaluateContact(email, allow).allowed).toBe(true);
  });

  it('treats NaN as too recent (fail closed)', () => {
    expect(evaluateContact(email, { ...allow, hoursSinceLastBrainPick: Number.NaN }).allowed).toBe(false);
  });

  it('does not apply to a non-email action', () => {
    expect(evaluateContact({ channel: 'in_app' }, { ...allow, hoursSinceLastBrainPick: 1 }).allowed).toBe(true);
    expect(evaluateContact({ channel: 'none' }, { ...allow, hoursSinceLastBrainPick: 1 }).allowed).toBe(true);
  });
});

describe('hoursSinceLastBrainPick: shadow picks count', () => {
  it('reads the newest earlier pick (a shadow draft) in whole decision days', async () => {
    const asked: Array<[number, string]> = [];
    const h = await hoursSinceLastBrainPick(42, '2026-11-18', {
      lastPickDate: async (lead, before) => { asked.push([lead, before]); return '2026-11-16'; },
    });
    expect(h).toBe(48);
    // Strictly before today, so re-running today's Governor never holds today's own decision.
    expect(asked).toEqual([[42, '2026-11-18']]);
  });

  it('null when there has never been a pick', async () => {
    expect(await hoursSinceLastBrainPick(42, '2026-11-18', { lastPickDate: async () => null })).toBeNull();
  });

  it('null with no lead (no draft row can exist), without reading', async () => {
    const lastPickDate = jest.fn();
    expect(await hoursSinceLastBrainPick(null, '2026-11-18', { lastPickDate })).toBeNull();
    expect(lastPickDate).not.toHaveBeenCalled();
  });

  it('a failed read is 0 hours, i.e. held (fail closed)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await hoursSinceLastBrainPick(42, '2026-11-18', { lastPickDate: async () => { throw new Error('db'); } })).toBe(0);
    warn.mockRestore();
  });

  it('day arithmetic', () => {
    expect(hoursBetweenDecisionDates('2026-11-18', '2026-11-15')).toBe(72);
    expect(Number.isNaN(hoursBetweenDecisionDates('2026-11-18', 'junk'))).toBe(true);
  });
});

describe('decideForLearner: one brain pick per 72 h, and held during the countdown', () => {
  it('a reachable learner with a pick 2 days ago WAITs, and the row says why', () => {
    const d = decideForLearner(ctx(), opts({ ...allow, hoursSinceLastBrainPick: 48 }));
    expect(d.action_type).toBe('WAIT');
    expect(d.rationale[0]).toBe('winner blocked by contact policy: brain_cadence (48h < 72h)');
    expect(d.executed).toBe(false);
  });

  it('the same learner 3 days after the pick gets an email decision (still shadow)', () => {
    const d = decideForLearner(ctx(), opts({ ...allow, hoursSinceLastBrainPick: 72 }));
    expect(d.channel).toBe('email');
    expect(d.executed).toBe(false);
  });

  it('a live Open House countdown is a hard stop, whatever the brain cadence says', () => {
    const d = decideForLearner(
      ctx({ hardStop: { ...ctx().hardStop, openHouseCountdown: true } }),
      opts({ ...allow, hoursSinceLastBrainPick: null }),
    );
    expect(d.action_type).toBe('WAIT');
    expect(d.rationale[0]).toBe('hard stop: open_house_countdown');
  });
});
