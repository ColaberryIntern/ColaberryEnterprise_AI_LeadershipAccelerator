import InternshipApplication from '../../models/InternshipApplication';
import InternshipAdministrativeIntake from '../../models/InternshipAdministrativeIntake';
import InternshipInterviewSession from '../../models/InternshipInterviewSession';
import CommunicationLog from '../../models/CommunicationLog';
import { triggerVoiceCall } from '../synthflowService';
import { redactForLogs } from '../../utils/piiRedaction';
import { buildInternshipCallPrompt } from './internshipCallPrompt';
import { openSession, progress, remainingQuestions } from './internshipInterviewService';
import { transition } from './internshipApplicationService';
import { emitInternshipEvent } from './internshipAnalytics';

/**
 * The "Have AI Call Me" path.
 *
 * ── WHAT THIS REFUSES TO DO ────────────────────────────────────────────────
 *
 * Four refusals, each of which is the safe outcome rather than a degraded one:
 *
 *   1. No permission to call → no call. `permission_to_call` is a separate consent
 *      from "I'll be interviewed by an AI", and dialling without it is a cold call
 *      the applicant did not agree to.
 *   2. No phone number → no call.
 *   3. Nothing left to ask → no call. An interview already complete online must not
 *      produce a call with no purpose.
 *   4. No configured agent → no call. `resolveAgentId` returns '' when
 *      SYNTHFLOW_INTERNSHIP_AGENT_ID is unset, and `triggerVoiceCall` then skips
 *      with `no_agent_id` rather than borrowing a Colaberry agent that carries a
 *      bootcamp sales script.
 *
 * Every one returns a named reason rather than throwing, so the UI can say what
 * happened and the applicant is never left looking at a spinner for a call that
 * was never placed.
 *
 * ── ABUSE ─────────────────────────────────────────────────────────────────
 *
 * "Prevent call abuse and repeated rapid callbacks." The route is rate limited,
 * and on top of that `CALL_COOLDOWN_MS` refuses a second call while one is
 * recently placed — rate limiting alone counts requests, which is not the same as
 * refusing to dial a person twice in a minute.
 */

/** No second call within five minutes of the last one, per application. */
const CALL_COOLDOWN_MS = 5 * 60 * 1000;

export type CallOutcome =
  | { placed: true; session_id: string; remaining: number }
  | { placed: false; reason: CallSkipReason; message: string };

export type CallSkipReason =
  | 'no_permission_to_call'
  | 'no_phone'
  | 'nothing_to_ask'
  | 'cooldown'
  | 'provider_skipped'
  | 'provider_error';

/**
 * Place the interview call now.
 *
 * `nowMs` is injected so the cooldown is testable without a clock.
 */
