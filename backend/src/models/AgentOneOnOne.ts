import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AgentOneOnOne — a structured check-in record between a manager and their
 * agent. AI Workforce Management, Checkpoint D (2026-08-29) — first slice.
 *
 * Deliberately simple, pure record-keeping: an agenda set when scheduled,
 * outcome notes filled in when completed. No live external data dependency
 * and no computed/derived field — unlike AgentGoal (deferred, not built in
 * this slice), there is no fabrication risk here to design around; a 1:1
 * record is exactly what a human wrote, nothing inferred.
 *
 * No recurring-cadence scheduling in this slice — that needs a real
 * per-manager timezone (confirmed absent in Checkpoint A's
 * COMMUNICATION_MAP.md, flagged there as a hard prerequisite specifically
 * for the Report Subscription piece, not this one). This is a single,
 * manually-created 1:1 record; "always schedule my next 1:1 for Friday at
 * 2pm" is real, deliberately deferred scope.
 */
export type AgentOneOnOneStatus = 'scheduled' | 'completed';

export interface AgentOneOnOneAttributes {
  id?: string;
  agent_id: string;
  /** Nullable for the same reason as ManagerDirective.created_by_org_member_id
   * — a platform super_admin is never resolved to an org_member by the auth
   * gate. created_by_email is always populated and is the real attribution. */
  org_member_id?: string | null;
  created_by_email: string;
  agenda: string;
  outcome_notes?: string | null;
  status?: AgentOneOnOneStatus;
  held_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class AgentOneOnOne extends Model<AgentOneOnOneAttributes> implements AgentOneOnOneAttributes {
  declare id: string;
  declare agent_id: string;
  declare org_member_id: string | null;
  declare created_by_email: string;
  declare agenda: string;
  declare outcome_notes: string | null;
  declare status: AgentOneOnOneStatus;
  declare held_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentOneOnOne.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    agent_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'ai_agents', key: 'id' } },
    org_member_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'org_members', key: 'id' } },
    created_by_email: { type: DataTypes.STRING(255), allowNull: false },
    agenda: { type: DataTypes.TEXT, allowNull: false },
    outcome_notes: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'scheduled' },
    held_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_one_on_ones',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['agent_id', 'status', 'created_at'] }],
  }
);

export default AgentOneOnOne;
