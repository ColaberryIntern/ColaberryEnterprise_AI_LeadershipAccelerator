import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { RoomPrivacy } from './CommunityRoom';

// A scheduled occurrence inside a room (the output of the §5 booking wizard).
// Carries the full lifecycle state machine and links back to an official
// LiveSession/module/project. idempotency_key dedups create.
export type RoomBookingVariant =
  | 'study' | 'build_room' | 'demo' | 'office_hours'
  | 'architecture_review' | 'cert_prep' | 'accountability' | 'networking';
export type RoomBookingState =
  | 'draft' | 'pending_approval' | 'scheduled' | 'lobby_open' | 'live'
  | 'cooldown' | 'completed' | 'archived'
  | 'rejected' | 'cancelled' | 'locked' | 'removed';
export type RoomRecordingPolicy = 'ask' | 'always' | 'never';

export interface RoomBookingAttributes {
  id?: string;
  room_id: string;
  variant?: RoomBookingVariant;
  title: string;
  description?: string | null;
  outcome?: string | null;
  agenda?: string | null;
  host_enrollment_id?: string | null;
  co_hosts?: string[];
  start_at?: Date | null;
  end_at?: Date | null;
  timezone?: string | null;
  recurrence?: string | null;
  privacy?: RoomPrivacy;
  audience_rules?: Record<string, unknown>;
  capacity?: number | null;
  approval_required?: boolean;
  meeting_provider?: string;
  meeting_link?: string | null;
  google_event_id?: string | null;
  external_ids?: Record<string, unknown>;
  related_module_id?: string | null;
  related_live_session_id?: string | null;
  related_project_id?: string | null;
  skill_tags?: string[];
  rsvp_deadline?: Date | null;
  reminder_policy?: Record<string, unknown>;
  recording_policy?: RoomRecordingPolicy;
  artifact_prompt?: string | null;
  reflection_prompt?: string | null;
  moderation_policy?: Record<string, unknown>;
  state?: RoomBookingState;
  timeline_published?: boolean;
  timeline_card_id?: string | null;
  created_by_enrollment_id?: string | null;
  idempotency_key?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class RoomBooking extends Model<RoomBookingAttributes> implements RoomBookingAttributes {
  declare id: string;
  declare room_id: string;
  declare variant: RoomBookingVariant;
  declare title: string;
  declare description: string | null;
  declare outcome: string | null;
  declare agenda: string | null;
  declare host_enrollment_id: string | null;
  declare co_hosts: string[];
  declare start_at: Date | null;
  declare end_at: Date | null;
  declare timezone: string | null;
  declare recurrence: string | null;
  declare privacy: RoomPrivacy;
  declare audience_rules: Record<string, unknown>;
  declare capacity: number | null;
  declare approval_required: boolean;
  declare meeting_provider: string;
  declare meeting_link: string | null;
  declare google_event_id: string | null;
  declare external_ids: Record<string, unknown>;
  declare related_module_id: string | null;
  declare related_live_session_id: string | null;
  declare related_project_id: string | null;
  declare skill_tags: string[];
  declare rsvp_deadline: Date | null;
  declare reminder_policy: Record<string, unknown>;
  declare recording_policy: RoomRecordingPolicy;
  declare artifact_prompt: string | null;
  declare reflection_prompt: string | null;
  declare moderation_policy: Record<string, unknown>;
  declare state: RoomBookingState;
  declare timeline_published: boolean;
  declare timeline_card_id: string | null;
  declare created_by_enrollment_id: string | null;
  declare idempotency_key: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

RoomBooking.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    room_id: { type: DataTypes.UUID, allowNull: false },
    variant: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'study' },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    outcome: { type: DataTypes.TEXT, allowNull: true },
    agenda: { type: DataTypes.TEXT, allowNull: true },
    host_enrollment_id: { type: DataTypes.UUID, allowNull: true },
    co_hosts: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    start_at: { type: DataTypes.DATE, allowNull: true },
    end_at: { type: DataTypes.DATE, allowNull: true },
    timezone: { type: DataTypes.STRING(60), allowNull: true },
    recurrence: { type: DataTypes.STRING(40), allowNull: true },
    privacy: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'public' },
    audience_rules: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    capacity: { type: DataTypes.INTEGER, allowNull: true },
    approval_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    meeting_provider: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'zoom' },
    meeting_link: { type: DataTypes.STRING(600), allowNull: true },
    google_event_id: { type: DataTypes.STRING(255), allowNull: true },
    external_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    related_module_id: { type: DataTypes.UUID, allowNull: true },
    related_live_session_id: { type: DataTypes.UUID, allowNull: true },
    related_project_id: { type: DataTypes.UUID, allowNull: true },
    skill_tags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    rsvp_deadline: { type: DataTypes.DATE, allowNull: true },
    reminder_policy: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    recording_policy: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'ask' },
    artifact_prompt: { type: DataTypes.TEXT, allowNull: true },
    reflection_prompt: { type: DataTypes.TEXT, allowNull: true },
    moderation_policy: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    timeline_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    timeline_card_id: { type: DataTypes.UUID, allowNull: true },
    created_by_enrollment_id: { type: DataTypes.UUID, allowNull: true },
    idempotency_key: { type: DataTypes.STRING(160), allowNull: true },
  },
  {
    sequelize,
    tableName: 'room_bookings',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['room_id'], name: 'idx_room_bookings_room' },
      { fields: ['state', 'start_at'], name: 'idx_room_bookings_state_start' },
      { fields: ['related_live_session_id'], name: 'idx_room_bookings_related_session' },
    ],
  }
);

export default RoomBooking;