export async function callNow(params: {
  application: InternshipApplication;
  enrollmentId: string;
  nowMs?: number;
}): Promise<CallOutcome> {
  const { application } = params;
  const nowMs = params.nowMs ?? Date.now();

  const intake = await InternshipAdministrativeIntake.findOne({
    where: { application_id: application.id },
  });

  if (!intake?.permission_to_call) {
    return {
      placed: false,
      reason: 'no_permission_to_call',
      message: 'We need your permission to call you first. You can give it on the application form.',
    };
  }
  if (!intake.phone) {
    return {
      placed: false,
      reason: 'no_phone',
      message: 'Add a phone number to your application and we can call you.',
    };
  }

  const remaining = await remainingQuestions(application.id);
  if (!remaining.length) {
    return {
      placed: false,
      reason: 'nothing_to_ask',
      message: 'You have already answered everything. Review your summary and submit when you are ready.',
    };
  }

  const recent = await InternshipInterviewSession.findOne({
    where: { application_id: application.id, channel: 'phone' },
    order: [['created_at', 'DESC']],
  });
  if (recent?.started_at && nowMs - new Date(recent.started_at).getTime() < CALL_COOLDOWN_MS) {
    return {
      placed: false,
      reason: 'cooldown',
      message: 'We just tried calling you. Give it a few minutes before trying again.',
    };
  }

  const p = await progress(application.id);
  const prompt = buildInternshipCallPrompt(remaining, {
    preferred_name: intake.preferred_name || intake.legal_name,
    recording_consented: !!intake.consent_recording,
    already_answered: p.resolved,
  });

  // Belt and braces: the builder returns '' only when there is nothing to ask,
  // which is already handled above. If that ever changes, refusing to dial is
  // still the right answer — an empty prompt is an unscripted agent.
  if (!prompt.trim()) {
    return { placed: false, reason: 'nothing_to_ask', message: 'There is nothing left to ask.' };
  }

  const session = await openSession({ applicationId: application.id, channel: 'phone' });
  await session.update({ status: 'in_progress', started_at: new Date(nowMs) });

  const result = await triggerVoiceCall({
    name: intake.preferred_name || intake.legal_name || 'there',
    phone: intake.phone,
    callType: 'internship_interview',
    brandSlug: 'colaberry-internship',
    prompt,
  });

  if (!result.success) {
    await session.update({ status: 'failed', failure_reason: 'provider_error' });
    return {
      placed: false,
      reason: 'provider_error',
      message: 'We could not place the call. You can try again, or answer online instead.',
    };
  }

  // The provider reports a deliberate no-op (kill switch, feature disabled, no
  // agent configured) as success-with-skipped. That is NOT a placed call, and
  // reporting it as one to the applicant would be a lie they would wait on.
  if ((result.data as any)?.skipped) {
    const reason = String((result.data as any)?.reason ?? 'unknown');
    await session.update({ status: 'failed', failure_reason: `skipped:${reason}`.slice(0, 120) });
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'internship_call_skipped',
      outcome: 'partial',
      context: { application_id: application.id, reason },
    }));
    return {
      placed: false,
      reason: 'provider_skipped',
      message: 'Calls are unavailable right now. You can answer the questions online instead.',
    };
  }

  // Link the call to this session so the completion webhook can find it. The id
  // key varies across Synthflow response shapes, hence the fallbacks.
  const callId = (result.data as any)?.call_id
    ?? (result.data as any)?.response?.call_id
    ?? (result.data as any)?._id
    ?? null;
  if (callId) await session.update({ provider_call_id: String(callId) });

  // The webhook matches on CommunicationLog.provider_message_id, and reads
  // metadata.source to decide whose transcript this is. Writing the row here is
  // what makes the internship branch in that controller reachable.
  try {
    await CommunicationLog.create({
      channel: 'voice',
      provider: 'synthflow',
      provider_message_id: callId ? String(callId) : null,
      direction: 'outbound',
      status: 'sent',
      to_address: intake.phone,
      subject: 'AI Internship interview call',
      // communication_logs is lead-scoped (lead_id), with no enrollment column —
      // so the enrollment travels in metadata, which is also where the webhook
      // reads `source` to decide whose transcript this is.
      metadata: {
        source: 'internship-interview',
        application_id: application.id,
        session_id: session.id,
        enrollment_id: params.enrollmentId,
      },
    } as any);
  } catch (err: any) {
    // Non-fatal: the call is placed. Losing the log costs the transcript hook,
    // not the interview — the applicant can still finish online.
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'internship_call_log_failed',
      outcome: 'partial',
      error_class: err?.constructor?.name ?? 'Error',
      context: { application_id: application.id, phone: redactForLogs(intake.phone) },
    }));
  }

  if (application.state === 'interview_channel_selected' || application.state === 'interview_scheduled') {
    await transition(application.id, 'interview_in_progress', {
      actor: 'system',
      actorId: 'internship_call_service',
      reason: 'call placed',
      evidenceSource: 'synthflow',
    });
  }

  await emitInternshipEvent({
    enrollmentId: params.enrollmentId,
    event: 'internship_interview_started',
    meta: { application_id: application.id, channel: 'phone' },
  });

  return { placed: true, session_id: session.id, remaining: remaining.length };
}

/**
 * Book the call for later, or move an existing booking.
 *
 * A reschedule is modelled as a real transition (the state machine allows
 * `interview_scheduled` → itself) so the audit trail records that it happened,
 * with a reason, rather than the row silently changing under the applicant.
 */
export async function scheduleCall(params: {
  application: InternshipApplication;
  enrollmentId: string;
  scheduledFor: Date;
}): Promise<{ session_id: string; scheduled_for: string }> {
  const { application } = params;

  const existing = await InternshipInterviewSession.findOne({
    where: { application_id: application.id, channel: 'phone', status: 'scheduled' },
    order: [['created_at', 'DESC']],
  });

  const session = existing
    ?? await openSession({
      applicationId: application.id,
      channel: 'phone',
      scheduledFor: params.scheduledFor,
    });

  await session.update({ status: 'scheduled', scheduled_for: params.scheduledFor });

  const isReschedule = application.state === 'interview_scheduled';
  await transition(application.id, 'interview_scheduled', {
    actor: 'applicant',
    actorId: params.enrollmentId,
    reason: isReschedule ? 'rescheduled' : 'scheduled',
    evidenceSource: 'portal',
  });

  await emitInternshipEvent({
    enrollmentId: params.enrollmentId,
    event: 'internship_interview_scheduled',
    meta: { application_id: application.id, channel: 'phone' },
  });

  return { session_id: session.id, scheduled_for: params.scheduledFor.toISOString() };
}

/**
 * Cancel a booked call.
 *
 * Returns the applicant to the channel choice rather than stranding them in
 * `interview_scheduled` with no call coming — cancelling a call is not
 * abandoning the application.
 */
export async function cancelScheduledCall(params: {
  application: InternshipApplication;
  enrollmentId: string;
}): Promise<{ cancelled: boolean }> {
  const { application } = params;

  const session = await InternshipInterviewSession.findOne({
    where: { application_id: application.id, channel: 'phone', status: 'scheduled' },
    order: [['created_at', 'DESC']],
  });
  if (session) await session.update({ status: 'cancelled' });

  if (application.state === 'interview_scheduled') {
    await transition(application.id, 'interview_channel_selected', {
      actor: 'applicant',
      actorId: params.enrollmentId,
      reason: 'call cancelled',
      evidenceSource: 'portal',
    });
  }

  return { cancelled: !!session };
}
