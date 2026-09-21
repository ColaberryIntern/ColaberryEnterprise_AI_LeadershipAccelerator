/**
 * The ordinary-project demo seed must be PROD-SAFE + idempotent + reversible: resolve (never invent)
 * the demo container, findOrCreate the labeled project on a stable slug so a re-run creates nothing,
 * and always backfill the honest `unassessed` shell. Tenant-refusal propagates. Everything mocked.
 */
const resolveFactoryDemoContainer = jest.fn();
jest.mock('../lib/factoryDemoContainer', () => ({ resolveFactoryDemoContainer: (...a: any[]) => resolveFactoryDemoContainer(...a) }));

const backfillUnassessedContract = jest.fn();
jest.mock('../../services/factory/factoryBackfill', () => ({ backfillUnassessedContract: (...a: any[]) => backfillUnassessedContract(...a) }));

const projFindOne = jest.fn(); const projCreate = jest.fn();
jest.mock('../../models/DeliveryProject', () => ({ __esModule: true, default: { findOne: (...a: any[]) => projFindOne(...a), create: (...a: any[]) => projCreate(...a) } }));

import { seedOrdinaryProjectDemo } from '../seedOrdinaryProjectDemo';

const container = { tenant: { id: 'ten-1', name: 'Refactored' }, brandId: 'brand-1', org: { id: 'org-1' }, engagement: { id: 'eng-1', tenant_id: 'ten-1' } };

beforeEach(() => jest.clearAllMocks());

describe('seedOrdinaryProjectDemo', () => {
  it('creates the labeled ordinary project on a fresh DB and backfills an unassessed shell', async () => {
    resolveFactoryDemoContainer.mockResolvedValue(container);
    projFindOne.mockResolvedValue(null);
    projCreate.mockResolvedValue({ id: 'op-1' });

    const res = await seedOrdinaryProjectDemo();
    expect(res).toEqual({ deliveryProjectId: 'op-1', created: true });
    expect(projCreate).toHaveBeenCalledTimes(1);
    expect(projCreate.mock.calls[0][0]).toMatchObject({ slug: 'ai-project-factory-demo-ordinary' });
    expect(backfillUnassessedContract).toHaveBeenCalledWith('op-1');
  });

  it('is idempotent: a re-run reuses the existing project and still backfills (no new project)', async () => {
    resolveFactoryDemoContainer.mockResolvedValue(container);
    projFindOne.mockResolvedValue({ id: 'op-1' });

    const res = await seedOrdinaryProjectDemo();
    expect(res).toEqual({ deliveryProjectId: 'op-1', created: false });
    expect(projCreate).not.toHaveBeenCalled();
    expect(backfillUnassessedContract).toHaveBeenCalledWith('op-1');
  });

  it('propagates the tenant-refusal (creates/backfills nothing) when the container refuses', async () => {
    resolveFactoryDemoContainer.mockRejectedValue(new Error("No tenant with slug 'refactored' exists in this database; refusing to invent one."));

    await expect(seedOrdinaryProjectDemo()).rejects.toThrow(/tenant.*refactored/i);
    expect(projFindOne).not.toHaveBeenCalled();
    expect(projCreate).not.toHaveBeenCalled();
    expect(backfillUnassessedContract).not.toHaveBeenCalled();
  });
});
