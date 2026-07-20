import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { TimelineBucket } from './TimelineCard';

/**
 * TimelineSectionRule — per-(program, section) gating rules for the Timeline
 * classroom. A "section" is a bucket (Pre-Class, Learn, Reflect, …); its `rules`
 * are an array of unlock predicates that lock EVERY card in that section until
 * the predicates pass. Per-card overrides live on `timeline_cards.unlock_rules`;
 * the gating engine (timelineGatingService) merges section rules + card rules.
 *
 * One row per (program_id, bucket) — the unique index makes authoring an
 * idempotent upsert. Created via raw SQL in server.ts `ensureTimelineEngineSchema`
 * (the repo runs no global sequelize.sync).
 */
export interface TimelineSectionRuleAttributes {
  id?: string;
  program_id: string;
  bucket: TimelineBucket;
  rules?: any;          // JSONB UnlockPredicate[]
  active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class TimelineSectionRule
  extends Model<TimelineSectionRuleAttributes>
  implements TimelineSectionRuleAttributes {
  declare id: string;
  declare program_id: string;
  declare bucket: TimelineBucket;
  declare rules: any;
  declare active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

TimelineSectionRule.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    program_id: { type: DataTypes.UUID, allowNull: false },
    bucket: { type: DataTypes.STRING(20), allowNull: false },
    rules: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'timeline_section_rules',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['program_id', 'bucket'] },
    ],
  }
);

export default TimelineSectionRule;
