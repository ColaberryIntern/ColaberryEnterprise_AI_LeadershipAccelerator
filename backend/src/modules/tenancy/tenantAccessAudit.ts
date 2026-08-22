import { TenantAccessAudit } from '../../models';
import type { TenantAccessDecision } from '../../models/TenantAccessAudit';
// `import type` rather than a value import: this module is imported BY the guard layer,
// and a runtime require back into tenantAuthorization would close a cycle. The audited
// guards live in tenantAccessGuards.ts, which depends on both and is depended on by
// neither, so the graph stays acyclic.
import type { PlatformRequestContext } from './tenantAuthorization';

/**
 * Recording side of the tenant-isolation audit trail (DEC-05).
 *
 * Two rules govern everything here.
 *
 * **A failed write must never become a security incident.** If this table is
 * unreachable, the correct behaviour is to keep enforcing the boundary and shout about
 * the missing evidence, not to deny every request or to crash the route. Losing an
 * audit row is bad; refusing legitimate work because bookkeeping failed is worse, and
 * silently allowing something because the audit threw would be worst of all. Nothing in
 * this module can affect an authorization outcome.
 *
 * **A dropped write must be loud.** A silently-lost audit row is indistinguishable from
 * an access that never happened, which is precisely the confusion an audit trail exists
 * to prevent. Every failure emits a structured error carrying the record it could not
 * persist, so the evidence survives in the log stream even when the table rejects it.
 */

export interface AccessAuditInput {
  ctx: PlatformRequestContext;
  resourceType: string;
  action: string;
  decision: TenantAccessDecision;
  resourceId?: string | null;
  resourceTenantId?: string | null;
  resourceBrandId?: string | null;
  reason?: string | null;
  permission?: string | null;
  correlationId?: string | null;
  ipAddress?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, any> | null;
}

/** Emitted when the row cannot be written, so the evidence survives in the log stream. */
function logAuditFailure(input: AccessAuditInput, err: unknown): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tenancy',
      event: 'tenant_access_audit_write_failed',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      // The whole record, because this line is now the only copy of it.
      context: {
        message: err instanceof Error ? err.message : String(err),
        platform_identity_id: input.ctx.platformIdentityId,
        context_tenant_id: input.ctx.tenantId,
        resource_tenant_id: input.resourceTenantId ?? null,
        resource_type: input.resourceType,
        resource_id: input.resourceId ?? null,
        action: input.action,
        decision: input.decision,
        reason: input.reason ?? null,
        correlation_id: input.correlationId ?? null,
      },
    }),
  );
}

/**
 * Append one access decision. Resolves even when the write fails.
 *
 * Returns whether the row was persisted, so a caller that genuinely needs to know
 * (the evidence generator, for instance) can tell, without any caller being forced to
 * care.
 */
export async function recordAccessDecision(input: AccessAuditInput): Promise<boolean> {
  try {
    await TenantAccessAudit.create({
      occurred_at: new Date(),
      platform_identity_id: input.ctx.platformIdentityId,
      actor_email: input.actorEmail ?? null,
      resource_tenant_id: input.resourceTenantId ?? null,
      resource_brand_id: input.resourceBrandId ?? null,
      context_tenant_id: input.ctx.tenantId,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      action: input.action,
      decision: input.decision,
      reason: input.reason ?? null,
      permission: input.permission ?? null,
      correlation_id: input.correlationId ?? null,
      ip_address: input.ipAddress ?? null,
      metadata: input.metadata ?? null,
    } as any);
    return true;
  } catch (err) {
    logAuditFailure(input, err);
    return false;
  }
}

export interface AuditQuery {
  tenantId?: string;
  decision?: TenantAccessDecision;
  since?: Date;
  limit?: number;
}

/**
 * Read the trail. Used by the evidence generator and the admin ecosystem view.
 *
 * Read-only by construction: this module exports no update and no delete. Trimming for
 * retention, if it ever becomes necessary, belongs in a separate reviewed operation,
 * not in the module that routes call on every request.
 */
export async function queryAccessAudit(query: AuditQuery = {}): Promise<TenantAccessAudit[]> {
  const where: Record<string, unknown> = {};
  if (query.tenantId) where.resource_tenant_id = query.tenantId;
  if (query.decision) where.decision = query.decision;
  if (query.since) {
    const { Op } = require('sequelize');
    where.occurred_at = { [Op.gte]: query.since };
  }

  return TenantAccessAudit.findAll({
    where,
    order: [['occurred_at', 'DESC']],
    limit: Math.min(query.limit ?? 200, 1000),
  });
}

export interface IsolationSummary {
  total: number;
  allowed: number;
  denied: number;
  deniedByReason: Record<string, number>;
  windowStart: Date | null;
  windowEnd: Date | null;
}

/**
 * Summary an auditor or grant officer can read.
 *
 * Deliberately reports denials broken down by reason: "the boundary was tested N times
 * and refused N times, for these reasons" is the sentence that demonstrates a working
 * control. A summary that only counted successes would demonstrate nothing.
 */
export async function summariseIsolation(since?: Date): Promise<IsolationSummary> {
  const rows = await queryAccessAudit({ since, limit: 1000 });

  const deniedByReason: Record<string, number> = {};
  let allowed = 0;
  let denied = 0;

  for (const row of rows) {
    if (row.decision === 'denied') {
      denied += 1;
      const reason = row.reason || 'unspecified';
      deniedByReason[reason] = (deniedByReason[reason] || 0) + 1;
    } else {
      allowed += 1;
    }
  }

  const times = rows.map((r) => new Date(r.occurred_at).getTime()).filter((t) => !Number.isNaN(t));

  return {
    total: rows.length,
    allowed,
    denied,
    deniedByReason,
    windowStart: times.length ? new Date(Math.min(...times)) : null,
    windowEnd: times.length ? new Date(Math.max(...times)) : null,
  };
}
