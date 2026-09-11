import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * TrackedLink — one canonical, attributable destination for one campaign/placement/creative.
 *
 * Replaces the single `campaigns.tracking_link` VARCHAR, which allowed exactly one link
 * per campaign and recorded no clicks. A campaign now has as many tracked links as it has
 * creatives and placements, and each one accumulates its own clicks.
 *
 * Columns must match backend/src/db/ensureMarketingTrackingSchema.ts EXACTLY — a column
 * present in the DDL but absent here is invisible to Sequelize, so reads return undefined
 * and writes are silently dropped. The parity test in db/__tests__ enforces this.
 *
 * IMMUTABILITY: once `published_at` is set, the UTM fields and destination are frozen.
 * Changing them would retroactively rewrite what already-recorded clicks meant. Producing
 * a replacement and pointing `superseded_by` at it is the supported path.
 */
export type TrackedLinkStatus = 'draft' | 'active' | 'paused' | 'archived';

export const TRACKED_LINK_STATUSES: readonly TrackedLinkStatus[] = [
  'draft',
  'active',
  'paused',
  'archived',
];

export interface TrackedLinkAttributes {
  id?: string;
  tenant_id: string;
  /** Nullable on purpose: campaignBrandAssignment refuses to guess, so unbranded reads as "Unattributed". */
  brand_id?: string | null;
  campaign_id?: string | null;
  placement_id?: string | null;
  /** Stable creative code; becomes utm_content. Unique per campaign when present. */
  variant_code?: string | null;
  short_code: string;
  destination_url: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  status?: TrackedLinkStatus;
  consent_classification?: string | null;
  created_by?: string | null;
  published_at?: Date | null;
  /** Set to the replacement link's id when this one is retired. Attribution history stays intact. */
  superseded_by?: string | null;
  first_click_at?: Date | null;
  last_click_at?: Date | null;
  click_count?: number;
  metadata?: Record<string, any>;
  /**
   * NOTE on the timestamps, which are a known trap in this codebase's model style:
   * with `timestamps: true` + `underscored: true`, Sequelize names the ATTRIBUTE
   * `createdAt` and points it at the `created_at` COLUMN. So `link.createdAt` is
   * populated and `link.created_at` is undefined at runtime, despite the declaration
   * below. The declaration matches Brand/BrandDomain/SenderProfile for consistency;
   * read these through `createdAt` / `updatedAt`.
   */
  created_at?: Date;
  updated_at?: Date;
}

class TrackedLink extends Model<TrackedLinkAttributes> implements TrackedLinkAttributes {
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string | null;
  declare campaign_id: string | null;
  declare placement_id: string | null;
  declare variant_code: string | null;
  declare short_code: string;
  declare destination_url: string;
  declare utm_source: string | null;
  declare utm_medium: string | null;
  declare utm_campaign: string | null;
  declare utm_content: string | null;
  declare utm_term: string | null;
  declare status: TrackedLinkStatus;
  declare consent_classification: string | null;
  declare created_by: string | null;
  declare published_at: Date | null;
  declare superseded_by: string | null;
  declare first_click_at: Date | null;
  declare last_click_at: Date | null;
  declare click_count: number;
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

TrackedLink.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    campaign_id: { type: DataTypes.UUID, allowNull: true },
    placement_id: { type: DataTypes.UUID, allowNull: true },
    variant_code: { type: DataTypes.STRING(64), allowNull: true },
    short_code: { type: DataTypes.STRING(32), allowNull: false },
    destination_url: { type: DataTypes.TEXT, allowNull: false },
    utm_source: { type: DataTypes.STRING(100), allowNull: true },
    utm_medium: { type: DataTypes.STRING(100), allowNull: true },
    utm_campaign: { type: DataTypes.STRING(200), allowNull: true },
    utm_content: { type: DataTypes.STRING(200), allowNull: true },
    utm_term: { type: DataTypes.STRING(200), allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    consent_classification: { type: DataTypes.STRING(30), allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    superseded_by: { type: DataTypes.UUID, allowNull: true },
    first_click_at: { type: DataTypes.DATE, allowNull: true },
    last_click_at: { type: DataTypes.DATE, allowNull: true },
    click_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // NOT NULL in the DDL, so allowNull must match (see LinkClick.click_ids).
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    sequelize,
    tableName: 'tracked_links',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['short_code'], name: 'tracked_links_short_code_unique' },
      { fields: ['tenant_id', 'brand_id', 'campaign_id'], name: 'idx_tracked_links_scope' },
      { fields: ['campaign_id'], name: 'idx_tracked_links_campaign' },
      { fields: ['status'], name: 'idx_tracked_links_status' },
    ],
  },
);

export default TrackedLink;
