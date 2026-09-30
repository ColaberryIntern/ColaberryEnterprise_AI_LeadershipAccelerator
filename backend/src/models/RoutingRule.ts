import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface RoutingAction {
  type: string;
  [key: string]: any;
}

interface RoutingRuleAttributes {
  id: string;
  name: string;
  priority: number;
  conditions: Record<string, any>;
  actions: RoutingAction[];
  continue_on_match: boolean;
  is_active: boolean;
  /** Bumped by the admin controller when conditions or actions change (T226). */
  version?: number;
  created_at?: Date;
  updated_at?: Date;
}

/** What a caller must supply to create a rule: the database mints the id, the version and the timestamps. */
export type RoutingRuleCreationAttributes = Optional<RoutingRuleAttributes, 'id' | 'version' | 'created_at' | 'updated_at'>;

class RoutingRule extends Model<RoutingRuleAttributes, RoutingRuleCreationAttributes> implements RoutingRuleAttributes {
  declare id: string;
  declare name: string;
  declare priority: number;
  declare conditions: Record<string, any>;
  declare actions: RoutingAction[];
  declare continue_on_match: boolean;
  declare is_active: boolean;
  declare version: number;
  declare created_at: Date;
  declare updated_at: Date;
}

RoutingRule.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },
    conditions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    actions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    continue_on_match: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'routing_rules',
    timestamps: false,
    indexes: [
      { fields: ['is_active', 'priority'], name: 'idx_routing_rules_active_priority' },
    ],
  }
);

export default RoutingRule;
