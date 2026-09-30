import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * TimelineCardComment — per-card student comments, shown newest-first in the
 * Learning Runtime workspace (podcast/testimonial/video cards). Card-scoped and
 * enrollment-authored; distinct from the cohort-wide Community posts system.
 */
export interface TimelineCardCommentAttributes {
  id?: string;
  card_id: string;
  enrollment_id: string;
  body: string;
  created_at?: Date;
}

class TimelineCardComment extends Model<TimelineCardCommentAttributes> implements TimelineCardCommentAttributes {
  declare id: string;
  declare card_id: string;
  declare enrollment_id: string;
  declare body: string;
  declare created_at: Date;
}

TimelineCardComment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    card_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'timeline_card_comments',
    timestamps: false,
    indexes: [
      { fields: ['card_id', 'created_at'], name: 'idx_tcc_card_created' },
      { fields: ['enrollment_id'], name: 'idx_tcc_enrollment' },
    ],
  }
);

export default TimelineCardComment;
