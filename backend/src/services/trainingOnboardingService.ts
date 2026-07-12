import crypto from 'crypto';
import { Lead, Enrollment, Cohort } from '../models';
import { env } from '../config/env';
import { sendTrainingWelcome } from './emailService';

/**
 * Training-signup onboarding.
 *
 * When someone registers on training.colaberry.com the lead is ingested via
 * POST /api/v1/leads. This service turns that lead into a live portal account:
 * it provisions an "Explorer" enrollment (portal access, no paid seat consumed)
 * and emails a branded welcome with a one-click magic link.
 *
 * Design contracts:
 *  - Gated by env.trainingWelcomeEnabled (master switch, OFF by default). When
 *    off this is a pure no-op so the flow can ship dark.
 *  - Idempotent end to end: exactly one Explorer enrollment per (email, cohort)
 *    and exactly one welcome email, even under retries / duplicate signups.
 *  - Failure-first: never throws into the ingest path; the welcome marker is
 *    stamped only after a confirmed send, so a transient failure stays retryable.
 */

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {}
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'training-onboarding', event, outcome, ...context }) + '\n'
  );
}

export interface ProvisionResult {
  status: 'disabled' | 'lead_not_found' | 'provisioned' | 'already_welcomed' | 'error';
  enrollmentId?: string;
  emailSent?: boolean;
  error?: string;
}

/**
 * Find (or lazily create once) the standing Explorer cohort that holds
 * training.colaberry.com prospects. cohort_type='explorer' keeps these accounts
 * out of paid-cohort seat counts and reporting. seats_taken is never touched
 * here — the model only increments it on confirmed payment.
 */
export async function getOrCreateExplorerCohort(): Promise<Cohort> {
  const existing = await Cohort.findOne({
    where: { cohort_type: 'explorer' },
    order: [['created_at', 'ASC']],
  });
  if (existing) return existing;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return Cohort.create({
    name: env.explorerCohortName,
    description:
      'Standing container for training.colaberry.com prospects (Explorer tier). ' +
      'Not a paid cohort; excluded from paid seat counts and revenue reporting.',
    start_date: today,
    core_day: 'Self-paced',
    core_time: 'Anytime',
    max_seats: 100000,
    seats_taken: 0,
    status: 'open',
    cohort_type: 'explorer',
  } as any);
}

export async function provisionTrainingSignup(leadId: number, correlationId?: string): Promise<ProvisionResult> {
  if (!env.trainingWelcomeEnabled) {
    log('info', 'training_welcome_skipped', 'success', { correlation_id: correlationId, reason: 'disabled', lead_id: leadId });
    return { status: 'disabled' };
  }

  try {
    const lead = await Lead.findByPk(leadId);
    if (!lead || !lead.email) {
      log('warn', 'training_welcome_skipped', 'partial', { correlation_id: correlationId, reason: 'lead_not_found', lead_id: leadId });
      return { status: 'lead_not_found' };
    }

    const email = lead.email.toLowerCase().trim();
    const cohort = await getOrCreateExplorerCohort();

    // Idempotent account: one Explorer enrollment per (email, explorer cohort).
    // Created directly (not via setPortalAccess) so the prospect stays in
    // enterprise's campaign control instead of being marked converted-to-student.
    const [enrollment, created] = await Enrollment.findOrCreate({
      where: { email, cohort_id: cohort.id },
      defaults: {
        full_name: lead.name || 'Explorer',
        email,
        company: lead.company || 'Prospect',
        title: lead.title || undefined,
        phone: lead.phone || undefined,
        company_size: lead.company_size || undefined,
        cohort_id: cohort.id,
        payment_status: 'pending',
        payment_method: 'invoice',
        status: 'active',
        portal_enabled: true, // immediate portal access via the magic link below
        notes: `Auto-provisioned Explorer account from training.colaberry.com signup (lead ${lead.id}, source ${lead.source || 'training'}).`,
      } as any,
    });

    // Idempotent welcome: the send-once marker lives on the enrollment JSONB, so
    // a create-then-crash leaves it unset and a later retry re-sends cleanly.
    const intake =
      enrollment.intake_data_json && typeof enrollment.intake_data_json === 'object'
        ? enrollment.intake_data_json
        : {};
    if (intake.training_welcome_sent_at) {
      log('info', 'training_welcome_skipped', 'success', {
        correlation_id: correlationId,
        reason: 'already_welcomed',
        lead_id: leadId,
        enrollment_id: enrollment.id,
      });
      return { status: 'already_welcomed', enrollmentId: enrollment.id };
    }

    // Fresh magic-link token for the welcome CTA (reusable until it expires).
    const token = crypto.randomUUID();
    const ttlMs = Math.max(1, env.trainingWelcomeTokenTtlDays) * 24 * 60 * 60 * 1000;
    await enrollment.update({
      portal_token: token,
      portal_token_expires_at: new Date(Date.now() + ttlMs),
      portal_enabled: true,
    } as any);

    const portalLink = `${env.frontendUrl.replace(/\/$/, '')}/portal/verify?token=${token}`;

    const result = await sendTrainingWelcome({ to: email, fullName: enrollment.full_name, portalLink });

    // Only stamp the marker once the email actually left, so a transient send
    // failure (SMTP down, provider 5xx) stays retryable on the next signal.
    if (result.sent) {
      await enrollment.update({
        intake_data_json: { ...intake, training_welcome_sent_at: new Date().toISOString() },
      } as any);
    }

    log('info', 'training_welcome_provisioned', 'success', {
      correlation_id: correlationId,
      lead_id: leadId,
      enrollment_id: enrollment.id,
      account_created: created,
      email_sent: result.sent,
    });
    return { status: 'provisioned', enrollmentId: enrollment.id, emailSent: result.sent };
  } catch (err: any) {
    log('error', 'training_welcome_failed', 'failure', {
      correlation_id: correlationId,
      lead_id: leadId,
      error_class: err?.constructor?.name || 'UnknownError',
      message: err?.message,
    });
    return { status: 'error', error: err?.message };
  }
}
