import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * MediaAsset - the brand-safe media library.
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
  storage_key: string;
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
  declare storage_key: string;
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
    storage_key: { type: DataTypes.TEXT, allowNull: false },
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
