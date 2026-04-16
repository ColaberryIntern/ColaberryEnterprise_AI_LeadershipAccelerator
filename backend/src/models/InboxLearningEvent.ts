import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface InboxLearningEventAttributes {
  id?: string;
  email_id: string;
  draft_id: string;
  ai_draft_text: string;
  actual_reply_text: string;
  diff_summary?: any | null;
  style_adjustments?: any | null;
  processed_at: Date;
}

class InboxLearningEvent extends Model<InboxLearningEventAttributes> implements InboxLearningEventAttributes {
  declare id: string;
  declare email_id: string;
  declare draft_id: string;
  declare ai_draft_text: string;
  declare actual_reply_text: string;
  declare diff_summary: any | null;
  declare style_adjustments: any | null;
  declare processed_at: Date;
}

InboxLearningEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    draft_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    ai_draft_text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    actual_reply_text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    diff_summary: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    style_adjustments: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    processed_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'inbox_learning_events',
    timestamps: false,
  }
);

export default InboxLearningEvent;
