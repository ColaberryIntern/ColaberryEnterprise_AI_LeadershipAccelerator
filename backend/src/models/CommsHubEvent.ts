import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubEvent: an event as the Community Organizer enters it in the Communications Hub (CH2.1).
 * Columns match backend/src/db/ensureCommsHubSchema.ts exactly (parity test). Instants are stored
 * in UTC (TIMESTAMPTZ) and shown in Central; never parse a wall-clock string here (centralDate.ts).
 */
export type CommsHubEventType = 'session' | 'open_house' | 'office_hours' | 'workshop' | 'other';
export type CommsHubEventStatus = 'draft' | 'scheduled' | 'live' | 'ended' | 'cancelled';
export type CommsHubAudience = { kind: 'all_members' } | { kind: 'cohorts'; cohort_ids: string[] };
export interface CommsHubRepeatRule { freq: 'weekly' | 'biweekly' | 'monthly'; until: string }
export interface CommsHubPlacement { calendar: boolean; events_page: boolean; campus_rail: boolean }
export interface CommsHubHost { name: string; role?: string }

export interface CommsHubEventAttributes {
  id?: string;
  title: string;
  event_type?: CommsHubEventType;
  audience?: CommsHubAudience;
  starts_at: Date;
  ends_at?: Date | null;
  repeat_rule?: CommsHubRepeatRule | null;
  join_url?: string | null;
  registration_url?: string | null;
  hosts?: CommsHubHost[];
  description?: string | null;
  placement?: CommsHubPlacement;
  status?: CommsHubEventStatus;
  thumbnail_id?: string | null;
  broadcast_occurrence_id?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class CommsHubEvent extends Model<CommsHubEventAttributes> implements CommsHubEventAttributes {
  declare id: string;
  declare title: string;
  declare event_type: CommsHubEventType;
  declare audience: CommsHubAudience;
  declare starts_at: Date;
  declare ends_at: Date | null;
  declare repeat_rule: CommsHubRepeatRule | null;
  declare join_url: string | null;
  declare registration_url: string | null;
  declare hosts: CommsHubHost[];
  declare description: string | null;
  declare placement: CommsHubPlacement;
  declare status: CommsHubEventStatus;
  declare thumbnail_id: string | null;
  declare broadcast_occurrence_id: string | null;
  declare created_by: string | null;
  declare updated_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CommsHubEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    event_type: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'other' },
    audience: { type: DataTypes.JSONB, allowNull: false, defaultValue: { kind: 'all_members' } },
    starts_at: { type: DataTypes.DATE, allowNull: false },
    ends_at: { type: DataTypes.DATE, allowNull: true },
    repeat_rule: { type: DataTypes.JSONB, allowNull: true },
    join_url: { type: DataTypes.TEXT, allowNull: true },
    registration_url: { type: DataTypes.TEXT, allowNull: true },
    hosts: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    description: { type: DataTypes.TEXT, allowNull: true },
    placement: { type: DataTypes.JSONB, allowNull: false, defaultValue: { calendar: true, events_page: true, campus_rail: true } },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'scheduled' },
    thumbnail_id: { type: DataTypes.UUID, allowNull: true },
    broadcast_occurrence_id: { type: DataTypes.UUID, allowNull: true },
    created_by: { type: DataTypes.STRING(64), allowNull: true },
    updated_by: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_events', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' },
);

export default CommsHubEvent;
