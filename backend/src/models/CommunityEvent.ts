import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CommunityEventType = 'session' | 'open_house' | 'office_hours' | 'other';

export interface CommunityEventAttributes {
  id?: string;
  cohort_id: string;
  title: string;
  description?: string | null;
  event_type?: CommunityEventType;
  starts_at: Date;
  ends_at?: Date | null;
  location_url?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class CommunityEvent extends Model<CommunityEventAttributes> implements CommunityEventAttributes {
  declare id: string;
  declare cohort_id: string;
  declare title: string;
  declare description: string | null;
  declare event_type: CommunityEventType;
  declare starts_at: Date;
  declare ends_at: Date | null;
  declare location_url: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CommunityEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    cohort_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'cohorts', key: 'id' },
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { notEmpty: true },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    event_type: {
      type: DataTypes.ENUM('session', 'open_house', 'office_hours', 'other'),
      allowNull: false,
      defaultValue: 'session',
    },
    starts_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    ends_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    location_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'community_events',
    timestamps: true,
    underscored: true,
    // See CommunityMember.ts — without this, Sequelize's auto-timestamp JS
    // attributes are createdAt/updatedAt (camelCase), not the snake_case
    // names this class declares, and created_at/updated_at read undefined.
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['cohort_id'], name: 'idx_community_events_cohort_id' },
      { fields: ['starts_at'], name: 'idx_community_events_starts_at' },
    ],
  }
);

export default CommunityEvent;
