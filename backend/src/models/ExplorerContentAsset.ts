import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { ExplorerAssetType } from '../types/explorerGrowth';

/**
 * explorer_content_assets — the Content Intelligence Registry INDEX.
 * Plan: docs/EXPLORER_GROWTH_OS_PLAN.md §5.4 T5, §10.
 *
 * Deliberately an INDEX over authoritative sources, NOT a second source of
 * truth. Two kinds of row:
 *
 *  - PROJECTED (`source_system` = network_videos | blog_posts | podcasts |
 *    cohorts | live_sessions | open_house_events | community_rooms |
 *    curriculum_type_definitions): refreshed on a cron, `source_id` points at
 *    the real record. Facts (dates, seats, prices, URLs) are RE-RESOLVED FROM
 *    THE SOURCE AT SEND TIME and never read from this table. This table answers
 *    "which asset?"; the source answers "what is true about it?". That split is
 *    what makes the "AI may select, never invent" rule structural rather than
 *    aspirational, and it is why a cohort date changing after an action is
 *    queued still propagates correctly.
 *
 *  - NATIVE (`source_system='manual'`): for assets with no queryable source
 *    today — case studies, internships, certifications, free tools. These are
 *    human-seeded and human-reviewed.
 *
 * Rows are marked `active=false` rather than deleted when a source record
 * disappears, because a historical decision may reference them.
 */
interface ExplorerContentAssetAttributes {
  id?: string;
  asset_type: ExplorerAssetType;
  source_system: string;
  source_id?: string | null;
  title: string;
  summary?: string | null;
  url?: string | null;
  topic_tags?: string[];
  affinity_tags?: string[];
  journey_stage_tags?: string[];
  audience_tags?: string[];
  cta_type?: string | null;
  priority?: number;
  proof_type?: string | null;
  allowed_channels?: string[];
  published_at?: Date | null;
  starts_at?: Date | null;
  expires_at?: Date | null;
  active?: boolean;
  metadata?: Record<string, any>;
  synced_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class ExplorerContentAsset
  extends Model<ExplorerContentAssetAttributes>
  implements ExplorerContentAssetAttributes
{
  declare id: string;
  declare asset_type: ExplorerAssetType;
  declare source_system: string;
  declare source_id: string | null;
  declare title: string;
  declare summary: string | null;
  declare url: string | null;
  declare topic_tags: string[];
  declare affinity_tags: string[];
  declare journey_stage_tags: string[];
  declare audience_tags: string[];
  declare cta_type: string | null;
  declare priority: number;
  declare proof_type: string | null;
  declare allowed_channels: string[];
  declare published_at: Date | null;
  declare starts_at: Date | null;
  declare expires_at: Date | null;
  declare active: boolean;
  declare metadata: Record<string, any>;
  declare synced_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ExplorerContentAsset.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    asset_type: { type: DataTypes.STRING(32), allowNull: false },
    source_system: {
      type: DataTypes.STRING(48),
      allowNull: false,
      comment: "Authoritative table this projects from, or 'manual' for human-seeded rows.",
    },
    source_id: {
      type: DataTypes.STRING(128),
      allowNull: true,
      comment: 'UNIQUE with source_system where not null — makes the sync an upsert.',
    },
    title: { type: DataTypes.TEXT, allowNull: false },
    summary: { type: DataTypes.TEXT, allowNull: true },
    url: { type: DataTypes.TEXT, allowNull: true },
    topic_tags: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
    affinity_tags: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
    journey_stage_tags: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
    },
    audience_tags: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
    cta_type: { type: DataTypes.STRING(32), allowNull: true },
    priority: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 50 },
    proof_type: { type: DataTypes.STRING(32), allowNull: true },
    allowed_channels: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: ['email'],
    },
    published_at: { type: DataTypes.DATE, allowNull: true },
    starts_at: { type: DataTypes.DATE, allowNull: true },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Past expiry makes an asset unselectable — an expired event can never be cited.',
    },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    synced_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'explorer_content_assets',
    timestamps: false,
  },
);

export default ExplorerContentAsset;
