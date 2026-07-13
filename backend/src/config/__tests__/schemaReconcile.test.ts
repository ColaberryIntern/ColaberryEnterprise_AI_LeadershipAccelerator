// Unit test for the additive schema self-heal. config/database is mocked so the
// reconciler runs against a fake QueryInterface — no real DB. Covers: adds only
// missing columns, honors snake_case `field`, skips VIRTUAL attrs, tolerates a
// missing table, records (not throws) an addColumn failure, and is idempotent.
const describeTable = jest.fn();
const addColumn = jest.fn();

jest.mock('../database', () => ({
  sequelize: { getQueryInterface: () => ({ describeTable, addColumn }) },
}));

import { DataTypes } from 'sequelize';
import { reconcileMissingColumns } from '../schemaReconcile';

// Minimal fake standing in for a Sequelize ModelStatic.
function fakeModel(tableName: string, rawAttributes: Record<string, any>): any {
  return { getTableName: () => tableName, rawAttributes };
}

beforeEach(() => {
  describeTable.mockReset();
  addColumn.mockReset();
  addColumn.mockResolvedValue(undefined);
});

describe('reconcileMissingColumns', () => {
  it('adds only the columns missing from the live table', async () => {
    describeTable.mockResolvedValue({ id: {}, name: {} }); // live has id + name
    const model = fakeModel('widgets', {
      id: { type: DataTypes.INTEGER },
      name: { type: DataTypes.STRING },
      color: { type: DataTypes.STRING }, // missing → should be added
    });

    const r = await reconcileMissingColumns([model]);

    expect(addColumn).toHaveBeenCalledTimes(1);
    expect(addColumn).toHaveBeenCalledWith(
      'widgets',
      'color',
      expect.objectContaining({ allowNull: true }),
    );
    expect(r.added).toEqual([{ table: 'widgets', column: 'color' }]);
    expect(r.checked).toBe(1);
  });

  it('honors the attribute `field` (snake_case column) when diffing', async () => {
    describeTable.mockResolvedValue({ id: {} });
    const model = fakeModel('enrollments', {
      id: { type: DataTypes.INTEGER },
      paysimplePaymentId: { type: DataTypes.STRING, field: 'paysimple_payment_id' },
    });

    await reconcileMissingColumns([model]);

    expect(addColumn).toHaveBeenCalledWith(
      'enrollments',
      'paysimple_payment_id',
      expect.objectContaining({ allowNull: true }),
    );
  });

  it('never adds VIRTUAL attributes (they have no physical column)', async () => {
    describeTable.mockResolvedValue({ id: {} });
    const model = fakeModel('things', {
      id: { type: DataTypes.INTEGER },
      fullName: { type: new DataTypes.VIRTUAL() },
    });

    const r = await reconcileMissingColumns([model]);

    expect(addColumn).not.toHaveBeenCalled();
    expect(r.added).toHaveLength(0);
  });

  it('skips a model whose table does not exist without aborting the rest', async () => {
    describeTable
      .mockRejectedValueOnce(new Error('relation "ghost" does not exist'))
      .mockResolvedValueOnce({ id: {} });
    const ghost = fakeModel('ghost', { id: { type: DataTypes.INTEGER } });
    const real = fakeModel('real', {
      id: { type: DataTypes.INTEGER },
      extra: { type: DataTypes.STRING },
    });

    const r = await reconcileMissingColumns([ghost, real]);

    expect(r.checked).toBe(1); // only `real` was describeable
    expect(r.added).toEqual([{ table: 'real', column: 'extra' }]);
    expect(r.skipped.some((s) => s.table === 'ghost')).toBe(true);
  });

  it('records an addColumn failure as skipped instead of throwing', async () => {
    describeTable.mockResolvedValue({ id: {} });
    addColumn.mockRejectedValue(new Error('type not mappable'));
    const model = fakeModel('t', {
      id: { type: DataTypes.INTEGER },
      weird: { type: DataTypes.STRING },
    });

    const r = await reconcileMissingColumns([model]);

    expect(r.added).toHaveLength(0);
    expect(r.skipped.some((s) => s.reason.includes('weird'))).toBe(true);
  });

  it('is idempotent — a fully in-sync table adds nothing', async () => {
    describeTable.mockResolvedValue({ id: {}, name: {} });
    const model = fakeModel('sync', {
      id: { type: DataTypes.INTEGER },
      name: { type: DataTypes.STRING },
    });

    const r = await reconcileMissingColumns([model]);

    expect(addColumn).not.toHaveBeenCalled();
    expect(r.added).toHaveLength(0);
  });
});
