/**
 * The service catalog CRUD: every read/write is tenant-scoped, arrays are cleaned to bounded string[], retire is an
 * idempotent soft status-flip (never a hard delete), and an unknown/cross-tenant id is a 404. The model is mocked so
 * these tests assert BEHAVIOR (what is written, under which where-clause), not a database round-trip.
 */
const findOne = jest.fn();
const create = jest.fn();
const findAll = jest.fn();
jest.mock('../../../models/ServiceOffering', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => findOne(...a),
    create: (...a: any[]) => create(...a),
    findAll: (...a: any[]) => findAll(...a),
  },
}));

import {
  createServiceOffering, updateServiceOffering, retireServiceOffering, listServiceOfferings, getServiceOffering,
  ServiceOfferingNotFoundError,
} from '../serviceCatalog';

function makeRow(fields: Record<string, any>) {
  const row: any = { ...fields, save: jest.fn().mockResolvedValue(undefined) };
  row.get = () => ({ ...fields, ...row, save: undefined, get: undefined });
  return row;
}

beforeEach(() => jest.clearAllMocks());

describe('createServiceOffering', () => {
  it('writes tenant/org/createdBy + cleaned arrays, defaults status active, returns a camelCased DTO', async () => {
    create.mockImplementation(async (attrs: any) => makeRow({ id: 's1', ...attrs }));
    const dto = await createServiceOffering({
      tenantId: 't1', organizationId: 'o1', name: '  Data Platform  ', category: 'Data',
      keywords: ['dashboards', 'etl', 'dashboards', 42, '  ', 'etl'], naicsCodes: ['541512'], pscCodes: [],
      pastPerformance: 'Built X for Y', owner: 'ali@colaberry.com', createdBy: 'dhee@colaberry.com',
    });
    const arg = create.mock.calls[0][0];
    expect(arg).toMatchObject({ tenant_id: 't1', organization_id: 'o1', name: 'Data Platform', status: 'active', created_by: 'dhee@colaberry.com' });
    expect(arg.keywords_json).toEqual(['dashboards', 'etl']);   // trimmed, de-duped, non-strings dropped
    expect(arg.naics_codes_json).toEqual(['541512']);
    expect(arg.psc_codes_json).toBeNull();                      // empty array -> null
    expect(dto).toMatchObject({ id: 's1', name: 'Data Platform', keywords: ['dashboards', 'etl'], status: 'active' });
  });
});

describe('updateServiceOffering', () => {
  it('updates only the patched fields on a row the tenant owns (scoped findOne)', async () => {
    const row = makeRow({ id: 's1', name: 'Old', category: 'IT', keywords_json: ['a'], status: 'active' });
    findOne.mockResolvedValueOnce(row);
    const dto = await updateServiceOffering({ tenantId: 't1', id: 's1', patch: { name: 'New', keywords: ['x', 'y'] } });
    expect(findOne.mock.calls[0][0]).toMatchObject({ where: { id: 's1', tenant_id: 't1' } });
    expect(row.name).toBe('New');
    expect(row.keywords_json).toEqual(['x', 'y']);
    expect(row.category).toBe('IT');            // untouched (not in patch)
    expect(row.save).toHaveBeenCalledTimes(1);
    expect(dto.name).toBe('New');
  });
  it('throws ServiceOfferingNotFoundError (→404) when the id is not the tenant\'s', async () => {
    findOne.mockResolvedValueOnce(null);
    await expect(updateServiceOffering({ tenantId: 't1', id: 'nope', patch: { name: 'x' } })).rejects.toBeInstanceOf(ServiceOfferingNotFoundError);
  });
});

describe('retireServiceOffering — soft, idempotent', () => {
  it('flips status to retired and saves', async () => {
    const row = makeRow({ id: 's1', status: 'active' });
    findOne.mockResolvedValueOnce(row);
    const dto = await retireServiceOffering({ tenantId: 't1', id: 's1' });
    expect(row.status).toBe('retired');
    expect(row.save).toHaveBeenCalledTimes(1);
    expect(dto.status).toBe('retired');
  });
  it('is a no-op when already retired (no second save)', async () => {
    const row = makeRow({ id: 's1', status: 'retired' });
    findOne.mockResolvedValueOnce(row);
    await retireServiceOffering({ tenantId: 't1', id: 's1' });
    expect(row.save).not.toHaveBeenCalled();
  });
  it('404s an unknown id', async () => {
    findOne.mockResolvedValueOnce(null);
    await expect(retireServiceOffering({ tenantId: 't1', id: 'nope' })).rejects.toBeInstanceOf(ServiceOfferingNotFoundError);
  });
});

describe('listServiceOfferings — tenant-scoped, status-filtered', () => {
  it('active (default) filters status=active for the tenant, newest first', async () => {
    findAll.mockResolvedValueOnce([makeRow({ id: 's1', name: 'A', status: 'active' })]);
    const out = await listServiceOfferings({ tenantId: 't1' });
    expect(findAll.mock.calls[0][0]).toMatchObject({ where: { tenant_id: 't1', status: 'active' }, order: [['created_at', 'DESC']] });
    expect(out[0]).toMatchObject({ id: 's1', name: 'A' });
  });
  it('all returns every status (no status in the where)', async () => {
    findAll.mockResolvedValueOnce([]);
    await listServiceOfferings({ tenantId: 't1', status: 'all' });
    const where = findAll.mock.calls[0][0].where;
    expect(where).toEqual({ tenant_id: 't1' });
    expect(where.status).toBeUndefined();
  });
});

describe('getServiceOffering', () => {
  it('returns null cross-tenant (scoped findOne)', async () => {
    findOne.mockResolvedValueOnce(null);
    expect(await getServiceOffering({ tenantId: 't1', id: 's9' })).toBeNull();
    expect(findOne.mock.calls[0][0]).toMatchObject({ where: { id: 's9', tenant_id: 't1' } });
  });
});
