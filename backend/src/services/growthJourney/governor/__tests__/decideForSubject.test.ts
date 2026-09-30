import { decideForSubject } from '../decideForSubject';
import { OfferNotEligibleError } from '../../offerEligibility';
import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import type { DecideDeps, JourneyCandidate, JourneyStrategy, JourneySubjectContext } from '../types';

/**
 * T303 — the shared pipeline's own behaviour: the gate, the order of the steps,
 * and what it does when it refuses.
 *
 * The invariant behind every case below: a refusal is an ANSWER, recorded with a
 * named reason. §15's exit criterion is "one governed next action per subject —
 * or a named refusal", and with every programme still `draft` and four of eight
 * content purposes declared unsupported, refusal is the honest answer for most
 * subjects today. A test that only checked the happy path would be describing a
 * system this one is not yet.
 */

const flags = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags =>
  Object.freeze({
    growthJourneyEnabled: true,
    journeySignalIngest: false,
    journeyClassification: false,
    journeyDecisions: true,
    journeyHandoffs: false,
    journeyExecution: false,
    ...over,
  });

const candidate = (over: Partial<JourneyCandidate> = {}): JourneyCandidate => ({
  action_type: 'SEND_EMAIL',
  campaign_key: 'gj_capability_education',
  priority_tier: 7,
  intra_tier_score: 50,
  channel: 'email',
  required_assets: [],
  rationale: ['a business lead asked about automation'],
  ...over,
});

const ctx = (over: Partial<JourneySubjectContext> = {}): JourneySubjectContext => ({
  tenant_id: 't-col',
  brand_id: 'b-ent',
  brand_slug: 'colaberry-enterprise',
  program_id: 'p-ent',
  program_slug: 'business-growth',
  program_status: 'draft',
  program_kind: 'business',
  subject_ref: 'lead:501',
  lead_id: 501,
  enrollment_id: null,
  classification: {
    classification_id: 'c-1',
    brand_relationship: 'colaberry-enterprise',
    primary_path: 'workflow_automation',
    secondary_paths: [],
    intent: 'automation_request',
    requires_human_review: false,
    source_step: 3,
  },
  state: 'PROBLEM_IDENTIFIED',
  state_entered_at: new Date('2026-09-10T00:00:00Z'),
  overlays: [],
  scores: { dimensions: [], summary: null, gaps: ['problem_clarity:no_source'], available: false, computed_at: null },
  contact: {
    channels: {
      email: { eligible: true, reason: 'ok', evaluator: 'consent', last_contact_at: null, hours_since_last_contact: null },
      sms: { eligible: false, reason: 'no_consent', evaluator: 'consent', last_contact_at: null, hours_since_last_contact: null },
      voice: { eligible: false, reason: 'no_consent', evaluator: 'consent', last_contact_at: null, hours_since_last_contact: null },
      in_app: { eligible: true, reason: 'always', evaluator: 'none', last_contact_at: null, hours_since_last_contact: null },
      none: { eligible: true, reason: 'no channel needed', evaluator: 'none', last_contact_at: null, hours_since_last_contact: null },
    },
    recent_contact_count: 0,
    hours_since_last_contact: null,
    human_conversation: 'unknown',
    human_conversation_reason: 'no source in this codebase',
    sales_capacity: 'unknown',
    sales_capacity_reason: 'no source in this codebase',
    failed_closed: false,
  },
  hardStop: {
    converted: false,
    unsubscribed: false,
    dnc: false,
    consentRevoked: false,
    killSwitch: false,
    campaignInactive: false,
  },
  freshness: { created_at: new Date('2026-09-01T00:00:00Z'), scores_computed_at: new Date('2026-09-13T00:00:00Z') },
  asOf: new Date('2026-09-13T06:00:00Z'),
  ...over,
});

function strategy(candidates: JourneyCandidate[], over: Partial<JourneyStrategy> = {}): JourneyStrategy {
  return {
    program_kind: 'business',
    ruleset_version: 'p3-v1',
    hardStops: (c) => c.hardStop,
    generate: () => candidates,
    ...over,
  };
}

function deps(over: Partial<DecideDeps> = {}): DecideDeps {
  return {
    assertOfferAllowed: async () => undefined,
    contactPolicyFor: () => ({
      channelEligible: true,
      consent: { verdict: 'allow', reason: 'granted', hasRecord: true },
      recentContactCount: 0,
      hoursSinceLastContact: null,
    }),
    ...over,
  };
}

