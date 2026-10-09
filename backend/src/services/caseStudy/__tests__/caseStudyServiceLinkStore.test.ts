/**
 * The case-study/service link store. Models are mocked, so these assert BEHAVIOR — what is written, under which
 * where-clause, and what is deliberately NOT written — rather than a database round-trip.
 *
 * The two tests this file exists for:
 *   - a SECOND suggestion pass must not touch a row a human already decided. If it did, every "no, that record
 *     does not prove that service" would reappear as an open proposal and the queue would never converge.
 *   - `inserted` must be counted from the database. The submitted-array length cannot stand in for it, because the
 *     model mints ids client-side and a discarded row still comes back carrying one.
 */
const csFindByPk = jest.fn();
const csFindAll = jest.fn();
const soFindAll = jest.fn();
const linkFindAll = jest.fn();
const linkFindByPk = jest.fn();
const linkBulkCreate = jest.fn();
const linkCount = jest.fn();

jest.mock('../../../models/CaseStudy', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => csFindByPk(...a), findAll: (...a: any[]) => csFindAll(...a) },
}));
jest.mock('../../../models/ServiceOffering', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => soFindAll(...a) },
}));
jest.mock('../../../models/CaseStudyServiceLink', () => ({
  __esModule: true,
  default: {
    findAll: (...a: any[]) => linkFindAll(...a),
    findByPk: (...a: any[]) => linkFindByPk(...a),
    bulkCreate: (...a: any[]) => linkBulkCreate(...a),
    count: (...a: any[]) => linkCount(...a),
  },
  CASE_STUDY_SERVICE_LINK_STATES: ['suggested', 'confirmed', 'rejected'],
}));

import {
  suggestLinksForCaseStudy,
  listLinksForCaseStudy,
  listLinksForService,
  decideLink,
  CaseStudyNotFoundError,
  CaseStudyServiceLinkNotFoundError,
} from '../caseStudyServiceLinkStore';

const RECORD = {
  id: 'cs1',
  title: 'The prompt was versioned, the text kept changing',
  canonical_summary: 'A governance review of prompt versioning for an admissions workflow.',
  industry: 'Education',
  primary_capability: 'AI Governance',
  program_key: 'accelerator',
};

const SERVICE = {
  id: 'svc1', name: 'AI Governance Advisory', category: 'AI Governance',
  keywords_json: ['governance', 'prompt'], naics_codes_json: ['541512'], tenant_id: 't1',
};
const OTHER_SERVICE = {
  id: 'svc2', name: 'Data Engineering', category: 'Data', keywords_json: ['governance'],
  naics_codes_json: [], tenant_id: 't1',
};

function row(fields: Record<string, any>) {
  const r: any = { ...fields, update: jest.fn().mockResolvedValue(undefined) };
  r.get = () => ({ ...fields });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  csFindByPk.mockResolvedValue(row(RECORD));
  csFindAll.mockResolvedValue([row({ ...RECORD, slug: 'a-slug', status: 'approved' })]);
  soFindAll.mockResolvedValue([row(SERVICE), row(OTHER_SERVICE)]);
  linkFindAll.mockResolvedValue([]);
  linkBulkCreate.mockResolvedValue([]);
  linkCount.mockResolvedValue(0);
});

