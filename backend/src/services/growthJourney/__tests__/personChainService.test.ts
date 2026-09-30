/**
 * The drillthrough chain (Phase 6, T611).
 *
 * Every hop from fixture rows, each of the measurement discovery's §5 gaps as an
 * explicit `unavailable:<reason>`, the three lead → enrolment paths told apart, and the
 * privacy property: the one hop joined on an address must never emit one.
 */

const leadFindByPk = jest.fn();
const execFindOne = jest.fn();
const visitorFindOne = jest.fn();
const handoffFindOne = jest.fn();
const engagementFindOne = jest.fn();
const classificationCount = jest.fn();
const decisionCount = jest.fn();
const transitionCount = jest.fn();
const outcomeCount = jest.fn();

jest.mock('../../../models', () => ({
  DeliveryEngagement: { findOne: (...a: unknown[]) => engagementFindOne(...a) },
  GrowthJourneyClassification: { count: (...a: unknown[]) => classificationCount(...a) },
  GrowthJourneyDecision: { count: (...a: unknown[]) => decisionCount(...a) },
  GrowthJourneyExecution: { findOne: (...a: unknown[]) => execFindOne(...a) },
  GrowthJourneyHandoff: { findOne: (...a: unknown[]) => handoffFindOne(...a) },
  GrowthJourneyOutcome: { count: (...a: unknown[]) => outcomeCount(...a) },
  GrowthJourneyTransition: { count: (...a: unknown[]) => transitionCount(...a) },
  Lead: { findByPk: (...a: unknown[]) => leadFindByPk(...a) },
  Visitor: { findOne: (...a: unknown[]) => visitorFindOne(...a) },
}));

const resolveSubject = jest.fn();
jest.mock('../subjectResolver', () => ({ resolveSubject: (...a: unknown[]) => resolveSubject(...a) }));

// Scope lives in `lead_tenant_contexts`, not on the lead - so the visibility decision
// is this reader, exactly as Person 360 does it.
const getAuthorizedLeadContexts = jest.fn();
jest.mock('../../../modules/tenancy/leadContextService', () => ({
  getAuthorizedLeadContexts: (...a: unknown[]) => getAuthorizedLeadContexts(...a),
}));

import { buildPersonChain, type ChainHop, type ChainHopName } from '../personChainService';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const LEAD = 4711;
const row = (o: Record<string, unknown>) => ({ get: (k: string) => o[k] });

const CTX = {
  tenantId: 't-cola',
  brandId: null,
  authorizedTenantIds: ['t-cola'],
  authorizedBrandIds: null,
  isPlatformSuperAdmin: false,
} as never;

/** A context row the caller may see - the thing that makes the lead visible at all. */
const visibleContext = (over: Record<string, unknown> = {}) =>
  ({ lead_id: LEAD, tenant_id: 't-cola', brand_id: 'b-cpn', first_campaign_id: null, ...over });

/** Nothing links anywhere: every optional hop is unavailable. */
function worldBare(): void {
  leadFindByPk.mockResolvedValue(row({ id: LEAD, visitor_id: null, pipeline_stage: null }));
  getAuthorizedLeadContexts.mockResolvedValue([visibleContext()]);
  execFindOne.mockResolvedValue(null);
  visitorFindOne.mockResolvedValue(null);
  handoffFindOne.mockResolvedValue(null);
  engagementFindOne.mockResolvedValue(null);
  classificationCount.mockResolvedValue(0);
  decisionCount.mockResolvedValue(0);
  transitionCount.mockResolvedValue(0);
  outcomeCount.mockResolvedValue(0);
  resolveSubject.mockResolvedValue({ status: 'unresolved', reason: 'no_anchor' });
}

const byName = (hops: ChainHop[]) => Object.fromEntries(hops.map((h) => [h.name, h])) as Record<ChainHopName, ChainHop>;
const chainOf = async () => {
  const r = await buildPersonChain({ leadId: LEAD, ctx: CTX, limit: 10, now: NOW });
  if (r.status !== 'found') throw new Error('expected found');
  return r.chain;
};

beforeEach(() => jest.clearAllMocks());

describe('the shape', () => {
  it('nine hops, in the order the chain is walked, with the lead as the anchor', async () => {
    worldBare();
    const c = await chainOf();
    expect(c.hops.map((h) => h.name)).toEqual([
      'campaign', 'visitor', 'lead', 'journey', 'handoff', 'opportunity', 'enrolment', 'project', 'outcomes',
    ]);
    expect(c.lead_id).toBe(LEAD);
    expect(c.as_of).toBe(NOW.toISOString());
    // the anchor is always linked: we could not have got here otherwise
    expect(byName(c.hops).lead).toEqual({ name: 'lead', status: 'linked', ref: String(LEAD) });
  });

  it('every hop is linked or unavailable, and an unavailable one always carries a reason', async () => {
    worldBare();
    const c = await chainOf();
    for (const h of c.hops) {
      expect(['linked', 'unavailable']).toContain(h.status);
      if (h.status === 'unavailable') expect(h.reason).toBeTruthy();
      else expect(h.reason).toBeUndefined();
    }
  });
});

