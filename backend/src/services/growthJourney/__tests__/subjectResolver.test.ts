const leadFindByPk = jest.fn();
const leadCreate = jest.fn();
const leadUpdate = jest.fn();
const enrollmentFindByPk = jest.fn();
const enrollmentCreate = jest.fn();
const enrollmentUpdate = jest.fn();
const visitorFindByPk = jest.fn();
const visitorCreate = jest.fn();
const visitorUpdate = jest.fn();
const orgMemberFindByPk = jest.fn();
const orgMemberCreate = jest.fn();
const orgMemberUpdate = jest.fn();

const profileFindOne = jest.fn();
const enrollmentLeadFindOne = jest.fn();
const enrollmentFindAll = jest.fn();
const subscriptionFindOne = jest.fn();

const resolveExplorerLead = jest.fn();
const getLeadContexts = jest.fn();

jest.mock('../../../models', () => ({
  Lead: {
    findByPk: (...a: unknown[]) => leadFindByPk(...a),
    create: (...a: unknown[]) => leadCreate(...a),
    update: (...a: unknown[]) => leadUpdate(...a),
    upsert: (...a: unknown[]) => leadCreate(...a),
  },
  Enrollment: {
    findByPk: (...a: unknown[]) => enrollmentFindByPk(...a),
    findAll: (...a: unknown[]) => enrollmentFindAll(...a),
    create: (...a: unknown[]) => enrollmentCreate(...a),
    update: (...a: unknown[]) => enrollmentUpdate(...a),
    upsert: (...a: unknown[]) => enrollmentCreate(...a),
  },
  Visitor: {
    findByPk: (...a: unknown[]) => visitorFindByPk(...a),
    create: (...a: unknown[]) => visitorCreate(...a),
    update: (...a: unknown[]) => visitorUpdate(...a),
    upsert: (...a: unknown[]) => visitorCreate(...a),
  },
  OrgMember: {
    findByPk: (...a: unknown[]) => orgMemberFindByPk(...a),
    create: (...a: unknown[]) => orgMemberCreate(...a),
    update: (...a: unknown[]) => orgMemberUpdate(...a),
    upsert: (...a: unknown[]) => orgMemberCreate(...a),
  },
  // T407: the lead -> enrolment walk and the customer fact. Reads only; no writer is mocked because none may exist.
  ExplorerJourneyProfile: { findOne: (...a: unknown[]) => profileFindOne(...a) },
  EnrollmentLead: { findOne: (...a: unknown[]) => enrollmentLeadFindOne(...a) },
  Subscription: { findOne: (...a: unknown[]) => subscriptionFindOne(...a) },
  CommunityMember: {},
}));

jest.mock('../../explorerGrowth/explorerIdentityBridge', () => ({
  resolveExplorerLead: (...a: unknown[]) => resolveExplorerLead(...a),
  // The REAL normaliser, not a stub. It is a pure function, and the point of
  // the lead-path test is that the resolver produces the same value the bridge
  // would — a stub would only prove the resolver called something.
  normalizeEmail: jest.requireActual('../../explorerGrowth/explorerIdentityBridge').normalizeEmail,
}));

jest.mock('../../../modules/tenancy/leadContextService', () => ({
  getLeadContexts: (...a: unknown[]) => getLeadContexts(...a),
}));

import { resolveSubject, subjectHasBrandRelationship } from '../subjectResolver';

/**
 * T204 — the subject view.
 *
 * THE CONTRACT THAT MATTERS MOST IS A NEGATIVE ONE: this module writes nothing.
 * Every mocked `create`, `update` and `upsert` above exists so that a write can
 * be asserted against, and `WRITERS` below is checked after every scenario
 * rather than in one dedicated test — a single "it does not write" test only
 * proves the one path it exercised.
 *
 * The trap this guards is specific and was found by reading the code rather
 * than the plan: `resolveExplorerLead` CREATES an `explorer_journey_profiles`
 * row unless `{ dryRun: true }` is passed. A resolver that forgot the flag
 * would write a row per lookup, on a page-view path, and every test here would
 * still pass unless the write were asserted against.
 */