describe('suggestLinksForCaseStudy', () => {
  it('inserts new proposals as suggested, stamped with who ran the pass', async () => {
    linkCount.mockResolvedValue(2);
    const res = await suggestLinksForCaseStudy({ caseStudyId: 'cs1', tenantId: 't1', suggestedBy: 'suggestion-pass' });

    // A NEW suggestion only ever points at a service the company still offers.
    expect(soFindAll).toHaveBeenCalledWith({ where: { tenant_id: 't1', status: 'active' } });
    const submitted = linkBulkCreate.mock.calls[0][0];
    expect(linkBulkCreate.mock.calls[0][1]).toEqual({ ignoreDuplicates: true });
    for (const r of submitted) {
      expect(r.state).toBe('suggested');
      expect(r.suggested_by).toBe('suggestion-pass');
      expect(r.case_study_id).toBe('cs1');
      expect(r.rationale).toContain('not confirmed');
      expect(typeof r.match_score).toBe('number');
      // Nothing here may pretend a person was involved.
      expect(r.decided_by ?? null).toBeNull();
      expect(r.decided_at ?? null).toBeNull();
    }
    expect(res.inserted).toBe(2);
    expect(res.proposed.length).toBe(2);
  });

  it('on a re-run, submits nothing and leaves a DECIDED row exactly as it stands', async () => {
    // Both pairs already exist; one was confirmed by a person, one rejected.
    const confirmed = row({ id: 'l1', case_study_id: 'cs1', service_offering_id: 'svc1', state: 'confirmed' });
    const rejected = row({ id: 'l2', case_study_id: 'cs1', service_offering_id: 'svc2', state: 'rejected' });
    linkFindAll.mockResolvedValue([confirmed, rejected]);
    linkCount.mockResolvedValue(2);

    const res = await suggestLinksForCaseStudy({ caseStudyId: 'cs1', tenantId: 't1', suggestedBy: 'suggestion-pass' });

    expect(linkBulkCreate).not.toHaveBeenCalled();
    expect(confirmed.update).not.toHaveBeenCalled();
    expect(rejected.update).not.toHaveBeenCalled();
    expect(res.inserted).toBe(0);
    expect(res.alreadyPresent).toBe(res.proposed.length);
  });

  it('submits only the pairs that are genuinely new', async () => {
    linkFindAll.mockResolvedValue([
      row({ id: 'l1', case_study_id: 'cs1', service_offering_id: 'svc1', state: 'rejected' }),
    ]);
    linkCount.mockResolvedValue(2);
    await suggestLinksForCaseStudy({ caseStudyId: 'cs1', tenantId: 't1', suggestedBy: 'p' });
    const submitted = linkBulkCreate.mock.calls[0][0];
    expect(submitted.map((r: any) => r.service_offering_id)).toEqual(['svc2']);
  });

  it('counts insertions from the database, not from what it submitted', async () => {
    // Two pairs submitted, but the table still holds what it held: ON CONFLICT discarded both (a concurrent pass
    // won the race). `inserted` must report 0. Taking the submitted length would report 2 and could never be
    // anything else, because the model mints ids client-side.
    linkFindAll.mockResolvedValue([]);
    linkCount.mockResolvedValue(0);
    const res = await suggestLinksForCaseStudy({ caseStudyId: 'cs1', tenantId: 't1', suggestedBy: 'p' });
    expect(linkBulkCreate.mock.calls[0][0]).toHaveLength(2);
    expect(res.inserted).toBe(0);
  });

  it('writes nothing when the catalog does not overlap the record at all', async () => {
    soFindAll.mockResolvedValue([
      row({ id: 'svc9', name: 'Fleet Maintenance', category: 'Logistics', keywords_json: ['forklift'], tenant_id: 't1' }),
    ]);
    const res = await suggestLinksForCaseStudy({ caseStudyId: 'cs1', tenantId: 't1', suggestedBy: 'p' });
    expect(linkBulkCreate).not.toHaveBeenCalled();
    expect(res).toMatchObject({ inserted: 0, alreadyPresent: 0, proposed: [] });
  });

  it('refuses an unknown case study instead of proposing against nothing', async () => {
    csFindByPk.mockResolvedValue(null);
    await expect(suggestLinksForCaseStudy({ caseStudyId: 'nope', tenantId: 't1', suggestedBy: 'p' }))
      .rejects.toBeInstanceOf(CaseStudyNotFoundError);
    expect(linkBulkCreate).not.toHaveBeenCalled();
  });
});

