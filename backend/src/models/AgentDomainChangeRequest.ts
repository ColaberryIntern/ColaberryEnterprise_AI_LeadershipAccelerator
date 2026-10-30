import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { AgentChangeRequestStatus } from '../services/agentDomain/agentChangeRequest';
import type { ChangeRequestKind } from '../db/ensureAgentDomainChangeRequestSchema';

/**
 * AgentDomainChangeRequest — AF4.2. An intern's request to change the platform, and who decided it.
 *
 * Shaped on `DeliveryChangeRequest`, which is the honest precedent in this repo: it already carries
 * a requester identity, an approver identity, an approval timestamp and a decline reason. That one
 * is a CLIENT's request scoped to a `delivery_project_id`; this one is an intern's request against
 * the platform they are testing, so it is a sibling table rather than a reused one.
 *
 * `requested_by_identity` is NOT NULL on purpose. The ticket's first acceptance criterion is "a
 * CR records a named proposer; a request with no proposer is refused", and a `NOT NULL` column
 * makes that true of the data rather than true of the code path — a proposer-less row cannot exist
 * even if some future caller forgets to run the gate.
 *
 * The two decision columns are nullable because a submitted request has not been decided, but they
 * are constrained to move together (`chk_adcr_decided_together` in
 * `db/ensureAgentDomainChangeRequestSchema.ts`): an approver with no timestamp, or a timestamp with
 * no approver, is exactly the half-written governance record this ticket exists to avoid. The
 * acceptance criterion is that an approved CR "names the approving human and the timestamp", so
 * the pair is the unit, not the two fields.
 *
 * The identity columns are `_identity`, not `_identity_id`, and they hold the actor's EMAIL. That
 * is not cosmetic. `DeliveryChangeRequest` stores an `org_members` UUID, and copying that here
 * would have disabled the guard this ticket exists for: the gate judges the stored identity with
 * `isNonHumanIdentity`, whose denylist matches strings like `system:auto_approve_timeout`, and a
 * UUID passes that denylist unconditionally. Door 2 would have been decorative in production while
 * every unit test still passed, because the tests supply emails.
 *
 * An email also makes the acceptance criterion literally true: "names the approving human" is
 * satisfied by a value a person can read, where a UUID names nobody without a join. The gov
 * subsystem reached the same conclusion already — actor identity there is an email, not a uuid.
 */
export interface AgentDomainChangeRequestAttributes {
  id?: string;
  /** What is being asked for: `change` (AF4.2) or `tool` (AF7.1). Defaults to `change`. */
  kind?: ChangeRequestKind;
  domain_key: string;
  title: string;
  description?: string | null;
  status: AgentChangeRequestStatus;
  requested_by_identity: string;
  requested_at?: Date;
  approved_by_identity?: string | null;
  approved_at?: Date | null;
  declined_reason?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class AgentDomainChangeRequest extends Model<AgentDomainChangeRequestAttributes>
  implements AgentDomainChangeRequestAttributes {
  declare id: string;
  declare kind: ChangeRequestKind;
  declare domain_key: string;
  declare title: string;
  declare description: string | null;
  declare status: AgentChangeRequestStatus;
  declare requested_by_identity: string;
  declare requested_at: Date;
  declare approved_by_identity: string | null;
  declare approved_at: Date | null;
  declare declined_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentDomainChangeRequest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    kind: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'change' },
    domain_key: { type: DataTypes.TEXT, allowNull: false },
    title: { type: DataTypes.TEXT, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'submitted' },
    requested_by_identity: { type: DataTypes.TEXT, allowNull: false },
    requested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    approved_by_identity: { type: DataTypes.TEXT, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    declined_reason: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_domain_change_requests',
    timestamps: false,
    indexes: [
      { fields: ['domain_key'] },
      { fields: ['status'] },
      { fields: ['kind'] },
      { fields: ['requested_by_identity'] },
    ],
  },
);

export default AgentDomainChangeRequest;