const WRITERS = [
  ['Lead.create/upsert', leadCreate],
  ['Lead.update', leadUpdate],
  ['Enrollment.create/upsert', enrollmentCreate],
  ['Enrollment.update', enrollmentUpdate],
  ['Visitor.create/upsert', visitorCreate],
  ['Visitor.update', visitorUpdate],
  ['OrgMember.create/upsert', orgMemberCreate],
  ['OrgMember.update', orgMemberUpdate],
] as const;

const expectNoWrites = () => {
  for (const [name, spy] of WRITERS) {
    if (spy.mock.calls.length > 0) {
      throw new Error(`${name} was called — this module must write nothing`);
    }
  }
};

const bridged = (over: Record<string, unknown> = {}) => ({
  enrollment_id: 'enr-1',
  lead_id: 42,
  email_normalized: 'a@example.test',
  resolved: true,
  ...over,
});

const context = (over: Record<string, unknown> = {}) => ({
  tenant_id: 'tenant-1',
  brand_id: 'brand-cpn',
  relationship_type: 'learner',
  first_touch_at: new Date('2026-01-01T00:00:00Z'),
  last_touch_at: new Date('2026-06-01T00:00:00Z'),
  ...over,
});

beforeEach(() => {
  for (const [, spy] of WRITERS) spy.mockReset();
  leadFindByPk.mockReset().mockResolvedValue({ id: 42, email: 'a@example.test' });
  enrollmentFindByPk.mockReset().mockResolvedValue({ id: 'enr-1', email: 'a@example.test' });
  visitorFindByPk.mockReset().mockResolvedValue({ id: 'vis-1', lead_id: 42 });
  orgMemberFindByPk.mockReset().mockResolvedValue({ id: 'om-1', enrollment_id: 'enr-1' });
  resolveExplorerLead.mockReset().mockResolvedValue(bridged());
  getLeadContexts.mockReset().mockResolvedValue([]);
  profileFindOne.mockReset().mockResolvedValue(null);
  enrollmentLeadFindOne.mockReset().mockResolvedValue(null);
  enrollmentFindAll.mockReset().mockResolvedValue([]);
  subscriptionFindOne.mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  expectNoWrites();
  jest.restoreAllMocks();
});

describe('THE INVARIANT: it writes nothing, on any path', () => {
  it('passes dryRun to the explorer bridge — without it, the bridge CREATES a row', async () => {
    await resolveSubject({ enrollmentId: 'enr-1' });
    expect(resolveExplorerLead).toHaveBeenCalledWith('enr-1', { dryRun: true });
  });

  it('passes dryRun on every call, not just the first', async () => {
    await resolveSubject({ enrollmentId: 'enr-1' });
    await resolveSubject({ enrollmentId: 'enr-2', leadId: 7 });
    await resolveSubject({ enrollmentId: 'enr-3', visitorId: 'vis-1' });
    for (const call of resolveExplorerLead.mock.calls) {
      expect(call[1]).toEqual({ dryRun: true });
    }
    expect(resolveExplorerLead.mock.calls.length).toBe(3);
  });

  it('calls no visitor write function, even though the service only exposes writers', async () => {
    // `visitorTrackingService.resolveIdentity` writes and returns void. It must
    // not be reachable from here.
    await resolveSubject({ visitorId: 'vis-1' });
    expect(visitorUpdate).not.toHaveBeenCalled();
    expect(visitorCreate).not.toHaveBeenCalled();
  });

  it('writes nothing when everything resolves', async () => {
    getLeadContexts.mockResolvedValue([context()]);
    const r = await resolveSubject({ enrollmentId: 'enr-1', visitorId: 'vis-1', orgMemberId: 'om-1' });
    expect(r.status).toBe('resolved');
    // expectNoWrites() runs in afterEach for this and every other case.
  });

  it('writes nothing when nothing resolves', async () => {
    resolveExplorerLead.mockResolvedValue(bridged({ resolved: false }));
    enrollmentFindByPk.mockResolvedValue(null);
    visitorFindByPk.mockResolvedValue(null);
    orgMemberFindByPk.mockResolvedValue(null);
    leadFindByPk.mockResolvedValue(null);
    const r = await resolveSubject({ enrollmentId: 'x', visitorId: 'y', orgMemberId: 'z', leadId: 1 });
    expect(r.status).toBe('unresolved');
  });

  it('writes nothing when a lookup throws', async () => {
    leadFindByPk.mockRejectedValue(new Error('connection terminated'));
    const r = await resolveSubject({ leadId: 42 });
    expect(r.status).toBe('unresolved');
  });
});

