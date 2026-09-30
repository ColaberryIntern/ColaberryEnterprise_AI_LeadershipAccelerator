import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * SenderProfile — an approved outbound identity for one brand.
 *
 * Today the only per-campaign sender control is `campaigns.settings.sender_email`, an
 * untyped JSONB value read at send time with no verification of any kind. That is
 * survivable with one brand and one domain; it is not survivable once CPN, AI Flotation
 * and Refactored are sending from their own domains, because nothing would stop a CPN
 * campaign going out over the AI Flotation envelope.
 *
 * A campaign therefore selects a *profile*, and the profile — not the campaign author —
 * decides the From address, the envelope domain, the tracking domain, the Reply-To, the
 * unsubscribe URL and the CAN-SPAM postal address.
 *
 * `status` and the sending domain's verification are checked before every LIVE send and
 * the send is blocked when either fails. Test-mode sends record the preflight result but
 * are not blocked by it, so a brand can be wired up and exercised before DNS is live.
 */
export type SenderProfileStatus = 'draft' | 'pending_verification' | 'active' | 'suspended';
export type SenderProvider = 'mandrill' | 'smtp';

export const SENDER_PROFILE_STATUSES: readonly SenderProfileStatus[] = [
  'draft',
  'pending_verification',
  'active',
  'suspended',
];

export interface SenderProfileAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  name: string;
  from_name: string;
  from_email: string;
  reply_to_email?: string | null;
  /** BrandDomain with purpose 'email'. The envelope domain whose DNS must be healthy. */
  sending_domain_id?: string | null;
  /** BrandDomain with purpose 'tracking'. Optional — falls back to the platform default. */
  tracking_domain_id?: string | null;
  provider?: SenderProvider;
  /** Mandrill subaccount. Keeps one brand's reputation from contaminating another's. */
  provider_subaccount?: string | null;
  unsubscribe_url?: string | null;
  /** Required by CAN-SPAM for commercial mail. Preflight blocks a live send without it. */
  physical_mailing_address?: string | null;
  status?: SenderProfileStatus;
  is_default?: boolean;
  metadata?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class SenderProfile extends Model<SenderProfileAttributes> implements SenderProfileAttributes {
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare name: string;
  declare from_name: string;
  declare from_email: string;
  declare reply_to_email: string | null;
  declare sending_domain_id: string | null;
  declare tracking_domain_id: string | null;
  declare provider: SenderProvider;
  declare provider_subaccount: string | null;
  declare unsubscribe_url: string | null;
  declare physical_mailing_address: string | null;
  declare status: SenderProfileStatus;
  declare is_default: boolean;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

SenderProfile.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    from_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    from_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    reply_to_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    // Nullable so a profile can be authored before its DNS exists. The preflight, not
    // the schema, is what refuses to send without a verified domain.
    sending_domain_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'brand_domains', key: 'id' },
    },
    tracking_domain_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'brand_domains', key: 'id' },
    },
    provider: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'mandrill',
    },
    provider_subaccount: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    unsubscribe_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    physical_mailing_address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'draft',
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'sender_profiles',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['tenant_id', 'brand_id', 'status'], name: 'idx_sender_profiles_tenant_brand_status' },
      { fields: ['from_email'], name: 'idx_sender_profiles_from_email' },
    ],
  }
);

export default SenderProfile;
