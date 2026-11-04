import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A screenshot captured from the VERIFIED build demo (Proposal Studio P4), tagged with the requirement ids it
 * proves and bound to the commit it was captured at. Inserted into a proposal document as a numbered figure.
 * Idempotent per (story_id, commit_sha). Schema: db/ensureGovBuildArtifactSchema.ts.
 */
export type GovBuildArtifactStatus = 'captured' | 'failed';

export interface GovBuildArtifactAttributes {
  id?: string;
  delivery_project_id: string;
  story_id: string;
  requirement_ids: string[];
  commit_sha: string | null;
  file_path: string | null;
  sha256: string | null;
  caption: string | null;
  status: GovBuildArtifactStatus;
  captured_at?: Date;
  created_at?: Date;
}

class GovBuildArtifact extends Model<GovBuildArtifactAttributes> implements GovBuildArtifactAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare story_id: string;
  declare requirement_ids: string[];
  declare commit_sha: string | null;
  declare file_path: string | null;
  declare sha256: string | null;
  declare caption: string | null;
  declare status: GovBuildArtifactStatus;
  declare captured_at: Date;
  declare created_at: Date;
}

GovBuildArtifact.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    story_id: { type: DataTypes.STRING(120), allowNull: false },
    requirement_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    commit_sha: { type: DataTypes.STRING(64), allowNull: true },
    file_path: { type: DataTypes.TEXT, allowNull: true },
    sha256: { type: DataTypes.STRING(64), allowNull: true },
    caption: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'captured' },
    captured_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'GovBuildArtifact',
    tableName: 'gov_build_artifacts',
    timestamps: false,
    indexes: [{ unique: true, fields: ['story_id', 'commit_sha'] }],
  },
);

export default GovBuildArtifact;
