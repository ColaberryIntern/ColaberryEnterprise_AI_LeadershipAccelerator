/**
 * propose-service and promote, with the models mocked (the real SQL - advisory lock, lower(name) match, the pair
 * index - runs in serviceProposal.integration.test.ts).
 */
const TX = { id: 'tx' };
const query = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { transaction: (fn: (t: unknown) => Promise<unknown>) => fn(TX), query: (...a: unknown[]) => query(...a) },
}));
const csFindByPk = jest.fn(); const csCount = jest.fn();
jest.mock('../../../models/CaseStudy', () => ({ __esModule: true, default: { findByPk: (...a: unknown[]) => csFindByPk(...a), count: (...a: unknown[]) => csCount(...a) } }));
const soFindOne = jest.fn(); const soCreate = jest.fn(); const soUpdate = jest.fn();
jest.mock('../../../models/ServiceOffering', () => ({ __esModule: true, default: {
  findOne: (...a: unknown[]) => soFindOne(...a), create: (...a: unknown[]) => soCreate(...a), update: (...a: unknown[]) => soUpdate(...a),
} }));
const linkFindOne = jest.fn(); const linkCreate = jest.fn(); const linkFindAll = jest.fn();
jest.mock('../../../models/CaseStudyServiceLink', () => ({ __esModule: true, default: {
  findOne: (...a: unknown[]) => linkFindOne(...a), create: (...a: unknown[]) => linkCreate(...a), findAll: (...a: unknown[]) => linkFindAll(...a),
} }));
const impFindOne = jest.fn();
jest.mock('../../../models/CaseStudyExternalImport', () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => impFindOne(...a) } }));

import { proposeServiceFromCaseStudy, promoteServiceOffering, ServiceProposalError, PROMOTION_REFUSED_MESSAGE } from '../serviceProposal';

const svc = (o: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = { id: 'svc-1', tenant_id: 't1', name: 'Pricing Analytics', status: 'growth', keywords_json: null, naics_codes_json: null, ...o };
  row.reload = jest.fn(async () => { row.status = 'active'; });
  return row;
};
const base = { tenantId: 't1', caseStudyId: 'cs-1', name: '  Pricing   Analytics ', actor: 'ali@colaberry.com' };
let log: jest.SpyInstance; let warn: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  csFindByPk.mockResolvedValue({ id: 'cs-1', status: 'draft', archived_at: null });
  soFindOne.mockResolvedValue(null);
  soUpdate.mockResolvedValue([1]);
  soCreate.mockImplementation(async (row: Record<string, unknown>) => svc(row));
  linkFindOne.mockResolvedValue(null);
  linkCreate.mockResolvedValue({ id: 'link-1' });
  impFindOne.mockResolvedValue({ analysis: { keywords: ['pricing', 'xgboost'], suggestedNaics: ['541511'] } });
  log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { log.mockRestore(); warn.mockRestore(); });

