import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Append-only audit trail for a case. Every state transition, disposition
// change, question answer, action approval/execution, and closure decision
// writes one row here. Never updated or deleted — closure guard condition 9
// ("the audit event chain is complete") checks this table, not a mutable log.

interface InboxCaseEventAttributes {
  id?: string;
  case_id: string;
  item_id: string | null;
  action_id: string | null;
  event_type: string;
  actor_type: 'admin' | 'system' | 'ai';
  actor_id: string;
  previous_state: string | null;
  new_state: string | null;
  details: Record<string, unknown>;
  correlation_id: string;
  created_at?: Date;
}

class InboxCaseEvent extends Model<InboxCaseEventAttributes> implements InboxCaseEventAttributes {
  declare id: string;
  declare case_id: string;
  declare item_id: string | null;
  declare action_id: string | null;
  declare event_type: string;
  declare actor_type: 'admin' | 'system' | 'ai';
  declare actor_id: string;
  declare previous_state: string | null;
  declare new_state: string | null;
  declare details: Record<string, unknown>;
  declare correlation_id: string;
  declare created_at: Date;
}

InboxCaseEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'inbox_cases', key: 'id' } },
    item_id: { type: DataTypes.UUID, allowNull: true },
    action_id: { type: DataTypes.UUID, allowNull: true },
    event_type: { type: DataTypes.STRING(60), allowNull: false },
    actor_type: { type: DataTypes.ENUM('admin', 'system', 'ai'), allowNull: false, defaultValue: 'system' },
    actor_id: { type: DataTypes.STRING(100), allowNull: false },
    previous_state: { type: DataTypes.STRING(30), allowNull: true },
    new_state: { type: DataTypes.STRING(30), allowNull: true },
    details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    correlation_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'inbox_case_events',
    timestamps: false,
    indexes: [
      { fields: ['case_id', 'created_at'], name: 'idx_inbox_case_events_case_created' },
      { fields: ['action_id'], name: 'idx_inbox_case_events_action_id' },
      { fields: ['correlation_id'], name: 'idx_inbox_case_events_correlation_id' },
    ],
  }
);

export default InboxCaseEvent;
