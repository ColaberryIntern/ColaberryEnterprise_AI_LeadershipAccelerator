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

  // Build customer object with all context for the AI agent
  const customer: Record<string, any> = {
    name: params.name,
  };

  // Pass structured context as customer variables so the AI agent
  // can reference lead data, cohort info, and prior conversation
  if (params.context) {
    const ctx = params.context;
    if (ctx.lead_company) customer.company = ctx.lead_company;
    if (ctx.lead_title) customer.title = ctx.lead_title;
    if (ctx.lead_email) customer.email = ctx.lead_email;
    if (ctx.lead_score) customer.lead_score = ctx.lead_score;
    if (ctx.lead_interest) customer.interest_area = ctx.lead_interest;
    if (ctx.cohort_name) customer.next_cohort = ctx.cohort_name;
    if (ctx.cohort_start_date) customer.cohort_start_date = ctx.cohort_start_date;
    if (ctx.cohort_seats_remaining != null) customer.seats_remaining = ctx.cohort_seats_remaining;
    if (ctx.conversation_history) customer.conversation_history = ctx.conversation_history;
    if (ctx.step_goal) customer.call_objective = ctx.step_goal;
  }

  // Build the request body
  const requestBody: Record<string, any> = {
    model_id: agentId,
    phone_number: actualPhone,
    customer,
  };

  // If a dynamic prompt is provided, pass it as the system prompt / instructions
  // so the AI agent gets per-call context instead of using a static script
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
