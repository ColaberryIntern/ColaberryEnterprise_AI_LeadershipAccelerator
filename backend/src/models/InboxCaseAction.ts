import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { ACTION_TYPES, ACTION_STATUSES, ACTION_RISK_LEVELS, ActionType, ActionStatus, ActionRiskLevel } from '../types/inboxCase';

// A single proposed external write (email send, Basecamp comment, archive,
// etc). `idempotency_key` is globally unique and is the durable-outbox guard
// against duplicate sends/comments on retry (root directive section 12).
// `depends_on_action_ids` lets the executor enforce "archive actions run
// last" and "a failed Basecamp update blocks its connected email archive."

interface InboxCaseActionAttributes {
  id?: string;
  case_id: string;
  item_id: string | null;
  action_type: ActionType;
  target_source: string;
  target_id: string | null;
  preview: string;
  payload: Record<string, unknown>;
  risk_level: ActionRiskLevel;
  requires_individual_approval: boolean;
  status: ActionStatus;
  depends_on_action_ids: string[];
  idempotency_key: string;
  attempt_count: number;
  external_receipt: Record<string, unknown> | null;
  verification_status: 'PENDING' | 'VERIFIED' | 'VERIFICATION_FAILED' | null;
  error_class: string | null;
  error_message: string | null;
  acting_admin: string;
  correlation_id: string;
  approved_by: string | null;
  approved_at: Date | null;
  executed_at: Date | null;
  verified_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class InboxCaseAction extends Model<InboxCaseActionAttributes> implements InboxCaseActionAttributes {
  declare id: string;
  declare case_id: string;
  declare item_id: string | null;
  declare action_type: ActionType;
  declare target_source: string;
  declare target_id: string | null;
  declare preview: string;
  declare payload: Record<string, unknown>;
  declare risk_level: ActionRiskLevel;
  declare requires_individual_approval: boolean;
  declare status: ActionStatus;
  declare depends_on_action_ids: string[];
  declare idempotency_key: string;
  declare attempt_count: number;
  declare external_receipt: Record<string, unknown> | null;
  declare verification_status: 'PENDING' | 'VERIFIED' | 'VERIFICATION_FAILED' | null;
  declare error_class: string | null;
  declare error_message: string | null;
  declare acting_admin: string;
  declare correlation_id: string;
  declare approved_by: string | null;
  declare approved_at: Date | null;
  declare executed_at: Date | null;
  declare verified_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InboxCaseAction.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'inbox_cases', key: 'id' } },
    item_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'inbox_case_items', key: 'id' } },
    action_type: { type: DataTypes.ENUM(...ACTION_TYPES), allowNull: false },
    target_source: { type: DataTypes.STRING(30), allowNull: false },
    target_id: { type: DataTypes.STRING(255), allowNull: true },
    preview: { type: DataTypes.TEXT, allowNull: false },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    risk_level: { type: DataTypes.ENUM(...ACTION_RISK_LEVELS), allowNull: false, defaultValue: 'MEDIUM' },
    requires_individual_approval: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    status: { type: DataTypes.ENUM(...ACTION_STATUSES), allowNull: false, defaultValue: 'PROPOSED' },
    depends_on_action_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    idempotency_key: { type: DataTypes.STRING(255), allowNull: false },
    attempt_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    external_receipt: { type: DataTypes.JSONB, allowNull: true },
    verification_status: { type: DataTypes.ENUM('PENDING', 'VERIFIED', 'VERIFICATION_FAILED'), allowNull: true },
    error_class: { type: DataTypes.STRING(100), allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    acting_admin: { type: DataTypes.STRING(100), allowNull: false },
    correlation_id: { type: DataTypes.UUID, allowNull: false },
    approved_by: { type: DataTypes.STRING(100), allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    executed_at: { type: DataTypes.DATE, allowNull: true },
    verified_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'inbox_case_actions',
    timestamps: false,
    indexes: [
      { fields: ['case_id'], name: 'idx_inbox_case_actions_case_id' },
      { fields: ['status'], name: 'idx_inbox_case_actions_status' },
      { unique: true, fields: ['idempotency_key'], name: 'uq_inbox_case_actions_idempotency_key' },
    ],
  }
);

export default InboxCaseAction;