const decided = async (...args: Parameters<typeof decideForSubject>) => {
  const out = await decideForSubject(...args);
  if (out.status !== 'decided') throw new Error(`expected a decision, got ${out.status}`);
  return out.decision;
};

describe('the gate', () => {
  it('master off returns disabled before any dependency is touched', async () => {
    const assertOfferAllowed = jest.fn();
    const generate = jest.fn();
    const out = await decideForSubject(
      ctx(),
      strategy([candidate()], { generate }),
      deps({ assertOfferAllowed }),
      flags({ growthJourneyEnabled: false }),
    );
    expect(out).toEqual({ status: 'disabled' });
    expect(generate).not.toHaveBeenCalled();
    expect(assertOfferAllowed).not.toHaveBeenCalled();
  });

  it('the capability off is also disabled, even with the master on', async () => {
    const out = await decideForSubject(ctx(), strategy([candidate()]), deps(), flags({ journeyDecisions: false }));
    expect(out).toEqual({ status: 'disabled' });
  });

  it('deciding does not require — or read — the execution flag', async () => {
    const d = await decided(ctx(), strategy([candidate()]), deps(), flags({ journeyExecution: false }));
    expect(d.selected_action).toBe('SEND_EMAIL');
  });
});

describe('the order of the steps', () => {
  it('a stale profile refuses BEFORE a hard stop is even computed', async () => {
    // Explorer's order, kept deliberately: a stale profile must not be scored
    // against, so freshness is asked first and the hard stops are never reached.
    const hardStops = jest.fn(() => ctx().hardStop);
    const d = await decided(
      // Scored AFTER creation (Explorer's sentinel is strict: equal timestamps mean
      // never scored, not stale) but far older than the 26-hour window.
      ctx({ freshness: { created_at: new Date('2026-09-01T00:00:00Z'), scores_computed_at: new Date('2026-09-05T00:00:00Z') } }),
      strategy([candidate()], { hardStops }),
      deps(),
      flags(),
    );
    expect(d.selected_action).toBe('WAIT');
    expect(d.reason).toBe('refused: freshness:stale');
    expect(hardStops).not.toHaveBeenCalled();
  });

  it('names all four freshness refusals distinctly, never a generic one', async () => {
    const cases: Array<[JourneySubjectContext['freshness'], string]> = [
      // Four DISTINCT reasons, and the mapping is not the obvious one: a null
      // scores_computed_at is `missing_timestamps`, while `never_scored` is the
      // equal-timestamps sentinel (the bridge writes both at the same instant).
      [{ created_at: new Date('2026-09-01T00:00:00Z'), scores_computed_at: null }, 'refused: freshness:missing_timestamps'],
      // Equal timestamps are the 'never scored' sentinel, NOT staleness — the
      // distinction Explorer draws deliberately and this pipeline inherits.
      [{ created_at: new Date('2026-09-01T00:00:00Z'), scores_computed_at: new Date('2026-09-01T00:00:00Z') }, 'refused: freshness:never_scored'],
      [{ created_at: new Date('2026-09-01T00:00:00Z'), scores_computed_at: new Date('2026-09-05T00:00:00Z') }, 'refused: freshness:stale'],
      [{ created_at: new Date('2026-09-01T00:00:00Z'), scores_computed_at: new Date('2026-09-20T00:00:00Z') }, 'refused: freshness:clock_skew'],
    ];
    for (const [freshness, reason] of cases) {
      const d = await decided(ctx({ freshness }), strategy([candidate()]), deps(), flags());
      expect(d.reason).toBe(reason);
    }
  });

  it('a hard stop refuses before anything is generated, and says which stop', async () => {
    const generate = jest.fn(() => [candidate()]);
    const d = await decided(
      ctx(),
      strategy([], { generate, hardStops: () => ({ ...ctx().hardStop, unsubscribed: true }) }),
      deps(),
      flags(),
    );
    expect(d.selected_action).toBe('WAIT');
    expect(d.reason).toBe('hard_stop:unsubscribed');
    expect(generate).not.toHaveBeenCalled();
  });

  it('a revoked consent record IS a hard stop here, unlike in Explorer’s own wiring', async () => {
    // Explorer hard-codes `consentRevoked` to false at its call site, so a
    // revoked record degrades to a per-channel block there. A journey strategy
    // computes the flag itself, which is why it is the strategy's job and not
    // the pipeline's.
    const d = await decided(
      ctx(),
      strategy([candidate()], { hardStops: () => ({ ...ctx().hardStop, consentRevoked: true }) }),
      deps(),
      flags(),
    );
    expect(d.reason).toBe('hard_stop:consent_revoked');
  });

  it('no candidate at all is a named refusal, not an empty answer', async () => {
    const d = await decided(ctx(), strategy([]), deps(), flags());
    expect(d.selected_action).toBe('WAIT');
    expect(d.reason).toBe('no_candidate');
  });
});

