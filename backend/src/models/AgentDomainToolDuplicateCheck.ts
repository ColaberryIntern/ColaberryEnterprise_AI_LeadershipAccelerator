import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { DuplicateCandidate } from '../services/agentDomain/toolDuplicateCheck';

/**
 * AgentDomainToolDuplicateCheck — AF11.2. The answer to "do we already have a tool that does
 * this?", as it was computed when the request was filed.
 *
 * `change_request_id` is the PRIMARY KEY rather than a foreign key beside an id of its own, so the
 * one-to-one is a constraint instead of a convention: two answers for one request cannot exist, and
 * no reader ever has to decide which is current. Same shape, same reason, as
 * `AgentDomainToolRequestDetail`.
 *
 * ## This row is ADVICE. It cannot become a decision
 *
 * There is no verdict, no approver, no status and no reason code. AF11.2 puts both of the available
 * opinions out of scope in its own words: it must not assign the matched tool, because *"a
 * recommendation is not a grant"*, and it must not reject the request, because *"the match is
 * advice to the approver, never a refusal"*. A table with nowhere to put a verdict cannot drift
 * into holding one.
 *
 * ## Why the ranking is one `JSONB` column and not a candidates table
 *
 * Because the answer is atomic: a half-written ranking is a different answer from the one that was
 * computed, and the approver would be reading two of three candidates with nothing saying the
 * third went missing. The full reasoning, and the `chk_adtdc_count_matches` constraint that stops
 * the count disagreeing with the list, are in `db/ensureAgentDomainToolDuplicateCheckSchema.ts`.
 *
 * It is typed on both sides rather than loose: `DuplicateCandidate[]` from `toolDuplicateCheck.ts`
 * going in, and `projectDuplicateCheck()` coming out, so nothing above this model receives an
 * untyped value.
 *
 * ## `catalog_absent` is the field that stops a zero lying
 *
 * A check that found nothing is good news, and good news is the kind of zero nobody verifies. The
 * row existing says the check RAN; `catalog_absent` says whether it could see anything when it
 * did. Zero candidates with `catalog_absent = false` is a genuinely novel request. Zero candidates
 * with `catalog_absent = true` means the detector was blind and the zero means nothing. No row at
 * all means it never ran. Those three are not the same state and this table can tell them apart.
 */
export interface AgentDomainToolDuplicateCheckAttributes {
  change_request_id: string;
  checked_at?: Date;
  /** How many tools were compared. Stored, because an answer is only as good as the set it saw. */
  catalog_size: number;
  catalog_absent: boolean;
  /** The cut-off this answer used, so it stays readable after the default changes. */
  threshold: number;
  candidate_count: number;
  candidates: DuplicateCandidate[];
  /** Tools with no behavior text: matchable by name only, and disclosed rather than silently missed. */
  behaviorless_tools: string[];
  created_at?: Date;
  updated_at?: Date;
}

class AgentDomainToolDuplicateCheck extends Model<AgentDomainToolDuplicateCheckAttributes>
  implements AgentDomainToolDuplicateCheckAttributes {
  declare change_request_id: string;
  declare checked_at: Date;
  declare catalog_size: number;
  declare catalog_absent: boolean;
  declare threshold: number;
  declare candidate_count: number;
  declare candidates: DuplicateCandidate[];
  declare behaviorless_tools: string[];
  declare created_at: Date;
  declare updated_at: Date;
}

AgentDomainToolDuplicateCheck.init(
  {
    change_request_id: { type: DataTypes.UUID, primaryKey: true },
    checked_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    catalog_size: { type: DataTypes.INTEGER, allowNull: false },
    catalog_absent: { type: DataTypes.BOOLEAN, allowNull: false },
    // `NUMERIC` comes back as a string from this driver, so the projection parses it rather than
    // handing a reader something that looks like a number and compares like a string.
    threshold: { type: DataTypes.DECIMAL(6, 4), allowNull: false },
    candidate_count: { type: DataTypes.INTEGER, allowNull: false },
    candidates: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    behaviorless_tools: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_domain_tool_duplicate_checks',
    timestamps: false,
    indexes: [{ fields: ['candidate_count'] }],
  },
);

export default AgentDomainToolDuplicateCheck;
