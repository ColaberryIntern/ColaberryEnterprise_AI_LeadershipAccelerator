import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudyRepoCollection — the multi-repo container for one Case Study.
 *
 * It is its own table rather than a column on case_studies so the
 * one-workspace-repo-per-Project invariant (a partial unique index on
 * github_connections.project_id) is never touched: a Project still has exactly one
 * workspace repo, while a Case Study may cite many evidence repos.
 *
 * Every DDL column is declared in the interface, in `init()` and as a `declare`
 * line — see the CaseStudy.ts header for why all three are mandatory.
 */
export interface CaseStudyRepoCollectionAttributes {
  id?: string;
  case_study_id: string;
  name?: string;
  /** active | archived */
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}

class CaseStudyRepoCollection
  extends Model<CaseStudyRepoCollectionAttributes>
  implements CaseStudyRepoCollectionAttributes
{
  declare id: string;
  declare case_study_id: string;
  declare name: string;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyRepoCollection.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false, defaultValue: 'Sources' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
  },
  {
    sequelize,
    tableName: 'case_study_repo_collections',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ fields: ['case_study_id'], name: 'idx_cs_repo_collections_case_study' }],
  }
);

export default CaseStudyRepoCollection;
