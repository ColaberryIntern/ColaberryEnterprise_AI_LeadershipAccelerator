import { DataTypes } from 'sequelize';
import { addMissingColumns } from '../addMissingColumns';

const model = {
  getTableName: () => 'enterprise_intakes',
  getAttributes: () =>
    ({
      id: { field: 'id', type: DataTypes.UUID },
      createdAt: { field: 'created_at', type: DataTypes.DATE },
      transcript: { field: 'transcript', type: DataTypes.TEXT },
      research_attempts: { field: 'research_attempts', type: DataTypes.INTEGER, defaultValue: 0 },
      research: { fieldName: 'research', type: DataTypes.JSONB, defaultValue: { fn: 'x' } },
    }) as any,
};

describe('addMissingColumns', () => {
  it('adds only the columns the table lacks, by column name, nullable, keeping plain defaults', async () => {
    const qi = {
      describeTable: jest.fn().mockResolvedValue({ id: {}, created_at: {} }),
      addColumn: jest.fn().mockResolvedValue(undefined),
    };
    const added = await addMissingColumns(model, qi as any);
    expect(added).toEqual(['transcript', 'research_attempts', 'research']);
    expect(qi.addColumn).toHaveBeenCalledWith('enterprise_intakes', 'transcript', { type: DataTypes.TEXT, allowNull: true });
    expect(qi.addColumn).toHaveBeenCalledWith('enterprise_intakes', 'research_attempts', {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    });
    // An object default (a function call, a literal) is not copied: only plain values are.
    expect(qi.addColumn).toHaveBeenCalledWith('enterprise_intakes', 'research', { type: DataTypes.JSONB, allowNull: true });
  });

  it('does nothing when the table is already complete', async () => {
    const qi = {
      describeTable: jest.fn().mockResolvedValue({ id: {}, created_at: {}, transcript: {}, research_attempts: {}, research: {} }),
      addColumn: jest.fn(),
    };
    expect(await addMissingColumns(model, qi as any)).toEqual([]);
    expect(qi.addColumn).not.toHaveBeenCalled();
  });
});
