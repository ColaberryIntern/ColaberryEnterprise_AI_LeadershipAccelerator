import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryClientAcceptance — the client's sign-off, as a durable record.
 *
 * Master plan §24 lists **"client acceptance is not durable"** as a stop condition, and
 * §Gate 10 requires it to be a first-class object. The student portal's
 * `AcceptanceChecklist.tsx` is a UI component, not a record — deliberately not the
 * precedent followed here.
 *
 * ## Supersession, not mutation
 *
 * Same discipline as `DeliveryDecision`. An acceptance that changes gets a **successor
 * row** and a back-pointer; the original keeps what was promised, what was previewed,
 * what evidence supported it, who accepted and when. An `UPDATE` on an accepted row would
 * let the record say a client approved something they never saw — which is exactly the
 * §24 stop condition, arrived at through a different door.
 *
 * ## Why the promise is copied in, not referenced
 *
 * `promised_acceptance`, `preview_ref` and `evidence_summary` are **snapshots**, not
 * foreign keys. A client accepted a specific promise against a specific preview backed by
 * specific evidence; if those are read through a live reference, the record silently
 * re-describes itself every time the underlying story is edited. A year later, in a
 * dispute, the only useful answer is what was on the screen that day.
 *
 * ## accepted_with_exceptions is a real outcome
 *
 * Master plan §Gate 10 lists `exceptions` as a field, which means the middle state is
 * expected. Forcing a binary accept/reject pushes real-world "fine, but the export is
 * still wrong" into a comment field where nothing tracks it. Here it is a status with
 * structured exceptions, so the open items survive the sign-off.
 */
export type ClientAcceptanceStatus =
  | 'pending'
  | 'accepted'
  | 'accepted_with_exceptions'
  | 'rejected'
  | 'withdrawn'
  | 'superseded';

export const CLIENT_ACCEPTANCE_STATUSES: readonly ClientAcceptanceStatus[] = [
  'pending',
  'accepted',
  'accepted_with_exceptions',
  'rejected',
  'withdrawn',
  'superseded',
];

export type ClientAcceptanceScope = 'release' | 'story';

export interface DeliveryClientAcceptanceAttributes {
  id?: string;
  delivery_project_id: string;
  scope_kind: ClientAcceptanceScope;
  /** No FK: `delivery_releases` / `delivery_stories` are not tables yet. */
  release_id?: string | null;
  story_id?: string | null;
  /** Snapshot of what was committed, not a live reference. */
  promised_acceptance?: any;
  /** What they actually looked at. */
  preview_ref?: string | null;
  /** Snapshot of the evidence that supported it. */
  evidence_summary?: any;
  accepted_by_identity_id?: string | null;
  accepted_at?: Date | null;
  comments?: string | null;
  /** Structured open items when status is accepted_with_exceptions. */
  exceptions?: any;
  status: ClientAcceptanceStatus;
  /** Back-pointer set on the OLD row when a successor replaces it. */
  superseded_by_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class DeliveryClientAcceptance extends Model<DeliveryClientAcceptanceAttributes>
  implements DeliveryClientAcceptanceAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare scope_kind: ClientAcceptanceScope;
  declare release_id: string | null;
  declare story_id: string | null;
  declare promised_acceptance: any;
  declare preview_ref: string | null;
  declare evidence_summary: any;
  declare accepted_by_identity_id: string | null;
  declare accepted_at: Date | null;
  declare comments: string | null;
  declare exceptions: any;
  declare status: ClientAcceptanceStatus;
  declare superseded_by_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryClientAcceptance.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    scope_kind: { type: DataTypes.STRING(20), allowNull: false },
    release_id: { type: DataTypes.UUID, allowNull: true },
    story_id: { type: DataTypes.UUID, allowNull: true },
    promised_acceptance: { type: DataTypes.JSONB, allowNull: true },
    preview_ref: { type: DataTypes.TEXT, allowNull: true },
    evidence_summary: { type: DataTypes.JSONB, allowNull: true },
    accepted_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    accepted_at: { type: DataTypes.DATE, allowNull: true },
    comments: { type: DataTypes.TEXT, allowNull: true },
    exceptions: { type: DataTypes.JSONB, allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
    superseded_by_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'delivery_client_acceptances',
    timestamps: false,
    indexes: [
      { fields: ['delivery_project_id'] },
      { fields: ['release_id'] },
      { fields: ['story_id'] },
      { fields: ['status'] },
    ],
  },
);

export default DeliveryClientAcceptance;
