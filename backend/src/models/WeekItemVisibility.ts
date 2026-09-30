import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type WeekItemType = 'warm_up' | 'lab' | 'video_critique' | 'post_quiz' | 'mock_interview';

export const ACTIVITY_SEQUENCE: WeekItemType[] = [
  'warm_up',
  'lab',
  'video_critique',
  'post_quiz',
  'mock_interview',
];

class WeekItemVisibility extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare week_number: number;
  declare item_type: WeekItemType;
  declare visible: boolean;
  declare revealed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

WeekItemVisibility.init(
  {
    id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    week_number:   { type: DataTypes.INTEGER, allowNull: false },
    item_type:     { type: DataTypes.TEXT, allowNull: false },
    visible:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    revealed_at:   { type: DataTypes.DATE, allowNull: true },
    created_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'week_item_visibility',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['enrollment_id', 'week_number', 'item_type'],
        name: 'uq_week_item_visibility_enrollment_week_item',
      },
      { fields: ['enrollment_id', 'week_number'], name: 'idx_week_item_visibility_enrollment_week' },
    ],
  }
);

export default WeekItemVisibility;
