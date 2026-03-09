import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AiSystemEventAttributes {
  id?: string;
  source: string;
  event_type: string;
  entity_type?: string;
  entity_id?: string;
  details?: Record<string, any>;
  created_at?: Date;
}

class AiSystemEvent extends Model<AiSystemEventAttributes> implements AiSystemEventAttributes {
  declare id: string;
  declare source: string;
  declare event_type: string;
  declare entity_type: string;
  declare entity_id: string;
  declare details: Record<string, any>;
  declare created_at: Date;
}

AiSystemEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    event_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    entity_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'ai_system_events',
    timestamps: false,
    indexes: [
      { fields: ['source'] },
      { fields: ['event_type'] },
      { fields: ['entity_type', 'entity_id'] },
      { fields: ['created_at'] },
    ],
  }
);

export default AiSystemEvent;
