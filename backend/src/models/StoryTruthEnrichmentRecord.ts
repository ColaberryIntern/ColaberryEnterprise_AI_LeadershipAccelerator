import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * StoryTruthEnrichmentRecord - one enrichment event a story produced, and
 * what the merge did with it. Storage only; the contract is in
 * services/sbp/storyEnrichmentContract.ts and the rules in enrichmentMerge.ts.
 *
 * Columns must match backend/src/db/ensureStoryEnrichmentSchema.ts EXACTLY.
 */

export type EnrichmentOutcome = 'merged' | 'no_op' | 'refused' | 'stale';

export interface StoryTruthEnrichmentAttributes {
  id?: string;
  project_id: string;
  story_id: string;
  idempotency_key: string;
  source_commit_sha: string | null;
  base_revision: number;
  merged_revision: number | null;
  outcome: EnrichmentOutcome;
  counts: Record<string, number>;
  refused: Array<{ dimension: string; value: string; reason: string }>;
  event: Record<string, unknown>;
  correlation_id: string | null;
  created_at?: Date;
}

class StoryTruthEnrichmentRecord
  extends Model<StoryTruthEnrichmentAttributes>
  implements StoryTruthEnrichmentAttributes {
  declare id: string;
  declare project_id: string;
  declare story_id: string;
  declare idempotency_key: string;
  declare source_commit_sha: string | null;
  declare base_revision: number;
  declare merged_revision: number | null;
  declare outcome: EnrichmentOutcome;
  declare counts: Record<string, number>;
  declare refused: Array<{ dimension: string; value: string; reason: string }>;
  declare event: Record<string, unknown>;
  declare correlation_id: string | null;
  declare created_at: Date;
}

StoryTruthEnrichmentRecord.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    story_id: { type: DataTypes.STRING(16), allowNull: false },
    idempotency_key: { type: DataTypes.STRING(64), allowNull: false },
    source_commit_sha: { type: DataTypes.STRING(40), allowNull: true },
    base_revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    merged_revision: { type: DataTypes.INTEGER, allowNull: true },
    outcome: { type: DataTypes.STRING(24), allowNull: false },
    counts: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    refused: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    event: { type: DataTypes.JSONB, allowNull: false },
    correlation_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'story_truth_enrichments',
    timestamps: false,
  },
);

export default StoryTruthEnrichmentRecord;
