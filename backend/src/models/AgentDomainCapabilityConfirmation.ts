import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AgentDomainCapabilityConfirmation — AF11.0. The recorded fact that a named human confirmed a
 * capability.
 *
 * `capability_id` is the PRIMARY KEY rather than a foreign key beside an id of its own, so the
 * one-per-capability rule is a constraint instead of a convention and no reader has to decide
 * which of two confirmations is current. It is NOT a database foreign key, because the 443
 * capabilities are JSON files rather than rows; the contract checks the id against
 * `allCapabilities()` instead and refuses an unknown one by name.
 *
 * ## The evidence is five columns, and that is the point of the ticket
 *
 * AF11.0 names the failure directly: a confirmation that records a date and a state but not the
 * human and the evidence *"would satisfy the type and prove nothing"*. So the four fields that say
 * what was looked at are `NOT NULL` and a CHECK refuses them blank. A row that cannot answer "who
 * looked at what" cannot exist.
 *
 * They mirror `EvidenceRecord` in `promotionContract.ts` field for field, because AF11.0 says to
 * reuse that vocabulary rather than parallel it.
 *
 * ## This row does not confirm anything on its own
 *
 * It is the RECORD of a confirmation, not the mechanism. `capabilityRecord.ts` reads these ids
 * through `effectiveValidationState` and `assertConfirmationsAreRecorded`; granting a tool on the
 * strength of one is AF3.5's and AF11.4's job and is not reachable from here. There is no verdict
 * column and no autonomy column, so this table cannot quietly become the grant.
 */
export interface AgentDomainCapabilityConfirmationAttributes {
  capability_id: string;
  confirmed_by_identity: string;
  evidence_kind: string;
  evidence_source: string;
  /** Kept as TEXT, matching `EvidenceRecord.observed_at`, which is a string there too. */
  evidence_observed_at: string;
  evidence_evaluated_by: string;
  evidence_summary?: string;
  confirmed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

class AgentDomainCapabilityConfirmation
  extends Model<AgentDomainCapabilityConfirmationAttributes>
  implements AgentDomainCapabilityConfirmationAttributes {
  declare capability_id: string;
  declare confirmed_by_identity: string;
  declare evidence_kind: string;
  declare evidence_source: string;
  declare evidence_observed_at: string;
  declare evidence_evaluated_by: string;
  declare evidence_summary: string;
  declare confirmed_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentDomainCapabilityConfirmation.init(
  {
    capability_id: { type: DataTypes.TEXT, primaryKey: true },
    confirmed_by_identity: { type: DataTypes.TEXT, allowNull: false },
    evidence_kind: { type: DataTypes.TEXT, allowNull: false },
    evidence_source: { type: DataTypes.TEXT, allowNull: false },
    evidence_observed_at: { type: DataTypes.TEXT, allowNull: false },
    evidence_evaluated_by: { type: DataTypes.TEXT, allowNull: false },
    evidence_summary: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    confirmed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_domain_capability_confirmations',
    timestamps: false,
    indexes: [{ fields: ['confirmed_by_identity'] }],
  },
);

export default AgentDomainCapabilityConfirmation;
