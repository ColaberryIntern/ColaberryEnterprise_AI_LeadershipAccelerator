import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommunicationPreference — what one person allows one brand to send them, per category.
 *
 * A single global marketing opt-out cannot express the real state of an ecosystem
 * contact. Someone can genuinely want CPN scholar updates, not want CPN fundraising
 * mail, want Colaberry Training course announcements, and have no relationship with AI
 * Flotation at all. One boolean flattens all four into a wrong answer.
 *
 * This is layered ON TOP OF, never in place of, the existing global suppression
 * (`unsubscribe_events`, bounce and complaint handling in the Mandrill webhook).
 * Infrastructure suppression is a fact about the ADDRESS — a hard bounce means the
 * mailbox does not accept mail, and no brand-level preference may override that.
 * The resolution order is therefore fixed:
 *
 *     global suppression (deny)  >  brand preference  >  brand default
 *
 * Absence of a row is NOT consent. The service treats "no row" as "no permission" for
 * marketing categories, so a new brand cannot inherit an implied opt-in from a
 * relationship the person formed with a different brand.
 */
export interface CommunicationPreferenceAttributes {
  id?: string;
  lead_id: number;
  tenant_id: string;
  brand_id: string;
  /** e.g. scholar_updates, fundraising, course_updates, product_news, transactional. */
  category: string;
  email_allowed?: boolean;
  sms_allowed?: boolean;
  voice_allowed?: boolean;
  /** How the preference was set: 'form_consent', 'preference_center', 'admin', 'import'. */
  source?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class CommunicationPreference
  extends Model<CommunicationPreferenceAttributes>
  implements CommunicationPreferenceAttributes
{
  declare id: string;
  declare lead_id: number;
  declare tenant_id: string;
  declare brand_id: string;
  declare category: string;
  declare email_allowed: boolean;
  declare sms_allowed: boolean;
  declare voice_allowed: boolean;
  declare source: string | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CommunicationPreference.init(
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
    category: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    // Default false, not true. An explicit allow is the only allow; see the class
    // comment on why absence of a row must never read as consent.
    email_allowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sms_allowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    voice_allowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    source: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'communication_preferences',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['lead_id', 'tenant_id', 'brand_id', 'category'],
        name: 'communication_preferences_lead_tenant_brand_category_unique',
      },
      { fields: ['tenant_id', 'brand_id'], name: 'idx_communication_preferences_tenant_brand' },
    ],
  }
);

export default CommunicationPreference;
