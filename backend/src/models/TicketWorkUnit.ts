import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ProofDesk Work Graph (Milestone 3 - Multi-Agent Work Graph). A TicketWorkUnit is
// one node in a ticket's DAG of work: a required capability, a target resource
// scope, acceptance criteria, a risk tier, an approval policy, a verification
// contract, how much parallelism it tolerates, and its expected output references.
// Opt-in — most tickets have zero work units; nothing auto-creates them yet.

export type WorkUnitStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'cancelled';

interface TicketWorkUnitAttributes {
  id?: string;
  ticket_id: string;
  work_context_id?: string | null;
  title: string;
  description?: string | null;
  required_capability: string;
  target_resource_scope?: string | null;
  acceptance_criteria?: string | null;
  status?: WorkUnitStatus;
  risk_tier?: string;
  approval_policy?: string;
  verification_contract?: string | null;
  eligible_parallelism?: number;
  expected_output_refs?: any[] | null;
  assigned_agent_name?: string | null;
  assigned_run_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class TicketWorkUnit extends Model<TicketWorkUnitAttributes> implements TicketWorkUnitAttributes {
  declare id: string;
  declare ticket_id: string;
  declare work_context_id: string | null;
  declare title: string;
  declare description: string | null;
  declare required_capability: string;
  declare target_resource_scope: string | null;
  declare acceptance_criteria: string | null;
  declare status: WorkUnitStatus;
  declare risk_tier: string;
  declare approval_policy: string;
  declare verification_contract: string | null;
  declare eligible_parallelism: number;
  declare expected_output_refs: any[] | null;
  declare assigned_agent_name: string | null;
  declare assigned_run_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

TicketWorkUnit.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tickets', key: 'id' },
    },
    work_context_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'work_contexts', key: 'id' },
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    required_capability: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    target_resource_scope: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    acceptance_criteria: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    risk_tier: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'R0',
    },
    approval_policy: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'auto',
    },
    verification_contract: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    eligible_parallelism: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    expected_output_refs: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    assigned_agent_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    assigned_run_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'agent_runs', key: 'id' },
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'ticket_work_units',
    timestamps: false,
    indexes: [
      { fields: ['ticket_id'] },
      { fields: ['status'] },
      { fields: ['required_capability'] },
    ],
  }
);

export default TicketWorkUnit;
