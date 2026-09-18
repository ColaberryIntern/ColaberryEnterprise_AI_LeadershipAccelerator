import { resolveJourneyContent, scopeFor, tierFor, EXPLORER_ERA_BRAND_SLUG } from '../journeyContent';
import { decideForSubject } from '../governor/decideForSubject';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import type {
  DecideDeps,
  JourneyCandidate,
  JourneyStrategy,
  JourneySubjectContext,
} from '../governor/types';

/**
 * T305 — the content adapter, and the acceptance criterion it makes provable:
 * a refused gate becomes a `WAIT` whose `content_gaps` name the refusal.
 *
 * Nothing here mocks a module. The gate and the registry lookup are injected as
 * functions, because what is under test is the COMPOSITION — the order of the
 * two calls, the scope each is given, and what happens to a refusal — and a
 * module mock would let the composition drift while the tests stayed green.
 */

const AS_OF = new Date('2026-09-14T12:00:00Z');

const flags = (): GrowthJourneyFlags =>
  Object.freeze({
    growthJourneyEnabled: true,
    journeySignalIngest: false,
    journeyClassification: false,
    journeyDecisions: true,
    journeyHandoffs: false,
    journeyExecution: false,
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
  // Six hours old, not 36: Explorer freshness refuses anything over 26 hours,
  // and a stale profile refuses BEFORE the content step, which made the first
  // version of this fixture prove nothing about content at all.
  freshness: { created_at: new Date('2026-09-01T00:00:00Z'), scores_computed_at: new Date('2026-09-14T06:00:00Z') },
  asOf: AS_OF,
  ...over,
});

const candidate = (over: Partial<JourneyCandidate> = {}): JourneyCandidate => ({
  action_type: 'SEND_EMAIL',
  campaign_key: 'gj_capability_education',
  priority_tier: 7,
  intra_tier_score: 50,
  channel: 'email',
  required_assets: [{ asset_type: 'weekly_digest' }],
  rationale: ['asked about automation'],
  ...over,
});

const allow = jest.fn();
const refuse = jest.fn();
const assets = jest.fn();
const facts = jest.fn();

/** The declaration columns of a resolved asset, as the loader returns them. */
const factsFor = (id: string, over: Record<string, unknown> = {}) =>
  new Map([[id, { id, brand_id: null, offer_family: null, approval_status: 'approved', ...over }]]);

beforeEach(() => {
  allow.mockReset().mockResolvedValue({ allowed: true, reason: 'policy_allows', rule_id: null });
  refuse.mockReset().mockResolvedValue({ allowed: false, reason: 'content_not_approved', rule_id: null });
  assets.mockReset().mockResolvedValue({ resolved: true, assets: [{ id: 'asset-1', title: 'A lesson' }] });
  facts.mockReset().mockResolvedValue(factsFor('asset-1'));
});

/** The three injected seams, defaulted so each test overrides only what it is about. */
const wiring = (over: Record<string, unknown> = {}) => ({
  assertAllowed: allow as never,
  resolveAssets: assets as never,
  loadFacts: facts as never,
  ...over,
});

describe('the scope this adapter hands the registry', () => {
  it('allows unscoped rows for Colaberry Training ONLY', () => {
    expect(scopeFor(ctx({ brand_slug: EXPLORER_ERA_BRAND_SLUG, brand_id: 'b-train' }))).toEqual({
      brand_id: 'b-train',
      allow_unscoped: true,
    });
  });

  it.each(['colaberry-enterprise', 'ai-flotation', 'cpn'])(
    'refuses the Explorer-era rows to %s — the leakage boundary, as one boolean',
    (slug) => {
      // 646 production rows carry no brand. Read as "everyone's", they would be
      // the whole cross-brand leak in one column.
      expect(scopeFor(ctx({ brand_slug: slug })).allow_unscoped).toBe(false);
    },
  );

  it('gives a subject with no enrollment the NARROWER tier', () => {
    expect(tierFor(ctx({ enrollment_id: null }))).toBe('free_preview');
    expect(tierFor(ctx({ enrollment_id: 'e-1' }))).toBe('full_access');
  });
});

