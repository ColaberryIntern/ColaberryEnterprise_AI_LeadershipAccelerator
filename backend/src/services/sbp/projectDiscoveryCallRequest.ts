import { createHash } from 'crypto';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import ProjectDiscoveryCallRequest from '../../models/ProjectDiscoveryCallRequest';
import { normalizePhone } from '../consentService';
import { resolveAgentId, triggerVoiceCall } from '../synthflowService';
import { getIntake } from './planStore';
import { loadIntakeTruth } from './intakeTruthStore';
import { decideProjectDiscoveryCall, remainingAngles, type CallRefusal } from './projectDiscoveryCall';

/**
 * projectDiscoveryCallRequest - "have an AI call me about what is still
 * unanswered", end to end. I/O.
 *
 * ## Fail-closed, by construction
 *
 * The brief forbids a real phone call in any environment until an operator
 * has decided otherwise. This module honours that without a feature flag of
 * its own: `decideProjectDiscoveryCall` refuses with `no_agent_configured`
 * whenever `SYNTHFLOW_PROJECT_DISCOVERY_AGENT_ID` is unset, and it is unset
 * everywhere. The dial branch below is therefore unreachable today, and
 * becomes reachable only by an operator creating the agent and setting the
 * variable. `triggerVoiceCall` then applies its own kill switch,
 * `ENABLE_VOICE_CALLS`, and API-key guards on top.
 *
 * ## Consent is recorded before anything is dialled, and only here
 *
 * The row is written first, inside the same transaction that holds the
 * project's advisory lock, and the call is placed only after it commits. A
 * consent we could not record is a consent we do not have, so a failed write
 * refuses the call rather than proceeding on memory.
 *
 * It is NOT written to `consent_records`. That ledger is what the marketing
 * voice gate reads, and a `granted` voice row there is read as permission to
 * call the number about anything. A student agreeing to one call about their
 * own project has not agreed to that. See ensureProjectDiscoveryCallSchema.
 *
 * ## One request at a time per project
 *
 * Two clicks a second apart would otherwise both read "no recent request",
 * both write a row, and both dial. A transaction-scoped advisory lock on the
 * project id serialises them, so the second sees the first and is refused as
 * `cooling_down`. Same input twice, one call.
 */

/**
 * The words the student agrees to. Versioned so a later change to the wording
 * cannot be mistaken for what an earlier student saw: the request carries the
 * version the client rendered, and a stale one is refused rather than recorded
 * against text the person never read.
 */
export const CALL_CONSENT_VERSION = '2026-09-11';
export const CALL_CONSENT_TEXT =
  'I agree to receive one automated phone call from an AI assistant about this project, '
  + 'to the number I entered, and I understand the call will be recorded and transcribed '
  + 'to fill in what my project plan still needs. This is not consent to marketing calls.';

export interface CallOffer {
  /** True only when every switch a call needs is on. The wizard hides the option otherwise. */
  readonly available: boolean;
  readonly consentText: string;
  readonly consentVersion: string;
}

/**
 * Whether the option should be shown at all. Reads configuration only, no
 * database, so the preview route can attach it without cost.
 *
 * Absent an agent, the honest UI is no checkbox rather than a checkbox that
 * always answers "not available". A control that can never succeed teaches a
 * student to ignore it, and then it is worth nothing when it starts working.
 */
export function callAvailability(): CallOffer {
  const agent = resolveAgentId({ callType: 'project_discovery' });
  return {
    available: Boolean(agent.trim()) && env.enableVoiceCalls && Boolean(env.synthflowApiKey),
    consentText: CALL_CONSENT_TEXT,
    consentVersion: CALL_CONSENT_VERSION,
  };
}

export interface CallRequestInput {
  readonly projectId: string;
  readonly enrollmentId: string;
  readonly phone: string;
  readonly consent: boolean;
  readonly consentVersion: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  /** The student's own name, as the agent should address them. */
  readonly name?: string | null;
}

export type CallRequestReason =
  | CallRefusal
  | 'consent_text_stale'
  | 'consent_not_recorded'
  | 'dial_skipped'
  | 'dial_failed';

