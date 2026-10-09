import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The approved, published take.
 *
 * `content_hash` is the approval's binding. Approval applies to the CONTENT that was
 * reviewed, not to the attempt in perpetuity: swap the recording or the deck after
 * sign-off and the hash no longer matches, so the publication is no longer approved
 * and must go back through review. Storing the hash is what makes that enforceable
 * rather than a policy nobody can check.
 *
 * Both approval timestamps are nullable with no default — author AND staff must each
 * act. Nothing is published by omission, and `audience` defaults to 'private'.
 *
 * Uniqueness is PARTIAL on `withdrawn_at IS NULL`: at most one LIVE showcase per
 * attempt, so a publish retried after a timeout cannot post twice, while a withdrawn
 * showcase can still be legitimately replaced later.
 */
export type PresentationShowcaseAudience = 'private' | 'cohort' | 'community' | 'public';

export interface PresentationShowcaseAttributes {
  id?: string;
  attempt_id: string;
  audience?: PresentationShowcaseAudience;
  draft_json?: Record<string, unknown>;
  content_hash?: string | null;
  author_approved_at?: Date | null;
  staff_approved_at?: Date | null;
  staff_approved_by?: string | null;
  published_at?: Date | null;
  publication_ref?: string | null;
  withdrawn_at?: Date | null;
  withdrawn_reason?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class PresentationShowcase
  extends Model<PresentationShowcaseAttributes>
  implements PresentationShowcaseAttributes {
  declare id: string;
  declare attempt_id: string;
  declare audience: PresentationShowcaseAudience;
  declare draft_json: Record<string, unknown>;
  declare content_hash: string | null;
  declare author_approved_at: Date | null;
  declare staff_approved_at: Date | null;
  declare staff_approved_by: string | null;
  declare published_at: Date | null;
  declare publication_ref: string | null;
  declare withdrawn_at: Date | null;
  declare withdrawn_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

PresentationShowcase.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    attempt_id: { type: DataTypes.UUID, allowNull: false },
    audience: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'private' },
    draft_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    content_hash: { type: DataTypes.STRING(80), allowNull: true },
    // No default. An approval is an act by a person, never an absence of one.
    author_approved_at: { type: DataTypes.DATE, allowNull: true },
    staff_approved_at: { type: DataTypes.DATE, allowNull: true },
    staff_approved_by: { type: DataTypes.STRING(160), allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    publication_ref: { type: DataTypes.STRING(160), allowNull: true },
    withdrawn_at: { type: DataTypes.DATE, allowNull: true },
    withdrawn_reason: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'presentation_showcases',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    // NOTE: the partial unique index (WHERE withdrawn_at IS NULL) is declared in
    // ensurePresentationStudioSchema.ts, not here — Sequelize's index DSL has no
    // partial-predicate support, and sync() is disabled on this graph anyway. The
    // DDL module is the source of truth for indexes; this list is the non-partial subset.
    indexes: [
      { fields: ['attempt_id'], name: 'presentation_showcases_attempt' },
    ],
  },
);

export default PresentationShowcase;
