import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Learning signal: records when Ali rescues a hidden email (or otherwise
// signals it mattered). The scoring engine reads these back as a positive
// corpus so future emails resembling rescued ones score higher. This closes
// the false-negative feedback loop the Missed Opportunities Report exists to fix.

export type FalseNegativeAction =
  | 'restored'         // pulled back into Inbox from the report
  | 'reopened'         // opened the original from the report
  | 'marked_important' // explicitly flagged important
  | 'moved_to_inbox';  // reclassified to INBOX

export type FalseNegativeSource = 'report' | 'email' | 'console';

interface InboxFalseNegativeFeedbackAttributes {
  id?: string;
  email_id: string;
  action: FalseNegativeAction;
  source: FalseNegativeSource;
  score_at_feedback?: number | null; // the opportunity score when feedback was given
  created_by?: string | null;
  created_at: Date;
}

class InboxFalseNegativeFeedback
  extends Model<InboxFalseNegativeFeedbackAttributes>
  implements InboxFalseNegativeFeedbackAttributes
{
  declare id: string;
  declare email_id: string;
  declare action: FalseNegativeAction;
  declare source: FalseNegativeSource;
  declare score_at_feedback: number | null;
  declare created_by: string | null;
  declare created_at: Date;
}

InboxFalseNegativeFeedback.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inbox_emails', key: 'id' },
    },
    action: {
      type: DataTypes.ENUM('restored', 'reopened', 'marked_important', 'moved_to_inbox'),
      allowNull: false,
    },
    source: {
      type: DataTypes.ENUM('report', 'email', 'console'),
      allowNull: false,
      defaultValue: 'report',
    },
    score_at_feedback: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'inbox_false_negative_feedback',
    timestamps: false,
    indexes: [
      {
        fields: ['email_id'],
        name: 'idx_inbox_fn_feedback_email_id',
      },
      {
        fields: ['action'],
        name: 'idx_inbox_fn_feedback_action',
      },
      {
        fields: ['created_at'],
        name: 'idx_inbox_fn_feedback_created_at',
      },
    ],
  }
);

export default InboxFalseNegativeFeedback;
