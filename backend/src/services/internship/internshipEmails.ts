import { guardedSendMail } from '../emailService';
import { sendOnce, type SendOnceResult } from '../email/idempotentSend';
import { isKillSwitchActive } from '../launchSafety';
import { buildStudentFacingReason, type InternshipReasonCode } from './internshipReasonCodes';

/**
 * Applicant-facing internship email.
 *
 * ── IDEMPOTENCY IS THE WHOLE POINT ─────────────────────────────────────────
 *
 * "Use idempotency keys so retries cannot send duplicate approval, rejection, or
 * offer-letter emails." Every send here goes through `sendOnce`, whose claim is
 * enforced by two UNIQUE indexes on `email_send_ledger` — so a double-clicked
 * Approve button, a retried request, or two reviewers acting at once cannot mail
 * the same person twice. The refusal has no override, by design.
 *
 * The `businessEventId` is `internship-<template>-<applicationId>`, which is what
 * makes the key stable across retries. It deliberately does NOT include a
 * timestamp: including one would make every retry a "new" event and defeat the
 * entire mechanism.
 *
 * ── WHAT CAN NEVER APPEAR IN THESE EMAILS ──────────────────────────────────
 *
 * "Never email internal risk scores, private reviewer notes, or raw model
 * reasoning." Enforced structurally rather than by care: `renderDecisionEmail`
 * takes a reason code, an optional student-facing message and conditions — and
 * nothing else. It has no parameter for reviewer notes, no parameter for the AI
 * recommendation, and no parameter for factors. There is no path from those fields
 * to this module.
 */

/** Versioned so a template change is visible in the ledger and in the audit. */
export const TEMPLATE_VERSIONS = {
  decision_approved: 1,
  decision_rejected: 1,
  decision_waitlisted: 1,
  information_requested: 1,
  application_received: 1,
} as const;

export type InternshipEmailTemplate = keyof typeof TEMPLATE_VERSIONS;

const FROM = 'Colaberry <ali@colaberry.com>';

/**
 * Shared shell. Plain and narrow on purpose — this is a decision about someone's
 * application, not a marketing email, and it should read like a person wrote it.
 */
function shell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f6f7f9;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;font-size:15px;line-height:1.6;">
    ${bodyHtml}
    <p style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:13px;">
      Colaberry &middot; AI Internship
    </p>
  </div>
</body></html>`;
}

const esc = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const para = (s: string): string =>
  `<p style="margin:0 0 14px;">${esc(s)}</p>`;

function stepsList(steps: readonly string[]): string {
  if (!steps.length) return '';
  return `<p style="margin:20px 0 8px;font-weight:600;">What would change our answer</p>
    <ul style="margin:0 0 14px;padding-left:20px;">
      ${steps.map((s) => `<li style="margin-bottom:6px;">${esc(s)}</li>`).join('')}
    </ul>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Render a decision email.
 *
 * Note the parameter list: reason code, student message, conditions, name. No
 * reviewer notes, no AI anything. That absence is the guarantee.
 */
