import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudyCollection — a saved editorial filter set (a curated path such as
 * "agents", "insurance" or "built by learners").
 *
 * It is a filter DEFINITION, not a list of member rows, so a curated path never
 * duplicates a Case Study record and can never drift out of date relative to the
 * records it describes.
 *
 * Despite the name this table has NO relationship to `case_study_repo_collections`
 * (which groups repositories) and no association to `case_studies` — membership is
 * evaluated from `filter_config` at read time, so an association here would imply a
 * referential link the design deliberately does not have.
 */
export interface CaseStudyCollectionAttributes {
  id?: string;
  slug: string;
  /** enterprise | training | ai-flotation | refactored */
  surface_key?: string;
  title: string;
  description?: string | null;
  filter_config?: Record<string, any>;
  sort_config?: Record<string, any>;
  /** draft | published */
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}

class CaseStudyCollection
  extends Model<CaseStudyCollectionAttributes>
  implements CaseStudyCollectionAttributes
{
  declare id: string;
  declare slug: string;
  declare surface_key: string;
  declare title: string;
  declare description: string | null;
  declare filter_config: Record<string, any>;
  declare sort_config: Record<string, any>;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyCollection.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    slug: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    surface_key: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'enterprise' },
    title: { type: DataTypes.STRING(300), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    filter_config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    sort_config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
  },
  {
    sequelize,
    tableName: 'case_study_collections',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ unique: true, fields: ['slug'], name: 'cs_collections_slug_unique' }],
  }
);

export default CaseStudyCollection;
