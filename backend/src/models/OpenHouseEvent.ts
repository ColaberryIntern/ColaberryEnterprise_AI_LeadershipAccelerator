import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type OpenHouseStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';

export interface OpenHouseEventAttributes {
  id?: string;
  title: string;
  description?: string | null;
  starts_at: Date;
  timezone?: string;
  registration_url?: string | null;
  meeting_link?: string | null;
  status?: OpenHouseStatus;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * A cohort-agnostic open house / info session. Prospects (free "guest"
 * accounts) can see the next one and RSVP before they belong to any cohort,
 * earning their first minimal points.
 */
class OpenHouseEvent extends Model<OpenHouseEventAttributes> implements OpenHouseEventAttributes {
  declare id: string;
  declare title: string;
  declare description: string | null;
  declare starts_at: Date;
  declare timezone: string;
  declare registration_url: string | null;
  declare meeting_link: string | null;
  declare status: OpenHouseStatus;
  declare created_at: Date;
  declare updated_at: Date;
}

OpenHouseEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    starts_at: { type: DataTypes.DATE, allowNull: false },
    timezone: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'America/Chicago' },
    registration_url: { type: DataTypes.STRING(500), allowNull: true },
    meeting_link: { type: DataTypes.STRING(500), allowNull: true },
    // STRING (not a DB ENUM) to match the idempotent raw-SQL ensure schema.
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'scheduled' },
  },
  {
    sequelize,
    tableName: 'open_house_events',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['status', 'starts_at'], name: 'idx_open_house_events_status_starts' },
    ],
  }
);

export default OpenHouseEvent;
