import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One entry in the opportunity's dates/messages/amendment INBOX (P4). A gov operator records an amendment or an
 * agency message/Q&A observed on the buyer portal, WITH its provenance (where it was seen). This is a manual
 * capture surface: there is no programmatic buyer-portal access, so the honest model is an operator-recorded entry
 * with a source reference, never a scraped/fabricated one.
 *
 * THE LOAD-BEARING EFFECT: an entry of kind `amendment` carries `affects` — the requirement ids it changes. When
 * recorded, it invalidates the proposal readiness of every affected requirement: any response for one of those
 * requirements that was `reviewed` or `approved` is flipped back to `revision_required` (the answer must be
 * re-examined against the amended requirement). A `message` entry (affects empty) records context but invalidates
 * nothing. Keyed (delivery_project_id, amendment_key) UNIQUE so re-recording the same amendment is idempotent.
 */
export type ProposalAmendmentKind = 'amendment' | 'message';

export interface GovProposalAmendmentAttributes {
  id?: string;
  delivery_project_id: string;
  /** A stable per-project key for this entry (operator-provided label / portal ref) — the idempotency anchor. */
  amendment_key: string;
  kind: ProposalAmendmentKind;
  summary: string;
  /** The requirement ids this amendment materially affects (empty for a plain message). Drives invalidation. */
  affects: string[];
  /** Where this was observed (a portal URL, an addendum number, a message thread ref). Never invented. */
  provenance: string | null;
  observed_at: Date | null;
  recorded_by_identity_id: string | null;
  /** How many responses this entry invalidated when recorded (audit of the effect; 0 for a message). */
  invalidated_count: number;
  created_at?: Date;
}

class GovProposalAmendment extends Model<GovProposalAmendmentAttributes> implements GovProposalAmendmentAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare amendment_key: string;
  declare kind: ProposalAmendmentKind;
  declare summary: string;
  declare affects: string[];
  declare provenance: string | null;
  declare observed_at: Date | null;
  declare recorded_by_identity_id: string | null;
  declare invalidated_count: number;
  declare created_at: Date;
}

GovProposalAmendment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    amendment_key: { type: DataTypes.STRING(160), allowNull: false },
    kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'amendment' },
    summary: { type: DataTypes.TEXT, allowNull: false },
    affects: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    provenance: { type: DataTypes.TEXT, allowNull: true },
    observed_at: { type: DataTypes.DATE, allowNull: true },
    recorded_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    invalidated_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'GovProposalAmendment',
    tableName: 'gov_proposal_amendment',
    timestamps: false,
    indexes: [{ unique: true, fields: ['delivery_project_id', 'amendment_key'] }],
  },
);

export default GovProposalAmendment;