describe('listLinksForCaseStudy', () => {
  it("hides links pointing at another tenant's service, which a shared record would otherwise leak", async () => {
    // `case_studies` carries no tenant_id, so the same record can be linked by two tenants.
    soFindAll.mockResolvedValue([row(SERVICE)]); // caller's tenant owns svc1 only
    linkFindAll.mockResolvedValue([
      row({ id: 'l1', case_study_id: 'cs1', service_offering_id: 'svc1', state: 'confirmed', match_score: 5 }),
      row({ id: 'l2', case_study_id: 'cs1', service_offering_id: 'svcOther', state: 'confirmed', match_score: 9 }),
    ]);
    const got = await listLinksForCaseStudy({ caseStudyId: 'cs1', tenantId: 't1' });
    expect(got.map((l) => l.id)).toEqual(['l1']);
    expect(JSON.stringify(got)).not.toContain('svcOther');
  });

  it('orders the queue strongest first and names the service', async () => {
    soFindAll.mockResolvedValue([row(SERVICE), row(OTHER_SERVICE)]);
    linkFindAll.mockResolvedValue([
      row({ id: 'lo', case_study_id: 'cs1', service_offering_id: 'svc2', state: 'suggested', match_score: 1 }),
      row({ id: 'hi', case_study_id: 'cs1', service_offering_id: 'svc1', state: 'suggested', match_score: 5 }),
    ]);
    const got = await listLinksForCaseStudy({ caseStudyId: 'cs1', tenantId: 't1' });
    expect(got.map((l) => l.id)).toEqual(['hi', 'lo']);
    expect(got[0].serviceName).toBe('AI Governance Advisory');
  });

  it('passes a state filter through to the query', async () => {
    await listLinksForCaseStudy({ caseStudyId: 'cs1', tenantId: 't1', state: 'suggested' });
    expect(linkFindAll).toHaveBeenCalledWith({ where: { case_study_id: 'cs1', state: 'suggested' } });
  });

  it('still shows a link whose service has since been RETIRED', async () => {
    // A confirmed link against a retired service is a true record of what was decided. Reads must not filter on
    // status, or a reviewer's own confirmed work disappears with no explanation.
    const retired = row({ ...SERVICE, status: 'retired' });
    soFindAll.mockResolvedValue([retired]);
    linkFindAll.mockResolvedValue([
      row({ id: 'l1', case_study_id: 'cs1', service_offering_id: 'svc1', state: 'confirmed', match_score: 5 }),
    ]);
    const got = await listLinksForCaseStudy({ caseStudyId: 'cs1', tenantId: 't1' });
    expect(soFindAll).toHaveBeenCalledWith({ where: { tenant_id: 't1' } }); // no status filter on a read
    expect(got.map((l) => l.id)).toEqual(['l1']);
  });
});

describe('listLinksForService', () => {
  it("returns nothing for a service outside the caller's tenant, without querying links", async () => {
    soFindAll.mockResolvedValue([row(SERVICE)]);
    const got = await listLinksForService({ serviceOfferingId: 'svcOther', tenantId: 't1' });
    expect(got).toEqual([]);
    expect(linkFindAll).not.toHaveBeenCalled();
  });

  it("lists a service's evidence when the tenant owns it, naming the RECORD not its uuid", async () => {
    soFindAll.mockResolvedValue([row(SERVICE)]);
    linkFindAll.mockResolvedValue([
      row({ id: 'l1', case_study_id: 'cs1', service_offering_id: 'svc1', state: 'confirmed', match_score: 5 }),
    ]);
    const got = await listLinksForService({ serviceOfferingId: 'svc1', tenantId: 't1', state: 'confirmed' });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      caseStudyId: 'cs1',
      caseStudyTitle: RECORD.title,
      caseStudySlug: 'a-slug',
      caseStudyStatus: 'approved',
      serviceName: 'AI Governance Advisory',
      state: 'confirmed',
    });
  });

  it('resolves the records in ONE query, not one per link', async () => {
    soFindAll.mockResolvedValue([row(SERVICE)]);
    linkFindAll.mockResolvedValue([
      row({ id: 'l1', case_study_id: 'cs1', service_offering_id: 'svc1', match_score: 5 }),
      row({ id: 'l2', case_study_id: 'cs2', service_offering_id: 'svc1', match_score: 4 }),
      row({ id: 'l3', case_study_id: 'cs1', service_offering_id: 'svc1', match_score: 3 }),
    ]);
    await listLinksForService({ serviceOfferingId: 'svc1', tenantId: 't1' });
    expect(csFindAll).toHaveBeenCalledTimes(1);
    expect(csFindAll).toHaveBeenCalledWith({ where: { id: ['cs1', 'cs2'] } }); // de-duped
    expect(csFindByPk).not.toHaveBeenCalled();
  });

  it('labels a link whose record cannot be resolved, rather than rendering a blank row', async () => {
    soFindAll.mockResolvedValue([row(SERVICE)]);
    csFindAll.mockResolvedValue([]); // the record is gone
    linkFindAll.mockResolvedValue([
      row({ id: 'l1', case_study_id: 'cs-missing', service_offering_id: 'svc1', match_score: 5 }),
    ]);
    const got = await listLinksForService({ serviceOfferingId: 'svc1', tenantId: 't1' });
    expect(got[0].caseStudyTitle).toBe('(case study unavailable)');
    expect(got[0].caseStudySlug).toBeNull();
  });
});

