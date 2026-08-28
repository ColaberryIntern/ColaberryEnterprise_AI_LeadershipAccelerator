import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudy — the canonical record. One row per project story, independent of any
 * publishing surface. Table created by `db/ensureCaseStudySchema.ts`; this file is
 * the read/write contract over it.
 *
 * EVERY column the DDL creates is declared three times on purpose — in the
 * attributes interface, in `init()`, and as a `declare` line (backend/CLAUDE.md,
 * "Models specifically"). Sequelize only ever SELECTs, INSERTs and UPDATEs
 * attributes it knows about, so a column present in Postgres but absent from
 * `init()` is invisible: reads return `undefined` and writes are dropped without
 * an error. That is not hypothetical — on 2026-08-22 nine models were given new
 * tenancy columns that were never declared, the whole tenancy runtime did nothing,
 * and every mocked test still passed. `__tests__/caseStudyModelParity.test.ts`
 * exists to make that failure impossible here.
 *
 * `status` is the editorial lifecycle; `visibility` and the two *_identity_mode
 * columns are the separate consent axis the publish gate reads. A record can be
 * `approved` while organisation consent is still `hidden`, and publishing must
 * fail closed in that state.
 *
 * Column string types are plain `string` rather than local unions: the canonical
 * unions (verification_class, verification_method, surface keys) are owned by
 * `types/caseStudy.ts`, so declaring a second copy here would let the two drift.
 */
export interface CaseStudyAttributes {
  id?: string;
  slug: string;
  title: string;
  /** draft | review | approved | published | archived */
  status?: string;
  /** Bare UUID, deliberately not a FK — see the ensureCaseStudySchema.ts header. */
  project_id?: string | null;
  /** platform_project | repo_collection | manual | engagement */
  source_type?: string;
  canonical_summary?: string | null;
  industry?: string | null;
  primary_capability?: string | null;
  program_key?: string | null;
  built_by_type?: string | null;
  /** public | anonymized | private */
  visibility?: string;
  organization_display_name?: string | null;
  organization_is_anonymized?: boolean;
  /** hidden | anonymized | named */
  organization_identity_mode?: string;
  organization_naming_consent?: boolean;
  /** anonymous | role_only | named */
  builder_identity_mode?: string;
  builder_naming_consent?: boolean;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
  archived_at?: Date | null;
}

class CaseStudy extends Model<CaseStudyAttributes> implements CaseStudyAttributes {
  declare id: string;
  declare slug: string;
  declare title: string;
  declare status: string;
  declare project_id: string | null;
  declare source_type: string;
  declare canonical_summary: string | null;
  declare industry: string | null;
  declare primary_capability: string | null;
  declare program_key: string | null;
  declare built_by_type: string | null;
  declare visibility: string;
  declare organization_display_name: string | null;
  declare organization_is_anonymized: boolean;
  declare organization_identity_mode: string;
  declare organization_naming_consent: boolean;
  declare builder_identity_mode: string;
  declare builder_naming_consent: boolean;
  declare created_by: string | null;
  declare approved_by: string | null;
  declare approved_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare archived_at: Date | null;
}

CaseStudy.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    slug: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    title: { type: DataTypes.STRING(300), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    project_id: { type: DataTypes.UUID, allowNull: true },
    source_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'repo_collection' },
    canonical_summary: { type: DataTypes.TEXT, allowNull: true },
    industry: { type: DataTypes.STRING(120), allowNull: true },
    primary_capability: { type: DataTypes.STRING(120), allowNull: true },
    program_key: { type: DataTypes.STRING(80), allowNull: true },
    built_by_type: { type: DataTypes.STRING(40), allowNull: true },
    visibility: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'private' },
    organization_display_name: { type: DataTypes.STRING(255), allowNull: true },
    organization_is_anonymized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    organization_identity_mode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'hidden' },
    organization_naming_consent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    builder_identity_mode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'anonymous' },
    builder_naming_consent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_by: { type: DataTypes.STRING(255), allowNull: true },
    approved_by: { type: DataTypes.STRING(255), allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    // Soft-archive stamp. Declared explicitly (no defaultValue) for the same
    // reason as projects.archived_at: an undeclared attribute makes the archive
    // a silent no-op that still resolves.
    archived_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'case_studies',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['slug'], name: 'case_studies_slug_unique' },
      { fields: ['status'], name: 'idx_case_studies_status' },
      { fields: ['project_id'], name: 'idx_case_studies_project_id' },
    ],
  }
);

export default CaseStudy;
