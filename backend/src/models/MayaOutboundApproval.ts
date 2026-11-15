import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * MayaOutboundApproval - one message Maya composed for one real person, waiting on one decision.
 *
 * The table is created by `db/ensureMayaOutboundApprovalSchema.ts` at boot, not by
 * `sequelize.sync`, which is off by default in this repo. This model is the typed read/write
 * surface over it, the same arrangement `AgentDomainToolGrant` has.
 *
 * ## The row IS the message
 *
 * `body` holds the exact bytes the provider will receive, rendered at COMPOSE time. That is not
 * a detail. `sendDocument`'s real HTML is assembled inside `emailService.sendAdmissionsDocument`,
 * so a row holding a summary would read as reviewed and approved while the bytes Ali never saw
 * were produced at delivery. `body_hash` pins what was shown; the approve path re-hashes before
 * transmitting and refuses if anything moved.
 *
 * A consequence worth stating: anything that CANNOT be rendered before send time does not belong
 * in this queue. Campaign enrolment is the example - its bodies are written by `generateAIContent()`
 * on a cron hours later - which is why `enrollInCampaign` is refused by name rather than queued.
 *
 * ## What this row deliberately cannot say
 *
 * There is no `auto_approved` status and no `approve_after` column. `decided_by` is constrained
 * at the database to reject anything beginning with `system:`, so the shape of a timer-written
 * approval does not exist here even if a future caller tries to produce one.
 */

/** The states a queued message can be in. Mirrors `APPROVAL_STATUSES` in the schema module. */
export type MayaOutboundStatus =
  | 'pending_approval'
  | 'approved'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'rejected'
  | 'withdrawn'
  | 'expired';

export interface MayaOutboundApprovalAttributes {
  id?: string;
  /**
   * The opaque id used in every log line and API response, for example `lead:<uuid>`.
   * Never an email address: ids are not PII in this repo.
   */
  recipient_ref: string;
  /** The real delivery target. Read by the delivery path; masked by the admin API. */
  recipient_address: string;
  /** A human-readable name for the review screen, when one is known. */
  recipient_display?: string | null;
  /** The channel this one message would leave by. One row is one message on one channel. */
  channel: string;
  subject?: string | null;
  /** The exact bytes the provider will receive. Rendered at compose time, never at delivery. */
  body: string;
  /** sha256 of `body` at compose time. Re-checked before transmitting. */
  body_hash: string;
  /** Which tool composed it, for the review screen and for tracing. */
  composed_by: string;
  /** The capability whose resolved mode put this row here. */
  capability: string;
  correlation_id: string;
  /** Unique. A replayed compose updates nothing and adds nothing. */
  idempotency_key: string;
  status?: MayaOutboundStatus;
  /**
   * The person who decided. Never a service account: the database rejects any value starting
   * with `system:`, which is the exact shape the auto-approving sweep on `approval_requests`
   * writes.
   */
  decided_by?: string | null;
  decided_at?: Date | null;
  decision_note?: string | null;
  delivered_at?: Date | null;
  failure_reason?: string | null;
  /** When an undecided row stops waiting. Expiry may write `expired` and nothing else. */
  expires_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

class MayaOutboundApproval
  extends Model<MayaOutboundApprovalAttributes>
  implements MayaOutboundApprovalAttributes {
  declare id: string;
  declare recipient_ref: string;
  declare recipient_address: string;
  declare recipient_display: string | null;
  declare channel: string;
  declare subject: string | null;
  declare body: string;
  declare body_hash: string;
  declare composed_by: string;
  declare capability: string;
  declare correlation_id: string;
  declare idempotency_key: string;
  declare status: MayaOutboundStatus;
  declare decided_by: string | null;
  declare decided_at: Date | null;
  declare decision_note: string | null;
  declare delivered_at: Date | null;
  declare failure_reason: string | null;
  declare expires_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

MayaOutboundApproval.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    recipient_ref: { type: DataTypes.TEXT, allowNull: false },
    recipient_address: { type: DataTypes.TEXT, allowNull: false },
    recipient_display: { type: DataTypes.TEXT, allowNull: true },
    channel: { type: DataTypes.TEXT, allowNull: false },
    subject: { type: DataTypes.TEXT, allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: false },
    body_hash: { type: DataTypes.TEXT, allowNull: false },
    composed_by: { type: DataTypes.TEXT, allowNull: false },
    capability: { type: DataTypes.TEXT, allowNull: false },
    correlation_id: { type: DataTypes.TEXT, allowNull: false },
    idempotency_key: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'pending_approval' },
    decided_by: { type: DataTypes.TEXT, allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    decision_note: { type: DataTypes.TEXT, allowNull: true },
    delivered_at: { type: DataTypes.DATE, allowNull: true },
    failure_reason: { type: DataTypes.TEXT, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'maya_outbound_approvals',
    timestamps: false,
    indexes: [
      { fields: ['idempotency_key'], unique: true },
      { fields: ['status', 'created_at'] },
      { fields: ['correlation_id'] },
    ],
  },
);

export default MayaOutboundApproval;
