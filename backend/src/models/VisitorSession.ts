import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface VisitorSessionAttributes {
  id?: string;
  visitor_id: string;
  lead_id?: number | null;
  started_at: Date;
  ended_at?: Date | null;
  duration_seconds: number;
  pageview_count: number;
  event_count: number;
  entry_page?: string | null;
  exit_page?: string | null;
  referrer_url?: string | null;
  referrer_domain?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
  ip_address?: string | null;
  device_type?: string | null;
  is_bounce: boolean;
  landing_page_category?: string | null;
  site_slug?: string | null;
  /** Multi-tenant ecosystem context. Nullable: tracking is fail-soft. */
  tenant_id?: string | null;
  brand_id?: string | null;
  source_id?: string | null;
  entry_point_id?: string | null;
  campaign_id?: string | null;
  campaign_lead_id?: string | null;
  organization_id?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
}

class VisitorSession extends Model<VisitorSessionAttributes> implements VisitorSessionAttributes {
  declare id: string;
  declare visitor_id: string;
  declare lead_id: number | null;
  declare started_at: Date;
  declare ended_at: Date | null;
  declare duration_seconds: number;
  declare pageview_count: number;
  declare event_count: number;
  declare entry_page: string | null;
  declare exit_page: string | null;
  declare referrer_url: string | null;
  declare referrer_domain: string | null;
  declare utm_source: string | null;
  declare utm_campaign: string | null;
  declare utm_medium: string | null;
  declare ip_address: string | null;
  declare device_type: string | null;
  declare is_bounce: boolean;
  declare landing_page_category: string | null;
  declare site_slug: string | null;
  declare tenant_id: string | null;
  declare brand_id: string | null;
  declare source_id: string | null;
  declare entry_point_id: string | null;
  declare campaign_id: string | null;
  declare campaign_lead_id: string | null;
  declare organization_id: string | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
}

VisitorSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    visitor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'visitors', key: 'id' },
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    ended_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    pageview_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    event_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    entry_page: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    exit_page: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    referrer_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    referrer_domain: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    utm_source: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    utm_campaign: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    utm_medium: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    device_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    is_bounce: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    landing_page_category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    site_slug: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    // --- multi-tenant ecosystem context -------------------------------------
    // Declared here because the DDL adds these columns and Sequelize only ever
    // SELECTs, INSERTs or UPDATEs attributes the model knows about. A column that
    // exists in Postgres but not in the model is invisible: reads come back
    // undefined and writes are silently dropped. That is exactly what happened
    // before this block existed, and it left the whole tenancy runtime inert while
    // every test still passed, because the tests mock the models.
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    source_id: { type: DataTypes.UUID, allowNull: true },
    entry_point_id: { type: DataTypes.UUID, allowNull: true },
    campaign_id: { type: DataTypes.UUID, allowNull: true },
    campaign_lead_id: { type: DataTypes.UUID, allowNull: true },
    organization_id: { type: DataTypes.UUID, allowNull: true },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'visitor_sessions',
    timestamps: false,
  }
);

export default VisitorSession;
