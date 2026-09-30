import InternshipInterviewSession from '../../models/InternshipInterviewSession';
import { fetchSynthflowCall, isTerminalCallStatus } from '../synthflowService';
import { handleInternshipCallCompleted } from './internshipCallCompletion';

/**
 * Complete a phone interview from Synthflow's own record, without waiting on the
 * call-complete webhook.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Completion normally rides the webhook `synthflowWebhookController` handles. But
 * Synthflow posts that webhook from a URL configured per agent in its dashboard,
 * and the internship interviewer (the AI Flotation shell agent) had no such URL
 * set — so a real, completed call with a full transcript left the session stuck
 * `in_progress`, nothing extracted, the interview frozen mid-flow. Observed on
 * production 2026-09-11: call `bc77d9a7…`, status completed, 312s, a 4 KB
 * transcript at the vendor, and zero of it in our database.
 *
 * The call record is readable over the API, so we reconcile against it. This is a
 * complement to the webhook, not a replacement: whichever arrives first completes
 * the session, and the second is a no-op because `handleInternshipCallCompleted`
 * keys on `provider_call_id`, which is unique, and a completed session is not
 * reopened.
 *
 * It is called from the interview poll, so an applicant's own screen drives their
 * completion — the call ends, the next poll reconciles, and the page moves on.
 */
export interface ReconcileOutcome {
  reconciled: boolean;
  reason?: string;
  status?: string;
  extracted?: number;
}

export async function reconcileInternshipCall(applicationId: string): Promise<ReconcileOutcome> {
  // The one call that could still be waiting on completion: the most recent phone
  // session that is still open and actually has a provider call to look up.
  const session = await InternshipInterviewSession.findOne({
    where: { application_id: applicationId, channel: 'phone', status: 'in_progress' },
    order: [['created_at', 'DESC']],
  });
  if (!session || !session.provider_call_id) {
    return { reconciled: false, reason: 'no_open_call' };
  }

  const record = await fetchSynthflowCall(session.provider_call_id);
  if (!record) {
    // Voice off, no key, unknown id, or the request failed — none of which means
    // the call is over. Leave the session open and try again on the next poll.
    return { reconciled: false, reason: 'no_record' };
  }
  if (!isTerminalCallStatus(record.status)) {
    // Still ringing or still talking. The overlay keeps showing "on the call".
    return { reconciled: false, reason: 'still_active', status: record.status };
  }

  const outcome = await handleInternshipCallCompleted({
    callId: session.provider_call_id,
    applicationId,
    sessionId: session.id,
    transcript: record.transcript,
    status: record.status,
    disposition: record.disposition,
    recordingUrl: record.recordingUrl,
    durationSeconds: record.durationSeconds,
  });

  return {
    reconciled: outcome.handled,
    status: record.status,
    extracted: outcome.handled ? outcome.extracted : 0,
  };
}
