import InternshipApplication from '../../models/InternshipApplication';
import InternshipAdministrativeIntake from '../../models/InternshipAdministrativeIntake';
import InternshipInterviewSession from '../../models/InternshipInterviewSession';
import { extractAnswersFromTranscript } from './internshipTranscriptExtraction';
import { remainingQuestions, saveAnswers } from './internshipInterviewService';

/**
 * What happens when an internship interview call ends.
 *
 * Called from `synthflowWebhookController` for calls whose CommunicationLog
 * metadata says `source: 'internship-interview'`.
 *
 * ── IDEMPOTENT, BECAUSE WEBHOOKS ARRIVE TWICE ──────────────────────────────
 *
 * Synthflow retries. Two things make a replay harmless:
 *
 *   1. The session is looked up by `provider_call_id`, which is UNIQUE where
 *      present, so both deliveries resolve to the SAME session.
 *   2. Answers are keyed `(application_id, question_key)`, so re-extracting the
 *      same transcript UPDATES the same rows rather than appending. The contract's
 *      "webhook retries do not duplicate interviews, answers, emails, documents"
 *      is satisfied by the storage shape, not by a replay check that could be
 *      forgotten.
 *
 * ── A CALL NEVER COMPLETES THE INTERVIEW ───────────────────────────────────
 *
 * Two deliberate refusals:
 *
 *   - No transition to `interview_complete` happens here. Extraction writes every
 *     answer as `needs_followup`, so the applicant must see them written down and
 *     confirm them. A dropped call therefore cannot finish an application, and a
 *     model's guess never reaches a reviewer as though the applicant had typed it.
 *   - The transcript is stored ONLY when recording consent was given. Without it
 *     we keep the extracted answers and discard the verbatim text, because the
 *     applicant agreed to be interviewed, not to be recorded.
 */

export type CallCompletionOutcome =
  | { handled: false; reason: string }
  | {
    handled: true;
    session_id: string;
    extracted: number;
    unmatched: number;
    transcript_stored: boolean;
  };

export async function handleInternshipCallCompleted(params: {
  callId: string | null;
  applicationId?: string | null;
  sessionId?: string | null;
  transcript: string;
  status?: string | null;
  disposition?: string | null;
  recordingUrl?: string | null;
  durationSeconds?: number | null;
}): Promise<CallCompletionOutcome> {
  // Resolve the session. `provider_call_id` first because it is the unique key;
  // the metadata session id is the fallback for a call whose id we never saw.
  let session: InternshipInterviewSession | null = null;
  if (params.callId) {
    session = await InternshipInterviewSession.findOne({
      where: { provider_call_id: params.callId },
    });
  }
  if (!session && params.sessionId) {
    session = await InternshipInterviewSession.findByPk(params.sessionId);
  }
  if (!session) return { handled: false, reason: 'no_session' };

  // Backfill the call id so a later replay resolves by the unique key.
  if (params.callId && !session.provider_call_id) {
    await session.update({ provider_call_id: params.callId });
  }

  const application = await InternshipApplication.findByPk(session.application_id);
  if (!application) return { handled: false, reason: 'no_application' };

  const intake = await InternshipAdministrativeIntake.findOne({
    where: { application_id: application.id },
  });
  const consented = !!intake?.consent_recording;

  const failed = params.status && params.status !== 'completed';
  const transcript = (params.transcript || '').trim();

  // A call that connected but produced nothing to read is a failed attempt, not a
  // completed interview. Mark it and let the applicant retry or go online — the
  // questions are all still outstanding, so nothing is lost.
  if (failed || !transcript) {
    await session.update({
      status: 'failed',
      completed_at: new Date(),
      failure_reason: (failed ? `call_${params.disposition || params.status}` : 'no_transcript').slice(0, 120),
      ...(consented && transcript ? { transcript } : {}),
      provider_payload: {
        status: params.status ?? null,
        disposition: params.disposition ?? null,
        duration_seconds: params.durationSeconds ?? null,
        // The recording URL is a pointer at the vendor, not the audio, and is kept
        // only with consent for the same reason the transcript is.
        recording_url: consented ? params.recordingUrl ?? null : null,
      },
    });
    return {
      handled: true,
      session_id: session.id,
      extracted: 0,
      unmatched: 0,
      transcript_stored: consented && !!transcript,
    };
  }

  // Only extract for questions this call was actually given, so a resumed call
  // cannot overwrite an answer the form already collected.
  const outstanding = await remainingQuestions(application.id);
  const { answers, unmatched } = extractAnswersFromTranscript({
    transcript,
    askedOnly: outstanding.map((q) => q.question_key),
  });

  if (answers.length) {
    await saveAnswers({ application, session, answers });
  }

  await session.update({
    status: 'completed',
    completed_at: new Date(),
    // Stored only with consent. The extracted answers survive either way.
    ...(consented ? { transcript } : {}),
    provider_payload: {
      status: params.status ?? null,
      disposition: params.disposition ?? null,
      duration_seconds: params.durationSeconds ?? null,
      recording_url: consented ? params.recordingUrl ?? null : null,
      extracted_count: answers.length,
      unmatched_keys: unmatched,
    },
  });

  return {
    handled: true,
    session_id: session.id,
    extracted: answers.length,
    unmatched: unmatched.length,
    transcript_stored: consented,
  };
}
