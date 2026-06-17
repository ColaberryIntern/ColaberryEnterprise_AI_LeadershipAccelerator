import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Per-week (module_number 1-12) deep-link to the Anthropic Skilljar course for that
// week, per BC decision 9985688697 (deep-link delivery on enterprise.colaberry.com).
// Cohort-agnostic reference data: the week->course map is the same for every cohort in
// v1. Seeded by backend/src/seeds/seedCurriculumCourseLinks.ts.
export type CourseLinkProvider = 'skilljar' | 'external_cert' | 'colaberry_original';
export type CourseLinkStatus = 'confirmed' | 'pending_confirmation' | 'not_applicable';

class CurriculumCourseLink extends Model {
  declare id: string;
  declare module_number: number;
  declare provider: CourseLinkProvider;
  declare course_title: string | null;
  declare course_url: string | null;
  declare link_status: CourseLinkStatus;
  declare created_at: Date;
  declare updated_at: Date;
}

CurriculumCourseLink.init(
  {
    id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    module_number: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    provider:      { type: DataTypes.STRING(30), allowNull: false },
    course_title:  { type: DataTypes.TEXT, allowNull: true },
    course_url:    { type: DataTypes.TEXT, allowNull: true },
    link_status:   { type: DataTypes.STRING(30), allowNull: false },
    created_at:    { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at:    { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'curriculum_course_links',
    timestamps: false,
  }
);

export default CurriculumCourseLink;
