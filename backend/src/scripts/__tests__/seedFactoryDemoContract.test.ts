/**
 * The prod demo seed must be PROD-SAFE + idempotent: resolve (never invent) the tenant, findOrCreate
 * the org/engagement/project on stable keys so a re-run creates nothing new, and (re)persist the
 * sample contract. Everything is mocked (no DB).
 */
const query = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: any[]) => query(...a) } }));

const orgFindOne = jest.fn(); const orgCreate = jest.fn();
const engFindOne = jest.fn(); const engCreate = jest.fn();
const projFindOne = jest.fn(); const projCreate = jest.fn();
jest.mock('../../models/Organization', () => ({ __esModule: true, default: { findOne: (...a: any[]) => orgFindOne(...a), create: (...a: any[]) => orgCreate(...a) } }));
jest.mock('../../models/DeliveryEngagement', () => ({ __esModule: true, default: { findOne: (...a: any[]) => engFindOne(...a), create: (...a: any[]) => engCreate(...a) } }));
jest.mock('../../models/DeliveryProject', () => ({ __esModule: true, default: { findOne: (...a: any[]) => projFindOne(...a), create: (...a: any[]) => projCreate(...a) } }));

const persistSampleContract = jest.fn();
jest.mock('../seedSampleContractProject', () => ({ persistSampleContract: (...a: any[]) => persistSampleContract(...a) }));

import { seedFactoryDemoContract } from '../seedFactoryDemoContract';

beforeEach(() => jest.clearAllMocks());

describe('seedFactoryDemoContract', () => {
  it('stands up the demo chain on a fresh DB and persists the sample contract', async () => {
    query.mockResolvedValueOnce([{ id: 'ten-1', name: 'Refactored' }]); // tenant
    query.mockResolvedValueOnce([{ id: 'brand-1' }]);                   // brand
    orgFindOne.mockResolvedValue(null); orgCreate.mockResolvedValue({ id: 'org-1' });
    engFindOne.mockResolvedValue(null); engCreate.mockResolvedValue({ id: 'eng-1', tenant_id: 'ten-1' });
    projFindOne.mockResolvedValue(null); projCreate.mockResolvedValue({ id: 'proj-1' });

    const res = await seedFactoryDemoContract();
    expect(res).toEqual({ deliveryProjectId: 'proj-1', created: true });
    expect(orgCreate).toHaveBeenCalledTimes(1);
    expect(engCreate).toHaveBeenCalledTimes(1);
    expect(projCreate).toHaveBeenCalledTimes(1);
    // Nulls the solution_build student-project link: the demo has no SBP project on prod (FK).
    expect(persistSampleContract).toHaveBeenCalledWith('proj-1', { solutionStudentProjectId: null });
  });

  it('is idempotent: a re-run reuses existing rows and creates nothing new', async () => {
    query.mockResolvedValueOnce([{ id: 'ten-1', name: 'Refactored' }]);
    query.mockResolvedValueOnce([{ id: 'brand-1' }]);
    orgFindOne.mockResolvedValue({ id: 'org-1' });
    engFindOne.mockResolvedValue({ id: 'eng-1', tenant_id: 'ten-1' });
    projFindOne.mockResolvedValue({ id: 'proj-1' });

    const res = await seedFactoryDemoContract();
    expect(res).toEqual({ deliveryProjectId: 'proj-1', created: false });
    expect(orgCreate).not.toHaveBeenCalled();
    expect(engCreate).not.toHaveBeenCalled();
    expect(projCreate).not.toHaveBeenCalled();
    expect(persistSampleContract).toHaveBeenCalledWith('proj-1', { solutionStudentProjectId: null }); // still (re)persists idempotently
  });

  it('refuses to invent a tenant (throws) when the refactored tenant is missing', async () => {
    query.mockResolvedValueOnce([]); // no tenant
    await expect(seedFactoryDemoContract()).rejects.toThrow(/tenant.*refactored/i);
    expect(orgFindOne).not.toHaveBeenCalled();
    expect(persistSampleContract).not.toHaveBeenCalled();
  });
});
