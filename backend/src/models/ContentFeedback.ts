// ─── Content Feedback Model ──────────────────────────────────────────────────
// Generic feedback for any content surface: charts, briefings, KPIs, trends, etc.
// Unlike UserInsightFeedback (tied to reporting_insights FK), this uses a
// content_type + content_key pattern to support any content.

import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ContentFeedbackType = 'useful' | 'not_useful' | 'favorite';
export type ContentType = 'chart' | 'briefing' | 'kpi' | 'trend' | 'auto_insight' | 'map' | 'agent' | 'experiment' | 'execution';

interface ContentFeedbackAttributes {
  id?: string;
  user_id: string;
  content_type: ContentType;
  content_key: string;
  feedback_type: ContentFeedbackType;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class ContentFeedback extends Model<ContentFeedbackAttributes> implements ContentFeedbackAttributes {
  declare id: string;
  declare user_id: string;
  declare content_type: ContentType;
  declare content_key: string;
  declare feedback_type: ContentFeedbackType;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

ContentFeedback.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    content_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    content_key: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    feedback_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'content_feedback',
    timestamps: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['content_type', 'content_key'] },
      {
        unique: true,
        fields: ['user_id', 'content_type', 'content_key'],
        name: 'content_feedback_unique',
      },
    ],
  },
);

export default ContentFeedback;
