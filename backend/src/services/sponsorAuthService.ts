import crypto from 'crypto';
import { Op } from 'sequelize';
import { Lead } from '../models';
import Sponsor from '../models/Sponsor';
import { sendSponsorMagicLink } from './emailService';
import { redactForLogs } from '../utils/piiRedaction';
import {
  recordSponsorPortalAuditEvent,
  SponsorAuditContext,
} from './sponsorAuditService';

// Door B (employer sponsor) portal auth. Replaces the sponsor.id-as-token
// stopgap in challengeController (see REAL-AUTH FOLLOW-UP note there) with a
// real magic-link: a random, expiring, emailed-only secret — never returned
// directly from an unauthenticated request. Same primitive as the
// participant flow (services/participantService.ts::requestMagicLink).
const MAGIC_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Outbound email is an external boundary, so it gets an explicit timeout and a
// capped number of attempts. Scoped to this call site on purpose: the shared
// nodemailer transporter in emailService has no timeouts, and adding them there
// would change the behaviour of every email the app sends.
const SEND_TIMEOUT_MS = 10_000;
const SEND_MAX_ATTEMPTS = 3; // 1 initial attempt + 2 retries
const SEND_BACKOFF_MS = [500, 1500];

// Tokens are crypto.randomUUID(), stored in a UUID column. Used to reject
// non-UUID input before it reaches Postgres — see verifySponsorPortalToken.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The magic link could not be delivered after every attempt was exhausted.
 * Thrown (rather than swallowed) so the route returns a real failure instead of
 * telling the manager "check your email" for a mail that never left.
 */
export class EmailDeliveryError extends Error {
  readonly error_class = 'EmailDeliveryError';

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

export interface SponsorPortalLinkRequest {
  email: string;
  /** Optional. Falls back to the email domain when the form doesn't collect it. */
  companyName?: string;
  /** Optional. Falls back to the email local part. */
  name?: string;
  /** Request origin, recorded on the audit row. */
  context?: SponsorAuditContext;
}

interface SponsorLinkLogFields {
  event: string;
  outcome: 'success' | 'failure' | 'partial';
  [key: string]: unknown;
}

// Structured, stdout-only, never carrying a raw email address or the token.
function logSponsorLink(correlationId: string, fields: SponsorLinkLogFields): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level: fields.outcome === 'failure' ? 'error' : 'info',
    service: 'sponsor-auth',
    correlation_id: correlationId,
    ...fields,
  });
  if (fields.outcome === 'failure') console.error(line);
  else console.log(line);
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Bound a promise that has no timeout of its own. Note this does not *cancel*
// the underlying send — nodemailer gives us no handle to abort — it only stops
// us waiting on it, so a timed-out attempt may still deliver.
async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new EmailDeliveryError(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Retries are safe to duplicate: every attempt carries the SAME token, so if a
 * timed-out attempt did in fact deliver, the manager receives two mails holding
 * one identical, single working link. The end state is the same either way.
 */
async function sendMagicLinkWithRetry(
  correlationId: string,
  payload: { to: string; contactName: string; companyName: string; token: string },
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SEND_MAX_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    try {
      await withTimeout(sendSponsorMagicLink(payload), SEND_TIMEOUT_MS, 'sendSponsorMagicLink');
      logSponsorLink(correlationId, {
        event: 'sponsor_magic_link_sent',
        outcome: 'success',
        attempt,
        duration_ms: Date.now() - startedAt,
        recipient: redactForLogs(payload.to),
      });
      return;
    } catch (error) {
      lastError = error;
      logSponsorLink(correlationId, {
        event: 'sponsor_magic_link_send_attempt_failed',
        outcome: 'failure',
        attempt,
        max_attempts: SEND_MAX_ATTEMPTS,
        duration_ms: Date.now() - startedAt,
        recipient: redactForLogs(payload.to),
        error_class: error instanceof Error ? error.name : 'UnknownError',
        error_message: error instanceof Error ? error.message : String(error),
      });
      if (attempt < SEND_MAX_ATTEMPTS) await delay(SEND_BACKOFF_MS[attempt - 1]);
    }
  }

  throw new EmailDeliveryError(
    `Could not deliver the sponsor magic link after ${SEND_MAX_ATTEMPTS} attempts`,
    lastError,
  );
}

// "jordan@acme-corp.com" -> "Acme Corp". A placeholder the manager can correct
// on the dashboard; it exists only so a self-serve signup never blocks on a
// field the login form does not ask for.
function companyNameFromEmail(email: string): string {
  const domain = email.split('@')[1] || '';
  const label = domain.split('.')[0] || 'Your Company';
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// "jordan.lee@acme.com" -> "Jordan Lee"
function contactNameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'there'
  );
}

/**
 * Self-serve: a manager who has never been in the system gets an account and a
 * link from this one call. Idempotent on the normalized email — submitting the
 * form twice reuses the same Lead, the same Sponsor, and the same still-valid
 * token, so an already-delivered link is never invalidated by a second request.
 *
 * Still no enumeration signal: every email now takes the same path and the
 * route's response is identical whether or not the manager was already known.
 *
 * Throws EmailDeliveryError if the mail cannot be delivered. The token is
 * persisted before the send is attempted, so a failed send is safe to retry.
 */
