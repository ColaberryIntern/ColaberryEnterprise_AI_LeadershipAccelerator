import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * BrandDomain — one hostname used by one brand for one purpose.
 *
 * A brand owns several hostnames that do different jobs: `cpn.org` serves the web
 * experience AND is the envelope domain for email, while `links.cpn.org` only ever
 * appears in tracked links. Those have genuinely different DNS requirements — the
 * email row needs SPF/DKIM/DMARC to be healthy, the web row does not — which is why
 * uniqueness is on (hostname, purpose) rather than on hostname alone.
 *
 * This table is what replaces the hard-coded HOST_TO_SITE_SLUG map in
 * trackingController.ts. Per the migration plan the map stays as a logged fallback
 * until every live domain is registered here and parity is proven.
 *
 * `verification_status` is deliberately not derived from the DNS columns: a domain can
 * be web-verified while its email posture is still pending, and a live send must be
 * blocked on the email posture specifically, not on a single conflated boolean.
 */
export type BrandDomainPurpose = 'web' | 'app' | 'email' | 'tracking' | 'reply';
export type DomainVerificationStatus = 'pending' | 'verified' | 'failed';
export type DnsCheckStatus = 'unknown' | 'pass' | 'fail';

export const BRAND_DOMAIN_PURPOSES: readonly BrandDomainPurpose[] = [
  'web',
  'app',
  'email',
  'tracking',
  'reply',
];

/**
 * Operational lifecycle exposed to the admin UI (master plan §62). Distinct from
 * `verification_status`, which is the machine-checked DNS fact. A domain may be
 * `dns_pending` in the UI while its verification_status is still `pending`; the two
 * are separated so nobody can fake DNS success by editing a status dropdown.
 */
export type BrandDomainActivationState =
  | 'configured'
  | 'dns_pending'
  | 'web_verified'
  | 'email_pending'
  | 'email_verified'
  | 'active';

export interface BrandDomainAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  hostname: string;
  purpose: BrandDomainPurpose;
  is_primary?: boolean;
  provider?: string | null;
  provider_domain_id?: string | null;
  verification_status?: DomainVerificationStatus;
  spf_status?: DnsCheckStatus;
  dkim_status?: DnsCheckStatus;
  dmarc_status?: DnsCheckStatus;
  activation_state?: BrandDomainActivationState;
  verified_at?: Date | null;
  last_checked_at?: Date | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class BrandDomain extends Model<BrandDomainAttributes> implements BrandDomainAttributes {
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare hostname: string;
  declare purpose: BrandDomainPurpose;
  declare is_primary: boolean;
  declare provider: string | null;
  declare provider_domain_id: string | null;
  declare verification_status: DomainVerificationStatus;
  declare spf_status: DnsCheckStatus;
  declare dkim_status: DnsCheckStatus;
  declare dmarc_status: DnsCheckStatus;
  declare activation_state: BrandDomainActivationState;
  declare verified_at: Date | null;
  declare last_checked_at: Date | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

BrandDomain.init(
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
    hostname: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    purpose: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    provider: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    provider_domain_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    verification_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    spf_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'unknown',
    },
    dkim_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'unknown',
    },
    dmarc_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'unknown',
    },
    activation_state: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'configured',
    },
    verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_checked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'brand_domains',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['hostname', 'purpose'], name: 'brand_domains_hostname_purpose_unique' },
      { fields: ['brand_id'], name: 'idx_brand_domains_brand' },
      { fields: ['tenant_id'], name: 'idx_brand_domains_tenant' },
    ],
  }
);

export default BrandDomain;
