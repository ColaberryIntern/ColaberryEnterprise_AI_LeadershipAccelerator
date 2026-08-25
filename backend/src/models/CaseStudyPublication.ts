import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudyPublication — binds ONE approved snapshot to ONE surface.
 *
 * This is the point of the architecture: canonical truth lives in `case_studies`,
 * and adding Training or AI Flotation later is a row here, not a schema change and
 * not a second database. `UNIQUE(case_study_id, surface_key)` in the DDL is what
 * makes publishing idempotent.
 *
 * `published_snapshot_id` is what pins published content: a later sync creates a
 * new draft snapshot but never moves this pointer without an explicit republish.
 * If that column were absent from this model, Sequelize would drop writes to it
 * and published content would silently follow the newest draft — the exact failure
 * the versioning model exists to prevent.
 *
 * `tenant_id` / `brand_id` are bare UUIDs with no FK, matching the 2026-08-22
 * tenancy precedent documented in the ensureCaseStudySchema.ts header.
 */
export interface CaseStudyPublicationAttributes {
  id?: string;
  case_study_id: string;
  /** enterprise | training | ai-flotation | refactored */
  surface_key: string;
  /** draft | published | unpublished */
  status?: string;
  published_snapshot_id?: string | null;
  tenant_id?: string | null;
  brand_id?: string | null;
  featured?: boolean;
  featured_rank?: number | null;
  surface_title_override?: string | null;
  surface_summary_override?: string | null;
  section_order?: any[] | null;
  hidden_sections?: any[] | null;
  cta_profile_key?: string | null;
  published_by?: string | null;
  published_at?: Date | null;
  unpublished_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class CaseStudyPublication
  extends Model<CaseStudyPublicationAttributes>
  implements CaseStudyPublicationAttributes
{
  declare id: string;
  declare case_study_id: string;
  declare surface_key: string;
  declare status: string;
  declare published_snapshot_id: string | null;
  declare tenant_id: string | null;
  declare brand_id: string | null;
  declare featured: boolean;
  declare featured_rank: number | null;
  declare surface_title_override: string | null;
  declare surface_summary_override: string | null;
  declare section_order: any[] | null;
  declare hidden_sections: any[] | null;
  declare cta_profile_key: string | null;
  declare published_by: string | null;
  declare published_at: Date | null;
  declare unpublished_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyPublication.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    surface_key: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    published_snapshot_id: { type: DataTypes.UUID, allowNull: true },
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    featured_rank: { type: DataTypes.INTEGER, allowNull: true },
    surface_title_override: { type: DataTypes.STRING(300), allowNull: true },
    surface_summary_override: { type: DataTypes.TEXT, allowNull: true },
    section_order: { type: DataTypes.JSONB, allowNull: true },
    hidden_sections: { type: DataTypes.JSONB, allowNull: true },
    cta_profile_key: { type: DataTypes.STRING(80), allowNull: true },
    published_by: { type: DataTypes.STRING(255), allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    unpublished_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'case_study_publications',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['case_study_id', 'surface_key'],
        name: 'cs_publications_unique_case_surface',
      },
      {
        fields: ['surface_key', 'status', 'featured'],
        name: 'idx_cs_publications_surface_status_featured',
      },
    ],
  }
);

export default CaseStudyPublication;
