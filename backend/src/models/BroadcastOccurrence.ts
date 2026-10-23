import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import type { EditorialState, EndReason, ProviderHealth } from '../services/broadcast/broadcastStateMachine';

/**
 * One airing. The table is created by db/ensureBroadcastSchema.ts — this model is the
 * typed read/write contract over it, not its definition. `sequelize.sync()` is off in this
 * repo, so adding or changing a field here produces no DDL; the ensure file must change too.
 *
 * Imported by direct path rather than through models/index.ts: the room services already do
 * this (roomBookingService.ts:1-4) because pulling the barrel drags the whole model graph in
 * behind it, and communityCalendarService.ts carries a comment explaining it avoided exactly
 * that coupling.
 *
 * editorial_state and provider_health are deliberately separate — see broadcastStateMachine
 * for why a producer's intent and the provider's reality must not share a column.
 */
export type BroadcastAccessMode = 'free' | 'paid' | 'preview' | 'private';

export interface BroadcastOccurrenceAttributes {
  id: string;
  series_id: string | null;
  occurrence_key: string;
  title: string;
  room_id: string | null;
  editorial_state: EditorialState;
  provider_health: ProviderHealth;
  provider: string;
  provider_session_id: string | null;
  provider_instance_uuid: string | null;
  scheduled_start_at: Date | null;
  scheduled_end_at: Date | null;
  content_started_at: Date | null;
  ended_at: Date | null;
  /** Why it ended (L7.4). Null for anything that ended before the column existed. */
  end_reason: EndReason | null;
  access_mode: BroadcastAccessMode;
  preview_seconds: number;
  access_policy_snapshot: Record<string, unknown>;
  access_policy_version: number;
  version: number;
  timezone: string;
  created_by_enrollment_id: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export type BroadcastOccurrenceCreation = Optional<
  BroadcastOccurrenceAttributes,
  | 'id' | 'series_id' | 'room_id' | 'editorial_state' | 'provider_health' | 'provider'
  | 'provider_session_id' | 'provider_instance_uuid' | 'scheduled_start_at' | 'scheduled_end_at'
  | 'content_started_at' | 'ended_at' | 'end_reason' | 'access_mode' | 'preview_seconds'
  | 'access_policy_snapshot' | 'access_policy_version' | 'version' | 'timezone'
  | 'created_by_enrollment_id' | 'created_at' | 'updated_at'
>;

class BroadcastOccurrence
  extends Model<BroadcastOccurrenceAttributes, BroadcastOccurrenceCreation>
  implements BroadcastOccurrenceAttributes {
  declare id: string;
  declare series_id: string | null;
  declare occurrence_key: string;
  declare title: string;
  declare room_id: string | null;
  declare editorial_state: EditorialState;
  declare provider_health: ProviderHealth;
  declare provider: string;
  declare provider_session_id: string | null;
  declare provider_instance_uuid: string | null;
  declare scheduled_start_at: Date | null;
  declare scheduled_end_at: Date | null;
  declare content_started_at: Date | null;
  declare ended_at: Date | null;
  declare end_reason: EndReason | null;
  declare access_mode: BroadcastAccessMode;
  declare preview_seconds: number;
  declare access_policy_snapshot: Record<string, unknown>;
  declare access_policy_version: number;
  declare version: number;
  declare timezone: string;
  declare created_by_enrollment_id: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

BroadcastOccurrence.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    series_id: { type: DataTypes.UUID, allowNull: true },
    occurrence_key: { type: DataTypes.STRING(200), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    room_id: { type: DataTypes.UUID, allowNull: true },
    editorial_state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'scheduled' },
    provider_health: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unknown' },
    provider: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'zoom' },
    provider_session_id: { type: DataTypes.STRING(200), allowNull: true },
    provider_instance_uuid: { type: DataTypes.STRING(200), allowNull: true },
    scheduled_start_at: { type: DataTypes.DATE, allowNull: true },
    scheduled_end_at: { type: DataTypes.DATE, allowNull: true },
    content_started_at: { type: DataTypes.DATE, allowNull: true },
    ended_at: { type: DataTypes.DATE, allowNull: true },
    end_reason: { type: DataTypes.TEXT, allowNull: true },
    access_mode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'private' },
    preview_seconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 900 },
    access_policy_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    access_policy_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    timezone: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'America/Chicago' },
    created_by_enrollment_id: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    tableName: 'broadcast_occurrences',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default BroadcastOccurrence;
