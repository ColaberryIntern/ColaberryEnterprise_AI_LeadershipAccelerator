import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { ToolEnvironment } from '../db/ensureAgentDomainToolRequestSchema';

/**
 * AgentDomainToolGrant — one recorded grant of one tool to one agent.
 *
 * AF3.5. This is the RECORD behind `ai_agents.tools_granted`. The column is what the runtime
 * reads to decide whether an agent may act; this table is who said it could, which capability it
 * was granted for, and when.
 *
 * ## Why the record exists separately from the column
 *
 * `seedAgentRegistry()` rewrites `tools_granted` wholesale from source literals on every boot.
 * Without a record the seed cannot tell a human's grant from a stale value, so it reverted every
 * grant on the next deploy — and the reclassification that rides on that column then rewrote
 * `autonomy_level` as a side effect of the revert. The seed now unions the registry list with
 * the grants recorded here.
 *
 * ## What this row deliberately cannot say
 *
 * It carries no autonomy level, no `enabled`, no `abac_mode_override` and no verdict. A grant
 * and an autonomy level are two decisions, and a row that could express both is how they stop
 * being two.
 *
 * `capability_id` is deliberately not a foreign key: the 443 capabilities are JSON files on
 * disk, not rows, and the AF11.0 confirmation table takes the same position for the same reason.
 */
export interface AgentDomainToolGrantAttributes {
  id?: string;
  agent_id: string;
  /** Denormalised so the boot seed, which matches on `agent_name`, needs no join per agent. */
  agent_name: string;
  tool_name: string;
  /** The capability this grant serves. Must be confirmed at the moment of granting. */
  capability_id: string;
  /**
   * The tool request this grant answers, when it answers one. AF11.4.
   *
   * NULLABLE, and not a foreign key. Null is the ordinary case for a grant made directly
   * through the AF3.5 route — a capability promotion answers no request — so a `NOT NULL`
   * column would have forced a fake id into those rows. Not a foreign key for the same reason
   * `capability_id` is not one: the constraint would make deleting a request fail or cascade
   * into a grant, and a grant outranks the paperwork that prompted it.
   *
   * A re-grant does not rewrite this. If a tool was granted earlier for a promotion and a
   * request later asks for the same tool, the first row keeps the provenance it was written
   * with and the second call reports `unchanged: true` — otherwise the record would depend on
   * the order the two calls happened to arrive in.
   */
  change_request_id?: string | null;
  approved_by_identity: string;
  /**
   * Where this grant applies. Phase 2b. NOT NULL, unlike `change_request_id`: a grant that
   * answers no request is ordinary, but a grant that does not say where it applies is a
   * permission of unknown blast radius, and that is not a state worth being able to record.
   */
  environment: ToolEnvironment;
  /**
   * The datasets this grant covers, as `dataset_registry` names.
   *
   * EMPTY MEANS NO DATASET SCOPE WAS RECORDED, not "no data" and not "all data". A tool that
   * sends email reads no table and legitimately has an empty list here. On the request side the
   * same empty array additionally carries Ali's 4 Nov ruling — an unscoped read is fine on the
   * sandbox — which is why `agentToolGrantContract.ts` only treats the request's list as a
   * ceiling for a PRODUCTION grant.
   *
   * A re-grant does not rewrite this, for the same reason it does not rewrite
   * `change_request_id`: `findOrCreate` keeps the existing row. The contract refuses a re-grant
   * that would widen the scope rather than letting it report a success that changed nothing.
   */
  datasets: string[];
  approved_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

class AgentDomainToolGrant
  extends Model<AgentDomainToolGrantAttributes>
  implements AgentDomainToolGrantAttributes {
  declare id: string;
  declare agent_id: string;
  declare agent_name: string;
  declare tool_name: string;
  declare capability_id: string;
  declare change_request_id: string | null;
  declare approved_by_identity: string;
  declare environment: ToolEnvironment;
  declare datasets: string[];
  declare approved_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentDomainToolGrant.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    agent_id: { type: DataTypes.UUID, allowNull: false },
    agent_name: { type: DataTypes.TEXT, allowNull: false },
    tool_name: { type: DataTypes.TEXT, allowNull: false },
    capability_id: { type: DataTypes.TEXT, allowNull: false },
    change_request_id: { type: DataTypes.UUID, allowNull: true },
    approved_by_identity: { type: DataTypes.TEXT, allowNull: false },
    environment: { type: DataTypes.TEXT, allowNull: false },
    datasets: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    approved_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_domain_tool_grants',
    timestamps: false,
    indexes: [
      { fields: ['agent_id', 'tool_name'], unique: true },
      { fields: ['agent_name'] },
      { fields: ['change_request_id'] },
    ],
  },
);

export default AgentDomainToolGrant;