describe('the brand boundary', () => {
  it('checks EVERY candidate before ranking, and suppresses the denied one with its reason', async () => {
    const denied = candidate({
      action_type: 'RECOMMEND_LESSON',
      campaign_key: 'business_training_push',
      priority_tier: 3,
      intra_tier_score: 99,
      required_assets: [{ asset_type: 'lesson_recommendation', offer_family: 'business_training' } as never],
    });
    const allowed = candidate({ priority_tier: 7 });
    const assertOfferAllowed = jest.fn(async ({ offerFamily }: { offerFamily: string }) => {
      if (offerFamily === 'business_training') {
        throw new OfferNotEligibleError({
          allowed: false,
          reason: 'explicit_deny',
          brand_id: 'b-af',
          offer_family: 'business_training',
          policy_id: 'pol-deny',
          approved_content_ready: false,
        });
      }
      return undefined;
    });

    const d = await decided(ctx(), strategy([denied, allowed]), deps({ assertOfferAllowed }), flags());

    // The denied candidate was the higher-ranked one. It still loses.
    expect(d.selected_action).toBe('SEND_EMAIL');
    expect(d.suppressed).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'offer_not_eligible:explicit_deny' })]),
    );
    // Two candidates, then the winner again: the boundary is checked per
    // candidate before ranking AND on the winner afterwards. The second pass is
    // defence in depth, and this count is what pins it.
    expect(assertOfferAllowed).toHaveBeenCalledTimes(3);
    expect(assertOfferAllowed).toHaveBeenLastCalledWith({ brandId: 'b-ent', offerFamily: 'workflow_automation' });
  });

  it('every candidate denied → a refusal that asks for a human, not a silent nothing', async () => {
    const assertOfferAllowed = async () => {
      throw new OfferNotEligibleError({
        allowed: false,
        reason: 'no_policy',
        brand_id: 'b-ent',
        offer_family: 'workflow_automation',
        policy_id: null,
        approved_content_ready: false,
      });
    };
    const d = await decided(ctx(), strategy([candidate()]), deps({ assertOfferAllowed }), flags());
    expect(d.selected_action).toBe('WAIT');
    expect(d.reason).toBe('every_candidate_ineligible');
    expect(d.requires_human_review).toBe(true);
    expect(d.candidates).toHaveLength(1);
    expect(d.suppressed[0]?.reason).toBe('offer_not_eligible:no_policy');
  });

  it('an error that is not an eligibility refusal propagates rather than being swallowed', async () => {
    const assertOfferAllowed = async () => {
      throw new Error('database unavailable');
    };
    await expect(decideForSubject(ctx(), strategy([candidate()]), deps({ assertOfferAllowed }), flags())).rejects.toThrow(
      'database unavailable',
    );
  });
});

