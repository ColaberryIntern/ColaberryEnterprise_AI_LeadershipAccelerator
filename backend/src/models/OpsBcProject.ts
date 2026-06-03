/**
 * OpsBcProject — mirror of Basecamp projects with the CB-managed flag.
 *
 * Owned by the AI Ops Command Center sync worker. Read-mirror; we never
 * mutate the upstream BC project through this table.
 *
 * is_cb_managed: true if the project is one the @CB bot is active in. v0:
 * defaults to true for every mirrored project. Phase 1.1 will refine by
 * looking for CB-attributed comments in the last 30 days.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface OpsBcProjectAttributes {
  bc_id: string;
  name: string;
  description: string | null;
  is_cb_managed: boolean;
  weight: number;
  last_synced_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

class OpsBcProject extends Model<OpsBcProjectAttributes> implements OpsBcProjectAttributes {
  declare bc_id: string;
  declare name: string;
  declare description: string | null;
  declare is_cb_managed: boolean;
  declare weight: number;
  declare last_synced_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

OpsBcProject.init(
  {
    bc_id: { type: DataTypes.STRING(50), primaryKey: true, allowNull: false },
    name: { type: DataTypes.TEXT, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    is_cb_managed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    weight: { type: DataTypes.DECIMAL(3, 2), allowNull: false, defaultValue: 1.0 },
    last_synced_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'OpsBcProject',
    tableName: 'ops_bc_projects',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['is_cb_managed'] }],
  },
);

export default OpsBcProject;
