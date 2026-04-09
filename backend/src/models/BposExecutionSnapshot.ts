import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class BposExecutionSnapshot extends Model {
  declare id: string;
  declare process_id: string;
  declare step_key: string;
  declare execution_type: string;
  declare metrics_before: Record<string, any>;
  declare metrics_after: Record<string, any>;
  declare regressions: any[];
  declare structural_report: Record<string, any>;
  declare triggered_by: string;
}

BposExecutionSnapshot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    process_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'capabilities', key: 'id' } },
    step_key: { type: DataTypes.STRING(50), allowNull: true },
    execution_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'resync' },
    metrics_before: { type: DataTypes.JSONB, allowNull: true },
    metrics_after: { type: DataTypes.JSONB, allowNull: true },
    regressions: { type: DataTypes.JSONB, defaultValue: [] },
    structural_report: { type: DataTypes.JSONB, allowNull: true },
    triggered_by: { type: DataTypes.STRING(100), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'bpos_execution_snapshots',
    timestamps: false,
    underscored: true,
    indexes: [
      { fields: ['process_id'] },
      { fields: ['process_id', 'step_key'] },
      { fields: ['created_at'] },
    ],
  }
);

export default BposExecutionSnapshot;
