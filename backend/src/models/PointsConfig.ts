import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * PointsConfig — the single, editable source of the XP economy and
 * promotion thresholds. NOTHING about points/levels is hardcoded; the
 * scoring and promotion services read this table.
 *
 *  scope = 'type_default'      key = card type slug        -> default XP per type
 *  scope = 'level_threshold'   key = builder level slug    -> promotion gate config
 *  scope = 'readiness_weight'  key = competency domain id  -> readiness contribution
 *  scope = 'card_override'     key = card id               -> per-card override
 */

export type PointsConfigScope =
  | 'type_default' | 'card_override' | 'level_threshold' | 'readiness_weight';

export interface PointsConfigAttributes {
  id?: string;
  scope: PointsConfigScope;
  key: string;
  learning_xp?: number | null;
  builder_xp?: number | null;
  community_xp?: number | null;
  config?: any;                 // thresholds, weights, gate minimums (JSONB)
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class PointsConfig extends Model<PointsConfigAttributes> implements PointsConfigAttributes {
  declare id: string;
  declare scope: PointsConfigScope;
  declare key: string;
  declare learning_xp: number | null;
  declare builder_xp: number | null;
  declare community_xp: number | null;
  declare config: any;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

PointsConfig.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    scope: { type: DataTypes.STRING(30), allowNull: false },
    key: { type: DataTypes.STRING(150), allowNull: false },
    learning_xp: { type: DataTypes.INTEGER, allowNull: true },
    builder_xp: { type: DataTypes.INTEGER, allowNull: true },
    community_xp: { type: DataTypes.INTEGER, allowNull: true },
    config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'points_config',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['scope', 'key'] },
      { fields: ['is_active'] },
    ],
  }
);

export default PointsConfig;
