import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One document in an applicant's offer-letter package — either one WE generated
 * or one THEY uploaded signed.
 *
 * ── TWO KINDS, NEVER ONE ROW MUTATED ───────────────────────────────────────
 *
 * "Store the original generated PDF and uploaded signed copy separately… Preserve
 * every revision; never overwrite a previously signed file."
 *
 * So `kind` is 'generated' or 'signed_upload' and they are different rows, and
 * `revision` increments rather than replacing. A re-upload after a correction
 * request is revision 2 sitting beside revision 1, both readable. The unique index
 * `uq_internship_document_revision` on
 * (application_id, document_type, kind, revision) makes reusing a revision number
 * impossible rather than merely discouraged — so "never overwrite" is enforced by
 * the storage engine, not by remembering.
 *
 * ── STORAGE ────────────────────────────────────────────────────────────────
 *
 * `storage_key` is an opaque UUID filename on the persistent uploads volume,
 * matching config/upload.ts. Never a predictable public path, and never the
 * original filename the applicant's computer supplied — that is kept separately in
 * `original_filename` for display only.
 */
export type DocumentKind = 'generated' | 'signed_upload';
export type DocumentStatus =
  | 'pending'            // generated, awaiting the applicant
  | 'uploaded'           // signed copy received, awaiting a reviewer
  | 'verified'           // a human checked it
  | 'correction_requested';

class InternshipDocument extends Model {
  declare id: string;
  declare application_id: string;
  /** The template key this document is an instance of. */
  declare document_type: string;
  declare kind: DocumentKind;
  declare revision: number;
  declare template_id: string | null;
  declare template_version: number | null;
  declare storage_key: string | null;
  declare original_filename: string | null;
  declare mime_type: string | null;
  declare byte_size: number | null;
  declare checksum_sha256: string | null;
  /** Short human-quotable id printed on the page. Not a secret. */
  declare document_public_id: string | null;
  declare status: DocumentStatus;
  /** Whether THIS applicant must produce it — see requiredTemplatesFor(). */
  declare required: boolean;
  declare verified_by: string | null;
  declare verified_at: Date | null;
  declare rejection_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InternshipDocument.init(
  {
    id:                 { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    application_id:     { type: DataTypes.UUID, allowNull: false },
    document_type:      { type: DataTypes.STRING(60), allowNull: false },
    kind:               { type: DataTypes.STRING(20), allowNull: false },
    revision:           { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    template_id:        { type: DataTypes.UUID, allowNull: true },
    template_version:   { type: DataTypes.INTEGER, allowNull: true },
    storage_key:        { type: DataTypes.STRING(255), allowNull: true },
    original_filename:  { type: DataTypes.STRING(255), allowNull: true },
    mime_type:          { type: DataTypes.STRING(100), allowNull: true },
    byte_size:          { type: DataTypes.INTEGER, allowNull: true },
    checksum_sha256:    { type: DataTypes.STRING(64), allowNull: true },
    document_public_id: { type: DataTypes.STRING(40), allowNull: true },
    status:             { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
    required:           { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    verified_by:        { type: DataTypes.STRING(255), allowNull: true },
    verified_at:        { type: DataTypes.DATE, allowNull: true },
    rejection_reason:   { type: DataTypes.TEXT, allowNull: true },
    created_at:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'internship_documents',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default InternshipDocument;
