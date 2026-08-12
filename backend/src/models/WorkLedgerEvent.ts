import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ProofDesk Work Ledger (Milestone 1 - Foundation). Append-only event envelope per
// spec section 9.1. This is the durable record of one side-effecting agent action.
// Never updated after creation (append-only) - callers that need to correct a row
// write a new event with parent_event_id pointing at the one being corrected.
//
// Bridges to existing analog tables by ID only via source_record_type/
// source_record_id (e.g. 'ticket_activity' -> TicketActivity.id, 'ai_agent_activity_log'
// -> AiAgentActivityLog.id) - never copies their payload.
//
// idempotency_key is UNIQUE - emitEvent() treats a duplicate key as a no-op (returns
// the existing row), not an error, per CLAUDE.md Idempotency & Replayability.

export type WorkLedgerEventResult = 'success' | 'failure' | 'skipped' | 'pending';

interface WorkLedgerEventAttributes {
  event_id?: string;
  work_context_id?: string | null;
  ticket_id?: string | null;
  work_unit_id?: string | null;
  run_id?: string | null;
  trace_id: string;
  parent_event_id?: string | null;
  actor_type: string;
  actor_id: string;
  agent_version?: string | null;
  intent: string;
  domain: string;
  action_class: string;
  target_type: string;
  target_id?: string | null;
  environment?: string;
  risk_tier?: string;
  authorization_decision_id?: string | null;
  idempotency_key: string;
  before_state_ref?: string | null;
  after_state_ref?: string | null;
  result: WorkLedgerEventResult;
  reason_code?: string | null;
  duration_ms?: number | null;
  cost_usd?: number | null;
  source_record_type?: string | null;
  source_record_id?: string | null;
  occurred_at?: Date;
  created_at?: Date;
}

class WorkLedgerEvent extends Model<WorkLedgerEventAttributes> implements WorkLedgerEventAttributes {
  declare event_id: string;
  declare work_context_id: string | null;
  declare ticket_id: string | null;
  declare work_unit_id: string | null;
  declare run_id: string | null;
  declare trace_id: string;
  declare parent_event_id: string | null;
  declare actor_type: string;
  declare actor_id: string;
  declare agent_version: string | null;
  declare intent: string;
  declare domain: string;
  declare action_class: string;
  declare target_type: string;
  declare target_id: string | null;
  declare environment: string;
  declare risk_tier: string;
  declare authorization_decision_id: string | null;
  declare idempotency_key: string;
  declare before_state_ref: string | null;
  declare after_state_ref: string | null;
  declare result: WorkLedgerEventResult;
  declare reason_code: string | null;
  declare duration_ms: number | null;
  declare cost_usd: number | null;
  declare source_record_type: string | null;
  declare source_record_id: string | null;
  declare occurred_at: Date;
  declare created_at: Date;
}

WorkLedgerEvent.init(
  {
    event_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    work_context_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'work_contexts', key: 'id' },
    },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'tickets', key: 'id' },
    },
    work_unit_id: {
      // No ticket_work_units table exists yet (Milestone 3) - loose UUID, no FK.
      type: DataTypes.UUID,
      allowNull: true,
    },
    run_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'agent_runs', key: 'id' },
    },
    trace_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    parent_event_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'work_ledger_events', key: 'event_id' },
    },
    actor_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    actor_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    agent_version: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    intent: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    domain: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    action_class: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    target_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    target_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    environment: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'production',
    },
    risk_tier: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'R0',
    },
    authorization_decision_id: {
      // No approval_requests table exists yet (Milestone 4) - loose UUID, no FK.
      type: DataTypes.UUID,
      allowNull: true,
    },
    idempotency_key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    before_state_ref: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    after_state_ref: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    result: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    reason_code: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    cost_usd: {
      type: DataTypes.DECIMAL(12, 6),
      allowNull: true,
    },
    source_record_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    source_record_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    occurred_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'work_ledger_events',
    timestamps: false,
    indexes: [
      { fields: ['idempotency_key'], unique: true },
      { fields: ['ticket_id'] },
      { fields: ['run_id'] },
      { fields: ['trace_id'] },
      { fields: ['occurred_at'] },
      { fields: ['source_record_type', 'source_record_id'] },
    ],
  }
);

export default WorkLedgerEvent;
