import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CapabilityAgentMapAttributes {
  id?: string;
  capability_id: string;
  feature_id?: string;
  agent_name: string;
  role?: string;
  status?: string;
  priority?: number;
  config?: Record<string, any>;
  linked_by?: string;
  linked_at?: Date;
  unlinked_at?: Date;
}

class CapabilityAgentMap extends Model<CapabilityAgentMapAttributes> implements CapabilityAgentMapAttributes {
  declare id: string;
  declare capability_id: string;
  declare feature_id: string;
  declare agent_name: string;
  declare role: string;
  declare status: string;
  declare priority: number;
  declare config: Record<string, any>;
  declare linked_by: string;
  declare linked_at: Date;
  declare unlinked_at: Date;
}

CapabilityAgentMap.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    capability_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'capabilities', key: 'id' } },
    feature_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'features', key: 'id' } },
    agent_name: { type: DataTypes.STRING(100), allowNull: false },
    role: { type: DataTypes.STRING(50), defaultValue: 'executor' },       // executor | monitor | fallback | advisor
    status: { type: DataTypes.STRING(20), defaultValue: 'active' },       // active | disabled | proposed
    priority: { type: DataTypes.INTEGER, defaultValue: 0 },               // execution order within capability
    config: { type: DataTypes.JSONB, defaultValue: {} },                   // agent-specific config for this capability
    linked_by: { type: DataTypes.STRING(50), defaultValue: 'manual' },    // manual | auto_discovery | seed | evolution
    linked_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    unlinked_at: { type: DataTypes.DATE, allowNull: true },               // soft-delete timestamp
  },
  {
    sequelize,
    tableName: 'capability_agent_maps',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['capability_id'] },
      { fields: ['agent_name'] },
      { fields: ['capability_id', 'agent_name'], unique: true, where: { status: 'active' }, name: 'cap_agent_active_unique' },
    ],
  }
);

export default CapabilityAgentMap;
