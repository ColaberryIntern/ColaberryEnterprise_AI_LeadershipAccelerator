import { env } from '../config/env';

interface VoiceCallParams {
  name: string;
  phone: string;
  callType: 'welcome' | 'interest';
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

  try {
    const response = await fetch('https://api.synthflow.ai/v2/calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.synthflowApiKey}`,
      },
      body: JSON.stringify({
        model_id: agentId,
        phone_number: params.phone,
        customer: { name: params.name },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Synthflow] API error:', response.status, data);
      return { success: false, error: JSON.stringify(data) };
    }

    console.log(`[Synthflow] ${params.callType} call initiated for ${params.name}`);
    return { success: true, data };
  } catch (error: any) {
    console.error('[Synthflow] Request failed:', error.message);
    return { success: false, error: error.message };
  }
}
