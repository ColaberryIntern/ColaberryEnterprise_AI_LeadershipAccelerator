import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type {
  ToolEnvironment,
  ToolProductState,
  ToolRunFrequency,
} from '../db/ensureAgentDomainToolRequestSchema';

/**
 * AgentDomainToolRequestDetail — AF11.1. The six field groups a `kind = 'tool'` change request
 * carries, hung one-to-one off the request it belongs to.
 *
 * `change_request_id` is the PRIMARY KEY, not a foreign key beside a synthetic id of its own. That
 * is the one-to-one expressed as a constraint rather than as a convention somebody has to keep: two
 * detail rows for one request cannot exist, so no reader ever has to decide which one is current.
 *
 * ## This model holds no decision, and that is deliberate
 *
 * No status, no approver, no approved_at, no declined_reason. The governance lives on
 * `AgentDomainChangeRequest` and only there — `docs/AGENT_TOOL_REQUEST_HANDOFF.md`: *"There is
 * already an approval spine. Do not build a second one."* A table that cannot express a decision
 * cannot quietly become the second one.
 *
 * ## The four `JSONB` columns are typed `string[]` HERE, which is the whole point
 *
 * `CLAUDE.md` forbids untyped JSON blobs as inter-module currency. These are `JSONB` in Postgres
 * because that is how `ai_agents.tools_granted` stores a list of strings in this repo, and because
 * `reads`/`produces` are `string[]` in the catalog already. Everything above this model receives
 * `string[]`.
 *
 * ## Why `side_effects` and `reversible` are nullable when the contract calls them mandatory
 *
 * They are mandatory ON A WRITE. A read-only tool has nothing to say in either, and a column that
 * is `NOT NULL` for every row would have forced an empty string into them, which reads as "answered
 * with nothing" rather than "not applicable". The conditional requirement is enforced in two
 * places instead: `chk_adtr_write_declares_effects` in the table, and `side_effects_missing` /
 * `reversibility_undeclared` in `toolRequestContract.ts` so the person filing gets a sentence
 * rather than a constraint violation.
 */
export interface AgentDomainToolRequestDetailAttributes {
  change_request_id: string;
  agent_id: string;
  domain_key: string;
  tool_name: string;
  purpose: string;
  reads: string[];
  produces: string[];
  capability_id: string;
  task_unblocked: string;
  task_key: string;
  manual_today: string;
  /**
   * AF11.7. The email of the person who will act on the output, in the people record's own
   * spelling. Not a role and not free text — see `services/agentDomain/actorRoster.ts`.
   */
  acts_on_output: string;
  /** The number that decides whether this tool worked. */
  judged_threshold: string;
  /** What the system already records that would produce that number. */
  judged_measured_from: string;
  /**
   * Always `not_built` on a stored row — `chk_adtr_build_request_is_unbuilt` enforces it, because
   * this is the detail of a BUILD request. The type carries all three states because the gate has
   * to recognize all three in order to route the other two away from here.
   */
  tried_in_product: ToolProductState;
  /** What the product cannot do today. The case for building anything at all. */
  missing_from_product: string;
  /** `YYYY-MM-DD`. A `DATE` column, so no timezone can move it a day either way. */
  needed_by: string;
  run_frequency: ToolRunFrequency;
  touches: string[];
  environment: ToolEnvironment;
  read_datasets: string[];
  inputs: string[];
  writes: boolean;
  side_effects?: string | null;
  reversible?: boolean | null;
  reversibility_note?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class AgentDomainToolRequestDetail extends Model<AgentDomainToolRequestDetailAttributes>
  implements AgentDomainToolRequestDetailAttributes {
  declare change_request_id: string;
  declare agent_id: string;
  declare domain_key: string;
  declare tool_name: string;
  declare purpose: string;
  declare reads: string[];
  declare produces: string[];
  declare capability_id: string;
  declare task_unblocked: string;
  /** AF12.1. Groups the several tools one task needs. */
  declare task_key: string;
  declare manual_today: string;
  declare acts_on_output: string;
  declare judged_threshold: string;
  declare judged_measured_from: string;
  declare tried_in_product: ToolProductState;
  declare missing_from_product: string;
  declare needed_by: string;
  declare run_frequency: ToolRunFrequency;
  declare touches: string[];
  declare environment: ToolEnvironment;
  declare read_datasets: string[];
  declare inputs: string[];
  declare writes: boolean;
  declare side_effects: string | null;
  declare reversible: boolean | null;
  declare reversibility_note: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentDomainToolRequestDetail.init(
  {
    change_request_id: { type: DataTypes.UUID, primaryKey: true },
    agent_id: { type: DataTypes.UUID, allowNull: false },
    domain_key: { type: DataTypes.TEXT, allowNull: false },
    tool_name: { type: DataTypes.TEXT, allowNull: false },
    purpose: { type: DataTypes.TEXT, allowNull: false },
    reads: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    produces: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    capability_id: { type: DataTypes.TEXT, allowNull: false },
    task_unblocked: { type: DataTypes.TEXT, allowNull: false },
    task_key: { type: DataTypes.TEXT, allowNull: false },
    manual_today: { type: DataTypes.TEXT, allowNull: false },
    acts_on_output: { type: DataTypes.TEXT, allowNull: false },
    judged_threshold: { type: DataTypes.TEXT, allowNull: false },
    judged_measured_from: { type: DataTypes.TEXT, allowNull: false },
    tried_in_product: { type: DataTypes.TEXT, allowNull: false },
    missing_from_product: { type: DataTypes.TEXT, allowNull: false },
    needed_by: { type: DataTypes.DATEONLY, allowNull: false },
    run_frequency: { type: DataTypes.TEXT, allowNull: false },
    touches: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    environment: { type: DataTypes.TEXT, allowNull: false },
    read_datasets: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    inputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    writes: { type: DataTypes.BOOLEAN, allowNull: false },
    side_effects: { type: DataTypes.TEXT, allowNull: true },
    reversible: { type: DataTypes.BOOLEAN, allowNull: true },
    reversibility_note: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_domain_tool_request_details',
    timestamps: false,
    indexes: [
      { fields: ['tool_name'] },
      { fields: ['capability_id'] },
      { fields: ['agent_id'] },
    ],
  },
);

export default AgentDomainToolRequestDetail;
