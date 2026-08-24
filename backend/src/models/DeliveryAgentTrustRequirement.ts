import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryAgentTrustRequirement — one INPACT dimension, addressed for one agent.
 *
 * Master plan §Gate 5: every production-bound agent must address all six INPACT
 * dimensions with a **requirement, implementation evidence, evaluation, owner and
 * status**. Five columns, six rows per agent — that is the entire shape.
 *
 * WHY A ROW PER DIMENSION RATHER THAN A JSONB BLOB ON THE AGENT. The gate has to answer
 * "which dimensions are unaddressed, and who owns each one" as a query. A blob makes that
 * a parse, makes partial completion invisible in a list view, and makes it impossible to
 * put a foreign key on the owner. Six small rows are also six things a person can be
 * assigned; a blob is one thing nobody owns.
 *
 * THE SCORE IS THE BOOK'S 1-6, NOT A PERCENTAGE. See `modules/delivery/inpact.ts` — the
 * canonical source defines INPACT as six dimensions scored 1-6 for a 36-point maximum,
 * reported on a 100-point scale for executives. The raw score lives here; the headline is
 * derived, never stored, so the underlying assessment stays auditable.
 */
export type TrustRequirementStatus =
  | 'not_started'
  | 'specified'
  | 'implemented'
  | 'evaluated'
  | 'accepted';

export const TRUST_REQUIREMENT_STATUSES: readonly TrustRequirementStatus[] = [
  'not_started',
  'specified',
  'implemented',
  'evaluated',
  'accepted',
];

export interface DeliveryAgentTrustRequirementAttributes {
  id?: string;
  agent_definition_id: string;
  /** One of the six INPACT dimensions. Validated against the registry at the boundary. */
  dimension: string;
  /** What this agent needs from this dimension, in this project's terms. */
  requirement?: string | null;
  /** How it is met. Free text plus references — the "we built it" half. */
  implementation_evidence?: string | null;
  /** How it is checked, and by what. The "and we proved it" half. */
  evaluation?: string | null;
  owner_identity_id?: string | null;
  status?: TrustRequirementStatus;
  /** The book's 1-6 score for this dimension. Null until assessed. */
  score?: number | null;
  assessed_at?: Date | null;
  notes?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class DeliveryAgentTrustRequirement
  extends Model<DeliveryAgentTrustRequirementAttributes>
  implements DeliveryAgentTrustRequirementAttributes
{
  declare id: string;
  declare agent_definition_id: string;
  declare dimension: string;
  declare requirement: string | null;
  declare implementation_evidence: string | null;
  declare evaluation: string | null;
  declare owner_identity_id: string | null;
  declare status: TrustRequirementStatus;
  declare score: number | null;
  declare assessed_at: Date | null;
  declare notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryAgentTrustRequirement.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    agent_definition_id: { type: DataTypes.UUID, allowNull: false },
    dimension: { type: DataTypes.STRING(20), allowNull: false },
    requirement: { type: DataTypes.TEXT, allowNull: true },
    implementation_evidence: { type: DataTypes.TEXT, allowNull: true },
    evaluation: { type: DataTypes.TEXT, allowNull: true },
    owner_identity_id: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'not_started' },
    score: { type: DataTypes.INTEGER, allowNull: true },
    assessed_at: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'delivery_agent_trust_requirements',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      // One row per (agent, dimension). Two rows for the same dimension would make
      // "is Permitted addressed?" depend on which one a query read first.
      {
        unique: true,
        fields: ['agent_definition_id', 'dimension'],
        name: 'delivery_agent_trust_requirements_unique',
      },
    ],
  },
);

export default DeliveryAgentTrustRequirement;