describe('unresolved is distinguishable from resolved-with-no-history', () => {
  it('a subject with no brand relationship is RESOLVED with none', async () => {
    getLeadContexts.mockResolvedValue([]);
    const r = await resolveSubject({ leadId: 42 });
    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') throw new Error('unreachable');
    expect(r.subject.brand_relationships).toEqual([]);
    expect(r.subject.lead_id).toBe(42);
  });

  it('no anchor at all is unresolved, with its own reason', async () => {
    const r = await resolveSubject({});
    expect(r).toEqual({ status: 'unresolved', reason: 'no_anchor_supplied' });
  });

  it('treats an explicit null anchor as no anchor', async () => {
    const r = await resolveSubject({ leadId: null, enrollmentId: null, visitorId: null });
    expect(r).toEqual({ status: 'unresolved', reason: 'no_anchor_supplied' });
  });

  it('queries nothing when no anchor was supplied', async () => {
    await resolveSubject({});
    expect(leadFindByPk).not.toHaveBeenCalled();
    expect(resolveExplorerLead).not.toHaveBeenCalled();
    expect(getLeadContexts).not.toHaveBeenCalled();
  });

  it('a stale anchor that matches nothing is anchor_not_found', async () => {
    resolveExplorerLead.mockResolvedValue(bridged({ resolved: false, lead_id: null }));
    enrollmentFindByPk.mockResolvedValue(null);
    leadFindByPk.mockResolvedValue(null);
    const r = await resolveSubject({ enrollmentId: 'gone', leadId: 999 });
    expect(r).toEqual({ status: 'unresolved', reason: 'anchor_not_found' });
  });

  it('a failed lookup is lookup_failed, never resolved', async () => {
    getLeadContexts.mockRejectedValue(new Error('boom'));
    const r = await resolveSubject({ leadId: 42 });
    expect(r).toEqual({ status: 'unresolved', reason: 'lookup_failed' });
  });

  it('distinguishes all three unresolved reasons rather than collapsing them', async () => {
    const reasons = new Set<string>();

    reasons.add((await resolveSubject({})).status === 'unresolved' ? 'no_anchor_supplied' : 'x');

    resolveExplorerLead.mockResolvedValue(bridged({ resolved: false, lead_id: null }));
    enrollmentFindByPk.mockResolvedValue(null);
    leadFindByPk.mockResolvedValue(null);
    const notFound = await resolveSubject({ enrollmentId: 'gone' });
    if (notFound.status === 'unresolved') reasons.add(notFound.reason);

    leadFindByPk.mockRejectedValue(new Error('boom'));
    const failed = await resolveSubject({ leadId: 1 });
    if (failed.status === 'unresolved') reasons.add(failed.reason);

    expect(reasons.size).toBe(3);
  });
});