export async function requestSponsorPortalLink(input: SponsorPortalLinkRequest): Promise<void> {
  const correlationId = crypto.randomUUID();
  const email = input.email.toLowerCase().trim();
  const companyName = input.companyName?.trim() || companyNameFromEmail(email);
  const contactName = input.name?.trim() || contactNameFromEmail(email);

  const [lead, leadCreated] = await Lead.findOrCreate({
    where: { email },
    defaults: {
      name: contactName,
      email,
      company: companyName,
      source: 'website',
      form_type: 'sponsor_dashboard_signup',
      interest_area: 'corporate_sponsorship',
      corporate_sponsorship_interest: true,
    } as never,
  });

  const [sponsor, sponsorCreated] = await Sponsor.findOrCreate({
    where: { contact_lead_id: lead.id },
    defaults: {
      company_name: companyName,
      contact_lead_id: lead.id,
      seats_purchased: 0,
      billing_status: 'pending',
    },
  });

  // Reuse a live token rather than rotating on every request. Expiry alone
  // bounds a token's life here and on verify, so a manager who clicks an older
  // email still lands in the dashboard instead of hitting a dead link.
  const tokenIsLive = Boolean(
    sponsor.portal_token &&
      sponsor.portal_token_expires_at &&
      sponsor.portal_token_expires_at.getTime() > Date.now(),
  );

  let token = sponsor.portal_token;
  if (!tokenIsLive) {
    token = crypto.randomUUID();
    await sponsor.update({
      portal_token: token,
      portal_token_expires_at: new Date(Date.now() + MAGIC_LINK_TTL_MS),
      updated_at: new Date(),
    });
  }

  logSponsorLink(correlationId, {
    event: 'sponsor_magic_link_generated',
    outcome: 'success',
    sponsor_id: sponsor.id,
    recipient: redactForLogs(email),
    lead_created: leadCreated,
    sponsor_created: sponsorCreated,
    token_reused: tokenIsLive,
  });

  // Durable audit row for the generation half of the trust requirement. Written
  // before the send so an undeliverable link is still on the record.
  await recordSponsorPortalAuditEvent({
    event: 'link_generated',
    correlationId,
    sponsorId: sponsor.id,
    leadId: lead.id,
    email,
    token: token!,
    ip: input.context?.ip,
    userAgent: input.context?.userAgent,
    metadata: {
      lead_created: leadCreated,
      sponsor_created: sponsorCreated,
      token_reused: tokenIsLive,
    },
  });

  await sendMagicLinkWithRetry(correlationId, {
    to: lead.email,
    contactName: lead.name || contactName,
    companyName: sponsor.company_name,
    token: token!,
  });
}

export interface SponsorPortalSession {
  sponsor_id: string;
  access_token: string;
  company_name: string;
}

// Keep the token reusable — don't rotate it on verify. Expiry alone bounds
// its life, same as the participant portal, so a sponsor can bookmark the
// dashboard URL.
//
// Both outcomes are audited: a rejected link (expired, or never issued) is the
// event an auditor most wants to see, so it is recorded as deliberately as a
// successful access.
export async function verifySponsorPortalToken(
  token: string,
  context?: SponsorAuditContext,
): Promise<SponsorPortalSession | null> {
  const correlationId = crypto.randomUUID();

  // sponsors.portal_token is a UUID column, so Postgres raises a type error on
  // a malformed literal rather than simply not matching. Without this guard an
  // empty or junk `?token=` produced a 500 and — worse — no audit row at all,
  // because the throw happened before the rejection was recorded. Anything that
  // is not UUID-shaped cannot be a token we issued, so reject it here, on the
  // same path and with the same 401 as any other bad link.
  if (!UUID_PATTERN.test(token)) {
    logSponsorLink(correlationId, {
      event: 'sponsor_magic_link_rejected',
      outcome: 'failure',
      reason: 'malformed_token',
    });
    await recordSponsorPortalAuditEvent({
      event: 'link_rejected',
      correlationId,
      // Deliberately not passed as `token`: fingerprinting a value that was
      // never a token adds noise to the trail without adding traceability.
      ip: context?.ip,
      userAgent: context?.userAgent,
      metadata: { reason: 'malformed_token' },
    });
    return null;
  }

  const sponsor = await Sponsor.findOne({
    where: {
      portal_token: token,
      portal_token_expires_at: { [Op.gt]: new Date() },
    },
  });

  if (!sponsor) {
    logSponsorLink(correlationId, {
      event: 'sponsor_magic_link_rejected',
      outcome: 'failure',
      reason: 'unknown_or_expired_token',
    });
    await recordSponsorPortalAuditEvent({
      event: 'link_rejected',
      correlationId,
      token,
      ip: context?.ip,
      userAgent: context?.userAgent,
      metadata: { reason: 'unknown_or_expired_token' },
    });
    return null;
  }

  logSponsorLink(correlationId, {
    event: 'sponsor_magic_link_accessed',
    outcome: 'success',
    sponsor_id: sponsor.id,
  });
  await recordSponsorPortalAuditEvent({
    event: 'link_accessed',
    correlationId,
    sponsorId: sponsor.id,
    leadId: sponsor.contact_lead_id,
    token,
    ip: context?.ip,
    userAgent: context?.userAgent,
  });

  return {
    sponsor_id: sponsor.id,
    access_token: sponsor.portal_token!,
    company_name: sponsor.company_name,
  };
}

// Used by challengeController's dashboard gate. A sponsor with no token yet
// (never requested a link) or an expired one is never authorized — there is
// no fallback to sponsor.id.
export function isValidSponsorToken(sponsor: Sponsor, provided?: string | null): boolean {
  if (!provided || !sponsor.portal_token || !sponsor.portal_token_expires_at) return false;
  if (sponsor.portal_token_expires_at.getTime() <= Date.now()) return false;
  return provided === sponsor.portal_token;
}
