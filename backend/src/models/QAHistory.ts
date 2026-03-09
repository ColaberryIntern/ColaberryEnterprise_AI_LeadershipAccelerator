import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface QAHistoryAttributes {
  id?: string;
  question: string;
  answer?: string;
  intent?: string;
  entities?: Record<string, any>;
  execution_path?: string;
  sources?: string[];
  user_id?: string;
  scope?: Record<string, any>;
  created_at?: Date;
}

class QAHistory extends Model<QAHistoryAttributes> implements QAHistoryAttributes {
  declare id: string;
  declare question: string;
  declare answer: string;
  declare intent: string;
  declare entities: Record<string, any>;
  declare execution_path: string;
  declare sources: string[];
  declare user_id: string;
  declare scope: Record<string, any>;
  declare created_at: Date;
}

QAHistory.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    intent: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    entities: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    execution_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    sources: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    scope: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'qa_history',
    timestamps: false,
    indexes: [
      { fields: ['intent'] },
      { fields: ['user_id'] },
      { fields: ['created_at'] },
    ],
  }
);

export default QAHistory;
