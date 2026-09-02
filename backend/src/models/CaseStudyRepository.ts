import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudyRepository — one repository cited by a Case Study collection.
 *
 * `allow_public_repo_link` defaults false: a public repo link is opt-in per repo
 * AND requires the repo to actually be public AND the snapshot to approve it.
 * Three independent gates, all defaulting closed.
 *
 * `github_connection_id` and `project_id` are bare UUIDs, not FKs — see the
 * ensureCaseStudySchema.ts header. Attaching a repo here never creates, modifies
 * or deletes a `github_connections` row.
 *
 * Case-insensitive dedupe within a collection is enforced by a database
 * expression index (`LOWER(repo_owner), LOWER(repo_name)`) that Sequelize's
 * `indexes` option cannot express, so it is deliberately absent below and lives
 * only in the DDL.
 */
export interface CaseStudyRepositoryAttributes {
  id?: string;
  collection_id: string;
  repo_owner: string;
  repo_name: string;
  repo_url: string;
  /** primary | frontend | backend | agents | data | infra | docs | evals | demo | other */
  role?: string;
  /** public | private | unknown */
  visibility?: string;
  github_connection_id?: string | null;
  project_id?: string | null;
  default_branch?: string | null;
  last_seen_sha?: string | null;
  last_synced_at?: Date | null;
  /** connected | read_only | unavailable | deleted | rate_limited | unknown */
  access_status?: string;
  allow_public_repo_link?: boolean;
  /**
   * Path prefixes this Case Study is about, or empty for the whole repository.
   *
   * A monorepo holds many features. Without this, a Case Study about one of
   * them inherits the whole repository's stack, tests and creation date.
   */
  path_scope?: string[];
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class CaseStudyRepository
  extends Model<CaseStudyRepositoryAttributes>
  implements CaseStudyRepositoryAttributes
{
  declare id: string;
  declare collection_id: string;
  declare repo_owner: string;
  declare repo_name: string;
  declare repo_url: string;
  declare role: string;
  declare visibility: string;
  declare github_connection_id: string | null;
  declare project_id: string | null;
  declare default_branch: string | null;
  declare last_seen_sha: string | null;
  declare last_synced_at: Date | null;
  declare access_status: string;
  declare allow_public_repo_link: boolean;
  declare path_scope: string[];
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyRepository.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    collection_id: { type: DataTypes.UUID, allowNull: false },
    repo_owner: { type: DataTypes.STRING(255), allowNull: false },
    repo_name: { type: DataTypes.STRING(255), allowNull: false },
    repo_url: { type: DataTypes.STRING(512), allowNull: false },
    role: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'other' },
    visibility: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unknown' },
    github_connection_id: { type: DataTypes.UUID, allowNull: true },
    project_id: { type: DataTypes.UUID, allowNull: true },
    default_branch: { type: DataTypes.STRING(255), allowNull: true },
    last_seen_sha: { type: DataTypes.STRING(64), allowNull: true },
    last_synced_at: { type: DataTypes.DATE, allowNull: true },
    access_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unknown' },
    allow_public_repo_link: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    path_scope: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    sequelize,
    tableName: 'case_study_repositories',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['collection_id'], name: 'idx_cs_repositories_collection' },
      { fields: ['repo_owner', 'repo_name'], name: 'idx_cs_repositories_owner_name' },
    ],
  }
);

export default CaseStudyRepository;
