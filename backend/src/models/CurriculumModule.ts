import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CurriculumModuleAttributes {
  id?: string;
  cohort_id: string;
  program_id?: string;
  module_number: number;
  title: string;
  description?: string;
  skill_area: 'strategy_trust' | 'governance' | 'requirements' | 'build_discipline' | 'executive_authority';
  total_lessons: number;
  unlock_rule: 'sequential' | 'manual';
  // --- Canonical course structure (additive, nullable). See docs/training-program-2026-q3/CANONICAL_COURSE_STRUCTURE.md ---
  intensive_number?: number | null;
  intensive_title?: string | null;
  intensive_standalone_value?: string | null;
  intensive_build_due?: string | null;
  week_number?: number | null;
  anthropic_course_title?: string | null;
  anthropic_course_slug?: string | null;
  anthropic_course_url?: string | null;
  anthropic_course_status?: 'confirmed' | 'closest_fit' | 'loose_fit' | 'colaberry_authored' | 'external_gate' | null;
  created_at?: Date;
}

class CurriculumModule extends Model<CurriculumModuleAttributes> implements CurriculumModuleAttributes {
  declare id: string;
  declare cohort_id: string;
  declare program_id: string;
  declare module_number: number;
  declare title: string;
  declare description: string;
  declare skill_area: 'strategy_trust' | 'governance' | 'requirements' | 'build_discipline' | 'executive_authority';
  declare total_lessons: number;
  declare unlock_rule: 'sequential' | 'manual';
  declare intensive_number: number | null;
  declare intensive_title: string | null;
  declare intensive_standalone_value: string | null;
  declare intensive_build_due: string | null;
  declare week_number: number | null;
  declare anthropic_course_title: string | null;
  declare anthropic_course_slug: string | null;
  declare anthropic_course_url: string | null;
  declare anthropic_course_status: 'confirmed' | 'closest_fit' | 'loose_fit' | 'colaberry_authored' | 'external_gate' | null;
  declare created_at: Date;
}

CurriculumModule.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    cohort_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'cohorts', key: 'id' },
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'program_blueprints', key: 'id' },
    },
    module_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    skill_area: {
      type: DataTypes.ENUM('strategy_trust', 'governance', 'requirements', 'build_discipline', 'executive_authority'),
      allowNull: false,
    },
    total_lessons: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 6,
    },
    unlock_rule: {
      type: DataTypes.ENUM('sequential', 'manual'),
      allowNull: false,
      defaultValue: 'sequential',
    },
    intensive_number: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    intensive_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    intensive_standalone_value: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    intensive_build_due: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    week_number: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    anthropic_course_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    anthropic_course_slug: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    anthropic_course_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    anthropic_course_status: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'curriculum_modules',
    timestamps: false,
  }
);

export default CurriculumModule;
