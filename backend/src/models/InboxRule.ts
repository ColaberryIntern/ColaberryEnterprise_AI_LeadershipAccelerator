import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type InboxRuleType = 'sender_pattern' | 'keyword' | 'header' | 'domain' | 'combined';
export type InboxRuleTargetState = 'INBOX' | 'AUTOMATION' | 'SILENT_HOLD';

interface InboxRuleAttributes {
  id?: string;
  name: string;
  rule_type: InboxRuleType;
  conditions: any;
  target_state: InboxRuleTargetState;
  priority?: number;
  enabled?: boolean;
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class InboxRule extends Model<InboxRuleAttributes> implements InboxRuleAttributes {
  declare id: string;
  declare name: string;
  declare rule_type: InboxRuleType;
  declare conditions: any;
  declare target_state: InboxRuleTargetState;
  declare priority: number;
  declare enabled: boolean;
  declare created_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InboxRule.init(
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
    rule_type: {
      type: DataTypes.ENUM('sender_pattern', 'keyword', 'header', 'domain', 'combined'),
      allowNull: false,
    },
    conditions: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    target_state: {
      type: DataTypes.ENUM('INBOX', 'AUTOMATION', 'SILENT_HOLD'),
      allowNull: false,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'inbox_rules',
    timestamps: false,
    indexes: [
      {
        fields: ['enabled', 'priority'],
        name: 'idx_inbox_rules_enabled_priority',
      },
    ],
  }
);

export default InboxRule;
