import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface InsightReplacementAttributes {
  id?: string;
  original_insight_id: string;
  replacement_insight_id: string;
  reason?: string;
  triggered_by_feedback_id?: string;
  created_at?: Date;
}

class InsightReplacement extends Model<InsightReplacementAttributes> implements InsightReplacementAttributes {
  declare id: string;
  declare original_insight_id: string;
  declare replacement_insight_id: string;
  declare reason: string;
  declare triggered_by_feedback_id: string;
  declare created_at: Date;
}

InsightReplacement.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    original_insight_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'reporting_insights', key: 'id' },
    },
    replacement_insight_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'reporting_insights', key: 'id' },
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    triggered_by_feedback_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'user_insight_feedback', key: 'id' },
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'insight_replacements',
    timestamps: false,
    indexes: [
      { fields: ['original_insight_id'] },
      { fields: ['replacement_insight_id'] },
    ],
  }
);

export default InsightReplacement;
