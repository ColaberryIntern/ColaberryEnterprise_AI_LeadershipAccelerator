import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * LinkClick — one recorded click on a TrackedLink. Append-only.
 *
 * This is the row that did not exist before. The platform could generate a tracking link
 * but had nowhere to record that anyone followed it, so click-through, click-to-session
 * match rate, and every cost-per-click figure were uncomputable.
 *
 * Conventions this follows, and one correction worth recording:
 *
 * - **`tracked_link_id` HAS a foreign key to its parent.** An earlier draft gave it none,
 *   justified as "what page_events and visitor_sessions do". That was wrong: `PageEvent.ts:65,70`
 *   declares real `references`, and `seedQrTracking.ts:32` gives `qr_scan_events.qr_code_id`
 *   a `REFERENCES qr_codes(id)`. qr_scan_events is the exact analogue of this table and it
 *   has the FK. The real convention is narrower than "high-write tables skip FKs" — the edge
 *   to the immediate parent is constrained; only cross-domain refs are left bare.
 *   No CASCADE: a delete must be refused while clicks exist, because clicks are attribution
 *   history. Retirement is `superseded_by` on the link, not deletion.
 * - **tenant_id / brand_id / campaign_id are denormalized bare UUIDs with no FK.** These are
 *   the cross-domain refs, and they follow `PageEvent.ts:72` ("No `references` here on
 *   purpose") and ensureMultiTenantSchema's treatment of the tenancy columns it adds to
 *   tracking tables. Denormalized rather than joined because this is a high-volume
 *   analytics table and every report would otherwise pay the join.
 * - **BIGSERIAL id**, matching qr_scan_events, so the (tracked_link_id, occurred_at)
 *   index stays dense.
 * - **timestamps: false** with an explicit created_at: this table is append-only and has
 *   no updated_at. Sequelize's default timestamp handling would invent one.
 *
 * PRIVACY: `ip_hash` is a SHA-256 digest — the raw address is never stored, matching
 * qrRedirectRoutes. Click IDs get first-class indexed columns for adopted platforms plus a
 * `click_ids` JSONB overflow for ones we have not adopted yet; the overflow exists so a new
 * platform does not require a migration, NOT as a general dumping ground.
 */
export interface LinkClickAttributes {
  id?: string;
  tracked_link_id: string;
  tenant_id?: string | null;
  brand_id?: string | null;
  campaign_id?: string | null;
  occurred_at?: Date;
  /** SHA-256 of the client IP. Never the address itself. */
  ip_hash?: string | null;
  user_agent?: string | null;
  referrer?: string | null;
  visitor_fingerprint?: string | null;
  session_id?: string | null;
  is_bot?: boolean;
  bot_reason?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  msclkid?: string | null;
  ttclid?: string | null;
  /** Overflow for click IDs from platforms not yet adopted as first-class columns. */
  click_ids?: Record<string, any>;
  created_at?: Date;
}

class LinkClick extends Model<LinkClickAttributes> implements LinkClickAttributes {
  declare id: string;
  declare tracked_link_id: string;
  declare tenant_id: string | null;
  declare brand_id: string | null;
  declare campaign_id: string | null;
  declare occurred_at: Date;
  declare ip_hash: string | null;
  declare user_agent: string | null;
  declare referrer: string | null;
  declare visitor_fingerprint: string | null;
  declare session_id: string | null;
  declare is_bot: boolean;
  declare bot_reason: string | null;
  declare fbclid: string | null;
  declare gclid: string | null;
  declare msclkid: string | null;
  declare ttclid: string | null;
  declare click_ids: Record<string, any>;
  declare created_at: Date;
}

LinkClick.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    tracked_link_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tracked_links', key: 'id' },
    },
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    campaign_id: { type: DataTypes.UUID, allowNull: true },
    occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    ip_hash: { type: DataTypes.CHAR(64), allowNull: true },
    user_agent: { type: DataTypes.TEXT, allowNull: true },
    referrer: { type: DataTypes.TEXT, allowNull: true },
    visitor_fingerprint: { type: DataTypes.STRING(64), allowNull: true },
    session_id: { type: DataTypes.UUID, allowNull: true },
    is_bot: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    bot_reason: { type: DataTypes.STRING(64), allowNull: true },
    fbclid: { type: DataTypes.STRING(255), allowNull: true },
    gclid: { type: DataTypes.STRING(255), allowNull: true },
    msclkid: { type: DataTypes.STRING(255), allowNull: true },
    ttclid: { type: DataTypes.STRING(255), allowNull: true },
    // NOT NULL in the DDL, so allowNull must match. An explicit `null` from a caller
    // otherwise passes Sequelize validation and takes a Postgres NOT NULL violation at insert.
    click_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'link_clicks',
    timestamps: false,
    indexes: [
      { fields: ['tracked_link_id', 'occurred_at'], name: 'idx_link_clicks_link_time' },
      { fields: ['occurred_at'], name: 'idx_link_clicks_occurred_at' },
      { fields: ['tenant_id', 'brand_id', 'occurred_at'], name: 'idx_link_clicks_scope_time' },
      { fields: ['campaign_id'], name: 'idx_link_clicks_campaign' },
    ],
  },
);

export default LinkClick;
