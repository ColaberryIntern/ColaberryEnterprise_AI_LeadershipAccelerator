import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ContentItem - the canonical content package. One idea, many platform variants.
 *
 * Columns must match backend/src/db/ensureContentOsSchema.ts EXACTLY; the parity test in
 * db/__tests__ enforces it. A column present in the DDL but absent here is invisible to
 * Sequelize, so reads return undefined and writes are silently dropped.
 *
 * `revision` is the approval-staleness mechanism. It increments on every edit to an
 * approval-relevant field, and an approval decided at an older revision no longer authorises
 * a publish (spec 8.3). An integer rather than a content hash, so that "why was this
 * approval invalidated" is answerable from a single log line.
 */
export type ContentItemStatus =
  | 'idea' | 'draft' | 'ready_for_review' | 'changes_requested' | 'approved'
  | 'scheduled' | 'publishing' | 'published'
  // Exceptional states (spec 8.3), deliberately in the same union: a status field that
  // cannot express failure ends up with failure encoded in a second, unqueryable column.
  | 'validation_failed' | 'publish_failed' | 'partially_published'
  | 'cancelled' | 'expired' | 'removed_by_provider' | 'archived';

export const CONTENT_ITEM_STATUSES: readonly ContentItemStatus[] = [
  'idea', 'draft', 'ready_for_review', 'changes_requested', 'approved',
  'scheduled', 'publishing', 'published',
  'validation_failed', 'publish_failed', 'partially_published',
  'cancelled', 'expired', 'removed_by_provider', 'archived',
];

export interface ContentItemAttributes {
  id?: string;
  tenant_id: string;
  brand_id?: string | null;
  campaign_id?: string | null;
  title: string;
  canonical_body?: string | null;
  content_type?: string;
  status?: ContentItemStatus;
  owner_admin_id?: string | null;
  created_by?: string | null;
  template_id?: string | null;
  scheduled_for?: Date | null;
  published_at?: Date | null;
  revision?: number;
  ai_model?: string | null;
  ai_prompt_version?: string | null;
  ai_template_version?: string | null;
  human_approved?: boolean;
  metadata?: Record<string, any>;
  archived_at?: Date | null;
  /** Read via createdAt/updatedAt at runtime - see the timestamps note in TrackedLink.ts. */
  created_at?: Date;
  updated_at?: Date;
}

class ContentItem extends Model<ContentItemAttributes> implements ContentItemAttributes {
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string | null;
  declare campaign_id: string | null;
  declare title: string;
  declare canonical_body: string | null;
  declare content_type: string;
  declare status: ContentItemStatus;
  declare owner_admin_id: string | null;
  declare created_by: string | null;
  declare template_id: string | null;
  declare scheduled_for: Date | null;
  declare published_at: Date | null;
  declare revision: number;
  declare ai_model: string | null;
  declare ai_prompt_version: string | null;
  declare ai_template_version: string | null;
  declare human_approved: boolean;
  declare metadata: Record<string, any>;
  declare archived_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ContentItem.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    campaign_id: { type: DataTypes.UUID, allowNull: true },
    title: { type: DataTypes.STRING(300), allowNull: false },
    canonical_body: { type: DataTypes.TEXT, allowNull: true },
    content_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'social_post' },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'idea' },
    owner_admin_id: { type: DataTypes.UUID, allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    template_id: { type: DataTypes.UUID, allowNull: true },
    scheduled_for: { type: DataTypes.DATE, allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    ai_model: { type: DataTypes.STRING(120), allowNull: true },
    ai_prompt_version: { type: DataTypes.STRING(60), allowNull: true },
    ai_template_version: { type: DataTypes.STRING(60), allowNull: true },
    human_approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    archived_at: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'content_items', timestamps: true, underscored: true },
);

export default ContentItem;
