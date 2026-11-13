/**
 * The must-link fact: confirmed links counted INSIDE the gov tenant, and fail-closed on any lookup failure.
 */
const soFindAll = jest.fn();
const linkCount = jest.fn();
jest.mock('../../../models/ServiceOffering', () => ({ __esModule: true, default: { findAll: (...a: unknown[]) => soFindAll(...a) } }));
jest.mock('../../../models/CaseStudyServiceLink', () => ({ __esModule: true, default: { count: (...a: unknown[]) => linkCount(...a) } }));
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: jest.fn() }));

import { Op } from 'sequelize';
import { serviceLinkGateFacts, countConfirmedLinksInTenant } from '../caseStudyServiceLinkGateFacts';
import { lookupGovContractsContainer } from '../../../scripts/lib/factoryDemoContainer';

let warn: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => warn.mockRestore());

describe('countConfirmedLinksInTenant', () => {
  it("counts only CONFIRMED links into the tenant's own services", async () => {
    soFindAll.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    linkCount.mockResolvedValue(2);
    expect(await countConfirmedLinksInTenant('cs1', 't1')).toBe(2);
    expect(soFindAll).toHaveBeenCalledWith({ where: { tenant_id: 't1' }, attributes: ['id'] });
    expect(linkCount).toHaveBeenCalledWith({ where: { case_study_id: 'cs1', state: 'confirmed', service_offering_id: { [Op.in]: ['s1', 's2'] } } });
  });

  it("is 0 without querying links when the tenant has no services - another tenant's confirmed link cannot count", async () => {
    soFindAll.mockResolvedValue([]);
    expect(await countConfirmedLinksInTenant('cs1', 't-empty')).toBe(0);
    expect(linkCount).not.toHaveBeenCalled();
  });
});

describe('serviceLinkGateFacts', () => {
  it('resolves the gov tenant by default and returns the count', async () => {
    (lookupGovContractsContainer as jest.Mock).mockResolvedValue({ tenant: { id: 'gov' } });
    soFindAll.mockResolvedValue([{ id: 's1' }]);
    linkCount.mockResolvedValue(1);
    expect(await serviceLinkGateFacts('cs1')).toEqual({ confirmedCount: 1 });
    expect(soFindAll.mock.calls[0][0].where).toEqual({ tenant_id: 'gov' });
  });

  it('fails CLOSED (0) and logs when the workspace cannot be resolved', async () => {
    expect(await serviceLinkGateFacts('cs1', async () => null)).toEqual({ confirmedCount: 0 });
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'case_study_service_link_facts_failed', error_class: 'TenantUnresolved' });
  });

  it('fails CLOSED (0) and logs when a query throws', async () => {
    soFindAll.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    expect(await serviceLinkGateFacts('cs1', async () => 'gov')).toEqual({ confirmedCount: 0 });
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ error_class: 'SequelizeConnectionError', context: { fail_closed: true } });
  });
});