describe('the contact policy', () => {
  it('a blocked winner is recorded as chosen-then-blocked, not replaced by the runner-up', async () => {
    // Explorer's precedent. The reason a person was NOT contacted is the answer
    // worth keeping; quietly promoting the second choice would hide it.
    const d = await decided(
      ctx(),
      strategy([candidate({ campaign_key: 'winner' }), candidate({ priority_tier: 9, campaign_key: 'runner_up' })]),
      deps({
        contactPolicyFor: () => ({
          channelEligible: false,
          channelReason: 'sms_suppressed',
          consent: { verdict: 'block', reason: 'revoked', hasRecord: true },
          recentContactCount: 0,
          hoursSinceLastContact: null,
        }),
      }),
      flags(),
    );
    expect(d.selected_action).toBe('WAIT');
    expect(d.selected_channel).toBeNull();
    expect(d.reason).toMatch(/^chosen_then_blocked:SEND_EMAIL:/);
    expect(d.suppressed.some((s) => s.reason.startsWith('contact_policy:'))).toBe(true);
  });

  it('an action needing no channel is not blocked by channel eligibility', async () => {
    // Known human inputs, deliberately: this case is about the CONTACT POLICY
    // step, and `CREATE_HUMAN_TASK` is also the action step 4b suppresses while
    // either input is unknown. Leaving them unknown would test that rule twice
    // and this one not at all.
    const known = ctx({ contact: { ...ctx().contact, human_conversation: 'no', sales_capacity: 'available' } });
    const d = await decided(
      known,
      strategy([candidate({ action_type: 'CREATE_HUMAN_TASK', channel: 'none', campaign_key: null })]),
      deps({
        contactPolicyFor: () => ({
          channelEligible: false,
          consent: { verdict: 'block', reason: 'revoked', hasRecord: true },
          recentContactCount: 99,
          hoursSinceLastContact: 0,
        }),
      }),
      flags(),
    );
    expect(d.selected_action).toBe('CREATE_HUMAN_TASK');
  });
});

describe('content', () => {
  it('a candidate that needs an asset with no resolver wired is a NAMED gap, never a silent pass', async () => {
    const d = await decided(
      ctx(),
      strategy([candidate({ required_assets: [{ asset_type: 'lesson_recommendation' } as never] })]),
      deps(),
      flags(),
    );
    expect(d.selected_action).toBe('WAIT');
    expect(d.content_gaps).toEqual(['content_resolver_not_wired']);
    expect(d.reason).toBe('content_gap:content_resolver_not_wired');
  });

  it('a resolver that reports a gap still produces WAIT, and never substitutes an asset', async () => {
    const d = await decided(
      ctx(),
      strategy([candidate({ required_assets: [{ asset_type: 'enrollment_offer' } as never] })]),
      deps({ resolveContent: async () => ({ assets: [], gaps: ['unsupported_purpose:enrollment_offer'] }) }),
      flags(),
    );
    expect(d.selected_action).toBe('WAIT');
    expect(d.selected_content).toBeNull();
    expect(d.content_gaps).toEqual(['unsupported_purpose:enrollment_offer']);
  });

  it('a resolved asset rides on the decision', async () => {
    const d = await decided(
      ctx(),
      strategy([candidate({ required_assets: [{ asset_type: 'lesson_recommendation' } as never] })]),
      deps({ resolveContent: async () => ({ assets: [{ id: 'asset-1', title: 'Automating intake' }], gaps: [] }) }),
      flags(),
    );
    expect(d.selected_action).toBe('SEND_EMAIL');
    expect(d.selected_content).toEqual({ assets: [{ id: 'asset-1', title: 'Automating intake' }] });
  });
});

describe('what a decision always carries', () => {
  it('stamps the strategy’s ruleset version, and claims no AI involvement', async () => {
    const d = await decided(ctx(), strategy([candidate()]), deps(), flags());
    expect(d.ruleset_version).toBe('p3-v1');
    expect(d.ai_involved).toBe(false);
    expect(d.model_version).toBeNull();
  });

  it('never reports an executed action or an execution receipt — Phase 3 executes nothing', async () => {
    const d = await decided(ctx(), strategy([candidate()]), deps(), flags());
    expect(d).not.toHaveProperty('executed');
    expect(d.deferred_actions).toEqual([]);
  });

  it('carries the classification’s review flag through to the decision', async () => {
    const base = ctx();
    const d = await decided(
      ctx({ classification: { ...base.classification!, requires_human_review: true } }),
      strategy([candidate()]),
      deps(),
      flags(),
    );
    expect(d.requires_human_review).toBe(true);
  });
});

