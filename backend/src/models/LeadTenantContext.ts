import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * LeadTenantContext — one person's relationship with one brand.
 *
 * This is the table that makes the ecosystem possible without duplicating people.
 * `leads` stays the single canonical contact record; a human who applies for a CPN
 * scholarship, takes a Colaberry Training class, and later appears as an AI Flotation
 * prospect is ONE lead row with THREE context rows. Splitting leads per tenant would
 * break cross-brand journey reconstruction and fragment suppression state, which is
 * exactly what master plan §4 forbids.
 *
 * Ownership split, stated once so it is not re-litigated at every call site:
 *   - the canonical Lead owns identity (email, name, phone, company),
 *   - this row owns everything tenant-specific (lifecycle, consent, attribution),
 *   - the legacy Lead columns (`pipeline_stage`, `lead_temperature`, `consent_contact`,
 *     `source`, `form_type`) remain the compatibility surface for existing Colaberry
 *     Enterprise consumers until a later project retires them.
 *
 * First-touch fields are WRITE-ONCE. Once a brand relationship has a first source, that
 * is a historical fact and no later visit may overwrite it. Last-touch fields are
 * updated freely. Enforcing that in the service rather than the schema is deliberate:
 * a backfill correcting a genuinely wrong first-touch must remain possible.
 *
 * `lead_id` is INTEGER, not UUID, because `leads.id` is an INTEGER autoincrement.
 */
export interface LeadTenantContextAttributes {
  id?: string;
  lead_id: number;
  tenant_id: string;
  brand_id: string;
  organization_id?: string | null;

  /** e.g. scholarship_applicant, learner, b2b_build_prospect, platform_prospect. */
  relationship_type: string;
  status?: string;
  pipeline_stage?: string | null;
  lead_temperature?: string | null;

  /**
   * Consent is per brand, never global. Someone consenting to CPN scholarship updates
   * has NOT consented to AI Flotation sales mail, and treating those as one flag is
   * both a CAN-SPAM problem and a trust problem.
   */
  consent_contact?: boolean;
  consent_source?: string | null;
  consent_at?: Date | null;

  // --- first touch (write-once) ---
  first_source_id?: string | null;
  first_entry_point_id?: string | null;
  first_visitor_id?: string | null;
  first_session_id?: string | null;
  first_campaign_id?: string | null;
  first_campaign_lead_id?: string | null;
  first_touch_at?: Date | null;

  // --- last touch (mutable) ---
  last_source_id?: string | null;
  last_entry_point_id?: string | null;
  last_session_id?: string | null;
  last_campaign_id?: string | null;
  last_touch_at?: Date | null;

  assigned_platform_identity_id?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class LeadTenantContext
  extends Model<LeadTenantContextAttributes>
  implements LeadTenantContextAttributes
{
  declare id: string;
  declare lead_id: number;
  declare tenant_id: string;
  declare brand_id: string;
  declare organization_id: string | null;
  declare relationship_type: string;
  declare status: string;
  declare pipeline_stage: string | null;
  declare lead_temperature: string | null;
  declare consent_contact: boolean;
  declare consent_source: string | null;
  declare consent_at: Date | null;
  declare first_source_id: string | null;
  declare first_entry_point_id: string | null;
  declare first_visitor_id: string | null;
  declare first_session_id: string | null;
  declare first_campaign_id: string | null;
  declare first_campaign_lead_id: string | null;
  declare first_touch_at: Date | null;
  declare last_source_id: string | null;
  declare last_entry_point_id: string | null;
  declare last_session_id: string | null;
  declare last_campaign_id: string | null;
  declare last_touch_at: Date | null;
  declare assigned_platform_identity_id: string | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

LeadTenantContext.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
    },
    brand_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'brands', key: 'id' },
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    relationship_type: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'active',
    },
    pipeline_stage: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    lead_temperature: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    consent_contact: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    consent_source: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    consent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Attribution columns carry no foreign keys. They point at high-churn tracking rows
    // (sessions, page events, campaign leads) and a constraint here would mean a
    // retention sweep on those tables could not delete without first rewriting history
    // on this one. The IDs are recorded as evidence, not as live references.
    first_source_id: { type: DataTypes.UUID, allowNull: true },
    first_entry_point_id: { type: DataTypes.UUID, allowNull: true },
    first_visitor_id: { type: DataTypes.UUID, allowNull: true },
    first_session_id: { type: DataTypes.UUID, allowNull: true },
    first_campaign_id: { type: DataTypes.UUID, allowNull: true },
    first_campaign_lead_id: { type: DataTypes.UUID, allowNull: true },
    first_touch_at: { type: DataTypes.DATE, allowNull: true },

    last_source_id: { type: DataTypes.UUID, allowNull: true },
    last_entry_point_id: { type: DataTypes.UUID, allowNull: true },
    last_session_id: { type: DataTypes.UUID, allowNull: true },
    last_campaign_id: { type: DataTypes.UUID, allowNull: true },
    last_touch_at: { type: DataTypes.DATE, allowNull: true },

    assigned_platform_identity_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'lead_tenant_contexts',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['lead_id', 'tenant_id', 'brand_id'],
        name: 'lead_tenant_contexts_lead_tenant_brand_unique',
      },
      {
        fields: ['tenant_id', 'brand_id', 'pipeline_stage'],
        name: 'idx_lead_tenant_contexts_tenant_brand_stage',
      },
      { fields: ['lead_id'], name: 'idx_lead_tenant_contexts_lead' },
    ],
  }
);

export default LeadTenantContext;
