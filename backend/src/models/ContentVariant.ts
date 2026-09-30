import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ContentVariant - one platform's rendering of a ContentItem.
 *
 * `is_manually_edited` is load-bearing rather than informational: the spec requires that
 * generating variants never silently overwrites the operator's copy, so regeneration skips
 * any variant carrying this flag. Without it, "regenerate variants" quietly destroys work
 * somebody typed.
 *
 * `content_item_id` carries a real FK to its immediate parent; `channel_account_id` and
 * `tracked_link_id` are cross-domain and stay bare. See ensureContentOsSchema.ts's header.
 */
export type VariantValidationState = 'unvalidated' | 'valid' | 'invalid' | 'handoff_required';

export const VARIANT_VALIDATION_STATES: readonly VariantValidationState[] = [
  'unvalidated', 'valid', 'invalid', 'handoff_required',
];

export interface ContentVariantAttributes {
  id?: string;
  content_item_id: string;
  provider: string;
  channel_account_id?: string | null;
  body?: string | null;
  hashtags?: string | null;
  cta_text?: string | null;
  link_url?: string | null;
  tracked_link_id?: string | null;
  media_crop?: string | null;
  targeting_notes?: string | null;
  disclosure_text?: string | null;
  is_manually_edited?: boolean;
  edited_by?: string | null;
  edited_at?: Date | null;
  validation_state?: VariantValidationState;
  validation_errors?: any[];
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class ContentVariant extends Model<ContentVariantAttributes> implements ContentVariantAttributes {
  declare id: string;
  declare content_item_id: string;
  declare provider: string;
  declare channel_account_id: string | null;
  declare body: string | null;
  declare hashtags: string | null;
  declare cta_text: string | null;
  declare link_url: string | null;
  declare tracked_link_id: string | null;
  declare media_crop: string | null;
  declare targeting_notes: string | null;
  declare disclosure_text: string | null;
  declare is_manually_edited: boolean;
  declare edited_by: string | null;
  declare edited_at: Date | null;
  declare validation_state: VariantValidationState;
  declare validation_errors: any[];
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

ContentVariant.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    content_item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'content_items', key: 'id' },
    },
    provider: { type: DataTypes.STRING(40), allowNull: false },
    channel_account_id: { type: DataTypes.UUID, allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: true },
    hashtags: { type: DataTypes.TEXT, allowNull: true },
    cta_text: { type: DataTypes.STRING(200), allowNull: true },
    link_url: { type: DataTypes.TEXT, allowNull: true },
    tracked_link_id: { type: DataTypes.UUID, allowNull: true },
    media_crop: { type: DataTypes.STRING(30), allowNull: true },
    targeting_notes: { type: DataTypes.TEXT, allowNull: true },
    disclosure_text: { type: DataTypes.STRING(300), allowNull: true },
    is_manually_edited: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    edited_by: { type: DataTypes.UUID, allowNull: true },
    edited_at: { type: DataTypes.DATE, allowNull: true },
    validation_state: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'unvalidated' },
    validation_errors: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  { sequelize, tableName: 'content_variants', timestamps: true, underscored: true },
);

export default ContentVariant;