describe('an unknown input never unlocks a human action', () => {
  // sec 7.3's two unanswerable inputs, and sec 8's two human layers in the existing
  // vocabulary. The plan's acceptance names both reason strings, so they are
  // asserted literally rather than by shape: renaming one is a silent contract
  // change for whatever reads the decision later.
  // The channel is 'none', not null: the union has a member for exactly this
  // case, and null does not type-check. Jest never said so - ts-jest runs with
  // isolatedModules, so the scoped tsc is the only thing that types a test file.
  const humanTask = candidate({ action_type: 'CREATE_HUMAN_TASK', campaign_key: null, priority_tier: 4, channel: 'none' });
  const aliOutreach = candidate({ action_type: 'SEND_ALI_OUTREACH', campaign_key: null, priority_tier: 3, channel: 'email' });

  const withContact = (over: Partial<JourneySubjectContext['contact']>): JourneySubjectContext =>
    ctx({ contact: { ...ctx().contact, ...over } });

  it('suppresses CREATE_HUMAN_TASK naming human_conversation_unknown', async () => {
    const d = await decided(
      withContact({ sales_capacity: 'available' }),
      strategy([humanTask, candidate()]),
      deps(),
      flags(),
    );
    expect(d.suppressed).toEqual(
      expect.arrayContaining([
        { action_type: 'CREATE_HUMAN_TASK', campaign_key: null, reason: 'human_conversation_unknown' },
      ]),
    );
    // The legitimate candidate still wins — the subject is not parked because one
    // proposal needed something we cannot know.
    expect(d.selected_action).toBe('SEND_EMAIL');
  });

  it('suppresses SEND_ALI_OUTREACH naming sales_capacity_unknown', async () => {
    const d = await decided(
      withContact({ human_conversation: 'no' }),
      strategy([aliOutreach, candidate()]),
      deps(),
      flags(),
    );
    expect(d.suppressed).toEqual(
      expect.arrayContaining([
        { action_type: 'SEND_ALI_OUTREACH', campaign_key: null, reason: 'sales_capacity_unknown' },
      ]),
    );
  });

  it('names BOTH when both are unknown, which is every subject today', async () => {
    const d = await decided(ctx(), strategy([humanTask, candidate()]), deps(), flags());
    expect(d.suppressed.map((s) => s.reason)).toContain('human_conversation_unknown,sales_capacity_unknown');
  });

  it('leaves a human action alone once BOTH inputs are known — the other direction', async () => {
    // Without this, the rule could be narrowed to "suppress every human action"
    // and still look green.
    const d = await decided(
      withContact({ human_conversation: 'no', sales_capacity: 'available' }),
      strategy([humanTask]),
      deps(),
      flags(),
    );
    expect(d.suppressed).toEqual([]);
    expect(d.selected_action).toBe('CREATE_HUMAN_TASK');
  });

  it('T403: a FULL queue suppresses CREATE_HUMAN_TASK naming sales_capacity_full, with both inputs otherwise known', async () => {
    const d = await decided(
      withContact({ human_conversation: 'no', sales_capacity: 'full' }),
      strategy([humanTask, candidate()]),
      deps(),
      flags(),
    );
    expect(d.suppressed).toEqual(
      expect.arrayContaining([{ action_type: 'CREATE_HUMAN_TASK', campaign_key: null, reason: 'sales_capacity_full' }]),
    );
    expect(d.selected_action).toBe('SEND_EMAIL');
  });

  it("T403: a full queue does NOT suppress SEND_ALI_OUTREACH - Ali's caps live in evaluateAliOutreachEligibility, not here", async () => {
    const d = await decided(
      withContact({ human_conversation: 'no', sales_capacity: 'full' }),
      strategy([aliOutreach]),
      deps(),
      flags(),
    );
    expect(d.suppressed).toEqual([]);
    expect(d.selected_action).toBe('SEND_ALI_OUTREACH');
  });

  it('says nothing about a non-human action while both are unknown', async () => {
    const d = await decided(ctx(), strategy([candidate()]), deps(), flags());
    expect(d.suppressed).toEqual([]);
    expect(d.selected_action).toBe('SEND_EMAIL');
  });

  it('refuses by name when every candidate needed an unknown input', async () => {
    const d = await decided(ctx(), strategy([humanTask, aliOutreach]), deps(), flags());
    expect(d.selected_action).toBe('WAIT');
    expect(d.reason).toBe('every_candidate_needs_an_unknown_input');
    expect(d.requires_human_review).toBe(true);
    expect(d.suppressed).toHaveLength(2);
  });

  it('checks the inputs BEFORE arbitration, so a blocked human action cannot win a tier', async () => {
    // `humanTask` is tier 4 and outranks the tier-7 email. Were the check run after
    // arbitration, the answer would be a chosen-then-blocked WAIT for a subject who
    // had a perfectly good email waiting.
    const d = await decided(ctx(), strategy([humanTask, candidate()]), deps(), flags());
    expect(d.selected_action).toBe('SEND_EMAIL');
    expect(d.reason).not.toContain('chosen_then_blocked');
  });
});
