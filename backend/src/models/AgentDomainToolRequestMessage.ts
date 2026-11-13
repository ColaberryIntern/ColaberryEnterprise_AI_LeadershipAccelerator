import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AgentDomainToolRequestMessage — one message in the conversation on a tool request.
 *
 * Agent Tools Phase 2. Ali: *"They can request and manage communication between me on the
 * request and keeping track until it is built out and handed over and we should track everything
 * associated so all parties can see what's going on."*
 *
 * ## Why this is not the decision log
 *
 * `AgentDomainToolRequestDecision` records the four VERBS and the words each verb requires. A
 * verb is not a conversation. "Does this need to cover the sandbox too?" and "no, production read
 * only" are neither an approval nor a denial, and before this table they happened in chat and
 * were lost to everyone who was not in that chat.
 *
 * ## What it deliberately cannot hold
 *
 * No `verb`, no `status`, no `tool_name`, no `capability_id`, no `autonomy_level`. Those belong
 * to the request and to the decision. A message that could carry them would be a second way to
 * decide things, which is exactly the "second approval spine" the AF11 design doc warns against.
 * Because this table has nowhere to put a decision, it can never disagree with
 * `agent_domain_change_requests.status` about whether a request is open.
 *
 * ## Append-only
 *
 * No UPDATE path and no `edited_at`. An edited message is a changed record of what somebody
 * said; a correction is a new message. A column nothing writes is a promise the code does not
 * keep, so there isn't one.
 */
export interface AgentDomainToolRequestMessageAttributes {
  id?: string;
  change_request_id: string;
  /** Who said it. Refused blank at the database by chk_adtrm_author_is_not_blank. */
  author_identity: string;
  posted_at?: Date;
  /** What they said. Refused blank at the database by chk_adtrm_body_is_not_blank. */
  body: string;
  created_at?: Date;
}

class AgentDomainToolRequestMessage
  extends Model<AgentDomainToolRequestMessageAttributes>
  implements AgentDomainToolRequestMessageAttributes {
  declare id: string;
  declare change_request_id: string;
  declare author_identity: string;
  declare posted_at: Date;
  declare body: string;
  declare created_at: Date;
}

AgentDomainToolRequestMessage.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    change_request_id: { type: DataTypes.UUID, allowNull: false },
    author_identity: { type: DataTypes.TEXT, allowNull: false },
    posted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    body: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_domain_tool_request_messages',
    timestamps: false,
    indexes: [{ fields: ['change_request_id', 'posted_at'] }],
  },
);

export default AgentDomainToolRequestMessage;
