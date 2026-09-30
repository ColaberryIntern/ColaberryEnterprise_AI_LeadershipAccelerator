import { frictionRecovery, FRICTION_RECOVERY_THRESHOLD } from '../frictionRecovery';
import {
  inConversation,
  personalisedLearning,
  community,
  generalNurture,
  referral,
} from '../nurture';
import { activationRescue } from '../activationRescue';
import { highIntent } from '../highIntent';
import type { GovernorContext } from '../../types';
import type { ExplorerPrimaryState, ExplorerOverlay } from '../../../../../types/explorerGrowth';

const NOW = new Date('2026-08-23T12:00:00Z');

function ctx(over: Partial<GovernorContext> = {}): GovernorContext {
  return {
    enrollment_id: 'e1',
    primary_state: 'ACTIVATING',
    overlays: [],
    scores: { e: 20, i: 0, f: 0 },
    affinities: [],
    readout: { lastEngagementAt: NOW, recentIntentTier: 0 } as any,
    days_in_current_state: 5,
    contactability: { email: { eligible: true }, in_app: { eligible: true } },
    hardStop: {
      converted: false,
      unsubscribed: false,
      dnc: false,
      consentRevoked: false,
      killSwitch: false,
      campaignInactive: false,
    },
    asOf: NOW,
    ...over,
  };
}

const withOverlay = (o: ExplorerOverlay, extra: Partial<GovernorContext> = {}) =>
  ctx({ overlays: [o], ...extra });

describe('tier 2 — friction recovery', () => {
  it('fires on the FRICTION overlay', () => {
    const c = withOverlay('FRICTION', { scores: { e: 20, i: 0, f: 30 } });
    expect(frictionRecovery(c)!.priority_tier).toBe(2);
  });

  it('fires on the score alone at the documented threshold', () => {
    expect(frictionRecovery(ctx({ scores: { e: 0, i: 0, f: FRICTION_RECOVERY_THRESHOLD } }))).not.toBeNull();
    expect(frictionRecovery(ctx({ scores: { e: 0, i: 0, f: FRICTION_RECOVERY_THRESHOLD - 1 } }))).toBeNull();
  });

  it('routes to a HUMAN when the address bounced — not an email into a void', () => {
    const c = withOverlay('NEEDS_SUPPORT', {
      contactability: { email: { eligible: false, reason: 'lead_status_bounced' } },
    });
    const r = frictionRecovery(c)!;
    expect(r.action_type).toBe('CREATE_HUMAN_TASK');
    expect(r.channel).toBe('none');
    expect(r.intra_tier_score).toBe(95);
  });

  it('stays silent for a learner with no friction', () => {
    expect(frictionRecovery(ctx())).toBeNull();
  });
});

describe('tier 2 outranks tier 3 — friction beats a reply (§9.1)', () => {
  it('produces both, and friction carries the lower tier', () => {
    // A learner who replied BECAUSE their payment failed needs recovery, not a
    // sales reply. The arbiter picks; this proves it has both to choose from.
    const c = ctx({
      overlays: ['FRICTION', 'IN_CONVERSATION'],
      scores: { e: 20, i: 0, f: 40 },
    });
    const f = frictionRecovery(c)!;
    const r = inConversation(c)!;
    expect(f.priority_tier).toBe(2);
    expect(r.priority_tier).toBe(3);
    expect(f.priority_tier).toBeLessThan(r.priority_tier);
  });
});

describe('tier 3 — a reply becomes a human task, never an automated response', () => {
  it('fires on IN_CONVERSATION and produces no campaign', () => {
    const r = inConversation(withOverlay('IN_CONVERSATION'))!;
    expect(r.action_type).toBe('CREATE_HUMAN_TASK');
    expect(r.campaign_key).toBeNull();
  });

  it('stays silent without the overlay', () => {
    expect(inConversation(ctx())).toBeNull();
  });
});

