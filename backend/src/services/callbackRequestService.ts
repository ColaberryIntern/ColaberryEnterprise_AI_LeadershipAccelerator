import { Op } from 'sequelize';
import { CommunicationLog } from '../models';
import { V1CallbackInput } from '../schemas/v1CallbackSchema';
import { ingestExternalLead } from './externalLeadIngestService';
import { evaluateSend } from './communicationSafetyService';
import { triggerVoiceCall } from './synthflowService';
import { logCommunication } from './communicationLogService';

// Two callbacks to the same lead inside this window collapse to one call. This is
// the idempotency key for the side effect: a double-click, a client retry, or a
// duplicate webhook must NOT place a second phone call. 5 minutes comfortably
// covers retry storms without blocking a genuine "call me again" later in the day.
const CALLBACK_DEDUP_WINDOW_MS = 5 * 60 * 1000;

export type CallbackStatus =
  | 'call_initiated' // handed to Synthflow, call_id returned
  | 'deduplicated' // a recent callback to this lead already fired
  | 'blocked' // safety pipeline stopped it (unsubscribed, rate limit, test-mode gap, paused)
  | 'skipped' // voice feature/agent/key not configured — deterministic no-op
  | 'failed'; // Synthflow upstream error

export interface CallbackResult {
  status: CallbackStatus;
  lead_id: number;
  call_id: string | null;
  deduped: boolean;
  reason?: string;
}

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {},
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'v1-request-callback', event, outcome, ...context }) + '\n',
  );
}

/**
 * Place an inbound "call me now" callback requested from training.colaberry.com.
 *
 * Pipeline: resolve an idempotent lead -> dedup the call -> run the shared safety
 * checks -> trigger the Synthflow outbound agent (whose knowledge base stays
 * attached server-side) -> log the communication for audit + webhook matching.
 */
export async function requestInstantCallback(
  payload: V1CallbackInput,
  correlation_id: string,
): Promise<CallbackResult> {
  // 1. Resolve the lead idempotently (dedup by strapi_lead_id/email inside the
  //    shared ingest service). A person asking to be called IS a lead.
  const lead = await ingestExternalLead(payload, correlation_id);
  const leadId = lead.id;

  // 2. Call-level idempotency: if we already fired a callback to this lead in the
  //    window, return the existing call rather than dialing again.
  const recent = await CommunicationLog.findOne({
    where: {
      lead_id: leadId,
      channel: 'voice',
      provider: 'synthflow',
      direction: 'outbound',
      status: { [Op.notIn]: ['failed', 'blocked', 'skipped'] },
      created_at: { [Op.gte]: new Date(Date.now() - CALLBACK_DEDUP_WINDOW_MS) },
    },
    order: [['created_at', 'DESC']],
  });

  if (recent) {
    log('info', 'callback_deduplicated', 'success', { correlation_id, lead_id: leadId, existing_call_id: recent.provider_message_id });
    return { status: 'deduplicated', lead_id: leadId, call_id: recent.provider_message_id, deduped: true };
  }

  // 3. Shared safety pipeline: scheduler pause, global rate limit, unsubscribe/DND,
  //    and test-mode redirect (fail-closed). Same chokepoint every other send uses.
  const decision = await evaluateSend({
    leadId,
    channel: 'voice',
    toPhone: payload.phone,
    source: 'manual',
  });

  if (!decision.allowed) {
    await logCommunication({
      lead_id: leadId,
      channel: 'voice',
      direction: 'outbound',
      delivery_mode: 'blocked',
      status: 'blocked',
      to_address: payload.phone,
      provider: 'synthflow',
      error_message: decision.blockedReason || 'blocked_by_safety',
      metadata: { trigger: 'instant_callback', call_type: 'callback', source: payload.source, correlation_id },
    }).catch(() => {});
    log('warn', 'callback_blocked', 'failure', { correlation_id, lead_id: leadId, reason: decision.blockedReason });
    return { status: 'blocked', lead_id: leadId, call_id: null, deduped: false, reason: decision.blockedReason };
  }

  const targetPhone = decision.redirect?.phone || payload.phone;

  // 4. Trigger the Synthflow outbound agent. The agent's prompt + knowledge base
  //    live in Synthflow; we only pass the phone, name, and structured context.
  const callResult = await triggerVoiceCall({
    name: payload.name,
    phone: targetPhone,
    callType: 'callback',
    context: {
      lead_name: payload.name,
      lead_company: payload.company || undefined,
      lead_title: payload.title || undefined,
      lead_email: payload.email,
      lead_interest: payload.interest_area || undefined,
      step_goal: 'Inbound "call me now" — the prospect just asked on training.colaberry.com to be called right away.',
    },
  });

  // 5. Classify the outcome. triggerVoiceCall returns success:true with data.skipped
  //    when voice is disabled / no key / no agent — a deterministic no-op, not a failure.
  const skipped = callResult.success && callResult.data?.skipped === true;
  const callId: string | null = callResult.data?.call_id || null;

  if (skipped) {
    const reason = callResult.data?.reason || 'voice_not_configured';
    await logCommunication({
      lead_id: leadId,
      channel: 'voice',
      direction: 'outbound',
      delivery_mode: decision.deliveryMode,
      status: 'skipped',
      to_address: targetPhone,
      provider: 'synthflow',
      error_message: reason,
      metadata: { trigger: 'instant_callback', call_type: 'callback', source: payload.source, correlation_id },
    }).catch(() => {});
    log('warn', 'callback_skipped', 'partial', { correlation_id, lead_id: leadId, reason });
    return { status: 'skipped', lead_id: leadId, call_id: null, deduped: false, reason };
  }

  if (!callResult.success) {
    await logCommunication({
      lead_id: leadId,
      channel: 'voice',
      direction: 'outbound',
      delivery_mode: decision.deliveryMode,
      status: 'failed',
      to_address: targetPhone,
      provider: 'synthflow',
      error_message: callResult.error || 'synthflow_error',
      metadata: { trigger: 'instant_callback', call_type: 'callback', source: payload.source, correlation_id },
    }).catch(() => {});
    log('error', 'callback_failed', 'failure', { correlation_id, lead_id: leadId, error_class: 'UpstreamUnavailable', reason: callResult.error });
    return { status: 'failed', lead_id: leadId, call_id: null, deduped: false, reason: callResult.error };
  }

  // Success — log with the call_id so the Synthflow completion webhook can match it.
  await logCommunication({
    lead_id: leadId,
    channel: 'voice',
    direction: 'outbound',
    delivery_mode: decision.deliveryMode,
    status: 'sent',
    to_address: targetPhone,
    provider: 'synthflow',
    provider_message_id: callId,
    metadata: {
      trigger: 'instant_callback',
      call_type: 'callback',
      source: payload.source,
      interest_area: payload.interest_area,
      test_mode: decision.testMode,
      correlation_id,
    },
  }).catch(() => {});

  log('info', 'callback_initiated', 'success', { correlation_id, lead_id: leadId, call_id: callId, delivery_mode: decision.deliveryMode });
  return { status: 'call_initiated', lead_id: leadId, call_id: callId, deduped: false };
}
