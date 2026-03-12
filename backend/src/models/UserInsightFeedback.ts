import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type FeedbackType = 'useful' | 'not_useful' | 'favorite';

interface UserInsightFeedbackAttributes {
  id?: string;
  user_id: string;
  insight_id: string;
  feedback_type: FeedbackType;
  created_at?: Date;
}

class UserInsightFeedback extends Model<UserInsightFeedbackAttributes> implements UserInsightFeedbackAttributes {
  declare id: string;
  declare user_id: string;
  declare insight_id: string;
  declare feedback_type: FeedbackType;
  declare created_at: Date;
}

UserInsightFeedback.init(
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
    insight_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'reporting_insights', key: 'id' },
    },
    feedback_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'user_insight_feedback',
    timestamps: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['insight_id'] },
      {
        unique: true,
        fields: ['user_id', 'insight_id'],
        name: 'user_insight_feedback_unique',
      },
    ],
  }
);

export default UserInsightFeedback;
