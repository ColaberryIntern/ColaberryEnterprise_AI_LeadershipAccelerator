import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface EntitySummaryAttributes {
  id?: string;
  entity_id: string;
  entity_name?: string;
  entity_type?: string;
  summary_text?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class EntitySummary extends Model<EntitySummaryAttributes> implements EntitySummaryAttributes {
  declare id: string;
  declare entity_id: string;
  declare entity_name: string;
  declare entity_type: string;
  declare summary_text: string;
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

EntitySummary.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    entity_id: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    entity_name: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    entity_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    summary_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
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
    tableName: 'entity_summaries',
    timestamps: false,
    indexes: [
      { fields: ['entity_id'] },
      { fields: ['entity_type'] },
    ],
  }
);

export default EntitySummary;
