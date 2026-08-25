import { decideForLearner, RULESET_VERSION } from '../decideForLearner';
import type { GovernorContext, ContactPolicyInput, Candidate } from '../types';
import type { ExplorerPrimaryState } from '../../../../types/explorerGrowth';

const NOW = new Date('2026-08-23T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/** A profile the scorer HAS run for: scores_computed_at strictly after created_at. */
const SCORED = { created_at: daysAgo(30), scores_computed_at: new Date(NOW.getTime() - 3_600_000) };
/** What EPIC 1's bridge produces: both stamped together. */
const NEVER_SCORED = { created_at: daysAgo(1), scores_computed_at: daysAgo(1) };

const allowPolicy: ContactPolicyInput = {
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
    readout: { lastEngagementAt: daysAgo(20), recentIntentTier: 0 } as any,
    days_in_current_state: 10,
    contactability: { email: { eligible: true }, in_app: { eligible: true } },
    hardStop: {
      converted: false, unsubscribed: false, dnc: false,
      consentRevoked: false, killSwitch: false, campaignInactive: false,
    },
    asOf: NOW,
    ...over,
  };
}

const opts = (policy: ContactPolicyInput = allowPolicy, ts = SCORED) => ({
  policyInputFor: (_c: Candidate) => policy,
  profileTimestamps: ts,
});

describe('every learner gets a row — silence is recorded', () => {
  it('decides an action for a reachable ACTIVATING learner', () => {
    const d = decideForLearner(ctx(), opts());
    expect(d.action_type).not.toBe('WAIT');
    expect(d.enrollment_id).toBe('e-1');
    expect(d.decision_date).toBe('2026-08-23');
  });

  it('records WAIT rather than nothing when no candidate applies', () => {
    // "Why did nobody hear from us" must be answerable from the row.
    const unreachable = ctx({ contactability: { email: { eligible: false }, in_app: { eligible: false } } });
    const d = decideForLearner(unreachable, opts());
    expect(d.action_type).toBe('WAIT');
    expect(d.rationale[0]).toBe('no candidate applies');
  });

  it('always stamps ruleset_version — the column is NOT NULL', () => {
    expect(decideForLearner(ctx(), opts()).ruleset_version).toBe(RULESET_VERSION);
    expect(RULESET_VERSION).toBeTruthy();
  });

  it('never marks anything executed — this epic decides, it does not send', () => {
    const decisions = [
      decideForLearner(ctx(), opts()),
      decideForLearner(ctx({ hardStop: { ...ctx().hardStop, converted: true } }), opts()),
      decideForLearner(ctx(), opts(allowPolicy, NEVER_SCORED)),
    ];
    for (const d of decisions) expect(d.executed).toBe(false);
  });
});

describe('the freshness gate refuses before anything else', () => {
  it('refuses a profile the bridge created but the scorer never touched', () => {
    const d = decideForLearner(ctx(), opts(allowPolicy, NEVER_SCORED));
    expect(d.action_type).toBe('WAIT');
    expect(d.rationale[0]).toBe('refused: profile never_scored');
  });

  it('refuses a stale profile', () => {
    const stale = { created_at: daysAgo(30), scores_computed_at: daysAgo(3) };
    const d = decideForLearner(ctx(), opts(allowPolicy, stale));
    expect(d.rationale[0]).toBe('refused: profile stale');
  });

  it('refuses BEFORE evaluating the hard stop, so the reason is the more specific one', () => {
    const d = decideForLearner(
      ctx({ hardStop: { ...ctx().hardStop, converted: true } }),
      opts(allowPolicy, NEVER_SCORED),
    );
    expect(d.rationale[0]).toContain('never_scored');
  });
});

