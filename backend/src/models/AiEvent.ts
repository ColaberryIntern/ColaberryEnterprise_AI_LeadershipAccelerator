import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ai_events — the unified AI event/telemetry table (TBI audit P1-1, event-model.md).
 *
 * One append-only row per AI step (LLM call, agent run, action, decision). It is the read
 * model the Trust Command Center queries for cost, traces, and outcomes. Today it is written
 * by the central llmCallWrapper; routing the remaining bypassing call sites through emitAiEvent
 * is the ongoing P1-2 work. cost_usd is computed from utils/aiCost.ts.
 */
export type AiEventOutcome = 'success' | 'failure' | 'blocked' | 'escalated';

interface AiEventAttributes {
  id?: string;
  trace_id?: string | null;
  event_type: string;
  workflow_id?: string | null;
  agent_id?: string | null;
  actor_type?: string | null;
  user_id?: string | null;
  external_system?: string | null;
  model?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  cost_usd?: number | null;
  duration_ms?: number | null;
  outcome: AiEventOutcome;
  error_class?: string | null;
  cache_hit?: boolean;
  metadata?: Record<string, any> | null;
  created_at?: Date;
}

class AiEvent extends Model<AiEventAttributes> implements AiEventAttributes {
  declare id: string;
  declare trace_id: string | null;
  declare event_type: string;
  declare workflow_id: string | null;
  declare agent_id: string | null;
  declare actor_type: string | null;
  declare user_id: string | null;
  declare external_system: string | null;
  declare model: string | null;
  declare prompt_tokens: number | null;
  declare completion_tokens: number | null;
  declare total_tokens: number | null;
  declare cost_usd: number | null;
  declare duration_ms: number | null;
  declare outcome: AiEventOutcome;
  declare error_class: string | null;
  declare cache_hit: boolean;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
}

AiEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    trace_id: { type: DataTypes.UUID, allowNull: true },
    event_type: { type: DataTypes.STRING(50), allowNull: false },
    workflow_id: { type: DataTypes.STRING(100), allowNull: true },
    agent_id: { type: DataTypes.STRING(100), allowNull: true },
    actor_type: { type: DataTypes.STRING(20), allowNull: true },
    user_id: { type: DataTypes.STRING(100), allowNull: true },
    external_system: { type: DataTypes.STRING(40), allowNull: true },
    model: { type: DataTypes.STRING(100), allowNull: true },
    prompt_tokens: { type: DataTypes.INTEGER, allowNull: true },
    completion_tokens: { type: DataTypes.INTEGER, allowNull: true },
    total_tokens: { type: DataTypes.INTEGER, allowNull: true },
    cost_usd: { type: DataTypes.DECIMAL(12, 6), allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    outcome: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'success' },
    error_class: { type: DataTypes.STRING(100), allowNull: true },
    cache_hit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'ai_events',
    timestamps: false,
    indexes: [
      { fields: ['event_type'] },
      { fields: ['created_at'] },
      { fields: ['trace_id'] },
      { fields: ['model'] },
      { fields: ['outcome'] },
    ],
  }
);

export default AiEvent;
