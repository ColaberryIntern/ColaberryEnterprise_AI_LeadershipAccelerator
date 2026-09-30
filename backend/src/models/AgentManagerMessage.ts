import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AgentManagerMessage — one turn in an AgentManagerConversation. AI Workforce
 * Management, Checkpoint C (2026-08-28).
 *
 * Deliberately NOT the same table as ChatMessage/RoomMessage (Checkpoint A's
 * own DOMAIN_REUSE_MAP.md verdict: those are structurally close but hard-FK'd
 * to visitor/enrollment identity — a schema change to loosen that would risk
 * Maya/the community system's own guarantees; new tables sharing the shape,
 * not the rows, is the safer additive path).
 *
 * No `intent_type` (ASK/INSTRUCT/CORRECT/APPROVE/COACH/SCHEDULE) or
 * confirmation-card state in this first slice — this is a purely
 * conversational channel with no side effects beyond the conversation
 * history itself. Classifying manager intent and gating durable-state-
 * creating actions behind a confirmation step is real, deliberately
 * deferred scope: nothing here lets a message create a ManagerDirective,
 * approve an inbox item, or change anything by itself.
 */
export type AgentManagerMessageRole = 'manager' | 'agent';

export interface AgentManagerMessageAttributes {
  id?: string;
  conversation_id: string;
  role: AgentManagerMessageRole;
  content: string;
  created_at?: Date;
}

class AgentManagerMessage extends Model<AgentManagerMessageAttributes> implements AgentManagerMessageAttributes {
  declare id: string;
  declare conversation_id: string;
  declare role: AgentManagerMessageRole;
  declare content: string;
  declare created_at: Date;
}

AgentManagerMessage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversation_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'agent_manager_conversations', key: 'id' } },
    role: { type: DataTypes.STRING(20), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_manager_messages',
    timestamps: false,
    indexes: [{ fields: ['conversation_id', 'created_at'] }],
  }
);

export default AgentManagerMessage;
