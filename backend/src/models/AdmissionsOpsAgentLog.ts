import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AdmissionsOpsAgentLog (AO2.3): one row per agent request in the Admissions & Ops workspace (kit AGENT_CONTROL_SURFACE.md
 * section 6). Append-only: the database refuses UPDATE and DELETE (trigger in ensureAdmissionsOpsAgentSchema.ts), and
 * nothing in the app calls update or destroy. Columns match that schema exactly (modelParity test).
 */
export type AgentLogOutcome = 'done' | 'drafted' | 'sent_to_approval' | 'refused' | 'failed';

export interface AdmissionsOpsAgentLogAttributes {
  id?: string;
  request_id: string;
  created_at?: Date;
  actor_kind: 'agent' | 'person';
  agent_id: string | null;
  agent_version: string | null;
  on_behalf_of: string;
  mode: 'answer' | 'guide' | 'operate';
  intent_type: 'navigate' | 'invoke' | 'annotate' | 'decide';
  screen: string | null;
  action: string | null;
  level: number | null;
  params: Record<string, unknown>;
  sources_read: Array<{ system: string; ref: string }>;
  outcome: AgentLogOutcome;
  reason: string | null;
  approval_id: string | null;
}

class AdmissionsOpsAgentLog extends Model<AdmissionsOpsAgentLogAttributes> implements AdmissionsOpsAgentLogAttributes {
  declare id: string;
  declare request_id: string;
  declare created_at: Date;
  declare actor_kind: 'agent' | 'person';
  declare agent_id: string | null;
  declare agent_version: string | null;
  declare on_behalf_of: string;
  declare mode: 'answer' | 'guide' | 'operate';
  declare intent_type: 'navigate' | 'invoke' | 'annotate' | 'decide';
  declare screen: string | null;
  declare action: string | null;
  declare level: number | null;
  declare params: Record<string, unknown>;
  declare sources_read: Array<{ system: string; ref: string }>;
  declare outcome: AgentLogOutcome;
  declare reason: string | null;
  declare approval_id: string | null;
}

AdmissionsOpsAgentLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    request_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    actor_kind: { type: DataTypes.STRING(16), allowNull: false },
    agent_id: { type: DataTypes.STRING(64), allowNull: true },
    agent_version: { type: DataTypes.STRING(32), allowNull: true },
    on_behalf_of: { type: DataTypes.STRING(128), allowNull: false },
    mode: { type: DataTypes.STRING(16), allowNull: false },
    intent_type: { type: DataTypes.STRING(16), allowNull: false },
    screen: { type: DataTypes.STRING(32), allowNull: true },
    action: { type: DataTypes.STRING(64), allowNull: true },
    level: { type: DataTypes.SMALLINT, allowNull: true },
    params: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    sources_read: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    outcome: { type: DataTypes.STRING(24), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: true },
    approval_id: { type: DataTypes.UUID, allowNull: true },
  },
  { sequelize, tableName: 'admissions_ops_agent_log', timestamps: false },
);

export default AdmissionsOpsAgentLog;
