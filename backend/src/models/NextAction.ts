import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface NextActionAttributes {
  id?: string;
  project_id: string;
  title: string;
  action_type: string;
  reason: string;
  priority_score: number;
  confidence_score: number;
  status?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class NextAction extends Model<NextActionAttributes> implements NextActionAttributes {
  declare id: string;
  declare project_id: string;
  declare title: string;
  declare action_type: string;
  declare reason: string;
  declare priority_score: number;
  declare confidence_score: number;
  declare status: string;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

NextAction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'projects', key: 'id' },
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    action_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    priority_score: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    confidence_score: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pending',
    },
    metadata: {
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
    tableName: 'next_actions',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['status'] },
    ],
  }
);

export default NextAction;
