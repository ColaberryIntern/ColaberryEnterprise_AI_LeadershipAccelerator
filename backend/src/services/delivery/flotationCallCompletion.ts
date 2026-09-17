/**
 * flotationCallCompletion - a finished AI Flotation call becomes a project, whoever tells
 * us it finished.
 *
 * ## The gap this closes
 *
 * Every AI Flotation call ever placed - three out of three, as of 2026-09-17 - sat at
 * `sent` forever: no transcript, no completion, nothing extracted. Synthflow's post-call
 * webhook was never configured for that agent in its dashboard, and our call request did
 * not carry a webhook URL of its own. The code that runs when a call ends was correct and
 * never ran.
 *
 * ## Three ways in, one function
 *
 * Completion can now reach us three ways, and all three end here:
 *
 *   1. The webhook, now that every call we place carries `external_webhook_url`.
 *   2. The admin page polling a call still at `sent`: `reconcileFlotationCall` reads the
 *      call back from Synthflow and completes it.
 *   3. A five-minute sweep over every Flotation call still at `sent`, for the prospect who
 *      has no page polling on their behalf. `reconcileOpenFlotationCalls`.
 *
 * `completeFlotationCall` is the one thing they all call: update the log row if it is not
 * already terminal, then `finishIntake` - the same end the typed interview has. Idempotent
 * end to end: the log write is a no-op on a row already at the same status, and
 * `finishIntake` dedups the understanding on the call id and the build on the understanding.
 */

import { Op } from 'sequelize';
import { CommunicationLog, Lead } from '../../models';
import { fetchSynthflowCall, isTerminalCallStatus } from '../synthflowService';
import { finishIntake, buildTargetFromCall, type IntakeOutcome } from './projectIntake';

export const FLOTATION_SOURCE = 'ai-flotation';

/** How far back the sweep looks. A call older than this that is still `sent` is a fossil. */
export const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;
/** How young a `sent` row must be before the sweep bothers Synthflow about it. */
export const SWEEP_MIN_AGE_MS = 2 * 60 * 1000;
export const SWEEP_LIMIT = 20;

export interface CallCompletionInput {
  callId: string;
  /** Synthflow's call status: 'completed' | 'no-answer' | 'failed' | ... */
  status: string;
  transcript: string;
  durationSeconds?: number | null;
  endReason?: string | null;
  recordingUrl?: string | null;
}

export type CallCompletionResult =
  | { handled: false; reason: 'not_found' | 'not_flotation' }
  | { handled: true; completed: boolean; intake?: IntakeOutcome };

/**
 * Finish one Flotation call. Safe to call from the webhook after it has already written
 * the log row - the update is skipped when the row is already terminal.
 */
export async function completeFlotationCall(input: CallCompletionInput): Promise<CallCompletionResult> {
  const commLog: any = await CommunicationLog.findOne({
    where: { provider: 'synthflow', provider_message_id: input.callId },
  });
  if (!commLog) return { handled: false, reason: 'not_found' };

  const meta = commLog.metadata || {};
  if (meta.source !== FLOTATION_SOURCE) return { handled: false, reason: 'not_flotation' };

  const completed = input.status === 'completed';

  if (commLog.status !== 'delivered' && commLog.status !== 'failed') {
    await commLog.update({
      status: completed ? 'delivered' : 'failed',
      provider_response: {
        ...(commLog.provider_response || {}),
        call_status: input.status,
        duration: input.durationSeconds ?? null,
        transcript: input.transcript || '',
        recording_url: input.recordingUrl ?? null,
        end_call_reason: input.endReason ?? null,
        completed_at: new Date().toISOString(),
      },
    });
  }

  if (!completed || !input.transcript) return { handled: true, completed: false };

  const leadRecord: any = commLog.lead_id ? await Lead.findByPk(commLog.lead_id) : null;
  const intake = await finishIntake({
    conversation: input.transcript,
    source: 'voice_transcript',
    sourceRef: input.callId,
    facts: {
      name: leadRecord?.name || null,
      company: leadRecord?.company || null,
      role: leadRecord?.role || leadRecord?.title || null,
    },
    leadId: (commLog.lead_id as number | null) ?? null,
    // An admin-requested call was stamped with the student it is for; a prospect's call
    // is found by their email, the way the typed door finds them.
    buildFor: buildTargetFromCall({ enrollmentId: meta.enrollment_id, email: leadRecord?.email }),
  });

  return { handled: true, completed: true, intake };
}

export type ReconcileResult =
  | { reconciled: false; reason: 'not_found' | 'not_flotation' | 'already_terminal' | 'no_record' | 'still_active'; status?: string }
  | { reconciled: true; status: string; intake?: IntakeOutcome };

/**
 * Read one call back from Synthflow and complete it if it has ended. What the admin page
 * calls while a call is still `sent`. Never throws past a missing record: "cannot
 * reconcile right now" is not "the call did not happen".
 */
export async function reconcileFlotationCall(callId: string): Promise<ReconcileResult> {
  const commLog: any = await CommunicationLog.findOne({
    where: { provider: 'synthflow', provider_message_id: callId },
  });
  if (!commLog) return { reconciled: false, reason: 'not_found' };
  if ((commLog.metadata || {}).source !== FLOTATION_SOURCE) return { reconciled: false, reason: 'not_flotation' };
  if (commLog.status === 'delivered' || commLog.status === 'failed') return { reconciled: false, reason: 'already_terminal' };

  const record = await fetchSynthflowCall(callId);
  if (!record) return { reconciled: false, reason: 'no_record' };
  if (!isTerminalCallStatus(record.status)) return { reconciled: false, reason: 'still_active', status: record.status };

  const done = await completeFlotationCall({
    callId,
    status: record.status,
    transcript: record.transcript,
    durationSeconds: record.durationSeconds,
    endReason: record.endedReason ?? record.disposition,
    recordingUrl: record.recordingUrl,
  });

  return done.handled
    ? { reconciled: true, status: record.status, intake: done.completed ? done.intake : undefined }
    : { reconciled: false, reason: done.reason };
}

/**
 * Every Flotation call still at `sent`, old enough to have plausibly ended, young enough
 * to matter. The safety net for the prospect nobody is polling for. Bounded, and one
 * failure never stops the sweep.
 */
export async function reconcileOpenFlotationCalls(now: Date = new Date()): Promise<{ checked: number; reconciled: string[] }> {
  const rows: any[] = await CommunicationLog.findAll({
    where: {
      provider: 'synthflow',
      channel: 'voice',
      status: 'sent',
      provider_message_id: { [Op.ne]: null },
      created_at: {
        [Op.gte]: new Date(now.getTime() - SWEEP_WINDOW_MS),
        [Op.lte]: new Date(now.getTime() - SWEEP_MIN_AGE_MS),
      },
    },
    order: [['created_at', 'ASC']],
    limit: SWEEP_LIMIT,
  });

  const reconciled: string[] = [];
  let checked = 0;
  for (const row of rows) {
    if ((row.metadata || {}).source !== FLOTATION_SOURCE) continue;
    checked += 1;
    try {
      const out = await reconcileFlotationCall(row.provider_message_id);
      if (out.reconciled) reconciled.push(row.provider_message_id);
    } catch (err: any) {
      console.warn(JSON.stringify({
        timestamp: now.toISOString(), level: 'warn', service: 'backend', event: 'flotation_call_sweep_item_failed',
        outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
        context: { call_id: row.provider_message_id, message: err?.message },
      }));
    }
  }
  return { checked, reconciled };
}
