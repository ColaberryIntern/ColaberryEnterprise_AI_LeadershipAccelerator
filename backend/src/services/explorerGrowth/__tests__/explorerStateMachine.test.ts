import { classify, DEFERRED_RULES } from '../explorerStateMachine';
import type { ClassifyInput } from '../explorerStateMachine';
import type {
  ExplorerPrimaryState,
  ExplorerSignalReadout,
  ExplorerIntentTier,
} from '../../../types/explorerGrowth';
import type { ExplorerScores } from '../explorerScoringService';

const NOW = new Date('2026-08-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

type Sig = { signal: string; occurrences?: number; lastOccurredAt?: Date };

function scores(e = 0, i = 0, f = 0): ExplorerScores {
  return {
    e,
    i,
    f,
    bands: {
      engagement: { achievement: 0, progress: 0, recency: 0 },
      intent: { raw: i, tierCapped: false },
      friction: { raw: f },
    },
  };
}

function readout(opts: {
  engagement?: Sig[];
  intent?: Sig[];
  friction?: Sig[];
  recentIntentTier?: ExplorerIntentTier | 0;
  lastEngagementAt?: Date | null;
}): ExplorerSignalReadout {
  const band = (b: 'engagement' | 'intent' | 'friction', sigs: Sig[] = []) => ({
    band: b,
    total: 0,
    signals: sigs.map((s) => ({
      signal: s.signal,
      occurrences: s.occurrences ?? 1,
      contribution: 1,
      lastOccurredAt: s.lastOccurredAt ?? NOW,
    })),
  });
  return {
    enrollment_id: 'e1',
    lead_id: null,
    asOf: NOW,
    bands: {
      engagement: band('engagement', opts.engagement),
      intent: band('intent', opts.intent),
      friction: band('friction', opts.friction),
    },
    highestIntentTier: opts.recentIntentTier ?? 0,
    recentIntentTier: opts.recentIntentTier ?? 0,
    lastEngagementAt:
      opts.lastEngagementAt !== undefined
        ? opts.lastEngagementAt
        : opts.engagement?.length
          ? NOW
          : null,
  };
}

function input(over: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    previousProfile: null,
    scores: scores(),
    readout: readout({}),
    affinities: [],
    entitlement: { hasFullCurriculumAccess: false, hasActiveNonCompSubscription: false },
    enrollment: { createdAt: NOW },
    asOf: NOW,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Primary states — the ladder
// ---------------------------------------------------------------------------

describe('primary states', () => {
  it('P1 — a brand-new Explorer with nothing is NEW_EXPLORER', () => {
    expect(classify(input()).primary_state).toBe('NEW_EXPLORER');
  });

  it('P3/P5 — 72h elapsed promotes to ACTIVATING with no activity at all', () => {
    const r = classify(input({ enrollment: { createdAt: hoursAgo(73) } }));
    expect(r.primary_state).toBe('ACTIVATING');
  });

  it('P3 — holds at NEW_EXPLORER just under 72h', () => {
    expect(classify(input({ enrollment: { createdAt: hoursAgo(71) } })).primary_state).toBe(
      'NEW_EXPLORER',
    );
  });

  it('P2/P4 — a feed interaction promotes to ACTIVATING immediately', () => {
    const r = classify(input({ readout: readout({ engagement: [{ signal: 'first_card_interacted' }] }) }));
    expect(r.primary_state).toBe('ACTIVATING');
  });

  it('P8 — one completed card is ACTIVE_LEARNER', () => {
    const r = classify(input({ readout: readout({ engagement: [{ signal: 'card_completed' }] }) }));
    expect(r.primary_state).toBe('ACTIVE_LEARNER');
  });

  it('P9/P11 — E >= 45 AND 3 cards is ENGAGED_LEARNER', () => {
    const r = classify(
      input({
        scores: scores(45),
        readout: readout({ engagement: [{ signal: 'card_completed', occurrences: 3 }] }),
      }),
    );
    expect(r.primary_state).toBe('ENGAGED_LEARNER');
  });

  it('P9 — 3 cards but E below 45 stays ACTIVE_LEARNER', () => {
    const r = classify(
      input({
        scores: scores(44),
        readout: readout({ engagement: [{ signal: 'card_completed', occurrences: 3 }] }),
      }),
    );
    expect(r.primary_state).toBe('ACTIVE_LEARNER');
  });

  it('P12/P14 — a community contribution is CONNECTED_TO_COMMUNITY', () => {
    const r = classify(
      input({ readout: readout({ engagement: [{ signal: 'community_contribution' }] }) }),
    );
    expect(r.primary_state).toBe('CONNECTED_TO_COMMUNITY');
  });

  it('P13/P15/P16 — I >= 45 with a T2+ signal is CONSIDERING_NEXT_STEP', () => {
    const r = classify(input({ scores: scores(0, 45), readout: readout({ recentIntentTier: 2 }) }));
    expect(r.primary_state).toBe('CONSIDERING_NEXT_STEP');
  });

  it('P16 — I >= 45 WITHOUT a T2+ signal does not reach CONSIDERING_NEXT_STEP', () => {
    // Views are not readiness, even a lot of them.
    const r = classify(input({ scores: scores(0, 45), readout: readout({ recentIntentTier: 1 }) }));
    expect(r.primary_state).not.toBe('CONSIDERING_NEXT_STEP');
  });

  it('P17/P19 — I >= 70, T3+, F < 25 is ENROLLMENT_READY', () => {
    const r = classify(input({ scores: scores(0, 70, 24), readout: readout({ recentIntentTier: 3 }) }));
    expect(r.primary_state).toBe('ENROLLMENT_READY');
  });

  it('P19 — friction at 25 BLOCKS ENROLLMENT_READY', () => {
    // Do not push enrolment at someone whose payment just failed.
    const r = classify(input({ scores: scores(0, 70, 25), readout: readout({ recentIntentTier: 3 }) }));
    expect(r.primary_state).not.toBe('ENROLLMENT_READY');
  });

  it('P19 — I >= 70 with only a T2 signal does not reach ENROLLMENT_READY', () => {
    const r = classify(input({ scores: scores(0, 70), readout: readout({ recentIntentTier: 2 }) }));
    expect(r.primary_state).toBe('CONSIDERING_NEXT_STEP');
  });
});

// ---------------------------------------------------------------------------
// CONVERTED — the rule whose inversion keeps marketing to paying customers
// ---------------------------------------------------------------------------

describe('P22/P23/P25 — CONVERTED', () => {
  it('entitlement ALONE converts (the OR, left side)', () => {
    const r = classify(
      input({ entitlement: { hasFullCurriculumAccess: true, hasActiveNonCompSubscription: false } }),
    );
    expect(r.primary_state).toBe('CONVERTED');
  });

  it('subscription ALONE converts (the OR, right side)', () => {
    // An AND here would keep marketing to someone who paid but has no
    // subscription row — the exact failure this rule exists to prevent.
    const r = classify(
      input({ entitlement: { hasFullCurriculumAccess: false, hasActiveNonCompSubscription: true } }),
    );
    expect(r.primary_state).toBe('CONVERTED');
  });

  it('is TERMINAL — no input demotes a converted learner', () => {
    const r = classify(
      input({
        previousProfile: { primary_state: 'CONVERTED' },
        entitlement: { hasFullCurriculumAccess: false, hasActiveNonCompSubscription: false },
        scores: scores(0, 0, 100),
      }),
    );
    expect(r.primary_state).toBe('CONVERTED');
  });
});

// ---------------------------------------------------------------------------
// Monotonicity
// ---------------------------------------------------------------------------

describe('monotonicity (§8 line 765)', () => {
  it('an inactive ACTIVE_LEARNER stays ACTIVE_LEARNER and gains DORMANT', () => {
    // Demoting them to NEW_EXPLORER would restart their onboarding.
    const r = classify(
      input({
        previousProfile: { primary_state: 'ACTIVE_LEARNER' },
        readout: readout({ lastEngagementAt: daysAgo(30) }),
      }),
    );
    expect(r.primary_state).toBe('ACTIVE_LEARNER');
    expect(r.overlays).toContain('DORMANT');
  });

  it.each([
    ['ENGAGED_LEARNER'],
    ['CONNECTED_TO_COMMUNITY'],
  ] as [ExplorerPrimaryState][])('never steps down from %s', (previous) => {
    const r = classify(input({ previousProfile: { primary_state: previous } }));
    expect(r.primary_state).toBe(previous);
  });

  it('DOES allow a commercial state to regress — intent decays', () => {
    const r = classify(
      input({
        previousProfile: { primary_state: 'CONSIDERING_NEXT_STEP' },
        readout: readout({ engagement: [{ signal: 'card_completed' }] }),
      }),
    );
    expect(r.primary_state).toBe('ACTIVE_LEARNER');
  });

  it('promotes normally when evidence improves', () => {
    const r = classify(
      input({
        previousProfile: { primary_state: 'ACTIVATING' },
        readout: readout({ engagement: [{ signal: 'card_completed' }] }),
      }),
    );
    expect(r.primary_state).toBe('ACTIVE_LEARNER');
  });
});

// ---------------------------------------------------------------------------
// Overlays — derived fresh, never accumulated
// ---------------------------------------------------------------------------

describe('overlays', () => {
  it('O1 — DORMANT after 14d with no engagement', () => {
    const r = classify(input({ readout: readout({ lastEngagementAt: daysAgo(14) }) }));
    expect(r.overlays).toContain('DORMANT');
  });

  it('O2 — DORMANT clears on any engagement, without an explicit exit step', () => {
    const r = classify(input({ readout: readout({ lastEngagementAt: daysAgo(13) }) }));
    expect(r.overlays).not.toContain('DORMANT');
  });

  it('O3 — HIGH_INTENT needs I >= 60 AND a recent T3+', () => {
    const r = classify(
      input({
        scores: scores(0, 60),
        readout: readout({ recentIntentTier: 3, intent: [{ signal: 'enrollment_form_started' }] }),
      }),
    );
    expect(r.overlays).toContain('HIGH_INTENT');
  });

  it('O3 — high I from tier-1 views alone does NOT grant HIGH_INTENT', () => {
    const r = classify(
      input({
        scores: scores(0, 95),
        readout: readout({ recentIntentTier: 1, intent: [{ signal: 'pricing_page_view' }] }),
      }),
    );
    expect(r.overlays).not.toContain('HIGH_INTENT');
  });

  it('O4 — HIGH_INTENT drops when the last T2+ is older than 21d', () => {
    const r = classify(
      input({
        scores: scores(0, 80),
        readout: readout({
          recentIntentTier: 3,
          intent: [{ signal: 'enrollment_form_started', lastOccurredAt: daysAgo(22) }],
        }),
      }),
    );
    expect(r.overlays).not.toContain('HIGH_INTENT');
  });

  it('O5 — FRICTION at F >= 25', () => {
    expect(classify(input({ scores: scores(0, 0, 25) })).overlays).toContain('FRICTION');
    expect(classify(input({ scores: scores(0, 0, 24) })).overlays).not.toContain('FRICTION');
  });

  it('O6a — FRICTION clears when F falls, WITHOUT accumulating from a prior run', () => {
    // Fresh derivation is why a learner cannot get stuck in FRICTION.
    const r = classify(input({ previousProfile: { primary_state: 'ACTIVE_LEARNER' }, scores: scores(0, 0, 10) }));
    expect(r.overlays).not.toContain('FRICTION');
  });

  it('O7a — NEEDS_SUPPORT on a hard bounce', () => {
    const r = classify(input({ readout: readout({ friction: [{ signal: 'email_hard_bounce' }] }) }));
    expect(r.overlays).toContain('NEEDS_SUPPORT');
  });

  it('O11 — EVENT_REGISTERED while registration is the latest event evidence', () => {
    const r = classify(input({ readout: readout({ intent: [{ signal: 'event_registered' }] }) }));
    expect(r.overlays).toContain('EVENT_REGISTERED');
  });

  it('O13/O14 — EVENT_ATTENDED holds 30d then expires', () => {
    const fresh = classify(input({ readout: readout({ intent: [{ signal: 'event_attended', lastOccurredAt: daysAgo(30) }] }) }));
    expect(fresh.overlays).toContain('EVENT_ATTENDED');
    const stale = classify(input({ readout: readout({ intent: [{ signal: 'event_attended', lastOccurredAt: daysAgo(31) }] }) }));
    expect(stale.overlays).not.toContain('EVENT_ATTENDED');
  });

  it('O17 — INTERNSHIP_READY needs affinity >= 0.5 AND E >= 50', () => {
    const yes = classify(input({ scores: scores(50), affinities: [{ tag: 'ai_internship', confidence: 0.5 }] }));
    expect(yes.overlays).toContain('INTERNSHIP_READY');
    const lowAffinity = classify(input({ scores: scores(50), affinities: [{ tag: 'ai_internship', confidence: 0.49 }] }));
    expect(lowAffinity.overlays).not.toContain('INTERNSHIP_READY');
  });

  it('O21 — REFERRAL_READY needs E >= 60 AND a contribution', () => {
    const r = classify(
      input({ scores: scores(60), readout: readout({ engagement: [{ signal: 'community_contribution' }] }) }),
    );
    expect(r.overlays).toContain('REFERRAL_READY');
  });

  it('O23/O24 — IN_CONVERSATION for 7d after a reply', () => {
    const fresh = classify(input({ readout: readout({ intent: [{ signal: 'reply_interested', lastOccurredAt: daysAgo(7) }] }) }));
    expect(fresh.overlays).toContain('IN_CONVERSATION');
    const stale = classify(input({ readout: readout({ intent: [{ signal: 'reply_interested', lastOccurredAt: daysAgo(8) }] }) }));
    expect(stale.overlays).not.toContain('IN_CONVERSATION');
  });
});

// ---------------------------------------------------------------------------
// Deferrals are a TESTED property, not a silent omission
// ---------------------------------------------------------------------------

describe('deferred rules stay absent', () => {
  it('never emits EVENT_READY — no event calendar exists (O9/O10)', () => {
    const r = classify(input({ scores: scores(80, 80), readout: readout({ recentIntentTier: 4 }) }));
    expect(r.overlays).not.toContain('EVENT_READY');
  });

  it('never emits EVENT_NO_SHOW — the repo has no no-show record (O15/O16)', () => {
    const r = classify(
      input({ readout: readout({ intent: [{ signal: 'event_registered', lastOccurredAt: daysAgo(60) }] }) }),
    );
    expect(r.overlays).not.toContain('EVENT_NO_SHOW');
  });

  it('never emits SUBSCRIPTION_READY — "no cohort fit" is undefined in §8 (O19/O20)', () => {
    const r = classify(input({ scores: scores(55, 40) }));
    expect(r.overlays).not.toContain('SUBSCRIPTION_READY');
  });

  it('documents every deferral with a reason and a target epic', () => {
    expect(DEFERRED_RULES.length).toBeGreaterThan(0);
    for (const d of DEFERRED_RULES) {
      expect(d.reason.length).toBeGreaterThan(10);
      expect(d.target.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Purity and the state clock
// ---------------------------------------------------------------------------

describe('purity and state_entered_at', () => {
  it('is pure — same input twice, identical output', () => {
    const i = input({ readout: readout({ engagement: [{ signal: 'card_completed' }] }) });
    expect(classify(i)).toEqual(classify(i));
  });

  it('does NOT restart the clock when the state is unchanged', () => {
    // §8's 30d and 72h durations are meaningless if every recompute resets them.
    const entered = daysAgo(10);
    const r = classify(
      input({
        previousProfile: { primary_state: 'ACTIVE_LEARNER', state_entered_at: entered },
        readout: readout({ engagement: [{ signal: 'card_completed' }] }),
      }),
    );
    expect(r.primary_state).toBe('ACTIVE_LEARNER');
    expect(r.state_entered_at.getTime()).toBe(entered.getTime());
  });

  it('DOES restart the clock when the state changes', () => {
    const r = classify(
      input({
        previousProfile: { primary_state: 'ACTIVATING', state_entered_at: daysAgo(10) },
        readout: readout({ engagement: [{ signal: 'card_completed' }] }),
      }),
    );
    expect(r.primary_state).toBe('ACTIVE_LEARNER');
    expect(r.state_entered_at.getTime()).toBe(NOW.getTime());
  });
});
