import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { PackageRecommendation } from '../db/ensureToolRequestPackageSchema';
import type {
  PackageFinding,
  PackageOption,
} from '../services/agentDomain/toolRequestPackageContract';

/**
 * AgentDomainToolRequestPackage — AF11.8. The case for deciding a tool request, hung one-to-one
 * off the request it argues for.
 *
 * `change_request_id` is the PRIMARY KEY rather than a foreign key beside a synthetic id, which is
 * the one-to-one expressed as a constraint instead of a convention: two packages for one request
 * cannot exist, so no reader ever has to work out which one Ali actually read.
 *
 * ## This model holds no decision, and that is the point
 *
 * No status, no verb, no chosen option, no approver, no decided_at. The governance lives on
 * `AgentDomainChangeRequest` and the decision log is `AgentDomainToolRequestDecision`.
 * `docs/AGENT_TOOL_REQUEST_HANDOFF.md`: *"There is already an approval spine. Do not build a
 * second one."* The options live here because the AGENT writes them; which one was chosen lives on
 * the decision because a HUMAN writes that, and keeping them apart is what stops the request from
 * being able to answer itself.
 *
 * ## The JSONB columns are typed HERE, which is the whole reason they are allowed to be JSONB
 *
 * `CLAUDE.md` forbids untyped JSON blobs as inter-module currency. `options` and `key_findings`
 * are arrays of a shape `toolRequestPackageContract.ts` defines and gates, `risk_can_break`,
 * `risk_cannot_break` and `steps_that_follow` are `string[]`, and nothing above this model ever
 * receives an `any`. The house precedent for a list on a row is `ai_agents.tools_granted`, which
 * is JSONB for the same reason.
 *
 * ## Why `simulated_at` is a timestamp and not a sentence
 *
 * Block 8 is the only one whose value is that it ACTUALLY HAPPENED. A date can be compared against
 * the request's own age and go stale; "recently" cannot. The gate refuses one dated in the future
 * for the same reason — that is the signature of a block filled in from a template rather than
 * from a run.
 */
export interface AgentDomainToolRequestPackageAttributes {
  change_request_id: string;
  executive_summary: string;
  problem: string;
  key_findings: PackageFinding[];
  /** Blocks 4 and 10 of the ten. `nothing` is never in here; it is always available instead. */
  options: PackageOption[];
  recommendation: PackageRecommendation;
  recommendation_reason: string;
  impact: string;
  risk_can_break: string[];
  /** The half that makes the other half believable, and the one an approver says yes on. */
  risk_cannot_break: string[];
  simulated_action: string;
  simulated_against: string;
  simulated_at: Date;
  steps_that_follow: string[];
  created_at?: Date;
  updated_at?: Date;
}

class AgentDomainToolRequestPackage extends Model<AgentDomainToolRequestPackageAttributes>
  implements AgentDomainToolRequestPackageAttributes {
  declare change_request_id: string;
  declare executive_summary: string;
  declare problem: string;
  declare key_findings: PackageFinding[];
  declare options: PackageOption[];
  declare recommendation: PackageRecommendation;
  declare recommendation_reason: string;
  declare impact: string;
  declare risk_can_break: string[];
  declare risk_cannot_break: string[];
  declare simulated_action: string;
  declare simulated_against: string;
  declare simulated_at: Date;
  declare steps_that_follow: string[];
  declare created_at: Date;
  declare updated_at: Date;
}

AgentDomainToolRequestPackage.init(
  {
    change_request_id: { type: DataTypes.UUID, primaryKey: true },
    executive_summary: { type: DataTypes.TEXT, allowNull: false },
    problem: { type: DataTypes.TEXT, allowNull: false },
    key_findings: { type: DataTypes.JSONB, allowNull: false },
    options: { type: DataTypes.JSONB, allowNull: false },
    recommendation: { type: DataTypes.TEXT, allowNull: false },
    recommendation_reason: { type: DataTypes.TEXT, allowNull: false },
    impact: { type: DataTypes.TEXT, allowNull: false },
    risk_can_break: { type: DataTypes.JSONB, allowNull: false },
    risk_cannot_break: { type: DataTypes.JSONB, allowNull: false },
    simulated_action: { type: DataTypes.TEXT, allowNull: false },
    simulated_against: { type: DataTypes.TEXT, allowNull: false },
    simulated_at: { type: DataTypes.DATE, allowNull: false },
    steps_that_follow: { type: DataTypes.JSONB, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_domain_tool_request_packages',
    timestamps: false,
  },
);

export default AgentDomainToolRequestPackage;
