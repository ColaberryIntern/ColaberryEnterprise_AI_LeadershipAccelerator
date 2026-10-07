import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The private source bytes behind a government qualification — the solicitation ZIP the reviewer attested as
 * the evidence of record. Before this, the attest-zip route hashed the upload and DISCARDED the bytes, so the
 * evidence of record could never be re-opened or re-downloaded; only its sha256 survived. This retains the
 * actual bytes, keyed to the tenant + the qualification key, so the proposal workspace has a durable, private,
 * access-controlled copy of what was submitted.
 *
 * Ownership + scoping live here, not in a request: "is this bundle yours" is a row lookup on (tenant_id,
 * qualification_key), never a trust decision about a path a client sent. `sha256` + the unique index on
 * (tenant_id, qualification_key, sha256) make re-attesting the same ZIP idempotent (one row, one file).
 *
 * Bytes live on the persistent `uploads` volume (stored_name), not in Postgres — a solicitation ZIP is
 * megabytes, which is the wrong thing to put in a row. Mirrors AgentAttachment.ts exactly, scoped to a gov
 * qualification instead of a student enrollment.
 */
export interface GovSourceBundleAttributes {
  id?: string;
  tenant_id: string;
  /** The qualification key this ZIP is evidence for — a gws key (gws:…) or a canonical id (op:gov:…). */
  qualification_key: string;
  sha256: string;
  mime: string;
  byte_size: number;
  /** Original name as the uploader's browser reported it (display only). */
  filename: string;
  /** Opaque on-disk name (uuid + ext) inside GOV_SOURCE_BUNDLE_DIR. */
  stored_name: string;
  created_at?: Date;
}

class GovSourceBundle extends Model<GovSourceBundleAttributes> implements GovSourceBundleAttributes {
  declare id: string;
  declare tenant_id: string;
  declare qualification_key: string;
  declare sha256: string;
  declare mime: string;
  declare byte_size: number;
  declare filename: string;
  declare stored_name: string;
  declare created_at: Date;
}

GovSourceBundle.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    qualification_key: { type: DataTypes.STRING(80), allowNull: false },
    sha256: { type: DataTypes.STRING(64), allowNull: false },
    mime: { type: DataTypes.STRING(100), allowNull: false },
    byte_size: { type: DataTypes.INTEGER, allowNull: false },
    filename: { type: DataTypes.STRING(255), allowNull: false },
    stored_name: { type: DataTypes.STRING(255), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'GovSourceBundle',
    tableName: 'gov_source_bundles',
    timestamps: false,
    indexes: [{ unique: true, fields: ['tenant_id', 'qualification_key', 'sha256'] }],
  },
);

export default GovSourceBundle;
