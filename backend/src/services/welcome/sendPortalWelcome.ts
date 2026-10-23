import crypto from 'crypto';
import { CommunicationLog } from '../../models';
import { env } from '../../config/env';

/**
 * Send a portal welcome carrying a one-click sign-in link, idempotently.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * There are two near-identical free-account doors, and only one of them emailed
 * anybody:
 *
 *   /api/create-free-account  -> enrollmentService.createExplorerEnrollment  SENDS
 *   /api/portal/free-signup   -> freeSignupService.createFreeAccount         SENT NOTHING
 *
 * The paid-ad funnel points at the second one. Measured in production on
 * 2026-10-23: 113 signups over three days, every one with an enrollment row, and
 * `communication_logs` rows for **zero** of them. The strings `sendTrainingWelcome`,
 * `welcome` and `consent` each appeared zero times in `freeSignupService.ts`.
 *
 * `createFreeAccount` returns a participant JWT, so those people were signed in at
 * the moment they signed up and were NOT locked out. What they never got was any
 * email: no sign-in link for a second device, no record in their inbox that the
 * account exists. One missing block caused that and the missing consent record
 * both.
 *
 * ── WHY A SHARED MODULE RATHER THAN A COPY ──────────────────────────────────
 *
 * The working block in `enrollmentService` is ~45 lines of token-minting, sending
 * and logging. Duplicating safety-critical code is how the two doors drifted apart
 * in the first place. This module is deliberately NOT yet wired into
 * `enrollmentService`: that is the one path that currently works, and widening the
 * blast radius of an incident fix to include the only healthy code is a bad trade.
 * Migrating it here is a follow-up, and `WELCOME_EVENTS` below already spans both
 * event names so the two cannot double-send across the transition.
 *
 * ── IDEMPOTENCY IS THE POINT, NOT A GARNISH ─────────────────────────────────
 *
 * CLAUDE.md makes idempotency non-negotiable, and this module has two callers that
 * make it load-bearing rather than theoretical: the signup path (which may be
 * retried) and the recovery script for the 110 already-stranded people (which must
 * be safe to re-run after a partial failure). The key is a `sent` CommunicationLog
 * row for the address under any welcome event name. Checked BEFORE the send, so a
 * second run reports `skipped` instead of mailing twice.
 */

/**
 * Event names that mean "this person already has their sign-in link".
 *
 * Spans both doors on purpose. `open_house_welcome` is what the working path has
 * written since it was built, so a person welcomed there must not be welcomed
 * again from here.
 */
export const WELCOME_EVENTS: ReadonlyArray<string> = ['portal_welcome', 'open_house_welcome'];

/** What this module writes. */
export const PORTAL_WELCOME_EVENT = 'portal_welcome';

/**
 * The minimum this module needs of an enrollment.
 *
 * A structural type rather than the Sequelize model, so a test can drive it with a
 * plain object and assert the token actually got written. The model satisfies it.
 */
export interface WelcomeEnrollment {
  id: string;
  full_name: string;
  email: string;
  update(values: Record<string, unknown>): Promise<unknown>;
}

export interface SendPortalWelcomeInput {
  enrollment: WelcomeEnrollment;
  /** For the CommunicationLog row. Null is honest when the lead is not resolved. */
  leadId?: number | null;
  /** Recovery copy. Absent means the standard welcome, unchanged. */
  subjectOverride?: string;
  /** Replaces the opening paragraph. Used to acknowledge a delay. */
  intro?: string;
  /** Drop the new-registrant highlights block, which reads wrong above an apology. */
  hideHighlights?: boolean;
  /** An extra paragraph after the sign-in link. */
  closing?: string;
}

export interface SendPortalWelcomeResult {
  sent: boolean;
  /** True when an earlier welcome already reached this address. */
  skipped: boolean;
  reason: string | null;
  messageId: string | null;
}

