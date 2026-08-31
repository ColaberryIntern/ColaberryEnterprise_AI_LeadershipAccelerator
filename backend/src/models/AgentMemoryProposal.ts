import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AgentMemoryProposalStatus = 'pending' | 'approved' | 'rejected';

/**
 * AgentMemoryProposal — AI Workforce Management, Checkpoint E. The real
 * "an agent learned something -> evidence attached -> a human approved it
 * -> it's used at runtime" object MEMORY_MAP.md's Checkpoint A research
 * confirmed did not exist anywhere in this codebase (every existing
 * memory-shaped model has no human-approval gate; `OpenclawLearning.applied`
 * is a real, confirmed-dead boolean nobody ever checks — the anti-pattern
 * this model exists to not repeat).
 *
 * Status lifecycle modeled on `ProposedAgentAction`'s real, live 4+-state
 * pattern (MEMORY_MAP.md's own verdict on the strongest existing
 * precedent), simplified to 3 states: this object has no "apply a DB
 * write" step to distinguish from approval — approval itself is what makes
 * a memory real, since `getApprovedMemoryTexts()` (the runtime read path)
 * queries `status = 'approved'` directly. There is no separate
 * "applied" phase to fake or forget to check.
 *
 * The hard bar this model must clear, stated in TARGET_ARCHITECTURE.md:
 * approval state must be PROVABLY READ by the runtime context assembler
 * before this ships, not just written. See agentSystemPrompt.ts and
 * agentManagerConversationPrompt.ts, both extended in this same piece to
 * call getApprovedMemoryTexts() — with regression tests proving the
 * injection actually happens, mirroring ManagerDirective's own proof.
 *
 * Deliberately NOT built here: any automated pipeline that observes agent
 * behavior and proposes memories on its own. This piece is the approval
 * object and the runtime read path only; proposals are created through the
 * API by a real person (a manager or admin), matching how ManagerDirective
 * itself is manager-authored, not auto-generated. An auto-learning source
 * is real, separable, future scope.
 */
export interface AgentMemoryProposalAttributes {
  id?: string;
  agent_id: string;
  content: string;
  evidence?: string | null;
  proposed_by_email: string;
  status?: AgentMemoryProposalStatus;
  reviewed_by_email?: string | null;
  reviewed_at?: Date | null;
  review_notes?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class AgentMemoryProposal extends Model<AgentMemoryProposalAttributes> implements AgentMemoryProposalAttributes {
  declare id: string;
  declare agent_id: string;
  declare content: string;
  declare evidence: string | null;
  declare proposed_by_email: string;
  declare status: AgentMemoryProposalStatus;
  declare reviewed_by_email: string | null;
  declare reviewed_at: Date | null;
  declare review_notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentMemoryProposal.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    agent_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'ai_agents', key: 'id' },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    evidence: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    proposed_by_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    reviewed_by_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    review_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'agent_memory_proposals',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['agent_id', 'status'], name: 'idx_agent_memory_proposals_agent_status' },
    ],
  }
);

export default AgentMemoryProposal;
