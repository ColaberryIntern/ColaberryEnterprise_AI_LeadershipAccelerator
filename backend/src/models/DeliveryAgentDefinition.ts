import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryAgentDefinition — the contract for one agent in a delivery project.
 *
 * NAMED `Delivery*` DELIBERATELY. Gate 0's SCHEMA_CONFLICTS C-06 found the `Agent*`
 * namespace already crowded with the **ops** fleet — `AgentRun`, `AgentTask`,
 * `AgentCreationProposal`, `AgentPerformanceMetric`, `AgentAttachment`, `AgentWriteAudit`.
 * A delivery agent built for a client's system is a different thing from an ops agent that
 * runs Colaberry, and a bare `AgentDefinition` would read as the latter.
 *
 * WHAT MAKES THIS A CONTRACT RATHER THAN A DESCRIPTION: `can_read`, `can_write`,
 * `prohibited_actions` and `autonomy_boundary` are the agent's permission envelope, and
 * `evaluation_suite` is how anyone checks it still holds. An agent definition with a
 * purpose and no boundary is marketing copy.
 *
 * `approved_version` is separate from `version` on purpose. The working definition may
 * move ahead of what was approved, and a production-bound agent is gated on the approved
 * one — otherwise editing a definition would silently widen a live agent's authority.
 */
export type AgentDefinitionStatus = 'draft' | 'proposed' | 'approved' | 'retired';

export const AGENT_DEFINITION_STATUSES: readonly AgentDefinitionStatus[] = [
  'draft',
  'proposed',
  'approved',
  'retired',
];

/** Whether this agent is bound for production, which is what triggers the trust gate. */
export type AgentDeploymentIntent = 'design_only' | 'internal_tool' | 'production_bound';

export const AGENT_DEPLOYMENT_INTENTS: readonly AgentDeploymentIntent[] = [
  'design_only',
  'internal_tool',
  'production_bound',
];

export interface DeliveryAgentDefinitionAttributes {
  id?: string;
  delivery_project_id: string;
  name: string;
  purpose?: string | null;
  /** The business owner accountable for what this agent does. */
  business_owner_identity_id?: string | null;
  /** The human who operates it day to day. May differ from the business owner. */
  human_owner_identity_id?: string | null;
  inputs?: Record<string, any> | null;
  outputs?: Record<string, any> | null;
  tools?: string[] | null;
  can_read?: string[] | null;
  can_write?: string[] | null;
  prohibited_actions?: string[] | null;
  /** The furthest this agent may act without a human. Mirrors the delivery risk ladder. */
  autonomy_boundary?: string | null;
  approval_rules?: Record<string, any> | null;
  escalation_rules?: Record<string, any> | null;
  /** Which of the 7 layers this agent depends on being operational. */
  layer_dependencies?: string[] | null;
  /** GOALS operating measures for this agent, scored 1-5 per dimension. */
  goals_measures?: Record<string, any> | null;
  evaluation_suite?: Record<string, any> | null;
  deployment_intent?: AgentDeploymentIntent;
  status?: AgentDefinitionStatus;
  version?: number;
  /** The version currently approved. A production-bound agent is gated on THIS. */
  approved_version?: number | null;
  approved_by_identity_id?: string | null;
  approved_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class DeliveryAgentDefinition
  extends Model<DeliveryAgentDefinitionAttributes>
  implements DeliveryAgentDefinitionAttributes
{
  declare id: string;
  declare delivery_project_id: string;
  declare name: string;
  declare purpose: string | null;
  declare business_owner_identity_id: string | null;
  declare human_owner_identity_id: string | null;
  declare inputs: Record<string, any> | null;
  declare outputs: Record<string, any> | null;
  declare tools: string[] | null;
  declare can_read: string[] | null;
  declare can_write: string[] | null;
  declare prohibited_actions: string[] | null;
  declare autonomy_boundary: string | null;
  declare approval_rules: Record<string, any> | null;
  declare escalation_rules: Record<string, any> | null;
  declare layer_dependencies: string[] | null;
  declare goals_measures: Record<string, any> | null;
  declare evaluation_suite: Record<string, any> | null;
  declare deployment_intent: AgentDeploymentIntent;
  declare status: AgentDefinitionStatus;
  declare version: number;
  declare approved_version: number | null;
  declare approved_by_identity_id: string | null;
  declare approved_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryAgentDefinition.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(160), allowNull: false },
    purpose: { type: DataTypes.TEXT, allowNull: true },
    business_owner_identity_id: { type: DataTypes.UUID, allowNull: true },
    human_owner_identity_id: { type: DataTypes.UUID, allowNull: true },
    inputs: { type: DataTypes.JSONB, allowNull: true },
    outputs: { type: DataTypes.JSONB, allowNull: true },
    tools: { type: DataTypes.JSONB, allowNull: true },
    can_read: { type: DataTypes.JSONB, allowNull: true },
    can_write: { type: DataTypes.JSONB, allowNull: true },
    prohibited_actions: { type: DataTypes.JSONB, allowNull: true },
    // Defaults to the most restrictive rung of the delivery risk ladder. An agent whose
    // boundary nobody has set may read and nothing else.
    autonomy_boundary: { type: DataTypes.STRING(4), allowNull: false, defaultValue: 'R0' },
    approval_rules: { type: DataTypes.JSONB, allowNull: true },
    escalation_rules: { type: DataTypes.JSONB, allowNull: true },
    layer_dependencies: { type: DataTypes.JSONB, allowNull: true },
    goals_measures: { type: DataTypes.JSONB, allowNull: true },
    evaluation_suite: { type: DataTypes.JSONB, allowNull: true },
    // Defaults to design_only. An agent nobody has declared production-bound is not one,
    // so the trust gate is opted INTO rather than accidentally escaped.
    deployment_intent: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'design_only',
    },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    approved_version: { type: DataTypes.INTEGER, allowNull: true },
    approved_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'delivery_agent_definitions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['delivery_project_id', 'name'],
        name: 'delivery_agent_definitions_project_name_unique',
      },
      {
        fields: ['delivery_project_id', 'deployment_intent'],
        name: 'idx_delivery_agent_definitions_intent',
      },
    ],
  },
);

export default DeliveryAgentDefinition;
