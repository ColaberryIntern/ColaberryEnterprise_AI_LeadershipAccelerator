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
// `mock`-prefixed so babel-plugin-jest-hoist permits it inside the hoisted factory.
// The factory runs on the first require of subjectResolver IN A GIVEN REGISTRY, so
// flipping this and resetting modules makes loading the resolver an observable event -
// which is what the lazy-import cell below needs. A `jest.doMock` inside
// `isolateModules` does NOT do this: the hoisted mock above wins, the throwing factory
// never runs, and the cell passes no matter where the import sits (it did - a mutant
// that put the import back at module scope survived it).
let mockResolverLoadThrows = false;
jest.mock('../subjectResolver', () => {
  if (mockResolverLoadThrows) throw new Error('subjectResolver was loaded at module scope');
  return { resolveSubject: (...a: unknown[]) => resolveSubject(...a) };
});

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
  const r = await buildPersonChain({ leadId: LEAD, ctx: CTX, now: NOW });
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

  it('a ticketed handoff CARRIES the ticket id - the plan asked for it, and where the trail goes next is the question', async () => {
    worldBare();
    handoffFindOne.mockResolvedValue(row({ id: 'h-2', ticket_id: 'tk-9' }));
    // The first pass read ticket_id only to choose a `via` and then discarded it,
    // which answered "is there a ticket" while withholding which one.
    expect(byName((await chainOf()).hops).handoff).toEqual({
      name: 'handoff', status: 'linked', ref: 'h-2', via: 'handoffs.ticket_id', ticket_ref: 'tk-9',
    });
  });

  it('a handoff without a ticket is still linked, and the key is ABSENT rather than empty', async () => {
    worldBare();
    handoffFindOne.mockResolvedValue(row({ id: 'h-1', ticket_id: null }));
    const h = byName((await chainOf()).hops).handoff;
    expect(h).toEqual({ name: 'handoff', status: 'linked', ref: 'h-1', via: 'no_ticket' });
    expect('ticket_ref' in h).toBe(false);
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

describe('the enrolment hop: three paths, and TWO of them are address matches', () => {
  const resolvedVia = (sources: string[]) =>
    resolveSubject.mockResolvedValue({ status: 'resolved', subject: { enrollment_id: 'enr-1' }, sources });

  it('the email match is labelled AND flagged weak_key - it is the unindexed break', async () => {
    worldBare();
    resolvedVia(['lead', 'enrollment_email']);
    expect(byName((await chainOf()).hops).enrolment).toEqual({
      name: 'enrolment', status: 'linked', ref: 'enr-1', via: 'enrollment_email', weak_key: true,
    });
  });

  // The first pass of this task got this wrong and a CELL ASSERTED THE ERROR:
  // `enrollment_lead` looks keyed because it goes through a bridge table, but
  // `subjectResolver` joins that bridge on LOWER(enrollment_leads.email) as well.
  // It is an address match, so it is weak. The `via` is what still tells them
  // apart - that column is UNIQUE, so the match is at least deterministic, while
  // `enrollments.email` is neither unique nor indexed. Degree is not safety, and
  // someone filtering for fragile joins needs both rows back.
  it.each([
    ['enrollment_lead', true],
    ['explorer_profile', false],
  ])('%s is weak_key=%s - only the persisted profile link is a real key', async (source, weak) => {
    worldBare();
    resolvedVia(['lead', source as string]);
    expect(byName((await chainOf()).hops).enrolment).toMatchObject({ via: source, weak_key: weak });
  });

  it('exactly one of the three paths is reported as keyed', async () => {
    const flags: unknown[] = [];
    for (const s of ['explorer_profile', 'enrollment_lead', 'enrollment_email']) {
      worldBare();
      resolvedVia(['lead', s]);
      flags.push(byName((await chainOf()).hops).enrolment.weak_key);
    }
    expect(flags).toEqual([false, true, true]);
  });

  it('the resolver walks in order, so the strongest link found wins', async () => {
    worldBare();
    resolvedVia(['explorer_profile', 'enrollment_email']);
    expect(byName((await chainOf()).hops).enrolment).toMatchObject({ via: 'explorer_profile', weak_key: false });
  });
});

describe('the resolver import stays LAZY, and this is what holds it there', () => {
  afterEach(() => {
    mockResolverLoadThrows = false;
    jest.resetModules();
  });

  it('the module loads cleanly even when loading subjectResolver would throw', () => {
    // WHY THIS IS A CELL AND NOT A COMMENT: a static import here put FOUR of the
    // seven suites that mount `growthJourneyRoutes` into "failed to run", because
    // `subjectResolver` reaches emailService -> settingsService -> models/SystemSetting
    // -> config/database, and a barrel mock cannot intercept a direct model import.
    // A text scan for `await import` would constrain the SPELLING; this constrains
    // the behaviour - if the import moves back to module scope, the require throws.
    jest.resetModules();
    mockResolverLoadThrows = true;
    expect(() => require('../personChainService')).not.toThrow();
  });

  it('...and the guard above is real: loading the resolver in that state DOES throw', () => {
    // The positive control. Without it the cell above passes whether or not the
    // registry is actually armed, which is the exact way the first version of this
    // guard failed - a mutant restored the module-scope import and it still passed.
    jest.resetModules();
    mockResolverLoadThrows = true;
    expect(() => require('../subjectResolver')).toThrow('loaded at module scope');
  });

  it('and the hop still resolves through it when the hop actually runs', async () => {
    worldBare();
    resolveSubject.mockResolvedValue({ status: 'resolved', subject: { enrollment_id: 'e-1' }, sources: ['explorer_profile'] });
    expect(byName((await chainOf()).hops).enrolment).toMatchObject({ ref: 'e-1' });
    expect(resolveSubject).toHaveBeenCalledWith({ leadId: LEAD });
  });
});

describe('scope, and the 404 that must not be distinguishable', () => {
  it('a lead that does not exist is not_found', async () => {
    worldBare();
    leadFindByPk.mockResolvedValue(null);
    expect(await buildPersonChain({ leadId: LEAD, ctx: CTX, now: NOW })).toEqual({ status: 'not_found' });
  });

  it('a lead OUTSIDE the caller\'s brands is not_found - the same answer, so a foreign tenant learns nothing', async () => {
    worldBare();
    // visible to nobody the caller is authorised for
    getAuthorizedLeadContexts.mockResolvedValue([]);
    expect(await buildPersonChain({ leadId: LEAD, ctx: CTX, now: NOW })).toEqual({ status: 'not_found' });
  });
});

describe("EVERY read carrying tenancy takes the caller's clause, not just the one someone named", () => {
  // The verifier of attempt 2 killed three mutants I had left alive, all one class: the
  // scope clause was ASSERTED for `delivery_engagements` alone, because that was the hop
  // it had named in attempt 1. Dropping the clause from the execution query, from the
  // handoff query, or reading the unfiltered context list all left 45/45 green.
  //
  // So this is written as the CLASS, not three more instances. Every table read here
  // that declares its own tenant_id/brand_id is enumerated, and each one's real query
  // argument is checked. A seventh hop added later that forgets the clause fails here
  // without anyone remembering to add a cell for it.
  const SCOPED_READS: [string, jest.Mock][] = [
    ['growth_journey_executions', execFindOne],
    ['growth_journey_handoffs', handoffFindOne],
    ['growth_journey_classifications', classificationCount],
    ['growth_journey_decisions', decisionCount],
    ['growth_journey_transitions', transitionCount],
    ['growth_journey_outcomes', outcomeCount],
    ['delivery_engagements', engagementFindOne],
  ];

  it.each(SCOPED_READS)('%s is queried with the tenant clause', async (_table, fn) => {
    worldBare();
    await chainOf();
    expect(fn).toHaveBeenCalled();
    const where = (fn.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ tenant_id: 't-cola' });
  });

  it.each(SCOPED_READS)('%s narrows by brand for a brand-restricted caller', async (_table, fn) => {
    worldBare();
    await buildPersonChain({ leadId: LEAD, ctx: { ...(CTX as object), brandId: 'b-cpn' } as never, now: NOW });
    const where = (fn.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ brand_id: 'b-cpn' });
  });

  it('`visitors` is the ONE read with no clause, because that table carries no tenancy', async () => {
    worldBare();
    await chainOf();
    // Stated positively so the exemption is a decision rather than an omission: adding a
    // tenant clause to a table without the column throws at runtime, not compile time.
    const where = (visitorFindOne.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toEqual({ lead_id: LEAD });
  });

  it('the campaign hop reads the VISIBLE contexts, never the authorized ones', async () => {
    worldBare();
    // Both rows survive `getAuthorizedLeadContexts` - the caller is authorised for the
    // tenant - but only one survives the brand narrowing. The out-of-brand row is the
    // only one naming a campaign, so reading `contexts` instead of `visible` would hand
    // a CPN-restricted operator an Enterprise campaign id off a lead they may see.
    getAuthorizedLeadContexts.mockResolvedValue([
      visibleContext({ brand_id: 'b-cpn', first_campaign_id: null }),
      visibleContext({ brand_id: 'b-enterprise', first_campaign_id: 'camp-enterprise' }),
    ]);
    const hop = byName(
      (await (async () => {
        const r = await buildPersonChain({ leadId: LEAD, ctx: { ...(CTX as object), brandId: 'b-cpn' } as never, now: NOW });
        if (r.status !== 'found') throw new Error('expected found');
        return r.chain;
      })()).hops,
    ).campaign;
    expect(hop.ref).not.toBe('camp-enterprise');
    expect(hop).toEqual({ name: 'campaign', status: 'unavailable', reason: 'no_key' });
  });
});

describe('the project hop is SCOPED: a visible lead does not make its engagement visible', () => {
  it("the query carries the caller's tenant clause, so a foreign engagement is never read", async () => {
    worldBare();
    await chainOf();
    // `delivery_engagements` carries its own tenant_id (NOT NULL) and brand_id, and
    // `source_lead_id` is written by whoever converted the lead - nothing stops an
    // engagement in one brand pointing at a lead another operator legitimately holds.
    // Unscoped, a Training-only operator would be handed an Enterprise project's UUID.
    const where = (engagementFindOne.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ source_lead_id: LEAD, tenant_id: 't-cola' });
  });

  it('a brand-restricted operator narrows further: the brand clause travels too', async () => {
    worldBare();
    await buildPersonChain({ leadId: LEAD, ctx: { ...(CTX as object), brandId: 'b-cpn' } as never, now: NOW });
    const where = (engagementFindOne.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ source_lead_id: LEAD, brand_id: 'b-cpn' });
  });

  it('the lead_id column is never sent to a table that has no such column', async () => {
    worldBare();
    await chainOf();
    // `personScopeWhere` includes lead_id for the lead's own collections; the
    // engagement is keyed on source_lead_id, so passing the clause whole would
    // query a column that does not exist and throw at runtime, not compile time.
    const where = (engagementFindOne.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect('lead_id' in where).toBe(false);
  });
});

