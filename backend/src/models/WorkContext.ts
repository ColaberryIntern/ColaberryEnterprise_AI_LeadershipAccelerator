import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ProofDesk Work Ledger (Milestone 1 - Foundation). A WorkContext is a loose
// grouping envelope for related agent_runs / work_ledger_events - typically one per
// ticket, but not required to have a ticket (e.g. a standalone directive run).
// Shadow-mode only: nothing outside workLedger/* reads or writes this table in M1.

export type WorkContextType = 'ticket' | 'directive' | 'standalone';
export type WorkContextStatus = 'active' | 'closed';

interface WorkContextAttributes {
  id?: string;
  ticket_id?: string | null;
  context_type: WorkContextType;
  title?: string | null;
  status?: WorkContextStatus;
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class WorkContext extends Model<WorkContextAttributes> implements WorkContextAttributes {
  declare id: string;
  declare ticket_id: string | null;
  declare context_type: WorkContextType;
  declare title: string | null;
  declare status: WorkContextStatus;
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

WorkContext.init(
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
    context_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'work_contexts',
    timestamps: false,
    indexes: [{ fields: ['ticket_id'] }, { fields: ['context_type'] }, { fields: ['status'] }],
  }
);

export default WorkContext;
