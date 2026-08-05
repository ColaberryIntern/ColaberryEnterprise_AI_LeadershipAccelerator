import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ProofDesk Governance (Milestone 4). A durable, append-mostly record of one
// authorization decision — the slot M1's WorkLedgerEvent.authorization_decision_id
// column reserved ("No approval_requests table exists yet (Milestone 4)").
//
// SHADOW MODE ONLY: this milestone's code never sets `status` to anything but
// `shadow_logged`. `pending`/`approved`/`rejected`/`expired` are modeled now so a
// future enforcement-flip milestone doesn't need a schema change, but nothing in this
// milestone writes those values or reads `status` to gate a real action — see
// agentActionAuthorizationBridge.ts, which is a pure logger, never a blocker.
//
// One row per ledger event that produced a would-require-approval/would-block verdict
// (unique on event_id — a retry that re-emits the same ledger event, via its
// idempotency key, must not create a second approval_requests row).

export type ApprovalVerdict = 'would_allow' | 'would_require_approval' | 'would_block';
export type ApprovalStatus = 'shadow_logged' | 'pending' | 'approved' | 'rejected' | 'expired';

interface ApprovalRequestAttributes {
  id?: string;
  ticket_id?: string | null;
  work_unit_id?: string | null;
  run_id?: string | null;
  event_id?: string | null;
  agent_name: string;
  action: string;
  risk_tier?: string;
  autonomy_level?: string | null;
  verdict: ApprovalVerdict;
  reason_code?: string | null;
  prepared_action?: Record<string, any> | null;
  approval_scope?: Record<string, any> | null;
  status?: ApprovalStatus;
  expires_at?: Date | null;
  decided_by?: string | null;
  decided_at?: Date | null;
  decision_channel?: string | null;
  created_at?: Date;
}

class ApprovalRequest extends Model<ApprovalRequestAttributes> implements ApprovalRequestAttributes {
  declare id: string;
  declare ticket_id: string | null;
  declare work_unit_id: string | null;
  declare run_id: string | null;
  declare event_id: string | null;
  declare agent_name: string;
  declare action: string;
  declare risk_tier: string;
  declare autonomy_level: string | null;
  declare verdict: ApprovalVerdict;
  declare reason_code: string | null;
  declare prepared_action: Record<string, any> | null;
  declare approval_scope: Record<string, any> | null;
  declare status: ApprovalStatus;
  declare expires_at: Date | null;
  declare decided_by: string | null;
  declare decided_at: Date | null;
  declare decision_channel: string | null;
  declare created_at: Date;
}

ApprovalRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'tickets', key: 'id' },
    },
    work_unit_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'ticket_work_units', key: 'id' },
    },
    run_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'agent_runs', key: 'id' },
    },
    event_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'work_ledger_events', key: 'event_id' },
    },
    agent_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    risk_tier: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'R0',
    },
    autonomy_level: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    verdict: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    reason_code: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    prepared_action: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    approval_scope: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'shadow_logged',
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    decided_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    decided_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    decision_channel: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'approval_requests',
    timestamps: false,
    indexes: [
      { fields: ['event_id'], unique: true },
      { fields: ['ticket_id'] },
      { fields: ['work_unit_id'] },
      { fields: ['run_id'] },
      { fields: ['agent_name'] },
      { fields: ['verdict'] },
      { fields: ['risk_tier'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  },
);

export default ApprovalRequest;