describe('tier 0 terminates — this is how the 7 staff accounts stay excluded', () => {
  it('produces WAIT with the reason for a converted learner', () => {
    const d = decideForLearner(ctx({ hardStop: { ...ctx().hardStop, converted: true } }), opts());
    expect(d.action_type).toBe('WAIT');
    expect(d.rationale[0]).toBe('hard stop: converted');
    expect(d.candidate_actions).toEqual([]);
  });

  it.each(['unsubscribed', 'dnc', 'consentRevoked', 'killSwitch', 'campaignInactive'])(
    'terminates on %s and generates no candidates at all',
    (flag) => {
      const d = decideForLearner(
        ctx({ hardStop: { ...ctx().hardStop, [flag]: true } as any }),
        opts(),
      );
      expect(d.action_type).toBe('WAIT');
      expect(d.candidate_actions).toEqual([]);
    },
  );
});

describe('the suppression record answers "why NOT"', () => {
  it('records every losing candidate with a reason', () => {
    const d = decideForLearner(ctx({ primary_state: 'CONNECTED_TO_COMMUNITY' }), opts());
    expect(d.candidate_actions.length).toBeGreaterThan(1);
    expect(d.suppressed_actions.length).toBeGreaterThan(0);
    for (const s of d.suppressed_actions) expect(s.reason).toBeTruthy();
  });

  it('records a policy-blocked WINNER as chosen-then-blocked, not as absent', () => {
    // Far more useful to a human than the candidate never appearing.
    const blocked: ContactPolicyInput = {
      ...allowPolicy,
      channelEligible: false,
      channelReason: 'lead_status_unsubscribed',
    };
    const d = decideForLearner(ctx(), opts(blocked));
    expect(d.action_type).toBe('WAIT');
    expect(d.rationale[0]).toContain('blocked by contact policy');
    expect(d.suppressed_actions.some((s) => s.reason === 'lead_status_unsubscribed')).toBe(true);
    expect(d.candidate_actions.length).toBeGreaterThan(0);
  });
});

describe('consent evidence reaches the row', () => {
  it('flags a decision permitted with NO consent record', () => {
    // Most Explorers have no consent record; evaluateConsent allows them under
    // can_spam_opt_out. That is not the same as consent, and the shadow review
    // has to be able to see which learners it applies to.
    const noEvidence: ContactPolicyInput = {
      ...allowPolicy,
      consent: { verdict: 'allow', reason: 'can_spam_opt_out', hasRecord: false },
    };
    const d = decideForLearner(ctx(), opts(noEvidence));
    expect(d.consent_note).toContain('can_spam_opt_out');
  });

  it('omits the note when a real record backs it', () => {
    expect(decideForLearner(ctx(), opts()).consent_note).toBeUndefined();
  });
});

describe('idempotency', () => {
  it('produces an identical decision for the same inputs', () => {
    expect(decideForLearner(ctx(), opts())).toEqual(decideForLearner(ctx(), opts()));
  });

  it('keys on the UTC date, matching the UNIQUE index', () => {
    const lateUtc = decideForLearner(
      ctx({ asOf: new Date('2026-08-23T23:59:59Z') }),
      opts(),
    );
    expect(lateUtc.decision_date).toBe('2026-08-23');
  });
});

describe('against the real population shape', () => {
  it.each([
    ['ACTIVATING', 'activation rescue'],
    ['ACTIVE_LEARNER', 'personalised learning'],
    ['CONNECTED_TO_COMMUNITY', 'community or better'],
  ] as [ExplorerPrimaryState, string][])('decides something for %s', (state) => {
    const d = decideForLearner(ctx({ primary_state: state }), opts());
    expect(d.action_type).not.toBe('WAIT');
  });

  it('never chooses a commercial action at the real max intent of 2', () => {
    // 153 learners, max i = 2, HIGH_INTENT needs 60. Any tier-5 action here is
    // a defect, not a lucky find.
    for (const state of ['ACTIVATING', 'ACTIVE_LEARNER', 'ENGAGED_LEARNER'] as ExplorerPrimaryState[]) {
      const d = decideForLearner(ctx({ primary_state: state, scores: { e: 40, i: 2, f: 0 } }), opts());
      expect(d.campaign_key).not.toBe('explorer_enrollment_ready');
    }
  });
});
