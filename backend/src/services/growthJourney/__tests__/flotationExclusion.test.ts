const m = { policyFindOne: jest.fn() };

// The MODULE the resolver actually imports, not the barrel. Mocking
// `../../../models` left the real model in place and every lookup came back
// `SequelizeConnectionRefusedError` -> `lookup_failed`, which is the resolver
// failing closed correctly and the test proving nothing.
jest.mock('../../../models/BrandOfferPolicy', () => ({
  BrandOfferPolicy: { findOne: (...a: unknown[]) => m.policyFindOne(...a) },
}));

import { assertOfferAllowed } from '../offerEligibility';
import { decideForSubject } from '../governor/decideForSubject';
import {
  isFamilyAllowedForFlotation,
  flotationExclusionReason,
  FLOTATION_ALLOWED_FAMILIES,
  FLOTATION_EXCLUDED_FAMILIES,
} from '../lifecycle/aiFlotationLifecycle';
import { AI_FLOTATION_DENIED_FAMILIES } from '../../../models/OfferFamily';
import { allowedFamiliesFor, BRAND_OFFER_POLICIES } from '../../../seeds/growthJourney/offerPolicyDefinitions';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import type {
  DecideDeps,
  JourneyCandidate,
  JourneyStrategy,
  JourneySubjectContext,
} from '../governor/types';

/**
 * T308 — the hard exclusion, enforced TWICE and proven BRAND-SCOPED.
 *
 * §5.4: "no `business_training`, learner training, certification or internship
 * offer may be selected, generated or sent in the AI Flotation brand context."
 *
 * Nothing here mocks the eligibility resolver. `assertOfferAllowed` is the real
 * one and only the policy ROW is mocked, so these tests exercise the actual
 * deny path — `decision === 'deny'` before status, before the window — rather
 * than a fake that returns whatever the test wants. A mocked resolver would make
 * this suite a test of itself.
 *
 * The positive control is the point of the whole file: the same candidate for
 * the same subject under Colaberry Enterprise is ALLOWED. An exclusion that had
 * turned out to be global would quietly break the Enterprise journey while
 * looking like it was protecting the Flotation one.
 */

const AS_OF = new Date('2026-09-14T12:00:00Z');

const FLOTATION = 'b-flot';
const ENTERPRISE = 'b-ent';

const policyRow = (over: Record<string, unknown> = {}) => ({
  id: 'pol-1',
  decision: 'allow',
  status: 'active',
  effective_from: null,
  effective_to: null,
  approved_landing_pages: ['https://example.test/x'],
  content_collections: [],
  ...over,
});

/**
 * The live policy data these tests stand on: Flotation DENIES business training,
 * Enterprise ALLOWS it, and both allow workflow automation.
 */
const POLICIES: Record<string, Record<string, unknown>> = {
  [`${FLOTATION}:business_training`]: policyRow({ id: 'pol-flot-deny', decision: 'deny' }),
  [`${FLOTATION}:workflow_automation`]: policyRow({ id: 'pol-flot-wf' }),
  [`${FLOTATION}:learner_paid_training`]: policyRow({ id: 'pol-flot-learner-deny', decision: 'deny' }),
  [`${ENTERPRISE}:business_training`]: policyRow({ id: 'pol-ent-bt' }),
  [`${ENTERPRISE}:workflow_automation`]: policyRow({ id: 'pol-ent-wf' }),
  [`${ENTERPRISE}:learner_paid_training`]: policyRow({ id: 'pol-ent-learner-deny', decision: 'deny' }),
};

beforeEach(() => {
  m.policyFindOne.mockReset().mockImplementation(async (options: { where: { brand_id: string; offer_family: string } }) => {
    const { brand_id: brand, offer_family: family } = options.where;
    return POLICIES[`${brand}:${family}`] ?? null;
  });
});