describe('decideLink', () => {
  it('stamps the state, who decided and when, together', async () => {
    const link = row({ id: 'l1', case_study_id: 'cs1', service_offering_id: 'svc1', state: 'suggested' });
    linkFindByPk.mockResolvedValue(link);
    soFindAll.mockResolvedValue([row(SERVICE)]);
    await decideLink({ id: 'l1', tenantId: 't1', state: 'confirmed', decidedBy: 'ali@colaberry.com' });
    const patch = link.update.mock.calls[0][0];
    expect(patch.state).toBe('confirmed');
    expect(patch.decided_by).toBe('ali@colaberry.com');
    expect(patch.decided_at).toBeInstanceOf(Date);
  });

  it('records a rejection as a decision, not as a deletion', async () => {
    const link = row({ id: 'l1', case_study_id: 'cs1', service_offering_id: 'svc1', state: 'suggested' });
    linkFindByPk.mockResolvedValue(link);
    soFindAll.mockResolvedValue([row(SERVICE)]);
    const dto = await decideLink({ id: 'l1', tenantId: 't1', state: 'rejected', decidedBy: 'ali@colaberry.com' });
    expect(link.update.mock.calls[0][0].state).toBe('rejected');
    expect(dto.id).toBe('l1');
  });

  it("refuses to write a link back to 'suggested'", async () => {
    const link = row({ id: 'l1', case_study_id: 'cs1', service_offering_id: 'svc1', state: 'confirmed' });
    linkFindByPk.mockResolvedValue(link);
    soFindAll.mockResolvedValue([row(SERVICE)]);
    await expect(decideLink({ id: 'l1', tenantId: 't1', state: 'suggested' as any, decidedBy: 'a' }))
      .rejects.toThrow(/can only be decided/);
    expect(link.update).not.toHaveBeenCalled();
  });

  it("reports a cross-tenant link as not found and never updates it", async () => {
    const link = row({ id: 'l1', case_study_id: 'cs1', service_offering_id: 'svcOther', state: 'suggested' });
    linkFindByPk.mockResolvedValue(link);
    soFindAll.mockResolvedValue([row(SERVICE)]);
    await expect(decideLink({ id: 'l1', tenantId: 't1', state: 'confirmed', decidedBy: 'a' }))
      .rejects.toBeInstanceOf(CaseStudyServiceLinkNotFoundError);
    expect(link.update).not.toHaveBeenCalled();
  });

  it('404s an unknown id', async () => {
    linkFindByPk.mockResolvedValue(null);
    soFindAll.mockResolvedValue([row(SERVICE)]);
    await expect(decideLink({ id: 'nope', tenantId: 't1', state: 'confirmed', decidedBy: 'a' }))
      .rejects.toBeInstanceOf(CaseStudyServiceLinkNotFoundError);
  });
});
