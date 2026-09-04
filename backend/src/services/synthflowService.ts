import { env } from '../config/env';
import { getTestOverrides } from './settingsService';
import { isKillSwitchActive } from './launchSafety';
import { redactForLogs } from '../utils/piiRedaction';
import { classifyError } from '../utils/errorClassifier';

// Lazy import (matches alertDeliveryService.ts's convention): avoids pulling
// the full Sequelize/model graph into every synthflowService import.
async function emitFailureEvent(params: Parameters<typeof import('./aiEventService').emitAiEvent>[0]): Promise<void> {
  try {
    const { emitAiEvent } = await import('./aiEventService');
    await emitAiEvent(params);
  } catch (err: any) {
    console.error(JSON.stringify({
      level: 'error', service: 'backend', event: 'emit_failure_event_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { event_type: params.event_type, message: err?.message },
    }));
  }
}

interface VoiceCallParams {
  name: string;
  phone: string;
  callType: 'welcome' | 'interest' | 'callback';
  /**
   * Which brand is calling. Absent means the Colaberry bootcamp agents, which is what
   * every existing caller means and why this is optional rather than required.
   */
  brandSlug?: string;
  /** Dynamic prompt/instructions for the AI agent on this specific call */
  prompt?: string;
  /** Structured context passed as customer variables to the AI agent */
  context?: {
    lead_name: string;
    lead_company?: string;
    lead_title?: string;
    lead_email?: string;
    lead_score?: number;
    lead_interest?: string;
    cohort_name?: string;
    cohort_start_date?: string;
    cohort_seats_remaining?: number;
    conversation_history?: string;
    step_goal?: string;
  };
}

interface SynthflowResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Which Synthflow agent should speak on this call.
 *
 * The agent carries its own knowledge base server-side, so this choice decides what the
 * person on the phone is told about — and by whom.
 *
 * ## AI Flotation never falls back
 *
 * Every other route here degrades to a neighbouring agent when its slot is unset, which is
 * reasonable while the agents all speak for the same business. AI Flotation does not: its
 * prospect answering the phone to a Colaberry bootcamp agent is worse than no call at all,
 * and it is the exact outcome the decision to give it its own agent was meant to prevent.
 *
 * So an unconfigured AI Flotation agent returns empty, and the caller skips deterministically
 * rather than dialling with somebody else's voice.
 */
export function resolveAgentId(params: { callType: 'welcome' | 'interest' | 'callback'; brandSlug?: string }): string {
  if (params.brandSlug === 'ai-flotation') return env.synthflowAiFlotationAgentId;

  // 'callback' (inbound "call me now") uses its own dedicated agent so it never
  // conflates with Maya's proactive interest calls. Falls back to the interest
  // agent when the callback slot is unset so the feature works with minimal config.
  if (params.callType === 'welcome') return env.synthflowWelcomeAgentId;
  if (params.callType === 'callback') return env.synthflowCallbackAgentId || env.synthflowInterestAgentId;
  return env.synthflowInterestAgentId;
}

