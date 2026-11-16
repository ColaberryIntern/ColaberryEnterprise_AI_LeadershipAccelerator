import { siblingIdsFromRows, siblingDeliveryProjectIds } from '../tenantProjects';

describe('siblingIdsFromRows (pure)', () => {
  it('returns every delivery project on the tenant except the current one, deduped', () => {
    const rows = [
      { delivery_project_id: 'dp-current' },
      { delivery_project_id: 'dp-a' },
      { delivery_project_id: 'dp-a' }, // a second qualification version of the same bid
      { delivery_project_id: 'dp-b' },
    ];
    expect(siblingIdsFromRows(rows, 'dp-current')).toEqual(['dp-a', 'dp-b']);
  });

  it('drops null / empty ids and returns [] when the only row is the current project', () => {
    expect(siblingIdsFromRows([{ delivery_project_id: null }, { delivery_project_id: '' }, {}], 'dp-current')).toEqual([]);
    expect(siblingIdsFromRows([{ delivery_project_id: 'dp-current' }], 'dp-current')).toEqual([]);
  });
});

describe('siblingDeliveryProjectIds', () => {
  const model = (findOne: jest.Mock, findAll: jest.Mock) => ({ findOne, findAll }) as never;

  it('resolves the tenant from the project then lists the other delivery projects on it', async () => {
    const findOne = jest.fn().mockResolvedValue({ tenant_id: 't1' });
    const findAll = jest.fn().mockResolvedValue([
      { delivery_project_id: 'dp-current' },
      { delivery_project_id: 'dp-a' },
      { delivery_project_id: 'dp-b' },
    ]);
    const out = await siblingDeliveryProjectIds('dp-current', model(findOne, findAll));
    expect(out).toEqual(['dp-a', 'dp-b']);
    expect(findOne).toHaveBeenCalledWith({ where: { delivery_project_id: 'dp-current' }, order: [['version', 'DESC']] });
    expect(findAll).toHaveBeenCalledWith({ where: { tenant_id: 't1' }, attributes: ['delivery_project_id'] });
  });

  it('returns [] when the project has no qualification or no tenant', async () => {
    expect(await siblingDeliveryProjectIds('dp-x', model(jest.fn().mockResolvedValue(null), jest.fn()))).toEqual([]);
    expect(await siblingDeliveryProjectIds('dp-x', model(jest.fn().mockResolvedValue({ tenant_id: null }), jest.fn()))).toEqual([]);
  });

  it('returns [] (never throws) when a read fails — propagation is best-effort', async () => {
    const findOne = jest.fn().mockRejectedValue(new Error('db down'));
    expect(await siblingDeliveryProjectIds('dp-x', model(findOne, jest.fn()))).toEqual([]);
  });

  it('returns [] for an empty project id without touching the model', async () => {
    const findOne = jest.fn();
    expect(await siblingDeliveryProjectIds('', model(findOne, jest.fn()))).toEqual([]);
    expect(findOne).not.toHaveBeenCalled();
  });
});
