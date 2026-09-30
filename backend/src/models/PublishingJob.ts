import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

import type { PublishingJobState } from '../services/publishing/publishingQueueQuery';

/**
 * PublishingJob - one intended publication of one content variant to one account at one time.
 *
 * `publish_at` is NOT NULL and is genuinely filtered on. That distinction is the entire point
 * of this table: `OpenclawTask.scheduled_for` already exists, is indexed, and is ignored by
 * the worker that reads it, so a future-dated task publishes immediately. The due-jobs
 * predicate lives in services/publishing/publishingQueueQuery.ts as a tested pure function
 * precisely so this column cannot quietly become decorative in the same way.
 *
 * `state` is typed from that module rather than redeclared here, so the queue's notion of a
 * runnable state and the model's cannot drift apart.
 *
 * Columns must match backend/src/db/ensurePublishingSchema.ts EXACTLY.
 */
export interface PublishingJobAttributes {
  id?: string;
  tenant_id: string;
  brand_id?: string | null;
  content_item_id: string;
  content_variant_id?: string | null;
  /** Bare UUID, no FK: marketing_channel_accounts does not exist while T003 is gated on ESC-001. */
  channel_account_id?: string | null;
  provider: string;
  publish_at: Date;
  /** Distinguishes one occurrence of a recurring slot from another. Part of the semantic key. */
  scheduled_occurrence: string;
  /** Part of the semantic key: publishing revision 3 after revision 2 shipped is NOT a duplicate. */
  content_revision?: number;
  idempotency_key: string;
  state?: PublishingJobState;
  attempts?: number;
  max_attempts?: number;
  next_retry_at?: Date | null;
  last_error?: string | null;
  last_error_class?: string | null;
  claimed_by?: string | null;
  claimed_at?: Date | null;
  /** The autonomy/brand policy as it stood when the job was queued, so an audit can say what rules applied. */
  policy_snapshot?: Record<string, any>;
  dead_lettered_at?: Date | null;
  dead_letter_reason?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class PublishingJob extends Model<PublishingJobAttributes> implements PublishingJobAttributes {
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string | null;
  declare content_item_id: string;
  declare content_variant_id: string | null;
  declare channel_account_id: string | null;
  declare provider: string;
  declare publish_at: Date;
  declare scheduled_occurrence: string;
  declare content_revision: number;
  declare idempotency_key: string;
  declare state: PublishingJobState;
  declare attempts: number;
  declare max_attempts: number;
  declare next_retry_at: Date | null;
  declare last_error: string | null;
  declare last_error_class: string | null;
  declare claimed_by: string | null;
  declare claimed_at: Date | null;
  declare policy_snapshot: Record<string, any>;
  declare dead_lettered_at: Date | null;
  declare dead_letter_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

PublishingJob.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    content_item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'content_items', key: 'id' },
    },
    content_variant_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'content_variants', key: 'id' },
    },
    channel_account_id: { type: DataTypes.UUID, allowNull: true },
    provider: { type: DataTypes.STRING(40), allowNull: false },
    publish_at: { type: DataTypes.DATE, allowNull: false },
    scheduled_occurrence: { type: DataTypes.STRING(64), allowNull: false },
    content_revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    idempotency_key: { type: DataTypes.STRING(200), allowNull: false },
    state: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    max_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
    next_retry_at: { type: DataTypes.DATE, allowNull: true },
    last_error: { type: DataTypes.TEXT, allowNull: true },
    last_error_class: { type: DataTypes.STRING(80), allowNull: true },
    claimed_by: { type: DataTypes.STRING(120), allowNull: true },
    claimed_at: { type: DataTypes.DATE, allowNull: true },
    policy_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    dead_lettered_at: { type: DataTypes.DATE, allowNull: true },
    dead_letter_reason: { type: DataTypes.STRING(200), allowNull: true },
  },
  { sequelize, tableName: 'publishing_jobs', timestamps: true, underscored: true },
);

export default PublishingJob;
