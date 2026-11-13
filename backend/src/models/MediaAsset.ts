import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * MediaAsset - the brand-safe media library.
 *
 * NOT EVERY ASSET HAS BYTES. Since 2026-11-13 a row is either a FILE (bytes on the uploads
 * volume, `storage_key` set) or a LINK (a URL someone pasted, `source_url` set, no key).
 * `kind` says which, and a database CHECK makes every other combination impossible, so code
 * reading `storage_key` may assume non-null exactly when `kind === 'file'`.
 *
 * STORAGE IS LOCAL DISK, NOT OBJECT STORAGE. There is no S3/GCS/Cloudinary client anywhere
 * in backend/src, and `sharp` is a dependency that is never imported. `storage_key` refers
 * to a path under the existing multer upload volume (config/upload.ts). Recorded here so
 * nobody reads the column name and assumes a bucket exists.
 *
 * `alt_text` is a first-class column rather than a metadata key because accessibility is a
 * stated requirement (spec 8.4), and anything living in a JSONB blob is optional in
 * practice. Same reasoning for `rights_expires_at`: publishing an asset past its licence is
 * a legal exposure, not a content bug, so it has to be queryable.
 */
export interface MediaAssetAttributes {
  id?: string;
  tenant_id: string;
  brand_id?: string | null;
  /**
   * NULL for a link. A link asset has no stored bytes, so there is no key to hold; the URL
   * lives in `source_url`. The database refuses the half-populated combinations
   * (media_assets_kind_shape), so a row where this is null is a link and a row where it is set
   * is a file - every reader can rely on that rather than guessing.
   */
  storage_key?: string | null;
  /** 'file' (bytes on the uploads volume) or 'link' (a URL we did not store). */
  kind?: 'file' | 'link';
  /** The URL, for a link. NULL for a file. */
  source_url?: string | null;
  /** Free tags for finding things again. Never null: the column defaults to '{}'. */
  tags?: string[];
  original_filename?: string | null;
  mime_type: string;
  byte_size?: number | null;
  checksum_sha256?: string | null;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  alt_text?: string | null;
  rights_holder?: string | null;
  rights_expires_at?: Date | null;
  derived_from_id?: string | null;
  uploaded_by?: string | null;
  metadata?: Record<string, any>;
  archived_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class MediaAsset extends Model<MediaAssetAttributes> implements MediaAssetAttributes {
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string | null;
  declare storage_key: string | null;
  declare kind: 'file' | 'link';
  declare source_url: string | null;
  declare tags: string[];
  declare original_filename: string | null;
  declare mime_type: string;
  declare byte_size: number | null;
  declare checksum_sha256: string | null;
  declare width: number | null;
  declare height: number | null;
  declare duration_ms: number | null;
  declare alt_text: string | null;
  declare rights_holder: string | null;
  declare rights_expires_at: Date | null;
  declare derived_from_id: string | null;
  declare uploaded_by: string | null;
  declare metadata: Record<string, any>;
  declare archived_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

MediaAsset.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    // allowNull true since 2026-11-13: a link row carries source_url instead. The DB CHECK
    // (ensureMediaLibrarySchema) is what keeps the two shapes from mixing; Sequelize alone
    // would happily write a link with a storage key and a file with neither.
    storage_key: { type: DataTypes.TEXT, allowNull: true },
    kind: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'file' },
    source_url: { type: DataTypes.TEXT, allowNull: true },
    // ARRAY(TEXT) maps to text[]. defaultValue [] matches the column default so a create()
    // that omits tags behaves the same as an INSERT that omits the column.
    tags: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
    original_filename: { type: DataTypes.STRING(400), allowNull: true },
    mime_type: { type: DataTypes.STRING(120), allowNull: false },
    byte_size: { type: DataTypes.BIGINT, allowNull: true },
    checksum_sha256: { type: DataTypes.CHAR(64), allowNull: true },
    width: { type: DataTypes.INTEGER, allowNull: true },
    height: { type: DataTypes.INTEGER, allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    alt_text: { type: DataTypes.STRING(1000), allowNull: true },
    rights_holder: { type: DataTypes.STRING(300), allowNull: true },
    rights_expires_at: { type: DataTypes.DATE, allowNull: true },
    derived_from_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'media_assets', key: 'id' },
    },
    uploaded_by: { type: DataTypes.UUID, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    archived_at: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'media_assets', timestamps: true, underscored: true },
);

export default MediaAsset;