export function renderDecisionEmail(params: {
  template: InternshipEmailTemplate;
  firstName?: string | null;
  reasonCode: InternshipReasonCode;
  studentMessage?: string | null;
  conditions?: string | null;
  nowMs: number;
}): RenderedEmail {
  const hello = params.firstName?.trim() ? `Hi ${params.firstName.trim()},` : 'Hi,';
  const reason = buildStudentFacingReason({
    code: params.reasonCode,
    studentMessage: params.studentMessage,
    nowMs: params.nowMs,
  });

  if (params.template === 'decision_approved') {
    const cond = params.conditions?.trim();
    const body = [
      para(hello),
      para('Good news — you have been accepted onto the AI Internship.'),
      cond
        ? `<p style="margin:0 0 14px;padding:12px 14px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;"><strong>Before you start:</strong> ${esc(cond)}</p>`
        : '',
      para('Your next step is your offer letter. Open the internship page in your portal to download it, sign it, and upload it back to us.'),
      para('Once we have checked your documents we will get you set up and introduce you to your manager.'),
      para('Welcome aboard.'),
    ].filter(Boolean).join('');

    return {
      subject: 'You are in — AI Internship',
      html: shell(body),
      text: [
        hello,
        'Good news — you have been accepted onto the AI Internship.',
        cond ? `Before you start: ${cond}` : '',
        'Your next step is your offer letter. Open the internship page in your portal to download it, sign it, and upload it back to us.',
        'Once we have checked your documents we will get you set up and introduce you to your manager.',
        'Welcome aboard.',
      ].filter(Boolean).join('\n\n'),
    };
  }

  if (params.template === 'decision_rejected') {
    const body = [
      para(hello),
      para('Thank you for applying to the AI Internship. We are not able to offer you a place this time.'),
      para(reason.headline),
      stepsList(reason.steps),
      reason.reapply_after
        ? para(`You are welcome to apply again from ${reason.reapply_after}.`)
        : para('There is no waiting period — apply again whenever that changes.'),
      para('If you think we have misread something, reply to this email and tell us. We would rather look again than get it wrong.'),
    ].filter(Boolean).join('');

    return {
      subject: 'Your AI Internship application',
      html: shell(body),
      text: [
        hello,
        'Thank you for applying to the AI Internship. We are not able to offer you a place this time.',
        reason.headline,
        reason.steps.length ? `What would change our answer:\n- ${reason.steps.join('\n- ')}` : '',
        reason.reapply_after
          ? `You are welcome to apply again from ${reason.reapply_after}.`
          : 'There is no waiting period — apply again whenever that changes.',
        'If you think we have misread something, reply to this email and tell us.',
      ].filter(Boolean).join('\n\n'),
    };
  }

  if (params.template === 'decision_waitlisted') {
    const body = [
      para(hello),
      // Careful wording: a waitlist must not read as an offer.
      para('You are on the waitlist for the AI Internship. That is not a place yet, and we will not pretend otherwise — but your application is live and we will come back to you if one opens.'),
      para(reason.headline),
      stepsList(reason.steps),
      para('You do not need to do anything. If you would rather withdraw, reply and say so.'),
    ].filter(Boolean).join('');

    return {
      subject: 'You are on the waitlist — AI Internship',
      html: shell(body),
      text: [
        hello,
        'You are on the waitlist for the AI Internship. That is not a place yet, but your application is live and we will come back to you if one opens.',
        reason.headline,
        reason.steps.length ? `Notes:\n- ${reason.steps.join('\n- ')}` : '',
        'You do not need to do anything. If you would rather withdraw, reply and say so.',
      ].filter(Boolean).join('\n\n'),
    };
  }

  // information_requested
  const body = [
    para(hello),
    para('We are reviewing your AI Internship application and need one more thing from you before we can decide.'),
    para(reason.headline),
    stepsList(reason.steps),
    para('Open the internship page in your portal to update your application.'),
  ].filter(Boolean).join('');

  return {
    subject: 'One more thing for your AI Internship application',
    html: shell(body),
    text: [
      hello,
      'We are reviewing your AI Internship application and need one more thing from you before we can decide.',
      reason.headline,
      reason.steps.length ? `What we need:\n- ${reason.steps.join('\n- ')}` : '',
      'Open the internship page in your portal to update your application.',
    ].filter(Boolean).join('\n\n'),
  };
}

/**
 * Send a decision email exactly once.
 *
 * Returns the ledger outcome rather than throwing: a decision must be recorded
 * even if the email fails, so the caller records the decision first and treats a
 * failed send as a thing to retry, not a reason to roll back an admission.
 */
export async function sendDecisionEmail(params: {
  template: InternshipEmailTemplate;
  to: string;
  firstName?: string | null;
  applicationId: string;
  reasonCode: InternshipReasonCode;
  studentMessage?: string | null;
  conditions?: string | null;
  correlationId?: string | null;
  nowMs?: number;
}): Promise<SendOnceResult | { outcome: 'skipped'; reason: 'kill_switch_active'; idempotencyKey: string }> {
  const nowMs = params.nowMs ?? Date.now();

  // The global stop must actually stop outbound mail, not merely flip a flag.
  if (await isKillSwitchActive()) {
    return { outcome: 'skipped', reason: 'kill_switch_active', idempotencyKey: '' };
  }

  const rendered = renderDecisionEmail({
    template: params.template,
    firstName: params.firstName,
    reasonCode: params.reasonCode,
    studentMessage: params.studentMessage,
    conditions: params.conditions,
    nowMs,
  });

  // No timestamp in the key: a retry must derive the SAME key, or the ledger
  // stops protecting anyone. One decision email of each template per application.
  const businessEventId = `internship-${params.template}-${params.applicationId}`;

  return sendOnce(
    {
      recipient: params.to,
      subject: rendered.subject,
      businessEventId,
      correlationId: params.correlationId ?? undefined,
    },
    async () => {
      try {
        const info = await guardedSendMail({
          from: FROM,
          to: params.to,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
        return { ok: true, messageId: (info as any)?.messageId };
      } catch (err: any) {
        return {
          ok: false,
          error: String(err?.message ?? err),
          errorClass: err?.name || 'MailTransportError',
        };
      }
    },
  );
}