export type CallRequestOutcome =
  | { readonly placed: true; readonly requestId: string; readonly angles: readonly string[]; readonly callId: string | null }
  | { readonly placed: false; readonly reason: CallRequestReason; readonly requestId: string | null };

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export async function requestProjectDiscoveryCall(input: CallRequestInput): Promise<CallRequestOutcome> {
  // A consent box that was not ticked is not a consent, and there is nothing
  // to record: no row, no phone number kept.
  if (!input.consent) return { placed: false, reason: 'no_consent', requestId: null };
  if (input.consentVersion !== CALL_CONSENT_VERSION) {
    return { placed: false, reason: 'consent_text_stale', requestId: null };
  }
  const phone = normalizePhone(input.phone);
  if (!phone) return { placed: false, reason: 'no_phone', requestId: null };

  const known = (await loadIntakeTruth(input.projectId)) ?? [];
  const intake = known.length > 0 ? await getIntake(input.projectId) : null;

  // Decide and record under the project's lock, so two simultaneous requests
  // cannot both decide "place". The lock is transaction-scoped and released on
  // commit or rollback; nothing is held while the call is dialled.
  let row: ProjectDiscoveryCallRequest;
  let decision: ReturnType<typeof decideProjectDiscoveryCall>;
  try {
    const result = await sequelize.transaction(async (transaction) => {
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key: `project_discovery_call:${input.projectId}` },
        transaction,
      });

      const last = await ProjectDiscoveryCallRequest.findOne({
        where: { project_id: input.projectId },
        order: [['created_at', 'DESC']],
        transaction,
      });
      const msSinceLastCall = last ? Date.now() - new Date(last.created_at).getTime() : null;

      const decided = decideProjectDiscoveryCall({
        consentToCall: true,
        phone,
        known,
        remainingAngles: remainingAngles(known),
        agentId: resolveAgentId({ callType: 'project_discovery' }),
        projectName: intake?.name ?? null,
        msSinceLastCall,
      });

      const created = await ProjectDiscoveryCallRequest.create({
        project_id: input.projectId,
        enrollment_id: input.enrollmentId,
        phone_e164: phone,
        consent_version: CALL_CONSENT_VERSION,
        consent_text: CALL_CONSENT_TEXT,
        consented_at: new Date(),
        ip: input.ip ?? null,
        user_agent: input.userAgent ? input.userAgent.slice(0, 512) : null,
        decision: decided.place ? 'place' : decided.reason,
        angles: decided.place ? [...decided.angles] : [],
        prompt_sha256: decided.place ? sha256(decided.prompt) : null,
        call_id: null,
        placed_at: null,
      }, { transaction });

      return { created, decided };
    });
    row = result.created;
    decision = result.decided;
  } catch (err: any) {
    console.error(JSON.stringify({
      event: 'sbp_call_request_not_recorded',
      level: 'error',
      outcome: 'failure',
      error_class: err?.name || 'DatabaseError',
      context: { project_id: input.projectId, message: String(err?.message || '').slice(0, 200) },
    }));
    return { placed: false, reason: 'consent_not_recorded', requestId: null };
  }

  if (!decision.place) {
    console.log(JSON.stringify({
      event: 'sbp_call_refused',
      level: 'info',
      outcome: 'success',
      context: { project_id: input.projectId, request_id: row.id, reason: decision.reason },
    }));
    return { placed: false, reason: decision.reason, requestId: row.id };
  }

  // Reachable only with the agent configured. Every guard inside
  // triggerVoiceCall (kill switch, ENABLE_VOICE_CALLS, API key, test-mode
  // redirect) still applies; a skip there is recorded as one, not as a call.
  try {
    const dialled = await triggerVoiceCall({
      name: (input.name ?? '').trim() || 'there',
      phone,
      callType: 'project_discovery',
      prompt: decision.prompt,
    });

    if (!dialled.success) {
      await row.update({ decision: 'dial_failed' });
      return { placed: false, reason: 'dial_failed', requestId: row.id };
    }
    if (dialled.data?.skipped) {
      const why = String(dialled.data.reason || 'unknown').slice(0, 26);
      await row.update({ decision: `dial_skipped:${why}` });
      return { placed: false, reason: 'dial_skipped', requestId: row.id };
    }

    const callId = dialled.data?.call_id ? String(dialled.data.call_id) : null;
    await row.update({ call_id: callId, placed_at: new Date() });
    console.log(JSON.stringify({
      event: 'sbp_call_placed',
      level: 'info',
      outcome: 'success',
      context: { project_id: input.projectId, request_id: row.id, angles: decision.angles.length, call_id: callId },
    }));
    return { placed: true, requestId: row.id, angles: decision.angles, callId };
  } catch (err: any) {
    console.error(JSON.stringify({
      event: 'sbp_call_dial_failed',
      level: 'error',
      outcome: 'failure',
      error_class: err?.name || 'UpstreamUnavailable',
      context: { project_id: input.projectId, request_id: row.id, message: String(err?.message || '').slice(0, 200) },
    }));
    // Best effort: the row already says 'place'; mark what actually happened.
    try { await row.update({ decision: 'dial_failed' }); } catch (e: any) {
      console.warn('[sbp] call request row not updated after dial failure:', e?.message);
    }
    return { placed: false, reason: 'dial_failed', requestId: row.id };
  }
}
