import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type {
  CandidateProductState,
  CandidateSource,
} from '../db/ensureAgentDomainCandidateSchema';

/**
 * AgentDomainCandidate — a capability a builder MIGHT take on, before anybody has decided anything.
 *
 * ## Why this is not a change request
 *
 * Most candidates never become a request. One candidate can become TWO: a screen request while the
 * product cannot do the thing, and a tool request once the builder has done it by hand and wants
 * the agent to take it over. A table whose rows are requests cannot express either fact.
 *
 * ## This model holds no decision
 *
 * No status, no approver, no approved_at, no declined_reason. The governance lives on
 * `AgentDomainChangeRequest` and only there — `docs/AGENT_TOOL_REQUEST_HANDOFF.md`: *"There is
 * already an approval spine. Do not build a second one."* The two nullable foreign keys below are
 * how this row reaches a decision: by pointing at the row that holds it, so there is one copy of
 * the fact and no way for two to disagree.
 *
 * Its position on the path is derived from those two rows rather than stored here. See
 * `services/agentDomain/candidateStages.ts`.
 *
 * ## `product_state` is the CATALOG vocabulary, not the tool request's
 *
 * `unchecked | in_app | partly | api_only | not_built` answers *what does the product have*.
 * `AgentDomainToolRequestDetail.tried_in_product` answers *what has the builder tried*, and its
 * values are different words on purpose. The only bridge between them is
 * `answerFrontDoor().implies_tried_in_product`, which is tested, so a candidate's product state
 * always translates into a filed request's field without a second mapping table.
 */
export interface AgentDomainCandidateAttributes {
  id: string;
  domain_key: string;
  /** What the capability is, in the builder's words. Unique within a domain. */
  title: string;
  /** Which of the four sources put this on the list. Provenance is a ranking input. */
  source: CandidateSource;
  /** Free text from that source: why they suggested it, or what they saw. */
  source_note: string | null;
  product_state: CandidateProductState;
  /** The `ProductFeature.feature_key` the front door matched, when it matched one. */
  matched_feature_key: string | null;
  /** When the builder did this by hand, in the app, with evidence. Null until they have. */
  proven_by_hand_at: Date | null;
  /** The change request asking Ali to build the missing screen, when one was filed. */
  screen_request_id: string | null;
  /** The change request asking for the tool, when one was filed. */
  tool_request_id: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class AgentDomainCandidate extends Model<AgentDomainCandidateAttributes>
  implements AgentDomainCandidateAttributes {
  declare id: string;
  declare domain_key: string;
  declare title: string;
  declare source: CandidateSource;
  declare source_note: string | null;
  declare product_state: CandidateProductState;
  declare matched_feature_key: string | null;
  declare proven_by_hand_at: Date | null;
  declare screen_request_id: string | null;
  declare tool_request_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentDomainCandidate.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    domain_key: { type: DataTypes.TEXT, allowNull: false },
    title: { type: DataTypes.TEXT, allowNull: false },
    source: { type: DataTypes.TEXT, allowNull: false },
    source_note: { type: DataTypes.TEXT, allowNull: true },
    product_state: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'unchecked' },
    matched_feature_key: { type: DataTypes.TEXT, allowNull: true },
    proven_by_hand_at: { type: DataTypes.DATE, allowNull: true },
    screen_request_id: { type: DataTypes.UUID, allowNull: true },
    tool_request_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_domain_candidates',
    timestamps: false,
    indexes: [
      { fields: ['domain_key'] },
      { fields: ['product_state'] },
      { fields: ['domain_key', 'title'], unique: true },
    ],
  },
);

export default AgentDomainCandidate;