describe('tier 7 — personalised learning', () => {
  it.each(['ACTIVE_LEARNER', 'ENGAGED_LEARNER', 'CONNECTED_TO_COMMUNITY'] as ExplorerPrimaryState[])(
    'fires for %s',
    (state) => {
      expect(personalisedLearning(ctx({ primary_state: state }))!.priority_tier).toBe(7);
    },
  );

  it('does NOT fire for a learner who has not started', () => {
    expect(personalisedLearning(ctx({ primary_state: 'ACTIVATING' }))).toBeNull();
  });

  it('ranks higher with more affinity evidence, but never above its tier', () => {
    const none = personalisedLearning(ctx({ primary_state: 'ACTIVE_LEARNER' }))!;
    const some = personalisedLearning(
      ctx({
        primary_state: 'ACTIVE_LEARNER',
        affinities: [
          { tag: 'agentic_ai', confidence: 0.6 },
          { tag: 'ai_builder', confidence: 0.5 },
        ],
      }),
    )!;
    expect(some.intra_tier_score).toBeGreaterThan(none.intra_tier_score);
    expect(some.priority_tier).toBe(7);
  });

  it('ignores affinities below the 0.35 confidence threshold', () => {
    const weak = personalisedLearning(
      ctx({ primary_state: 'ACTIVE_LEARNER', affinities: [{ tag: 'leadership', confidence: 0.3 }] }),
    )!;
    expect(weak.required_assets[0].affinity_tags).toEqual([]);
  });
});

describe('tiers 8, 9, 10', () => {
  it('community fires only for CONNECTED_TO_COMMUNITY', () => {
    expect(community(ctx({ primary_state: 'CONNECTED_TO_COMMUNITY' }))!.priority_tier).toBe(8);
    expect(community(ctx({ primary_state: 'ACTIVE_LEARNER' }))).toBeNull();
  });

  it('general nurture is the last resort and fires for anyone reachable', () => {
    const r = generalNurture(ctx())!;
    expect(r.priority_tier).toBe(9);
    expect(r.intra_tier_score).toBe(30);
  });

  it('nothing fires when the learner is unreachable', () => {
    const unreachable = ctx({ contactability: { email: { eligible: false } } });
    expect(generalNurture(unreachable)).toBeNull();
    expect(community(ctx({ primary_state: 'CONNECTED_TO_COMMUNITY', contactability: { email: { eligible: false } } }))).toBeNull();
    expect(personalisedLearning(ctx({ primary_state: 'ACTIVE_LEARNER', contactability: { email: { eligible: false } } }))).toBeNull();
  });

  it('referral fires only on REFERRAL_READY', () => {
    expect(referral(withOverlay('REFERRAL_READY'))!.priority_tier).toBe(10);
    expect(referral(ctx())).toBeNull();
  });
});

describe('deferred tiers stay absent (§9.1 tier 4)', () => {
  it('NO generator produces a tier-4 event-logistics candidate', () => {
    // There is no event calendar, and EVENT_REGISTERED's exit needs
    // event.ends_at — EPIC 3 already deferred both to EPIC 7. Asserted absent
    // rather than silently missing, the same treatment EPIC 3 gave its 13
    // deferred §8 rules.
    const generators = [
      frictionRecovery, inConversation, personalisedLearning,
      community, generalNurture, referral, activationRescue, highIntent,
    ];
    const eventish = ctx({ overlays: ['EVENT_REGISTERED', 'EVENT_ATTENDED'] });
    const tiers = generators.map((g) => g(eventish)).filter(Boolean).map((c) => c!.priority_tier);
    expect(tiers).not.toContain(4);
  });
});

describe('every generator is pure and self-describing', () => {
  const generators = [
    frictionRecovery, inConversation, personalisedLearning,
    community, generalNurture, referral, activationRescue, highIntent,
  ];

  it('returns the same result twice for the same input', () => {
    const c = ctx({ primary_state: 'CONNECTED_TO_COMMUNITY', overlays: ['REFERRAL_READY'] });
    for (const g of generators) expect(g(c)).toEqual(g(c));
  });

  it('every candidate carries a rationale and a valid tier', () => {
    const c = ctx({ primary_state: 'CONNECTED_TO_COMMUNITY', overlays: ['REFERRAL_READY', 'FRICTION'], scores: { e: 60, i: 0, f: 30 } });
    const produced = generators.map((g) => g(c)).filter(Boolean);
    expect(produced.length).toBeGreaterThan(0);
    for (const cand of produced) {
      expect(cand!.rationale.length).toBeGreaterThan(0);
      expect(cand!.priority_tier).toBeGreaterThanOrEqual(0);
      expect(cand!.priority_tier).toBeLessThanOrEqual(10);
      expect(cand!.intra_tier_score).toBeGreaterThanOrEqual(0);
      expect(cand!.intra_tier_score).toBeLessThanOrEqual(100);
    }
  });
});
