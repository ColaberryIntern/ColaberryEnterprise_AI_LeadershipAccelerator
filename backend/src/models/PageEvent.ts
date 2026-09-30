import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface PageEventAttributes {
  id?: string;
  session_id: string;
  visitor_id: string;
  /**
   * Set by visitorTrackingService.resolveIdentity() once a visitor is known to
   * be a given lead, and backfilled historically from visitor_sessions.
   * Nullable: most page events belong to visitors who were never identified.
   * contextGraphService.ts:135-139 depends on this column existing.
   */
  lead_id?: number | null;
  event_type: string;
  page_url: string;
  page_path: string;
  page_title?: string | null;
  page_category?: string | null;
  event_data?: Record<string, any> | null;
  /** Multi-tenant ecosystem context. Nullable: tracking is fail-soft. */
  tenant_id?: string | null;
  brand_id?: string | null;
  source_id?: string | null;
  entry_point_id?: string | null;
  campaign_id?: string | null;
  campaign_lead_id?: string | null;
  organization_id?: string | null;
  timestamp: Date;
  created_at?: Date;
}

class PageEvent extends Model<PageEventAttributes> implements PageEventAttributes {
  declare id: string;
  declare session_id: string;
  declare visitor_id: string;
  declare lead_id: number | null;
  declare event_type: string;
  declare page_url: string;
  declare page_path: string;
  declare page_title: string | null;
  declare page_category: string | null;
  declare event_data: Record<string, any> | null;
  declare tenant_id: string | null;
  declare brand_id: string | null;
  declare source_id: string | null;
  declare entry_point_id: string | null;
  declare campaign_id: string | null;
  declare campaign_lead_id: string | null;
  declare organization_id: string | null;
  declare timestamp: Date;
  declare created_at: Date;
}

PageEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'visitor_sessions', key: 'id' },
    },
    visitor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'visitors', key: 'id' },
    },
    // No `references` here on purpose: the DDL adds the column without a foreign
    // key so Postgres never has to validate-scan this high-write table. Declaring
    // one in the model but not in the DDL would be a lie about the schema.
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    event_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    page_url: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    page_path: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    page_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    page_category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    event_data: {
      type: DataTypes.JSONB,
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
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'page_events',
    timestamps: false,
  }
);

export default PageEvent;