describe('the identity half', () => {
  it('reuses the explorer bridge for the enrollment-to-lead match', async () => {
    const r = await resolveSubject({ enrollmentId: 'enr-1' });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.subject.lead_id).toBe(42);
    expect(r.subject.email_normalized).toBe('a@example.test');
    expect(r.sources).toContain('enrollment');
  });

  it('keeps an enrollment that exists but matches no lead', async () => {
    // The bridge reports `resolved: false` both for a missing enrollment and for
    // a real one with no matching lead. Conflating them would discard a genuine
    // identity.
    resolveExplorerLead.mockResolvedValue(bridged({ resolved: false, lead_id: null }));
    enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: 'a@example.test' });
    leadFindByPk.mockResolvedValue(null);

    const r = await resolveSubject({ enrollmentId: 'enr-1' });

    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') throw new Error('unreachable');
    expect(r.subject.enrollment_id).toBe('enr-1');
    expect(r.subject.lead_id).toBeNull();
  });

  it('takes the lead id from a visitor row when the caller had none', async () => {
    visitorFindByPk.mockResolvedValue({ id: 'vis-1', lead_id: 77 });
    leadFindByPk.mockResolvedValue({ id: 77, email: 'v@example.test' });
    const r = await resolveSubject({ visitorId: 'vis-1' });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.subject.lead_id).toBe(77);
    expect(r.sources).toEqual(expect.arrayContaining(['visitor', 'lead']));
  });

  it('does not overwrite a caller-supplied lead id with the visitor’s', async () => {
    visitorFindByPk.mockResolvedValue({ id: 'vis-1', lead_id: 77 });
    const r = await resolveSubject({ leadId: 42, visitorId: 'vis-1' });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.subject.lead_id).toBe(42);
  });

  it('reaches an enrollment through an org member', async () => {
    orgMemberFindByPk.mockResolvedValue({ id: 'om-1', enrollment_id: 'enr-9' });
    const r = await resolveSubject({ orgMemberId: 'om-1' });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.subject.org_member_id).toBe('om-1');
    expect(r.subject.enrollment_id).toBe('enr-9');
    expect(r.sources).toContain('org_member');
  });

  it('does not overwrite a caller-supplied enrollment id with the org member’s', async () => {
    // One of two precedence branches an independent review found unpinned.
    // Caller wins, deterministically - the same rule as the visitor case.
    orgMemberFindByPk.mockResolvedValue({ id: 'om-1', enrollment_id: 'enr-from-member' });
    const r = await resolveSubject({ enrollmentId: 'enr-1', orgMemberId: 'om-1' });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.subject.enrollment_id).toBe('enr-1');
  });

  it('does not overwrite a caller-supplied lead id with the bridge’s', async () => {
    // The other unpinned branch. The bridge resolves enr-1 to lead 42; the
    // caller said 7. The caller's anchor is the one they are asking about.
    resolveExplorerLead.mockResolvedValue(bridged({ lead_id: 42 }));
    leadFindByPk.mockResolvedValue({ id: 7, email: 'seven@example.test' });
    const r = await resolveSubject({ enrollmentId: 'enr-1', leadId: 7 });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.subject.lead_id).toBe(7);
  });

  it('normalises the email on the lead-only path, through the bridge’s own function', async () => {
    // `email_normalized` carried the RAW Lead.email when no enrollment was
    // involved. Lead.email has no lowercase hook and the unique index is on
    // LOWER(email), so mixed case exists in the table.
    leadFindByPk.mockResolvedValue({ id: 42, email: '  Mixed.Case@Example.TEST ' });
    const r = await resolveSubject({ leadId: 42 });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.subject.email_normalized).toBe('mixed.case@example.test');
  });

  it('drops a DANGLING enrollment id inherited from an org member', async () => {
    // The org member row points at an enrollment that no longer exists. Without
    // validation the facade reported learner_without_profile - "not scored yet"
    // - for an enrollment that is simply gone. Found by the T206 verifier.
    orgMemberFindByPk.mockResolvedValue({ id: 'om-1', enrollment_id: 'enr-gone' });
    enrollmentFindByPk.mockResolvedValue(null);
    const r = await resolveSubject({ orgMemberId: 'om-1' });
    if (r.status !== 'resolved') throw new Error('expected resolved via org member');
    expect(r.subject.org_member_id).toBe('om-1');
    expect(r.subject.enrollment_id).toBeNull();
  });

  it('keeps an inherited enrollment id that DOES exist', async () => {
    orgMemberFindByPk.mockResolvedValue({ id: 'om-1', enrollment_id: 'enr-9' });
    enrollmentFindByPk.mockResolvedValue({ id: 'enr-9', email: 'x@example.test' });
    const r = await resolveSubject({ orgMemberId: 'om-1' });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.subject.enrollment_id).toBe('enr-9');
  });

  it('drops a dangling lead id rather than reporting an identity that is gone', async () => {
    visitorFindByPk.mockResolvedValue({ id: 'vis-1', lead_id: 999 });
    leadFindByPk.mockResolvedValue(null);
    const r = await resolveSubject({ visitorId: 'vis-1' });
    if (r.status !== 'resolved') throw new Error('expected resolved via visitor');
    expect(r.subject.lead_id).toBeNull();
    expect(r.sources).not.toContain('lead');
  });

  it('drops a visitor anchor that matches no row', async () => {
    visitorFindByPk.mockResolvedValue(null);
    const r = await resolveSubject({ leadId: 42, visitorId: 'gone' });
    if (r.status !== 'resolved') throw new Error('expected resolved via lead');
    expect(r.subject.visitor_id).toBeNull();
  });
});