describe('the composition', () => {
  it('gates BEFORE it looks anything up, and passes the scope to both', async () => {
    const out = await resolveJourneyContent(candidate(), ctx(), wiring());
    expect(assets).toHaveBeenCalledTimes(1);
    expect(allow.mock.calls[0][0]).toMatchObject({
      brandId: 'b-ent',
      tenantId: 't-col',
      offerFamily: 'workflow_automation',
      allowUnscoped: false,
      programSlug: 'business-growth',
      state: 'PROBLEM_IDENTIFIED',
    });
    // The FIRST call is the policy question: no asset, because nothing is
    // selected yet.
    expect(allow.mock.calls[0][0].asset).toBeUndefined();
    expect(assets.mock.calls[0][3]).toEqual({ brand_id: 'b-ent', allow_unscoped: false });
    expect(out).toEqual({ assets: [{ id: 'asset-1', title: 'A lesson' }], gaps: [] });
  });

  it('asks the gate AGAIN per resolved asset, with that asset own columns', async () => {
    // The reason this second call exists: RESOLVE_SQL enforces brand, offer
    // family and eligible_programs, and never approval_status or eligible_paths.
    await resolveJourneyContent(candidate(), ctx(), wiring());
    expect(allow).toHaveBeenCalledTimes(2);
    expect(facts).toHaveBeenCalledWith(['asset-1']);
    expect(allow.mock.calls[1][0]).toMatchObject({
      offerFamily: 'workflow_automation',
      tier: 'free_preview',
      asset: { id: 'asset-1', approval_status: 'approved' },
    });
  });

  it('drops an asset the per-asset gate refuses, and names the reason as a gap', async () => {
    allow
      .mockResolvedValueOnce({ allowed: true, reason: 'policy_allows', rule_id: null })
      .mockResolvedValueOnce({ allowed: false, reason: 'asset_not_approved:none', rule_id: null });
    const out = await resolveJourneyContent(candidate(), ctx(), wiring());
    expect(out).toEqual({ assets: [], gaps: ['asset_not_approved:none'] });
  });

  it('fails closed when the declaration columns cannot be read back', async () => {
    facts.mockRejectedValue(new Error('connection reset'));
    const out = await resolveJourneyContent(candidate(), ctx(), wiring());
    expect(out).toEqual({ assets: [], gaps: ['asset_facts_lookup_failed'] });
  });

  it('records the error CLASS on that failure, with ids only', async () => {
    // The gap travelling is not enough: a failure nobody can classify is a
    // recurring outage nobody can see. The sibling path in contentEligibility
    // logs the same way, and a learner address must not reach the line.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    facts.mockRejectedValue(new Error('learner@example.com could not be read'));
    await resolveJourneyContent(candidate(), ctx(), wiring());
    const line = String(warn.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('growth_journey.asset_facts_lookup_failed');
    expect(line).toContain('error_class');
    expect(line).not.toContain('learner@example.com');
    warn.mockRestore();
  });

  it('fails closed when a resolved asset has no row to read back', async () => {
    // It came from this table a moment ago. If it cannot be read, the safe
    // answer is not to cite it.
    facts.mockResolvedValue(new Map());
    const out = await resolveJourneyContent(candidate(), ctx(), wiring());
    expect(out).toEqual({ assets: [], gaps: ['asset_facts_missing'] });
  });

  it('a refusal is a NAMED GAP and the registry is never consulted', async () => {
    const out = await resolveJourneyContent(candidate(), ctx(), wiring({ assertAllowed: refuse as never }));
    expect(out).toEqual({ assets: [], gaps: ['content_not_approved'] });
    expect(assets).not.toHaveBeenCalled();
    expect(facts).not.toHaveBeenCalled();
  });

  it('a registry refusal is also a named gap, never a substituted asset', async () => {
    assets.mockResolvedValue({ resolved: false, reason: 'no_asset_for_purpose:weekly_digest' });
    const out = await resolveJourneyContent(candidate(), ctx(), wiring());
    expect(out).toEqual({ assets: [], gaps: ['no_asset_for_purpose:weekly_digest'] });
  });

  it('reports a gap for a query with no offer family behind it', async () => {
    const out = await resolveJourneyContent(candidate(), ctx({ classification: null }), wiring());
    expect(out.gaps).toEqual(['content_no_offer_family:weekly_digest']);
    expect(allow).not.toHaveBeenCalled();
  });

  it('handles EVERY query a candidate carries, keeping what resolved', async () => {
    assets
      .mockResolvedValueOnce({ resolved: true, assets: [{ id: 'a1' }] })
      .mockResolvedValueOnce({ resolved: false, reason: 'no_asset_for_purpose:lesson_recommendation' });
    facts.mockResolvedValue(factsFor('a1'));
    const out = await resolveJourneyContent(
      candidate({
        required_assets: [{ asset_type: 'weekly_digest' }, { asset_type: 'lesson_recommendation' }],
      }),
      ctx(),
      wiring(),
    );
    expect(out.assets).toEqual([{ id: 'a1' }]);
    expect(out.gaps).toEqual(['no_asset_for_purpose:lesson_recommendation']);
  });

  it('prefers the query own offer family over the subject path', async () => {
    await resolveJourneyContent(
      candidate({ required_assets: [{ asset_type: 'weekly_digest', offer_family: 'business_training' } as never] }),
      ctx(),
      wiring(),
    );
    expect(allow.mock.calls[0][0].offerFamily).toBe('business_training');
  });
});

describe('the acceptance criterion: a refused gate becomes a WAIT that names it', () => {
  const strategy = (candidates: JourneyCandidate[]): JourneyStrategy => ({
    program_kind: 'business',
    ruleset_version: 'p3-v1',
    hardStops: (c) => c.hardStop,
    generate: () => candidates,
  });

  const deps = (resolveContent: DecideDeps['resolveContent']): DecideDeps => ({
    assertOfferAllowed: async () => undefined,
    contactPolicyFor: () => ({
      channelEligible: true,
      consent: { verdict: 'allow', reason: 'granted', hasRecord: true },
      recentContactCount: 0,
      hoursSinceLastContact: null,
    }),
    resolveContent,
  });

  it('content_not_approved reaches content_gaps and the action becomes WAIT', async () => {
    // The whole point of the criterion: with nothing approved anywhere in
    // production, this is the honest answer for every subject who wants content,
    // and the reason travels instead of being swallowed into an empty success.
    const out = await decideForSubject(
      ctx(),
      strategy([candidate()]),
      deps((c, x) => resolveJourneyContent(c, x, wiring({ assertAllowed: refuse as never }))),
      flags(),
    );
    expect(out.status).toBe('decided');
    const d = (out as { decision: { selected_action: string; content_gaps: string[]; reason: string } }).decision;
    expect(d.selected_action).toBe('WAIT');
    expect(d.content_gaps).toEqual(['content_not_approved']);
    expect(d.reason).toBe('content_gap:content_not_approved');
  });

  it('and an approved gate lets the action through with its assets', async () => {
    const out = await decideForSubject(
      ctx(),
      strategy([candidate()]),
      deps((c, x) => resolveJourneyContent(c, x, wiring())),
      flags(),
    );
    const d = (out as { decision: { selected_action: string; selected_content: unknown } }).decision;
    expect(d.selected_action).toBe('SEND_EMAIL');
    expect(d.selected_content).toEqual({ assets: [{ id: 'asset-1', title: 'A lesson' }] });
  });
});
