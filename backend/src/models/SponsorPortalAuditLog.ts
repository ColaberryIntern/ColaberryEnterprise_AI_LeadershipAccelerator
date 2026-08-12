import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// STORY-001 trust requirement: magic-link generation and access are auditable
// after the fact, not just visible in container stdout. One append-only row per
// event.
//
// SECURITY: the token itself is a live credential and is NEVER stored here.
// token_fingerprint holds a SHA-256 prefix instead, which is enough to tie an
// access event back to the generation event that issued it, but useless to
// anyone who reads the table.
export type SponsorPortalAuditEvent = 'link_generated' | 'link_accessed' | 'link_rejected';

export interface SponsorPortalAuditLogAttributes {
  id?: string;
  event: SponsorPortalAuditEvent;
  sponsor_id?: string | null;
  lead_id?: number | null;
  correlation_id: string;
  /** Redacted for storage, e.g. "j***@acme.com". Never the full address. */
  email_redacted?: string | null;
  /** SHA-256 of the token, first 16 hex chars. Never the token. */
  token_fingerprint?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: Date;
}

class SponsorPortalAuditLog
  extends Model<SponsorPortalAuditLogAttributes>
  implements SponsorPortalAuditLogAttributes
{
  declare id: string;
  declare event: SponsorPortalAuditEvent;
  declare sponsor_id: string | null;
  declare lead_id: number | null;
  declare correlation_id: string;
  declare email_redacted: string | null;
  declare token_fingerprint: string | null;
  declare ip_address: string | null;
  declare user_agent: string | null;
  declare metadata: Record<string, unknown>;
  declare created_at: Date;
}

SponsorPortalAuditLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    event: { type: DataTypes.STRING(30), allowNull: false },
    // Nullable: a rejected link has no sponsor to attribute it to, and that
    // rejection is exactly the event an auditor most wants to see.
    sponsor_id: { type: DataTypes.UUID, allowNull: true },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    correlation_id: { type: DataTypes.UUID, allowNull: false },
    email_redacted: { type: DataTypes.STRING(255), allowNull: true },
    token_fingerprint: { type: DataTypes.STRING(64), allowNull: true },
    ip_address: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.STRING(512), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'sponsor_portal_audit_log',
    timestamps: false,
    indexes: [
      { fields: ['sponsor_id'], name: 'idx_sponsor_portal_audit_sponsor_id' },
      { fields: ['event'], name: 'idx_sponsor_portal_audit_event' },
      { fields: ['correlation_id'], name: 'idx_sponsor_portal_audit_correlation_id' },
      { fields: ['token_fingerprint'], name: 'idx_sponsor_portal_audit_token_fp' },
      { fields: ['created_at'], name: 'idx_sponsor_portal_audit_created_at' },
    ],
  },
);

export default SponsorPortalAuditLog;
