import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type MentorReviewStatus = 'pending_review' | 'auto_approved' | 'approved' | 'dismissed';

export interface MentorReviewItemAttributes {
  id: string;
  submission_id: string;
  enrollment_id: string;
  ai_feedback: string;
  confidence_score: number;
  status: MentorReviewStatus;
  reviewer_notes: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

class MentorReviewItem
  extends Model<MentorReviewItemAttributes>
  implements MentorReviewItemAttributes
{
  declare id: string;
  declare submission_id: string;
  declare enrollment_id: string;
  declare ai_feedback: string;
  declare confidence_score: number;
  declare status: MentorReviewStatus;
  declare reviewer_notes: string | null;
  declare reviewed_at: Date | null;
  declare created_at: Date;
}

MentorReviewItem.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    submission_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'assignment_submissions', key: 'id' },
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    ai_feedback: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    confidence_score: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending_review', 'auto_approved', 'approved', 'dismissed'),
      allowNull: false,
      defaultValue: 'pending_review',
    },
    reviewer_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'mentor_review_items',
    timestamps: false,
    indexes: [
      { fields: ['enrollment_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  }
);

export default MentorReviewItem;