/**
 * Has this address already been welcomed?
 *
 * Reads `status: 'sent'` rows for the address and checks the event in JS rather
 * than in SQL. The per-address row count here is single digits, and a jsonb
 * predicate in a Sequelize `where` is the kind of thing that silently matches
 * nothing when the operator is wrong - which would turn this guard into a
 * rubber stamp and double-mail everybody.
 */
export async function alreadyWelcomed(email: string): Promise<boolean> {
  const rows = await CommunicationLog.findAll({
    where: { to_address: email, status: 'sent' },
    attributes: ['id', 'metadata'],
  });
  return rows.some((r) => {
    const meta = (r as unknown as { metadata?: unknown }).metadata;
    const event = meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>).event
      : null;
    return typeof event === 'string' && WELCOME_EVENTS.includes(event);
  });
}

/**
 * Mint a fresh portal token on THIS enrollment and email the sign-in link.
 *
 * The token is generated against the row passed in, never by an email-keyed
 * lookup. `enrollmentService` carries a comment about why: a lookup could land the
 * token on a stale enrollment when one person has several, signing them in to the
 * wrong account.
 *
 * Never throws. A signup must not fail because mail failed, and a recovery run
 * must not abort on one bad address. Every outcome is returned AND written to
 * CommunicationLog, so a failure is visible rather than swallowed.
 */
export async function sendPortalWelcome(
  input: SendPortalWelcomeInput,
): Promise<SendPortalWelcomeResult> {
  const { enrollment, leadId = null, subjectOverride, intro, hideHighlights, closing } = input;
  const email = enrollment.email;

  try {
    if (await alreadyWelcomed(email)) {
      return { sent: false, skipped: true, reason: 'already_welcomed', messageId: null };
    }
  } catch (err) {
    // A failed guard must not become a send. Refusing here is the safe direction:
    // a missed welcome is recoverable by re-running, a double-send is not.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'portal_welcome_idempotency_check_failed',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      outcome: 'failure',
      message: err instanceof Error ? err.message : String(err),
    }));
    return { sent: false, skipped: true, reason: 'idempotency_check_failed', messageId: null };
  }

  const subject = subjectOverride || 'Welcome to Colaberry: your AI journey starts now';
  let sent = false;
  let messageId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const { sendTrainingWelcome } = await import('../emailService');
    const ttlDays = Math.max(1, env.trainingWelcomeTokenTtlDays || 30);
    const token = crypto.randomUUID();
    await enrollment.update({
      portal_token: token,
      portal_token_expires_at: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
    });
    const base = (env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/$/, '');
    const result = await sendTrainingWelcome({
      to: email,
      fullName: enrollment.full_name,
      portalLink: `${base}/portal/verify?token=${token}`,
      subjectOverride,
      intro,
      hideHighlights,
      closing,
    });
    sent = result.sent;
    messageId = result.messageId || null;
    if (!sent) errorMessage = 'welcome email not sent (kill switch active or SMTP unconfigured)';
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  try {
    const { logCommunication } = await import('../communicationLogService');
    await logCommunication({
      lead_id: leadId,
      channel: 'email',
      direction: 'outbound',
      delivery_mode: 'live',
      status: sent ? 'sent' : 'failed',
      to_address: email,
      from_address: env.trainingWelcomeFromEmail,
      subject,
      provider: 'mandrill',
      provider_message_id: messageId,
      error_message: errorMessage,
      metadata: { event: PORTAL_WELCOME_EVENT, enrollment_id: enrollment.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- log params are loose
    } as any);
  } catch (err: unknown) {
    // Non-fatal, but it costs the idempotency guard its memory for this address,
    // so it is logged loudly rather than ignored.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'portal_welcome_comm_log_failed',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      outcome: 'failure',
      message: err instanceof Error ? err.message : String(err),
    }));
  }

  return { sent, skipped: false, reason: errorMessage, messageId };
}

export default sendPortalWelcome;
