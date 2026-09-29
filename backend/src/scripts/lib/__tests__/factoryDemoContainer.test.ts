/**
 * lookupGovContractsContainer is the READ-ONLY, tenant-scoped, fail-closed resolver used by the navigation-only
 * gov start route. This tests the REAL lookup logic (only the DB models are mocked, never the lookup itself):
 * it must scope the organization to the resolved `refactored` tenant (a same-name org in another tenant can
 * never be selected), validate the engagement's tenant/org relationship, return null on any missing/mismatched
 * piece, and NEVER create a record.
 */
const query = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => query(...a) } }));

const orgFindOne = jest.fn();
const orgCreate = jest.fn();
const engFindOne = jest.fn();
const engCreate = jest.fn();
jest.mock('../../../models/Organization', () => ({ __esModule: true, default: { findOne: (...a: any[]) => orgFindOne(...a), create: (...a: any[]) => orgCreate(...a) } }));
jest.mock('../../../models/DeliveryEngagement', () => ({ __esModule: true, default: { findOne: (...a: any[]) => engFindOne(...a), create: (...a: any[]) => engCreate(...a) } }));

import { lookupGovContractsContainer, GOV_ORG_NAME } from '../factoryDemoContainer';

const TENANT = { id: 'ten-ref', name: 'refactored' };
beforeEach(() => {
  jest.clearAllMocks();
  query.mockResolvedValue([TENANT]);                                            // tenant slug='refactored' exists
  orgFindOne.mockResolvedValue({ id: 'org-gov', tenant_id: 'ten-ref' });         // gov org in that tenant
  engFindOne.mockResolvedValue({ id: 'eng-gov', tenant_id: 'ten-ref', organization_id: 'org-gov' });
});
afterEach(() => { expect(orgCreate).not.toHaveBeenCalled(); expect(engCreate).not.toHaveBeenCalled(); }); // NEVER provisions

describe('lookupGovContractsContainer', () => {
  it('resolves the container read-only and scopes the org lookup to the resolved tenant', async () => {
    const c = await lookupGovContractsContainer();
    expect(c).toEqual({ tenant: TENANT, org: { id: 'org-gov', tenant_id: 'ten-ref' }, engagement: { id: 'eng-gov', tenant_id: 'ten-ref', organization_id: 'org-gov' } });
    // the org query MUST carry tenant_id (a same-name org in another tenant can never be selected)
    expect(orgFindOne).toHaveBeenCalledWith({ where: { tenant_id: 'ten-ref', name: GOV_ORG_NAME } });
    expect(engFindOne).toHaveBeenCalledWith({ where: { tenant_id: 'ten-ref', organization_id: 'org-gov' } });
  });

  it('SAME-NAME ORG IN ANOTHER TENANT: the scoped org query misses -> null (no foreign org, no create)', async () => {
    orgFindOne.mockResolvedValue(null); // the only 'Colaberry Government Contracts' org belongs to a different tenant
    expect(await lookupGovContractsContainer()).toBeNull();
  });

  it('defends against a returned org whose tenant_id does not match -> null', async () => {
    orgFindOne.mockResolvedValue({ id: 'org-gov', tenant_id: 'ten-OTHER' });
    expect(await lookupGovContractsContainer()).toBeNull();
  });

  it('MISMATCHED ENGAGEMENT TENANT: engagement not under the resolved tenant -> null', async () => {
    engFindOne.mockResolvedValue({ id: 'eng-gov', tenant_id: 'ten-OTHER', organization_id: 'org-gov' });
    expect(await lookupGovContractsContainer()).toBeNull();
  });

  it('MISMATCHED ENGAGEMENT ORG: engagement points at a different org -> null', async () => {
    engFindOne.mockResolvedValue({ id: 'eng-gov', tenant_id: 'ten-ref', organization_id: 'org-OTHER' });
    expect(await lookupGovContractsContainer()).toBeNull();
  });

  it('MISSING tenant -> null (and never queries org/engagement)', async () => {
    query.mockResolvedValue([]); // no 'refactored' tenant
    expect(await lookupGovContractsContainer()).toBeNull();
    expect(orgFindOne).not.toHaveBeenCalled();
  });

  it('MISSING org -> null; MISSING engagement -> null', async () => {
    orgFindOne.mockResolvedValueOnce(null);
    expect(await lookupGovContractsContainer()).toBeNull();
    orgFindOne.mockResolvedValue({ id: 'org-gov', tenant_id: 'ten-ref' });
    engFindOne.mockResolvedValueOnce(null);
    expect(await lookupGovContractsContainer()).toBeNull();
  });
});