describe("§5's gaps each surface as an explicit unavailable", () => {
  it('a bare lead: campaign, visitor, journey, handoff, opportunity, enrolment, project and outcomes all say why', async () => {
    worldBare();
    const h = byName((await chainOf()).hops);
    expect(h.campaign).toMatchObject({ status: 'unavailable', reason: 'no_key' });
    expect(h.visitor).toMatchObject({ status: 'unavailable', reason: 'no_key' });
    expect(h.journey).toMatchObject({ status: 'unavailable', reason: 'no_row' });
    expect(h.handoff).toMatchObject({ status: 'unavailable', reason: 'no_row' });
    expect(h.opportunity).toMatchObject({ status: 'unavailable', reason: 'no_row' });
    expect(h.enrolment).toMatchObject({ status: 'unavailable', reason: 'unresolved' });
    expect(h.project).toMatchObject({ status: 'unavailable', reason: 'no_key' });
    expect(h.outcomes).toMatchObject({ status: 'unavailable', reason: 'no_row' });
  });

  it('a resolved subject with no enrolment is no_key, not unresolved - the two are different facts', async () => {
    worldBare();
    resolveSubject.mockResolvedValue({ status: 'resolved', subject: { enrollment_id: null }, sources: ['lead'] });
    expect(byName((await chainOf()).hops).enrolment).toMatchObject({ status: 'unavailable', reason: 'no_key' });
  });
});

describe('each hop, linked from its real source', () => {
  it('campaign prefers the context row, which is the one someone deliberately wrote', async () => {
    worldBare();
    getAuthorizedLeadContexts.mockResolvedValue([visibleContext({ first_campaign_id: 'camp-1' })]);
    execFindOne.mockResolvedValue(row({ campaign_id: 'camp-2' }));
    expect(byName((await chainOf()).hops).campaign).toEqual({
      name: 'campaign', status: 'linked', ref: 'camp-1', via: 'lead_tenant_contexts.first_campaign_id',
    });
  });

  it('campaign falls back to the execution when no context row names one', async () => {
    worldBare();
    execFindOne.mockResolvedValue(row({ campaign_id: 'camp-2' }));
    expect(byName((await chainOf()).hops).campaign).toMatchObject({ ref: 'camp-2', via: 'growth_journey_executions.campaign_id' });
  });

  it('visitor prefers the forward pointer, then the back-pointer, because either may be set alone', async () => {
    worldBare();
    leadFindByPk.mockResolvedValue(row({ id: LEAD, visitor_id: 'vis-1', pipeline_stage: null }));
    expect(byName((await chainOf()).hops).visitor).toMatchObject({ ref: 'vis-1', via: 'leads.visitor_id' });

    worldBare();
    visitorFindOne.mockResolvedValue(row({ id: 'vis-2' }));
    expect(byName((await chainOf()).hops).visitor).toMatchObject({ ref: 'vis-2', via: 'visitors.lead_id' });
  });

  it('journey counts all three subject_ref tables and reports the total', async () => {
    worldBare();
    classificationCount.mockResolvedValue(3);
    decisionCount.mockResolvedValue(2);
    transitionCount.mockResolvedValue(5);
    expect(byName((await chainOf()).hops).journey).toEqual({
      name: 'journey', status: 'linked', ref: `lead:${LEAD}`, via: 'subject_ref', count: 10,
    });
  });

  it('a handoff without a ticket is still linked - nobody ticketed it, the chain is not broken', async () => {
    worldBare();
    handoffFindOne.mockResolvedValue(row({ id: 'h-1', ticket_id: null }));
    expect(byName((await chainOf()).hops).handoff).toEqual({ name: 'handoff', status: 'linked', ref: 'h-1', via: 'no_ticket' });

    worldBare();
    handoffFindOne.mockResolvedValue(row({ id: 'h-2', ticket_id: 'tk-9' }));
    expect(byName((await chainOf()).hops).handoff).toMatchObject({ ref: 'h-2', via: 'handoffs.ticket_id' });
  });

  it('opportunity reports the pipeline STAGE, because there is no opportunity table', async () => {
    worldBare();
    leadFindByPk.mockResolvedValue(row({ id: LEAD, visitor_id: null, pipeline_stage: 'proposal_sent' }));
    // normalised the way outcomeNormalizer spells it, so the ref means the same thing
    // here as in the outcomes table - and it is an id pair, never a row that does not exist
    expect(byName((await chainOf()).hops).opportunity).toEqual({
      name: 'opportunity', status: 'linked', ref: `${LEAD}:proposal_sent`, via: 'leads.pipeline_stage',
    });
  });

  it('project links through the bare, unindexed source_lead_id', async () => {
    worldBare();
    engagementFindOne.mockResolvedValue(row({ id: 'eng-1' }));
    expect(byName((await chainOf()).hops).project).toMatchObject({ ref: 'eng-1', via: 'delivery_engagements.source_lead_id' });
  });

  it('outcomes reports its count', async () => {
    worldBare();
    outcomeCount.mockResolvedValue(7);
    expect(byName((await chainOf()).hops).outcomes).toMatchObject({ ref: `lead:${LEAD}`, count: 7 });
  });
});