const flags = (): GrowthJourneyFlags =>
  Object.freeze({
    growthJourneyEnabled: true,
    journeySignalIngest: false,
    journeyClassification: false,
    journeyDecisions: true,
    journeyExecution: false,
  });

const ctx = (brandId: string, family: string): JourneySubjectContext => ({
  tenant_id: 't-col',
  brand_id: brandId,
  brand_slug: brandId === FLOTATION ? 'ai-flotation' : 'colaberry-enterprise',
  program_id: 'p-1',
  program_slug: brandId === FLOTATION ? 'consulting-growth' : 'business-growth',
  program_status: 'draft',
  program_kind: brandId === FLOTATION ? 'consulting' : 'business',
  subject_ref: 'lead:902',
  lead_id: 902,
  enrollment_id: null,
  classification: {
    classification_id: 'c-1',
    brand_relationship: brandId === FLOTATION ? 'ai-flotation' : 'colaberry-enterprise',
    primary_path: family,
    secondary_paths: [],
    intent: 'training_request',
    requires_human_review: false,
    source_step: 3,
  },
  state: 'PROBLEM_CLARIFIED',
  state_entered_at: null,
  overlays: [],
  scores: { dimensions: [], summary: null, gaps: [], available: false, computed_at: null },
  contact: {
    channels: {
      email: { eligible: true, reason: 'ok', evaluator: 'consent', last_contact_at: null, hours_since_last_contact: null },
      sms: { eligible: false, reason: 'no', evaluator: 'consent', last_contact_at: null, hours_since_last_contact: null },
      voice: { eligible: false, reason: 'no', evaluator: 'consent', last_contact_at: null, hours_since_last_contact: null },
      in_app: { eligible: true, reason: 'ok', evaluator: 'none', last_contact_at: null, hours_since_last_contact: null },
      none: { eligible: true, reason: 'ok', evaluator: 'none', last_contact_at: null, hours_since_last_contact: null },
    },
    recent_contact_count: 0,
    hours_since_last_contact: null,
    human_conversation: 'no',
    human_conversation_reason: 'fixture',
    sales_capacity: 'available',
    sales_capacity_reason: 'fixture',
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
  freshness: { created_at: new Date('2026-09-01T00:00:00Z'), scores_computed_at: new Date('2026-09-14T06:00:00Z') },
  asOf: AS_OF,
});

const candidateFor = (family: string): JourneyCandidate => ({
  action_type: 'SEND_EMAIL',
  campaign_key: 'gj_capability_education',
  priority_tier: 7,
  intra_tier_score: 50,
  channel: 'email',
  required_assets: [{ asset_type: 'weekly_digest', offer_family: family } as never],
  rationale: [`a signal pointed at ${family}`],
});

/** A strategy that emits whatever it is given — the injected-candidate attack. */
const strategy = (candidates: JourneyCandidate[]): JourneyStrategy => ({
  program_kind: 'consulting',
  ruleset_version: 'p3-v1',
  hardStops: (c) => c.hardStop,
  generate: () => candidates,
});

/** The REAL resolver; only the policy row is mocked. */
const deps = (): DecideDeps => ({
  assertOfferAllowed: (args) => assertOfferAllowed({ brandId: args.brandId, offerFamily: args.offerFamily, at: AS_OF }),
  contactPolicyFor: () => ({
    channelEligible: true,
    consent: { verdict: 'allow', reason: 'granted', hasRecord: true },
    recentContactCount: 0,
    hoursSinceLastContact: null,
  }),
  // Content has to resolve for an ALLOWED candidate to reach selected_action at
  // all: without this, T303 content gate turns every allow into a WAIT with
  // content_resolver_not_wired, and the positive control below would pass for
  // entirely the wrong reason.
  resolveContent: async () => ({ assets: [{ id: 'asset-1' }], gaps: [] }),
});

const decided = async (brandId: string, family: string, candidates?: JourneyCandidate[]) => {
  const out = await decideForSubject(
    ctx(brandId, family),
    strategy(candidates ?? [candidateFor(family)]),
    deps(),
    flags(),
  );
  if (out.status !== 'decided') throw new Error(`expected a decision, got ${out.status}`);
  return out.decision;
};

describe('enforcement ONE: generation refuses a denied family', () => {
  it('a business-training signal on a Flotation subject produces no candidate for it', () => {
    // The generation-side half. A generator that consults this cannot emit the
    // candidate at all, so the decision path never sees it.
    expect(isFamilyAllowedForFlotation('business_training')).toBe(false);
    expect(flotationExclusionReason('business_training')).toBe('flotation_excludes:business_training');
  });

  it('and the same check allows the four service paths plus paid discovery', () => {
    for (const family of ['ai_consulting', 'workflow_automation', 'application_build', 'ai_project', 'paid_discovery']) {
      expect(isFamilyAllowedForFlotation(family)).toBe(true);
    }
  });
});

describe('enforcement TWO: an injected candidate is suppressed and never selected', () => {
  it('suppresses it with offer_not_eligible:explicit_deny', async () => {
    // The attack the second check exists for: a generator that does NOT consult
    // the first one — a future caller, a hand-built candidate, a bug.
    const d = await decided(FLOTATION, 'business_training');
    expect(d.suppressed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'offer_not_eligible:explicit_deny' }),
      ]),
    );
  });

  it('and it NEVER reaches selected_action', async () => {
    const d = await decided(FLOTATION, 'business_training');
    expect(d.selected_action).toBe('WAIT');
    expect(d.reason).toBe('every_candidate_ineligible');
    expect(d.requires_human_review).toBe(true);
  });

  it('the deny is read from the live policy row, not from a fixture', async () => {
    // The row is what says `deny`; the resolver is real. Proven by the query the
    // resolver actually issued.
    await decided(FLOTATION, 'business_training');
    expect(m.policyFindOne).toHaveBeenCalledWith({
      where: { brand_id: FLOTATION, offer_family: 'business_training' },
    });
  });

  it('an allowed family for the same brand still gets through', async () => {
    // Otherwise "everything is suppressed" would pass this suite.
    const d = await decided(FLOTATION, 'workflow_automation');
    expect(d.selected_action).toBe('SEND_EMAIL');
    expect(d.suppressed).toEqual([]);
  });

  it('a mixed field keeps the allowed candidate and suppresses the denied one', async () => {
    const d = await decided(FLOTATION, 'workflow_automation', [
      candidateFor('business_training'),
      candidateFor('workflow_automation'),
    ]);
    expect(d.selected_action).toBe('SEND_EMAIL');
    expect(d.suppressed).toHaveLength(1);
    expect(d.suppressed[0].reason).toBe('offer_not_eligible:explicit_deny');
  });
});

