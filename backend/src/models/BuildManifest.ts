/**
 * BuildManifest — authoritative telemetry from Claude Code builds.
 *
 * One row per ingested manifest. Append-only. Older manifests are NOT mutated;
 * the freshness monitor surfaces stale entries.
 *
 * Contract: /system/intelligence/contracts/BUILD_MANIFEST_CONTRACT.md
 * Schema: /system/intelligence/manifests/build_manifest.schema.json
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface BuildManifestAttributes {
  id?: string;
  manifest_version: string;
  telemetry_version: string;
  task_id: string;
  bp_id: string | null;
  project_id: string;
  execution_timestamp: Date;

  files_created: string[];
  files_modified: string[];
  files_deleted: string[];

  database_changes: any[];
  apis_added: any[];
  apis_modified: any[];
  frontend_routes_added: any[];
  ui_components_added: any[];
  ui_components_modified: any[];
  tests_added: any[];
  tests_modified: any[];
  validation_results: any[];
  dependencies_added: any[];
  packages_added: any[];
  system_impacts: any[];

  decision_trace: Record<string, unknown> | null;

  created_at?: Date;
}

class BuildManifest extends Model<BuildManifestAttributes> implements BuildManifestAttributes {
  declare id: string;
  declare manifest_version: string;
  declare telemetry_version: string;
  declare task_id: string;
  declare bp_id: string | null;
  declare project_id: string;
  declare execution_timestamp: Date;
  declare files_created: string[];
  declare files_modified: string[];
  declare files_deleted: string[];
  declare database_changes: any[];
  declare apis_added: any[];
  declare apis_modified: any[];
  declare frontend_routes_added: any[];
  declare ui_components_added: any[];
  declare ui_components_modified: any[];
  declare tests_added: any[];
  declare tests_modified: any[];
  declare validation_results: any[];
  declare dependencies_added: any[];
  declare packages_added: any[];
  declare system_impacts: any[];
  declare decision_trace: Record<string, unknown> | null;
  declare created_at: Date;
}

BuildManifest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    manifest_version: { type: DataTypes.STRING(16), allowNull: false, defaultValue: '1.0' },
    telemetry_version: { type: DataTypes.STRING(16), allowNull: false, defaultValue: '1.0' },
    task_id: { type: DataTypes.UUID, allowNull: false },
    bp_id: { type: DataTypes.UUID, allowNull: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    execution_timestamp: { type: DataTypes.DATE, allowNull: false },

    files_created: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    files_modified: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    files_deleted: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },

    database_changes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    apis_added: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    apis_modified: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    frontend_routes_added: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    ui_components_added: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    ui_components_modified: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    tests_added: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    tests_modified: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    validation_results: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    dependencies_added: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    packages_added: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    system_impacts: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },

    decision_trace: { type: DataTypes.JSONB, allowNull: true },

    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'build_manifests',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['bp_id'] },
      { fields: ['task_id'] },
      { fields: ['execution_timestamp'] },
      { fields: ['project_id', 'execution_timestamp'] },
      { fields: ['bp_id', 'execution_timestamp'] },
    ],
  }
);

export default BuildManifest;
