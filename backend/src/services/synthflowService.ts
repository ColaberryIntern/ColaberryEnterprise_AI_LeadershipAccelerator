import { env } from '../config/env';
import { getTestOverrides } from './settingsService';

interface VoiceCallParams {
  name: string;
  phone: string;
  callType: 'welcome' | 'interest';
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

export async function triggerVoiceCall(params: VoiceCallParams): Promise<SynthflowResponse> {
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

  const agentId = params.callType === 'welcome'
    ? env.synthflowWelcomeAgentId
    : env.synthflowInterestAgentId;

  if (!agentId) {
    console.warn(`[Synthflow] No agent ID configured for ${params.callType}. Skipping.`);
    return { success: true, data: { skipped: true, reason: 'no_agent_id' } };
  }

  // Check global test mode — redirect phone if enabled
  let actualPhone = params.phone;
  try {
    const test = await getTestOverrides();
    if (test.enabled && test.phone) {
      console.log(`[Synthflow] TEST MODE: redirecting call from ${params.phone} to ${test.phone}`);
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

  if (customVariables.length > 0) {
    requestBody.custom_variables = customVariables;
  }

  if (params.prompt) {
    requestBody.prompt = params.prompt;
  }

  try {
    const response = await fetch('https://api.synthflow.ai/v2/calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.synthflowApiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Synthflow] API error:', response.status, data);
      return { success: false, error: JSON.stringify(data) };
    }

    console.log(`[Synthflow] ${params.callType} call initiated for ${params.name} (prompt-driven)`);
    return { success: true, data };
  } catch (error: any) {
    console.error('[Synthflow] Request failed:', error.message);
    return { success: false, error: error.message };
  }
}
