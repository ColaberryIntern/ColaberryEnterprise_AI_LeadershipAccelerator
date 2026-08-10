import crypto from 'crypto';
import SponsorPortalAuditLog, {
  SponsorPortalAuditEvent,
} from '../models/SponsorPortalAuditLog';

// STORY-001 trust requirement. Two rules govern everything in this file:
//
//  1. An audit write must never break a manager's login. Every write is
//     best-effort — a failed insert is logged loudly and swallowed, because
//     losing one audit row is strictly better than locking a paying customer
//     out of their dashboard.
//  2. Nothing written here is usable as a credential. Tokens become
//     fingerprints, email addresses are stored redacted.

export interface SponsorAuditContext {
  /** Client IP, normally req.ip. */
  ip?: string | null;
  /** Client user agent, normally req.get('user-agent'). */
  userAgent?: string | null;
}

export interface SponsorAuditEventInput extends SponsorAuditContext {
  event: SponsorPortalAuditEvent;
  correlationId: string;
  sponsorId?: string | null;
  leadId?: number | null;
  /** Full address. Redacted here before it is persisted. */
  email?: string | null;
  /** Full token. Fingerprinted here before it is persisted. */
  token?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Stable, non-reversible handle for a token. The same token always produces the
 * same fingerprint, so an access event can be joined to the generation event
 * that issued it, but the fingerprint cannot be replayed as a login.
 */
export function fingerprintToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/**
 * "jordan.lee@acme.com" -> "j***@acme.com". Keeps the domain (useful for
 * auditing which employer an event belongs to) and drops the identity.
 */
export function redactEmailForAudit(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${(local || '').charAt(0) || '*'}***@${domain}`;
}

// Postgres columns are bounded; an oversized header must not turn an audit
// write into a constraint violation.
function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

export async function recordSponsorPortalAuditEvent(
  input: SponsorAuditEventInput,
): Promise<void> {
  try {
    await SponsorPortalAuditLog.create({
      event: input.event,
      correlation_id: input.correlationId,
      sponsor_id: input.sponsorId ?? null,
      lead_id: input.leadId ?? null,
      email_redacted: input.email ? redactEmailForAudit(input.email) : null,
      token_fingerprint: input.token ? fingerprintToken(input.token) : null,
      ip_address: truncate(input.ip, 64),
      user_agent: truncate(input.userAgent, 512),
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    // Rule 1: never propagate. Log with enough context that the gap in the
    // audit trail is itself discoverable in the container logs.
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'sponsor-audit',
        event: 'sponsor_portal_audit_write_failed',
        outcome: 'failure',
        correlation_id: input.correlationId,
        audited_event: input.event,
        error_class: error instanceof Error ? error.name : 'UnknownError',
        error_message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
