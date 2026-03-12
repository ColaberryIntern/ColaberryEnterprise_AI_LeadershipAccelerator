import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type KPIScopeType = 'department' | 'campaign' | 'agent' | 'cohort' | 'student' | 'system';
export type KPIPeriod = 'daily' | 'weekly' | 'monthly';

interface KPISnapshotAttributes {
  id?: string;
  scope_type: KPIScopeType;
  scope_id: string;
  scope_name: string;
  period: KPIPeriod;
  snapshot_date: string;
  metrics: Record<string, any>;
  deltas?: Record<string, any>;
  computed_by: string;
  created_at?: Date;
}

class KPISnapshot extends Model<KPISnapshotAttributes> implements KPISnapshotAttributes {
  declare id: string;
  declare scope_type: KPIScopeType;
  declare scope_id: string;
  declare scope_name: string;
  declare period: KPIPeriod;
  declare snapshot_date: string;
  declare metrics: Record<string, any>;
  declare deltas: Record<string, any>;
  declare computed_by: string;
  declare created_at: Date;
}

KPISnapshot.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    scope_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    scope_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    scope_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    period: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    snapshot_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    metrics: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    deltas: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    computed_by: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'kpi_snapshots',
    timestamps: false,
    indexes: [
      { fields: ['scope_type', 'scope_id'] },
      { fields: ['snapshot_date'] },
      {
        unique: true,
        fields: ['scope_type', 'scope_id', 'period', 'snapshot_date'],
        name: 'kpi_snapshots_unique_entry',
      },
    ],
  }
);

export default KPISnapshot;