describe('the two enforcement points cannot DRIFT from what the seed actually seeds', () => {
  // The verifier's convention finding: two literal lists for one boundary is how
  // a grant added to the seed's allow set later gets silently withheld here, or
  // how an exclusion gets dropped from one side only. The excluded half is now
  // the canonical constant rather than a copy; the allowed half stays enumerated
  // on purpose (see the comment on it) and is pinned here instead.

  it('the excluded half IS the canonical constant, not a copy that agrees today', () => {
    expect(FLOTATION_EXCLUDED_FAMILIES).toBe(AI_FLOTATION_DENIED_FAMILIES);
  });

  it("the allowed half equals what the seed grants AI Flotation, after its own denials", () => {
    const seeded = allowedFamiliesFor('ai-flotation', 'ai-flotation');
    expect([...FLOTATION_ALLOWED_FAMILIES].sort()).toEqual([...seeded].sort());
    expect(seeded.length).toBeGreaterThan(0); // non-vacuity: the seed really has a row
  });

  it('and the deny row the seed writes is the same set this file excludes', () => {
    const denyRow = BRAND_OFFER_POLICIES.find(
      (p) => p.brand_slug === 'ai-flotation' && p.decision === 'deny',
    );
    expect(denyRow).toBeDefined();
    expect([...(denyRow?.offer_families ?? [])].sort()).toEqual([...FLOTATION_EXCLUDED_FAMILIES].sort());
  });
});

