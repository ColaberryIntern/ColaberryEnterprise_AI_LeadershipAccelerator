import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AdmissionsOpsApproval (AO2.3): something prepared at level 3 or 5 that a person must decide (kit
 * AGENT_CONTROL_SURFACE.md section 6). Approve or Hold records who decided and when; the agent can never decide.
 * In this build nothing is sent on approval (M0 Q6 default). Columns match ensureAdmissionsOpsAgentSchema.ts exactly.
 */
export type ApprovalStatus = 'open' | 'approved' | 'held';

export interface AdmissionsOpsApprovalAttributes {
  id?: string;
  request_id: string;
  created_at?: Date;
  action: string;
  level: number;
  screen: string;
  summary: string;
  params: Record<string, unknown>;
  prepared_by_kind: 'agent' | 'person';
  prepared_by: string;
  on_behalf_of: string;
  status?: ApprovalStatus;
  decided_by?: string | null;
  decided_at?: Date | null;
}

class AdmissionsOpsApproval extends Model<AdmissionsOpsApprovalAttributes> implements AdmissionsOpsApprovalAttributes {
  declare id: string;
  declare request_id: string;
  declare created_at: Date;
  declare action: string;
  declare level: number;
  declare screen: string;
  declare summary: string;
  declare params: Record<string, unknown>;
  declare prepared_by_kind: 'agent' | 'person';
  declare prepared_by: string;
  declare on_behalf_of: string;
  declare status: ApprovalStatus;
  declare decided_by: string | null;
  declare decided_at: Date | null;
}

AdmissionsOpsApproval.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    request_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    action: { type: DataTypes.STRING(64), allowNull: false },
    level: { type: DataTypes.SMALLINT, allowNull: false },
    screen: { type: DataTypes.STRING(32), allowNull: false },
    summary: { type: DataTypes.TEXT, allowNull: false },
    params: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    prepared_by_kind: { type: DataTypes.STRING(16), allowNull: false },
    prepared_by: { type: DataTypes.STRING(128), allowNull: false },
    on_behalf_of: { type: DataTypes.STRING(128), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'open' },
    decided_by: { type: DataTypes.STRING(128), allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'admissions_ops_approvals', timestamps: false },
);

export default AdmissionsOpsApproval;