export async function triggerVoiceCall(params: VoiceCallParams): Promise<SynthflowResponse> {
  // SECURITY (TBI audit P0-2): the global kill switch must actually stop outbound voice calls,
  // not merely flip a DB flag. Check it first so an emergency stop is effective.
  if (await isKillSwitchActive()) {
    console.warn('[Synthflow] BLOCKED by kill switch — not initiating voice call.');
    return { success: true, data: { skipped: true, reason: 'kill_switch_active' } };
  }

  if (!env.enableVoiceCalls) {
    console.log('[Synthflow] Voice calls disabled via ENABLE_VOICE_CALLS. Skipping.');
    return { success: true, data: { skipped: true, reason: 'feature_disabled' } };
  }

  if (!params.phone) {
    console.log('[Synthflow] No phone number provided. Skipping voice call.');
    return { success: true, data: { skipped: true, reason: 'no_phone' } };
  }

  if (!env.synthflowApiKey) {
    console.warn('[Synthflow] API key not configured. Skipping voice call.');
    return { success: true, data: { skipped: true, reason: 'no_api_key' } };
  }

  const agentId = resolveAgentId({ callType: params.callType, brandSlug: params.brandSlug });

  if (!agentId) {
    console.warn(`[Synthflow] No agent ID configured for ${params.callType}. Skipping.`);
    return { success: true, data: { skipped: true, reason: 'no_agent_id' } };
  }

  // AI Flotation shares a SHELL agent whose saved prompt is only `{prompt}`. The
  // instructions therefore arrive at call time, and without them the agent is not neutral -
  // it is unscripted, on a number the person may associate with a different business.
  // Refusing to dial is the safe outcome; a silent no-op is better than an improvised call.
  if (params.brandSlug === 'ai-flotation' && !(params.prompt || '').trim()) {
    console.warn('[Synthflow] AI Flotation call has no prompt. Refusing to dial an unscripted agent.');
    return { success: true, data: { skipped: true, reason: 'no_prompt' } };
  }

  // Check global test mode — redirect phone if enabled
  let actualPhone = params.phone;
  try {
    const test = await getTestOverrides();
    if (test.enabled && test.phone) {
      console.log(`[Synthflow] TEST MODE: redirecting call from ${redactForLogs(params.phone)} to ${redactForLogs(test.phone)}`);
      actualPhone = test.phone;
    }
  } catch {
    // If settings DB fails, don't block the call
  }

  // Build custom_variables array per Synthflow V2 API docs
  const customVariables: { key: string; value: string }[] = [];

  if (params.context) {
    const ctx = params.context;
    if (ctx.lead_company) customVariables.push({ key: 'company', value: ctx.lead_company });
    if (ctx.lead_title) customVariables.push({ key: 'title', value: ctx.lead_title });
    if (ctx.lead_email) customVariables.push({ key: 'email', value: ctx.lead_email });
    if (ctx.lead_score) customVariables.push({ key: 'lead_score', value: String(ctx.lead_score) });
    if (ctx.lead_interest) customVariables.push({ key: 'interest_area', value: ctx.lead_interest });
    if (ctx.cohort_name) customVariables.push({ key: 'next_cohort', value: ctx.cohort_name });
    if (ctx.cohort_start_date) customVariables.push({ key: 'cohort_start_date', value: ctx.cohort_start_date });
    if (ctx.cohort_seats_remaining != null) customVariables.push({ key: 'seats_remaining', value: String(ctx.cohort_seats_remaining) });
    if (ctx.conversation_history) customVariables.push({ key: 'conversation_history', value: ctx.conversation_history });
    if (ctx.step_goal) customVariables.push({ key: 'call_objective', value: ctx.step_goal });
  }

  // Build the request body per Synthflow V2 API docs
  const requestBody: Record<string, any> = {
    model_id: agentId,
    phone: actualPhone,
    name: params.name,
  };

  if (params.prompt) {
    // Sent BOTH ways on purpose. The agent's saved prompt embeds `{prompt}`, which
    // Synthflow fills from custom_variables - so the variable is what actually reaches the
    // conversation. The top-level field is kept because existing callers already rely on
    // it and removing it would change their behaviour silently.
    requestBody.prompt = params.prompt;
    customVariables.push({ key: 'prompt', value: params.prompt });
  }

  if (customVariables.length > 0) {
    requestBody.custom_variables = customVariables;
  }

  try {
    const response = await fetch('https://api.synthflow.ai/v2/calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.synthflowApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Synthflow] API error:', response.status, redactForLogs(JSON.stringify(data)));
      emitFailureEvent({
        event_type: 'synthflow_call_failed',
        outcome: 'failure',
        external_system: 'synthflow',
        error_class: classifyError({ status: response.status, message: JSON.stringify(data) }),
        metadata: { message: redactForLogs(JSON.stringify(data)).slice(0, 200) },
      });
      return { success: false, error: JSON.stringify(data) };
    }

    // Extract call_id from Synthflow response (varies by API version)
    const d = data as Record<string, any>;
    const callId = d.call_id || d.id || d._id || d.data?.call_id || d.data?.id || null;
    if (!callId) {
      console.warn('[Synthflow] call_id is null after extraction. Full response:', redactForLogs(JSON.stringify(d)));
    }
    console.log(`[Synthflow] ${params.callType} call initiated for ${redactForLogs(params.name)}. call_id: ${callId}. Response keys: ${Object.keys(d).join(',')}`);
    return { success: true, data: { ...d, call_id: callId } };
  } catch (error: any) {
    console.error('[Synthflow] Request failed:', error.message);
    emitFailureEvent({
      event_type: 'synthflow_call_failed',
      outcome: 'failure',
      external_system: 'synthflow',
      error_class: classifyError(error),
      metadata: { message: String(error?.message || '').slice(0, 200) },
    });
    return { success: false, error: error.message };
  }
}