describe('proposeServiceFromCaseStudy', () => {
  it('creates a GROWTH service stamped with the actor and a CONFIRMED link decided by the actor, in one transaction', async () => {
    const out = await proposeServiceFromCaseStudy(base);
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', { bind: ['service-propose:t1:pricing analytics'], transaction: TX });
    expect(soCreate.mock.calls[0][0]).toMatchObject({ tenant_id: 't1', name: 'Pricing Analytics', status: 'growth', created_by: 'ali@colaberry.com' });
    expect(soCreate.mock.calls[0][1]).toEqual({ transaction: TX });
    expect(linkCreate.mock.calls[0][0]).toMatchObject({ case_study_id: 'cs-1', service_offering_id: 'svc-1', state: 'confirmed', decided_by: 'ali@colaberry.com' });
    expect(linkCreate.mock.calls[0][0].decided_at).toBeInstanceOf(Date);
    expect(out).toMatchObject({ existing: false, link: { id: 'link-1', state: 'confirmed', changed: true } });
  });

  it('pre-fills keywords and NAICS from the AI analysis when the body omits them', async () => {
    const out = await proposeServiceFromCaseStudy(base);
    expect(soCreate.mock.calls[0][0]).toMatchObject({ keywords_json: ['pricing', 'xgboost'], naics_codes_json: ['541511'] });
    expect(out.prefilledFromAnalysis).toEqual({ keywords: true, naicsCodes: true });
  });

  it('uses the body keywords/NAICS when given, and does not read the analysis', async () => {
    const out = await proposeServiceFromCaseStudy({ ...base, keywords: ['custom'], naicsCodes: ['541512'] });
    expect(impFindOne).not.toHaveBeenCalled();
    expect(soCreate.mock.calls[0][0]).toMatchObject({ keywords_json: ['custom'], naics_codes_json: ['541512'] });
    expect(out.prefilledFromAnalysis).toEqual({ keywords: false, naicsCodes: false });
  });

  it('is idempotent by name: an existing (differently cased) service is linked, not duplicated - existing:true', async () => {
    soFindOne.mockResolvedValue(svc({ name: 'pricing analytics', status: 'active' }));
    const out = await proposeServiceFromCaseStudy(base);
    expect(soCreate).not.toHaveBeenCalled();
    expect(out.existing).toBe(true);
  });

  it('a repeat call with the link already confirmed writes nothing', async () => {
    soFindOne.mockResolvedValue(svc());
    const update = jest.fn();
    linkFindOne.mockResolvedValue({ id: 'link-9', state: 'confirmed', update });
    const out = await proposeServiceFromCaseStudy(base);
    expect(linkCreate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(out.link).toEqual({ id: 'link-9', state: 'confirmed', changed: false });
  });

  it('moves an existing suggested (or rejected) row for the pair to confirmed instead of inserting a duplicate', async () => {
    soFindOne.mockResolvedValue(svc());
    const update = jest.fn();
    linkFindOne.mockResolvedValue({ id: 'link-7', state: 'suggested', update });
    await proposeServiceFromCaseStudy(base);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ state: 'confirmed', decided_by: 'ali@colaberry.com' }), { transaction: TX });
    expect(linkCreate).not.toHaveBeenCalled();
  });

  it('refuses an unknown or archived case study (404) before opening a transaction', async () => {
    csFindByPk.mockResolvedValueOnce(null);
    await expect(proposeServiceFromCaseStudy(base)).rejects.toMatchObject({ errorClass: 'CaseStudyNotFound', httpStatus: 404 });
    csFindByPk.mockResolvedValueOnce({ id: 'cs-1', status: 'archived', archived_at: null });
    await expect(proposeServiceFromCaseStudy(base)).rejects.toBeInstanceOf(ServiceProposalError);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a name already used by a RETIRED service (409), creating and linking nothing', async () => {
    soFindOne.mockResolvedValue(svc({ status: 'retired' }));
    await expect(proposeServiceFromCaseStudy(base)).rejects.toMatchObject({ errorClass: 'ServiceRetired', httpStatus: 409 });
    expect(soCreate).not.toHaveBeenCalled();
    expect(linkCreate).not.toHaveBeenCalled();
  });
});

describe('promoteServiceOffering', () => {
  const promote = () => promoteServiceOffering({ tenantId: 't1', serviceId: 'svc-1', actor: 'ali@colaberry.com' });

  it('refuses growth -> active with a plain sentence when there is no confirmed case study (409)', async () => {
    soFindOne.mockResolvedValue(svc());
    linkFindAll.mockResolvedValue([]);
    await expect(promote()).rejects.toMatchObject({ errorClass: 'PromotionRefused', httpStatus: 409, message: PROMOTION_REFUSED_MESSAGE });
    expect(soUpdate).not.toHaveBeenCalled();
  });

  it('does not count a confirmed link whose case study is archived', async () => {
    soFindOne.mockResolvedValue(svc());
    linkFindAll.mockResolvedValue([{ case_study_id: 'cs-old' }]);
    csCount.mockResolvedValue(0);
    await expect(promote()).rejects.toMatchObject({ errorClass: 'PromotionRefused' });
  });

  it('promotes with one confirmed, live case study, using a conditional update', async () => {
    soFindOne.mockResolvedValue(svc());
    linkFindAll.mockResolvedValue([{ case_study_id: 'cs-1' }]);
    csCount.mockResolvedValue(1);
    const out = await promote();
    expect(soUpdate).toHaveBeenCalledWith({ status: 'active' }, { where: { id: 'svc-1', tenant_id: 't1', status: 'growth' } });
    expect(out).toMatchObject({ promoted: true, confirmedCaseStudies: 1, service: { status: 'active' } });
  });

  it('reports promoted:false when a concurrent click already moved the row (0 rows updated)', async () => {
    soFindOne.mockResolvedValue(svc());
    linkFindAll.mockResolvedValue([{ case_study_id: 'cs-1' }]);
    csCount.mockResolvedValue(1);
    soUpdate.mockResolvedValueOnce([0]);
    expect((await promote()).promoted).toBe(false);
  });

  it('is idempotent when already active', async () => {
    soFindOne.mockResolvedValue(svc({ status: 'active' }));
    linkFindAll.mockResolvedValue([]);
    const out = await promote();
    expect(out.promoted).toBe(false);
    expect(soUpdate).not.toHaveBeenCalled();
  });

  it("404s a service outside the caller's tenant, and 409s a retired one", async () => {
    soFindOne.mockResolvedValueOnce(null);
    await expect(promote()).rejects.toMatchObject({ errorClass: 'ServiceNotFound', httpStatus: 404 });
    expect(soFindOne.mock.calls[0][0]).toEqual({ where: { id: 'svc-1', tenant_id: 't1' } });
    soFindOne.mockResolvedValueOnce(svc({ status: 'retired' }));
    await expect(promote()).rejects.toMatchObject({ errorClass: 'ServiceRetired', httpStatus: 409 });
  });
});
