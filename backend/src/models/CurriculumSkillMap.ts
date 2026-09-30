import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { ArchitectureSkillId } from '../constants/architectureSkills';

/**
 * CurriculumSkillMap — the storage for CAPE Phase 3's curriculum-to-skill resolution
 * hierarchy (design doc §7, §13). One row per (scope, version). `scope_type='type'`
 * keys on `type_slug` (a Curriculum Type default), `'week'` keys on `week_number` (a
 * Week Blueprint target), `'card'` keys on `card_id` (a per-card override). Only one
 * row per scope key may have `is_current=true` — editing a mapping inserts a NEW row
 * with `version+1` and flips the prior row's `is_current` to false (see
 * capeCurriculumSkillMapService.ts's `createOrVersionMapping`); the old version's row
 * is preserved unchanged so historical evidence stamped under it is never silently
 * rewritten (design doc §7 "later mapping edits do not rewrite historical evidence
 * silently").
 *
 * `source:'ai_suggested'` rows always have `approved:false` and are NEVER returned by
 * `resolveSkillMapping()` — an AI-suggested draft is an authoring aid only; a human
 * must approve it (which creates a NEW `source:'human'` row) before it can resolve
 * (design doc §7 resolution hierarchy, item 4).
 */
export type CurriculumSkillMapScope = 'type' | 'week' | 'card';
export type CurriculumSkillMapSource = 'human' | 'ai_suggested';
export type EvidenceBandName = 'claim' | 'knowledge' | 'application' | 'judgment';
export type CreditStrength = 'none' | 'low' | 'medium' | 'high' | 'capstone';

/** design doc §7 `ArchitectureSkillImpact` interface, as a real exported TS type. */
export interface ArchitectureSkillImpact {
  skill_id: ArchitectureSkillId;
  weight: number;
  bands: EvidenceBandName[];
  credit_strength: CreditStrength;
  evidence_required: boolean;
  max_credit: number;
}

/** design doc §7 `LearningPlacementContract` interface (the resolved shape returned
 * by resolution and stamped onto a TimelineCard at publish time). */
export interface LearningPlacementContract {
  skill_impacts: ArchitectureSkillImpact[];
  prerequisite_skills: Array<{ skill_id: ArchitectureSkillId; min_placement: number }>;
  recommended_range: { min: number; max: number };
  freshness_days?: number | null;
  reviewable: boolean;
}

export interface CurriculumSkillMapAttributes {
  id?: string;
  scope_type: CurriculumSkillMapScope;
  type_slug?: string | null;
  week_number?: number | null;
  card_id?: string | null;
  skill_impacts: ArchitectureSkillImpact[];
  prerequisite_skills: Array<{ skill_id: string; min_placement: number }>;
  recommended_range: { min: number; max: number } | Record<string, never>;
  freshness_days?: number | null;
  reviewable: boolean;
  source: CurriculumSkillMapSource;
  approved: boolean;
  version: number;
  is_current: boolean;
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class CurriculumSkillMap extends Model<CurriculumSkillMapAttributes> implements CurriculumSkillMapAttributes {
  declare id: string;
  declare scope_type: CurriculumSkillMapScope;
  declare type_slug: string | null;
  declare week_number: number | null;
  declare card_id: string | null;
  declare skill_impacts: ArchitectureSkillImpact[];
  declare prerequisite_skills: Array<{ skill_id: string; min_placement: number }>;
  declare recommended_range: { min: number; max: number } | Record<string, never>;
  declare freshness_days: number | null;
  declare reviewable: boolean;
  declare source: CurriculumSkillMapSource;
  declare approved: boolean;
  declare version: number;
  declare is_current: boolean;
  declare created_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CurriculumSkillMap.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    scope_type: { type: DataTypes.STRING(10), allowNull: false },
    type_slug: { type: DataTypes.STRING(100), allowNull: true },
    week_number: { type: DataTypes.INTEGER, allowNull: true },
    card_id: { type: DataTypes.UUID, allowNull: true },
    skill_impacts: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    prerequisite_skills: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    recommended_range: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    freshness_days: { type: DataTypes.INTEGER, allowNull: true },
    reviewable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'human' },
    approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'curriculum_skill_maps',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['scope_type'] },
      { fields: ['approved'] },
    ],
  }
);

export default CurriculumSkillMap;
