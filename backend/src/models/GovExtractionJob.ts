import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type GovExtractionJobStatus = 'queued' | 'running' | 'completed' | 'failed';

/**
 * A background gov-qualification requirements-extraction job. The ZIP upload used to extract synchronously in the
 * request, which exceeded the ~100s edge timeout for large solicitation bundles. The upload now stores the bytes
 * (gov_source_bundles) and enqueues one of these rows; a fire-and-forget worker runs the extractor and writes the
 * same { candidates, items, fileCount, files, extraction } payload into result_json for the frontend to poll.
 *
 * Keyed by (tenant_id, qualification_key, sha256) so re-uploading the same bytes while a job is in flight reuses
 * it instead of spawning a second extraction. Schema: db/ensureGovExtractionJobSchema.ts (columns must match).
 */
export interface GovExtractionJobAttributes {
  id?: string;
  tenant_id: string;
  qualification_key: string;
  source_bundle_id: string;
  sha256: string;
  status?: GovExtractionJobStatus;
  result_json?: any | null;
  error_message?: string | null;
  created_at?: Date;
  completed_at?: Date | null;
}

class GovExtractionJob extends Model<GovExtractionJobAttributes> implements GovExtractionJobAttributes {
  declare id: string;
  declare tenant_id: string;
  declare qualification_key: string;
  declare source_bundle_id: string;
  declare sha256: string;
  declare status: GovExtractionJobStatus;
  declare result_json: any | null;
  declare error_message: string | null;
  declare created_at: Date;
  declare completed_at: Date | null;
}

GovExtractionJob.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    qualification_key: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    source_bundle_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    sha256: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'queued',
    },
    result_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'gov_extraction_jobs',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id', 'qualification_key'] },
      { fields: ['status'] },
    ],
  }
);

export default GovExtractionJob;
