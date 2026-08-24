import { activationRescue } from '../activationRescue';
import { highIntent, HIGH_INTENT_REQUIRED_SCORE } from '../highIntent';
import { hardStopReason } from '../hardStop';
import type { GovernorContext } from '../../types';
import type { ExplorerPrimaryState } from '../../../../../types/explorerGrowth';

const NOW = new Date('2026-08-23T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/**
 * THE REAL PRODUCTION DISTRIBUTION, measured 2026-08-23 against
 * `accelerator_prod` after EPIC 3's corrected recompute:
 *
 *   ACTIVATING              134
 *   CONVERTED                 9   (2 paid, 7 @colaberry.com staff)
 *   ACTIVE_LEARNER            6
 *   ENGAGED_LEARNER           2
 *   CONNECTED_TO_COMMUNITY    2
 *   ---------------------------
 *   total                   153
 *
 *   max e = 78, max i = 2, max f = 0
 *
 * These are not invented figures. Generating against the population that
 * actually exists is what catches a generator tuned for a rich-signal audience
 * we do not have.
 */
const REAL_DISTRIBUTION: Array<{ state: ExplorerPrimaryState; count: number }> = [
  { state: 'ACTIVATING', count: 134 },
  { state: 'CONVERTED', count: 9 },
  { state: 'ACTIVE_LEARNER', count: 6 },
  { state: 'ENGAGED_LEARNER', count: 2 },
  { state: 'CONNECTED_TO_COMMUNITY', count: 2 },
];

const MAX_REAL_INTENT = 2;

function learner(state: ExplorerPrimaryState, i = 0): GovernorContext {
  return {
    enrollment_id: `e-${state}-${i}`,
    primary_state: state,
    overlays: [],
    // Intent is pinned to the real maximum. A test that quietly used i=80 would
    // prove the generator works on data we do not have.
    scores: { e: 40, i: Math.min(i, MAX_REAL_INTENT), f: 0 },
    affinities: [],
    readout: { lastEngagementAt: daysAgo(20), recentIntentTier: 0 } as any,
    days_in_current_state: 10,
    contactability: { email: { eligible: true }, in_app: { eligible: true } },
    hardStop: {
      converted: state === 'CONVERTED',
      unsubscribed: false,
      dnc: false,
      consentRevoked: false,
      killSwitch: false,
      campaignInactive: false,
    },
    asOf: NOW,
  };
}

/** The full 153, as they actually are. */
function population(): GovernorContext[] {
  const out: GovernorContext[] = [];
  for (const { state, count } of REAL_DISTRIBUTION) {
    for (let n = 0; n < count; n += 1) out.push(learner(state, n));
  }
  return out;
}

describe('against the real production population', () => {
  it('is exactly 153 learners', () => {
    expect(population()).toHaveLength(153);
  });

  it('produces ZERO tier-5 commercial candidates', () => {
    // The single most valuable assertion in this task. Max intent is 2 and
    // HIGH_INTENT needs 60 — any commercial push to this population is a
    // defect, not a judgement call.
    const commercial = population()
      .filter((c) => hardStopReason(c) === null)
      .map(highIntent)
      .filter(Boolean);
    expect(commercial).toEqual([]);
    expect(MAX_REAL_INTENT).toBeLessThan(HIGH_INTENT_REQUIRED_SCORE);
  });

  it('generates NOTHING for any of the 9 CONVERTED, including the 7 staff', () => {
    const converted = population().filter((c) => c.primary_state === 'CONVERTED');
    expect(converted).toHaveLength(9);
    for (const c of converted) {
      expect(hardStopReason(c)).toBe('converted');
    }
  });

  it('reaches the 134 ACTIVATING learners with activation rescue', () => {
    // If this tier is silent, the Governor has nothing to say to 88% of the
    // audience — which would make the whole epic pointless in its current state.
    const activating = population().filter((c) => c.primary_state === 'ACTIVATING');
    const rescued = activating.map(activationRescue).filter(Boolean);
    expect(activating).toHaveLength(134);
    expect(rescued).toHaveLength(134);
    for (const r of rescued) expect(r!.priority_tier).toBe(6);
  });

  it('does not offer activation rescue to learners past activation', () => {
    for (const state of ['ACTIVE_LEARNER', 'ENGAGED_LEARNER', 'CONNECTED_TO_COMMUNITY'] as const) {
      expect(activationRescue(learner(state))).toBeNull();
    }
  });

  it('every candidate carries a rationale a human can read', () => {
    const all = population()
      .filter((c) => hardStopReason(c) === null)
      .flatMap((c) => [activationRescue(c), highIntent(c)])
      .filter(Boolean);
    expect(all.length).toBeGreaterThan(0);
    for (const c of all) {
      expect(c!.rationale.length).toBeGreaterThan(0);
      for (const r of c!.rationale) expect(typeof r).toBe('string');
    }
  });
});

describe('activation rescue distinguishes never-started from lapsed', () => {
  it('scores a never-engaged learner differently from a lapsed one', () => {
    const never = learner('ACTIVATING');
    (never.readout as any).lastEngagementAt = null;
    const lapsed = learner('ACTIVATING');

    const a = activationRescue(never)!;
    const b = activationRescue(lapsed)!;
    expect(a.campaign_key).toBe('explorer_activation_never_started');
    expect(b.campaign_key).toBe('explorer_activation_restart');
    expect(a.intra_tier_score).not.toBe(b.intra_tier_score);
  });

  it('falls back to in-app when email is ineligible', () => {
    const c = learner('ACTIVATING');
    c.contactability.email = { eligible: false, reason: 'unsubscribed' };
    const r = activationRescue(c)!;
    expect(r.channel).toBe('in_app');
    expect(r.action_type).toBe('SHOW_IN_APP_NUDGE');
  });

  it('produces nothing when no channel is reachable', () => {
    const c = learner('ACTIVATING');
    c.contactability = { email: { eligible: false }, in_app: { eligible: false } };
    expect(activationRescue(c)).toBeNull();
  });
});

describe('high intent, when it eventually can fire', () => {
  it('fires only with the overlay, the score, and low friction', () => {
    const c = learner('CONSIDERING_NEXT_STEP');
    c.overlays = ['HIGH_INTENT'];
    c.scores = { e: 50, i: 75, f: 0 };
    expect(highIntent(c)!.priority_tier).toBe(5);
  });

  it('refuses when friction is high, even with the overlay', () => {
    // A learner whose payment just failed needs recovery, never a sales push.
    const c = learner('CONSIDERING_NEXT_STEP');
    c.overlays = ['HIGH_INTENT'];
    c.scores = { e: 50, i: 75, f: 25 };
    expect(highIntent(c)).toBeNull();
  });

  it('refuses on the overlay alone if the score contradicts it', () => {
    const c = learner('CONSIDERING_NEXT_STEP');
    c.overlays = ['HIGH_INTENT'];
    c.scores = { e: 50, i: 59, f: 0 };
    expect(highIntent(c)).toBeNull();
  });
});