describe('the winner re-check is the SECOND enforcement point, not a duplicate of the first', () => {
  it('catches a family that was allowed when the field was filtered and denied by the time it won', async () => {
    // The plan's mutation for this ("remove the winner re-check") does not kill
    // any test above, because an injected candidate is already caught BEFORE
    // arbitration — so the re-check needs the case it actually exists for: the
    // policy changing mid-decision. A human revoking an offer while a nightly
    // batch runs, or a seed re-applying, is exactly that.
    let call = 0;
    m.policyFindOne.mockImplementation(async (options: { where: { brand_id: string; offer_family: string } }) => {
      const { offer_family: family } = options.where;
      if (family !== 'workflow_automation') return POLICIES[`${FLOTATION}:${family}`] ?? null;
      call += 1;
      // Allowed while the field is filtered; revoked before the winner is recorded.
      return call === 1 ? policyRow({ id: 'pol-flot-wf' }) : policyRow({ id: 'pol-flot-wf', decision: 'deny' });
    });

    const d = await decided(FLOTATION, 'workflow_automation');
    expect(d.selected_action).toBe('WAIT');
    expect(d.reason).toBe('winner_not_eligible:explicit_deny');
    expect(d.requires_human_review).toBe(true);
    // Both calls happened: the field check and then the winner.
    expect(call).toBe(2);
  });

  it('and the two checks are independent: the first alone cannot save a revoked winner', async () => {
    // Stated as a property rather than a mechanism, so it survives a refactor
    // of either check.
    let call = 0;
    m.policyFindOne.mockImplementation(async () => {
      call += 1;
      return call === 1 ? policyRow({ id: 'p' }) : policyRow({ id: 'p', decision: 'deny' });
    });
    const d = await decided(FLOTATION, 'ai_consulting');
    expect(d.selected_action).not.toBe('SEND_EMAIL');
    expect(d.suppressed.some((s) => s.reason.includes('explicit_deny'))).toBe(true);
  });
});

describe('the exclusion is BRAND-SCOPED, not global — the positive control', () => {
  it('the SAME candidate for the SAME subject under Enterprise IS allowed', async () => {
    // The whole reason this file exists. A global exclusion would look like it
    // was protecting Flotation while quietly breaking Enterprise.
    const d = await decided(ENTERPRISE, 'business_training');
    expect(d.selected_action).toBe('SEND_EMAIL');
    expect(d.suppressed).toEqual([]);
  });

  it('and the two brands are asked separately, with their own rows', async () => {
    await decided(FLOTATION, 'business_training');
    await decided(ENTERPRISE, 'business_training');
    const brands = m.policyFindOne.mock.calls.map((c) => c[0].where.brand_id);
    expect(new Set(brands)).toEqual(new Set([FLOTATION, ENTERPRISE]));
  });
});

describe('no learner family reaches EITHER business brand', () => {
  it.each([FLOTATION, ENTERPRISE])('a learner-training candidate is refused for %s', async (brandId) => {
    // Neither brand sells learner training: Flotation by §5.4's exclusion,
    // Enterprise because its own policy row denies it. Same outcome, two
    // different reasons, and both are the policy's to state.
    const d = await decided(brandId, 'learner_paid_training');
    expect(d.selected_action).toBe('WAIT');
    expect(d.suppressed[0].reason).toBe('offer_not_eligible:explicit_deny');
  });

  it('and a family with NO policy row at all is refused, not defaulted', async () => {
    const d = await decided(FLOTATION, 'learner_internship');
    expect(d.selected_action).toBe('WAIT');
    expect(d.suppressed[0].reason).toBe('offer_not_eligible:no_policy');
  });
});