describe('where the scrub boundary IS: the route, not this service', () => {
  const adversarial = () => {
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
  };

  // This cell used to be named "none reaches the chain" and asserted nothing of the
  // kind - six addresses reached it and the assertions looked elsewhere. A name that
  // claims a property the body does not check is worse than no cell, because it reads
  // as coverage. The service is NOT a scrub boundary: it copies ids verbatim, and the
  // route is where addresses are removed (proved at the route, which refuses `@` on
  // the serialised response). What is asserted here is the true half.
  it('every ref is copied through VERBATIM, which is exactly why the route must scrub', async () => {
    adversarial();
    const refs = byName((await chainOf()).hops);
    expect(refs.handoff.ref).toBe('h@example.com');
    expect(refs.handoff.ticket_ref).toBe('tk@example.com');
    expect(refs.enrolment.ref).toBe('person@example.com');
    expect(refs.visitor.ref).toBe('someone@example.com');
  });

  it('no address is INVENTED, reshaped or moved between fields on the way through', async () => {
    adversarial();
    const c = await chainOf();
    // A half-scrub added here later would read as safety and provide none - the route
    // would still be the only real boundary, but nobody would believe it had to be.
    // So the count is pinned: the fixture seeds SEVEN addresses and seven arrive.
    //
    // This number was 6 until the handoff hop started carrying `ticket_ref`, and this
    // assertion is what caught the new surface - a field added to the chain is a field
    // the route now has to scrub, and the pin makes that arrive as a failure rather
    // than as an address in a response.
    const emitted = JSON.stringify(c).match(/@/g) ?? [];
    expect(emitted).toHaveLength(7);
    expect(c.hops.map((h) => h.name)).toHaveLength(9);
  });
});
