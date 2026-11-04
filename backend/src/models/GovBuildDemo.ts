import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The per-project demo configuration for build-artifact capture (Proposal Studio P4): the admin-set demo URL the
 * Playwright capture navigates (validated https + host-allowlisted at the API), an optional capture root, and
 * optional per-story capture paths (story_id → path, defaulting to the demo root). One row per project.
 * Schema: db/ensureGovBuildArtifactSchema.ts.
 */
export interface GovBuildDemoAttributes {
  delivery_project_id: string;
  demo_url: string | null;
  capture_root: string | null;
  story_capture_paths: Record<string, string>;
  updated_by_identity_id?: string | null;
  updated_at?: Date;
}

class GovBuildDemo extends Model<GovBuildDemoAttributes> implements GovBuildDemoAttributes {
  declare delivery_project_id: string;
  declare demo_url: string | null;
  declare capture_root: string | null;
  declare story_capture_paths: Record<string, string>;
  declare updated_by_identity_id: string | null;
  declare updated_at: Date;
}

GovBuildDemo.init(
  {
    delivery_project_id: { type: DataTypes.UUID, primaryKey: true },
    demo_url: { type: DataTypes.TEXT, allowNull: true },
    capture_root: { type: DataTypes.TEXT, allowNull: true },
    story_capture_paths: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    updated_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'GovBuildDemo',
    tableName: 'gov_build_demo',
    timestamps: false,
  },
);

export default GovBuildDemo;