describe('the relationship half — §15 calls it a subject AND relationship service', () => {
  it('returns per-brand relationships from lead_tenant_contexts', async () => {
    // Cycle 1 of the plan omitted this half, which is how a SECOND per-brand
    // relationship model gets built beside `lead_tenant_contexts`.
    getLeadContexts.mockResolvedValue([
      context({ brand_id: 'brand-cpn' }),
      context({ brand_id: 'brand-colaberry-training', relationship_type: 'applicant' }),
    ]);
    const r = await resolveSubject({ leadId: 42 });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.subject.brand_relationships).toHaveLength(2);
    expect(r.subject.brand_relationships.map((b) => b.brand_id)).toEqual([
      'brand-cpn',
      'brand-colaberry-training',
    ]);
    expect(r.sources).toContain('lead_tenant_context');
  });

  it('asks leadContextService, rather than querying the table itself', async () => {
    await resolveSubject({ leadId: 42 });
    expect(getLeadContexts).toHaveBeenCalledWith(42);
  });

  it('never touches lead_tenant_contexts itself — a source scan, not a spy', async () => {
    // A spy on `getLeadContexts` proves the service was CALLED; it cannot prove
    // the table is not also read directly somewhere else in the module. My
    // first attempt to mutate this wrote `getLeadContexts(leadId + 0)`, which
    // is semantically identical to the original — an equivalent mutant that
    // proved nothing. So this scans the source, the way the T203 no-new-map
    // assertions do.
    //
    // It matters because `lead_tenant_contexts` is the trusted per-brand
    // relationship map, and §15 names this a subject AND RELATIONSHIP service:
    // reading the table here is how a second relationship model starts.
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'subjectResolver.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code).toContain('getLeadContexts');
    expect(code).not.toMatch(/LeadTenantContext/);
    expect(code).not.toMatch(/lead_tenant_contexts/);
    // Nor any other model reaching for the same data: the ONE findAll in the module is
    // T407's step 3 over `enrollments` (an identity table, not a relationship one).
    expect(code.match(/\.findAll\s*\(/g)).toHaveLength(1);
    expect(code).toMatch(/Enrollment\.findAll\s*\(/);
  });

  it('does not look for relationships without a lead', async () => {
    resolveExplorerLead.mockResolvedValue(bridged({ resolved: false, lead_id: null }));
    enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: 'a@example.test' });
    await resolveSubject({ enrollmentId: 'enr-1' });
    expect(getLeadContexts).not.toHaveBeenCalled();
  });

  it('omits lead_tenant_context from sources when there are none', async () => {
    getLeadContexts.mockResolvedValue([]);
    const r = await resolveSubject({ leadId: 42 });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.sources).not.toContain('lead_tenant_context');
  });

  it('carries the touch timestamps through unchanged', async () => {
    getLeadContexts.mockResolvedValue([context()]);
    const r = await resolveSubject({ leadId: 42 });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.subject.brand_relationships[0]).toEqual({
      tenant_id: 'tenant-1',
      brand_id: 'brand-cpn',
      relationship_type: 'learner',
      first_touch_at: new Date('2026-01-01T00:00:00Z'),
      last_touch_at: new Date('2026-06-01T00:00:00Z'),
    });
  });
});

