import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * TenantAccessAudit — an append-only record of every tenant-boundary decision.
 *
 * WHY THIS EXISTS: CPN's data isolation is a formal grant and donor requirement, not
 * merely good practice (DEC-05, 2026-08-21). Enforcement alone does not satisfy that.
 * A control that silently works produces no evidence it worked, and "trust us, the
 * code denies it" is not an answer to a grant officer. **The denials are the evidence.**
 * A log containing only successful reads proves nothing about the boundary.
 *
 * APPEND-ONLY. There is no update path and no delete path in the service, and the
 * table carries no `updated_at`. An audit trail that can be edited after the fact is
 * not an audit trail. Retention trimming, when it is eventually needed, must be a
 * deliberate, logged, separately-reviewed operation rather than an ordinary write.
 *
 * NOT A REPLACEMENT FOR STRUCTURED LOGS. Application logs are for debugging and roll
 * off; this table is for attestation and must survive. They serve different masters,
 * which is why this is a table rather than another `console.log`.
 */
export type TenantAccessDecision = 'allowed' | 'denied';

export const TENANT_ACCESS_DECISIONS: readonly TenantAccessDecision[] = ['allowed', 'denied'];

export interface TenantAccessAuditAttributes {
  id?: string;
  occurred_at?: Date;

  /** Who. Null for an unauthenticated caller, which is itself worth recording. */
  platform_identity_id?: string | null;
  /** Denormalised so the record stays readable after an identity is renamed or removed. */
  actor_email?: string | null;

  /** The tenant that owns the thing being reached, when it is known. */
  resource_tenant_id?: string | null;
  resource_brand_id?: string | null;
  /** The tenant the caller was operating in when they tried. */
  context_tenant_id?: string | null;

  /** e.g. campaign, lead_context, organization, sender_profile, journey. */
  resource_type: string;
  resource_id?: string | null;
  /** e.g. read, write, list, send, export. */
  action: string;

  decision: TenantAccessDecision;
  /** Machine-readable cause: TenantIsolationViolation, AuthorizationError, granted. */
  reason?: string | null;
  /** The permission under test, when the decision was permission-based. */
  permission?: string | null;

  /** Ties this decision to the request that produced it. */
  correlation_id?: string | null;
  ip_address?: string | null;
  metadata?: Record<string, any> | null;
}

class TenantAccessAudit
  extends Model<TenantAccessAuditAttributes>
  implements TenantAccessAuditAttributes
{
  declare id: string;
  declare occurred_at: Date;
  declare platform_identity_id: string | null;
  declare actor_email: string | null;
  declare resource_tenant_id: string | null;
  declare resource_brand_id: string | null;
  declare context_tenant_id: string | null;
  declare resource_type: string;
  declare resource_id: string | null;
  declare action: string;
  declare decision: TenantAccessDecision;
  declare reason: string | null;
  declare permission: string | null;
  declare correlation_id: string | null;
  declare ip_address: string | null;
  declare metadata: Record<string, any> | null;
}

TenantAccessAudit.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    occurred_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    // No foreign keys on any of the identity or tenant columns. This table must
    // outlive the rows it describes: deleting a suspended operator or archiving a
    // tenant cannot be allowed to cascade away the evidence of what they reached.
    platform_identity_id: { type: DataTypes.UUID, allowNull: true },
    actor_email: { type: DataTypes.STRING(255), allowNull: true },
    resource_tenant_id: { type: DataTypes.UUID, allowNull: true },
    resource_brand_id: { type: DataTypes.UUID, allowNull: true },
    context_tenant_id: { type: DataTypes.UUID, allowNull: true },
    resource_type: { type: DataTypes.STRING(64), allowNull: false },
    resource_id: { type: DataTypes.STRING(64), allowNull: true },
    action: { type: DataTypes.STRING(32), allowNull: false },
    decision: { type: DataTypes.STRING(16), allowNull: false },
    reason: { type: DataTypes.STRING(64), allowNull: true },
    permission: { type: DataTypes.STRING(64), allowNull: true },
    correlation_id: { type: DataTypes.STRING(64), allowNull: true },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'tenant_access_audits',
    // No updated_at: nothing here is ever updated. See the class comment.
    timestamps: false,
    indexes: [
      // The query an auditor actually asks: "show me every attempt against this
      // tenant, newest first".
      {
        fields: ['resource_tenant_id', 'occurred_at'],
        name: 'idx_tenant_access_audits_tenant_time',
      },
      // The query a security review asks: "show me the denials".
      { fields: ['decision', 'occurred_at'], name: 'idx_tenant_access_audits_decision_time' },
      { fields: ['platform_identity_id'], name: 'idx_tenant_access_audits_identity' },
    ],
  }
);

export default TenantAccessAudit;
