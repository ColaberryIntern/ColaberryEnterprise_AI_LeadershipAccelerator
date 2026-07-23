import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Durable transactional outbox for community-room domain events. Side effects
// (Google Meet creation, timeline-card publish, reminders, feed updates) are
// driven off this table by an idempotent, retryable drain worker so they are
// safe to replay. idempotency_key is UNIQUE so emitting the same event twice is
// a no-op. Named room_outbox_events to avoid colliding with the existing
// community_events (per-cohort calendar) table.
export type RoomOutboxStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'dead';
export type RoomOutboxAggregateType = 'room' | 'booking' | 'attendee' | 'message' | 'resource';

export interface RoomOutboxEventAttributes {
  id?: string;
  event_type: string;
  aggregate_type: RoomOutboxAggregateType;
  aggregate_id: string;
  payload?: Record<string, unknown>;
  idempotency_key: string;
  status?: RoomOutboxStatus;
  attempts?: number;
  max_attempts?: number;
  next_attempt_at?: Date;
  last_error?: string | null;
  correlation_id?: string | null;
  processed_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class RoomOutboxEvent extends Model<RoomOutboxEventAttributes> implements RoomOutboxEventAttributes {
  declare id: string;
  declare event_type: string;
  declare aggregate_type: RoomOutboxAggregateType;
  declare aggregate_id: string;
  declare payload: Record<string, unknown>;
  declare idempotency_key: string;
  declare status: RoomOutboxStatus;
  declare attempts: number;
  declare max_attempts: number;
  declare next_attempt_at: Date;
  declare last_error: string | null;
  declare correlation_id: string | null;
  declare processed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

RoomOutboxEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    event_type: { type: DataTypes.STRING(50), allowNull: false },
    aggregate_type: { type: DataTypes.STRING(30), allowNull: false },
    aggregate_id: { type: DataTypes.UUID, allowNull: false },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    idempotency_key: { type: DataTypes.STRING(180), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    max_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 6 },
    next_attempt_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    last_error: { type: DataTypes.TEXT, allowNull: true },
    correlation_id: { type: DataTypes.UUID, allowNull: true },
    processed_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'room_outbox_events',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['idempotency_key'], name: 'room_outbox_events_idem_unique' },
      { fields: ['status', 'next_attempt_at'], name: 'idx_room_outbox_ready' },
      { fields: ['aggregate_type', 'aggregate_id'], name: 'idx_room_outbox_aggregate' },
    ],
  }
);

export default RoomOutboxEvent;