describe('T407: the lead -> enrolment walk, and what a customer is', () => {
  const NONE = { paid: false, basis: 'none' };

  it('a lead anchor with no profile link, no enrollment_leads row and no enrolment by email reports no enrolment and no customer - three reads, in that order, and the bridge is not called', async () => {
    const r = await resolveSubject({ leadId: 42 });
    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') return;
    expect(r.subject.enrollment_id).toBeNull();
    expect(r.subject.customer).toEqual(NONE);
    expect(r.sources).toEqual(['lead']);
    expect(profileFindOne).toHaveBeenCalledWith({ where: { lead_id: 42 }, attributes: ['enrollment_id'] });
    expect(enrollmentLeadFindOne).toHaveBeenCalledTimes(1);
    expect(enrollmentFindAll).toHaveBeenCalledTimes(1);
    expect(resolveExplorerLead).not.toHaveBeenCalled();
    expect(subscriptionFindOne).not.toHaveBeenCalled();
  });

  it('step 1: the profile link wins, and the later steps are not read', async () => {
    profileFindOne.mockResolvedValue({ enrollment_id: 'enr-p' });
    enrollmentFindByPk.mockResolvedValue({ id: 'enr-p', payment_status: 'paid', tier: 'member' });
    const r = await resolveSubject({ leadId: 42 });
    if (r.status !== 'resolved') throw new Error(r.status);
    expect(r.subject.enrollment_id).toBe('enr-p');
    expect(r.sources).toEqual(['lead', 'enrollment', 'explorer_profile']);
    expect(enrollmentLeadFindOne).not.toHaveBeenCalled();
    expect(enrollmentFindAll).not.toHaveBeenCalled();
    expect(r.subject.customer).toEqual({ paid: true, basis: 'payment_status' });
  });

  it('step 2: an enrollment_leads row that carries an enrolment; one that does not (a prospect) falls through to step 3', async () => {
    enrollmentLeadFindOne.mockResolvedValue({ enrollment_id: 'enr-el' });
    enrollmentFindByPk.mockResolvedValue({ id: 'enr-el', payment_status: 'pending', tier: 'member' });
    const r = await resolveSubject({ leadId: 42 });
    if (r.status !== 'resolved') throw new Error(r.status);
    expect(r.subject.enrollment_id).toBe('enr-el');
    expect(r.sources).toEqual(['lead', 'enrollment', 'enrollment_lead']);
    expect(enrollmentFindAll).not.toHaveBeenCalled();
    expect(r.subject.customer).toEqual(NONE);
    enrollmentLeadFindOne.mockResolvedValue({ enrollment_id: null });
    enrollmentFindAll.mockResolvedValue([{ id: 'enr-e', email: 'A@Example.test', enrollment_type: 'explorer', payment_status: 'pending', created_at: new Date('2026-01-01') }]);
    const r2 = await resolveSubject({ leadId: 42 });
    if (r2.status !== 'resolved') throw new Error(r2.status);
    expect(r2.subject.enrollment_id).toBe('enr-e');
    expect(r2.sources).toEqual(['lead', 'enrollment', 'enrollment_email']);
  });

  it("step 3: several enrolments on one address are deduped by the bridge's rule - mgmt_role > non-explorer > paid > newest - never by recency alone", async () => {
    enrollmentFindAll.mockResolvedValue([
      { id: 'newest-explorer', enrollment_type: 'explorer', payment_status: 'pending', created_at: new Date('2026-09-01') },
      { id: 'older-paid-seat', enrollment_type: 'standard', payment_status: 'paid', created_at: new Date('2026-03-01') },
      { id: 'staff', enrollment_type: 'standard', payment_status: 'pending', created_at: new Date('2025-01-01'), communityMember: { mgmt_role: 'admin' } },
    ]);
    enrollmentFindByPk.mockImplementation(async (id: string) => ({ id, payment_status: id === 'older-paid-seat' ? 'paid' : 'pending', tier: 'member' }));
    const r = await resolveSubject({ leadId: 42 });
    if (r.status !== 'resolved') throw new Error(r.status);
    expect(r.subject.enrollment_id).toBe('staff');
    // The email match is on the NORMALISED address through LOWER(email), not the raw column.
    const call = enrollmentFindAll.mock.calls[0][0] as { where: unknown; include: Array<{ as: string; required: boolean }> };
    expect(JSON.stringify(call.where)).toContain('a@example.test');
    expect(call.include[0]).toMatchObject({ as: 'communityMember', required: false });
  });

  it('the walk needs an address for steps 2 and 3: a lead with no email stops after the profile step', async () => {
    leadFindByPk.mockResolvedValue({ id: 42, email: null });
    const r = await resolveSubject({ leadId: 42 });
    if (r.status !== 'resolved') throw new Error(r.status);
    expect(r.subject.enrollment_id).toBeNull();
    expect(profileFindOne).toHaveBeenCalledTimes(1);
    expect(enrollmentLeadFindOne).not.toHaveBeenCalled();
    expect(enrollmentFindAll).not.toHaveBeenCalled();
  });

  it('a caller-supplied enrolment id is never overwritten by the walk, and the walk does not run', async () => {
    profileFindOne.mockResolvedValue({ enrollment_id: 'enr-other' });
    const r = await resolveSubject({ leadId: 42, enrollmentId: 'enr-1' });
    if (r.status !== 'resolved') throw new Error(r.status);
    expect(r.subject.enrollment_id).toBe('enr-1');
    expect(profileFindOne).not.toHaveBeenCalled();
  });

  describe('customer is a PAID relationship, never "an enrolment exists"', () => {
    it('a paid, member-tier enrolment: paid, basis payment_status', async () => {
      enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: 'a@example.test', payment_status: 'paid', tier: 'member' });
      const r = await resolveSubject({ enrollmentId: 'enr-1' });
      if (r.status !== 'resolved') throw new Error(r.status);
      expect(r.subject.customer).toEqual({ paid: true, basis: 'payment_status' });
      expect(subscriptionFindOne).not.toHaveBeenCalled();
    });

    it('a GUEST-tier enrolment is not a customer even with payment_status paid (every AI Flotation submit mints one); an unpaid member is not either', async () => {
      enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: 'a@example.test', payment_status: 'paid', tier: 'guest' });
      const guest = await resolveSubject({ enrollmentId: 'enr-1' });
      if (guest.status !== 'resolved') throw new Error(guest.status);
      expect(guest.subject.enrollment_id).toBe('enr-1');
      expect(guest.subject.customer).toEqual(NONE);
      enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: 'a@example.test', payment_status: 'pending', tier: 'member' });
      const pending = await resolveSubject({ enrollmentId: 'enr-1' });
      if (pending.status !== 'resolved') throw new Error(pending.status);
      expect(pending.subject.customer).toEqual(NONE);
      expect(subscriptionFindOne).toHaveBeenCalledTimes(2);
    });

    it('an ACTIVE subscription on the enrolment is the other basis; a canceled or past_due one is not asked for', async () => {
      enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: 'a@example.test', payment_status: 'pending', tier: 'guest' });
      subscriptionFindOne.mockResolvedValue({ id: 'sub-1' });
      const r = await resolveSubject({ enrollmentId: 'enr-1' });
      if (r.status !== 'resolved') throw new Error(r.status);
      expect(r.subject.customer).toEqual({ paid: true, basis: 'subscription' });
      expect(subscriptionFindOne).toHaveBeenCalledWith({ where: { enrollment_id: 'enr-1', status: 'active' }, attributes: ['id'] });
    });

    it('no enrolment at all: not a customer, and nothing is asked', async () => {
      const r = await resolveSubject({ visitorId: 'vis-1' });
      if (r.status !== 'resolved') throw new Error(r.status);
      expect(r.subject.customer).toEqual(NONE);
      expect(subscriptionFindOne).not.toHaveBeenCalled();
    });
  });

  it('a walk step that throws is lookup_failed, never a resolved subject with a guessed enrolment', async () => {
    enrollmentLeadFindOne.mockRejectedValue(new Error('db down'));
    expect(await resolveSubject({ leadId: 42 })).toEqual({ status: 'unresolved', reason: 'lookup_failed' });
  });
});
describe('subjectHasBrandRelationship', () => {
  it('is true only for a brand the subject actually has', async () => {
    getLeadContexts.mockResolvedValue([context({ brand_id: 'brand-cpn' })]);
    await expect(subjectHasBrandRelationship({ leadId: 42 }, 'tenant-1', 'brand-cpn')).resolves.toBe(true);
    await expect(
      subjectHasBrandRelationship({ leadId: 42 }, 'tenant-1', 'brand-ai-flotation'),
    ).resolves.toBe(false);
  });

  it('requires the TENANT to match too, not only the brand', async () => {
    // Brand ids are UUIDs so a cross-tenant collision is unlikely — but the
    // relationship is scoped by both, and checking one is how a cross-tenant
    // read eventually passes.
    getLeadContexts.mockResolvedValue([context({ tenant_id: 'tenant-1', brand_id: 'brand-cpn' })]);
    await expect(subjectHasBrandRelationship({ leadId: 42 }, 'tenant-other', 'brand-cpn')).resolves.toBe(
      false,
    );
  });

  it('is false — never throwing — for an unresolved subject', async () => {
    await expect(subjectHasBrandRelationship({}, 'tenant-1', 'brand-cpn')).resolves.toBe(false);
  });

  it('is false when the lookup failed, rather than reporting no relationship', async () => {
    getLeadContexts.mockRejectedValue(new Error('boom'));
    await expect(subjectHasBrandRelationship({ leadId: 42 }, 'tenant-1', 'brand-cpn')).resolves.toBe(
      false,
    );
  });
});
