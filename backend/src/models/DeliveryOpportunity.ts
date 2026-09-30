import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryOpportunity — one row of the AI-native Opportunity Map (master plan §Gate 4).
 *
 * One row per capability, answering the same questions for each: what traditional
 * software should do, where AI should recommend, where an agent may act, what stays a
 * human-only decision, what data it depends on, what trust it requires, and what it is
 * worth against what it costs.
 *
 * "DO NOT FORCE AI EVERYWHERE" is the master plan's instruction, and this table is how it
 * is enforced rather than merely intended. `human_only_decision` and
 * `traditional_software` are first-class columns, not an absence of AI columns — a
 * capability whose right answer is "a form and a database" records that as an answer,
 * instead of leaving a gap that later reads as an unexplored AI opportunity.
 *
 * `trust_requirement` is an **INPACT dimension reference, not free text** (Gate 0's
 * TRUST_BEFORE_INTELLIGENCE_INTEGRATION §"What this means for the gates"). Free text here
 * would make Gate 9's "Trust Before Intelligence coverage" unanswerable by query.
 */
export type OpportunityDisposition =
  | 'traditional_software'
  | 'ai_recommends'
  | 'agent_acts'
  | 'full_automation'
  | 'human_only';

export const OPPORTUNITY_DISPOSITIONS: readonly OpportunityDisposition[] = [
  'traditional_software',
  'ai_recommends',
  'agent_acts',
  'full_automation',
  'human_only',
];

export interface DeliveryOpportunityAttributes {
  id?: string;
  delivery_project_id: string;
  discovery_id?: string | null;
  capability: string;
  /** The recommended answer for this capability. */
  disposition?: OpportunityDisposition;
  traditional_software?: string | null;
  ai_recommendation?: string | null;
  agent_opportunity?: string | null;
  automation?: string | null;
  /** What must stay a human decision, and why. */
  human_only_decision?: string | null;
  data_dependency?: Record<string, any> | null;
  /** INPACT dimensions this capability requires. Validated against the registry. */
  trust_requirement?: string[] | null;
  /** 1-5 business value. Deliberately coarse: precision here is false. */
  value_score?: number | null;
  /** 1-5 delivery complexity. */
  complexity_score?: number | null;
  notes?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class DeliveryOpportunity
  extends Model<DeliveryOpportunityAttributes>
  implements DeliveryOpportunityAttributes
{
  declare id: string;
  declare delivery_project_id: string;
  declare discovery_id: string | null;
  declare capability: string;
  declare disposition: OpportunityDisposition;
  declare traditional_software: string | null;
  declare ai_recommendation: string | null;
  declare agent_opportunity: string | null;
  declare automation: string | null;
  declare human_only_decision: string | null;
  declare data_dependency: Record<string, any> | null;
  declare trust_requirement: string[] | null;
  declare value_score: number | null;
  declare complexity_score: number | null;
  declare notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryOpportunity.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    discovery_id: { type: DataTypes.UUID, allowNull: true },
    capability: { type: DataTypes.STRING(255), allowNull: false },
    // Defaults to the least autonomous answer. A capability nobody has classified is not
    // an agent opportunity by default — that default is how "AI everywhere" happens
    // without anyone deciding it.
    disposition: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'traditional_software',
    },
    traditional_software: { type: DataTypes.TEXT, allowNull: true },
    ai_recommendation: { type: DataTypes.TEXT, allowNull: true },
    agent_opportunity: { type: DataTypes.TEXT, allowNull: true },
    automation: { type: DataTypes.TEXT, allowNull: true },
    human_only_decision: { type: DataTypes.TEXT, allowNull: true },
    data_dependency: { type: DataTypes.JSONB, allowNull: true },
    trust_requirement: { type: DataTypes.JSONB, allowNull: true },
    value_score: { type: DataTypes.INTEGER, allowNull: true },
    complexity_score: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'delivery_opportunities',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      // One row per capability per project. A capability assessed twice with different
      // answers is not richer information, it is an unresolved disagreement.
      {
        unique: true,
        fields: ['delivery_project_id', 'capability'],
        name: 'delivery_opportunities_project_capability_unique',
      },
      { fields: ['discovery_id'], name: 'idx_delivery_opportunities_discovery' },
    ],
  },
);

export default DeliveryOpportunity;