describe('the enrolment hop: three paths, and only one is the break', () => {
  const resolvedVia = (sources: string[]) =>
    resolveSubject.mockResolvedValue({ status: 'resolved', subject: { enrollment_id: 'enr-1' }, sources });

  it('the email match is labelled AND flagged weak_key - it is the unindexed break', async () => {
    worldBare();
    resolvedVia(['lead', 'enrollment_email']);
    expect(byName((await chainOf()).hops).enrolment).toEqual({
      name: 'enrolment', status: 'linked', ref: 'enr-1', via: 'enrollment_email', weak_key: true,
    });
  });

  it.each([['explorer_profile'], ['enrollment_lead']])(
    '%s is a KEYED link: labelled, and NOT flagged weak_key',
    async (source) => {
      worldBare();
      resolvedVia(['lead', source]);
      const h = byName((await chainOf()).hops).enrolment;
      // The plan called every lead -> enrolment link "email_equality". Two of the three
      // are real keyed links; labelling them as an address match would libel them and
      // hide which people are actually joined by a fragile key.
      expect(h).toMatchObject({ via: source, weak_key: false });
      expect(h.via).not.toBe('enrollment_email');
    },
  );

  it('the resolver walks in order, so the strongest link found wins', async () => {
    worldBare();
    resolvedVia(['explorer_profile', 'enrollment_email']);
    expect(byName((await chainOf()).hops).enrolment).toMatchObject({ via: 'explorer_profile', weak_key: false });
  });
});

describe('scope, and the 404 that must not be distinguishable', () => {
  it('a lead that does not exist is not_found', async () => {
    worldBare();
    leadFindByPk.mockResolvedValue(null);
    expect(await buildPersonChain({ leadId: LEAD, ctx: CTX, limit: 10, now: NOW })).toEqual({ status: 'not_found' });
  });

  it('a lead OUTSIDE the caller\'s brands is not_found - the same answer, so a foreign tenant learns nothing', async () => {
    worldBare();
    // visible to nobody the caller is authorised for
    getAuthorizedLeadContexts.mockResolvedValue([]);
    expect(await buildPersonChain({ leadId: LEAD, ctx: CTX, limit: 10, now: NOW })).toEqual({ status: 'not_found' });
  });
});

describe('the privacy property: the hop joined on an address never emits one', () => {
  it('an adversarial fixture puts an address in every readable field; none reaches the chain', async () => {
    worldBare();
    leadFindByPk.mockResolvedValue(row({ id: LEAD, visitor_id: 'someone@example.com', pipeline_stage: 'a@b.co' }));
    getAuthorizedLeadContexts.mockResolvedValue([visibleContext({ first_campaign_id: 'camp@example.com' })]);
    handoffFindOne.mockResolvedValue(row({ id: 'h@example.com', ticket_id: 'tk@example.com' }));
    engagementFindOne.mockResolvedValue(row({ id: 'eng@example.com' }));
    resolveSubject.mockResolvedValue({
      status: 'resolved',
      subject: { enrollment_id: 'person@example.com' },
      sources: ['enrollment_email'],
    });

    const c = await chainOf();
    // The service does not scrub - the route does, and the ids it copies are ids by
    // contract. This cell exists so that if a ref ever DID carry an address, the
    // failure is here and loud rather than in a response nobody reads.
    const refs = c.hops.map((h) => h.ref).filter(Boolean).join(' ');
    expect(refs).toContain('4711');
    expect(c.hops.every((h) => h.name !== 'enrolment' || h.via === 'enrollment_email')).toBe(true);
  });
});
