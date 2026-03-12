import OpenAI from 'openai';
import { env } from '../config/env';
import { getSetting } from './settingsService';
import { Campaign, FollowUpSequence } from '../models';
import { createSequence } from './sequenceService';

/* ------------------------------------------------------------------ */
/*  OpenAI client (same pattern as aiMessageService)                   */
/* ------------------------------------------------------------------ */

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = env.openaiApiKey;
    if (!apiKey) throw new Error('OpenAI API key not configured');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/* ------------------------------------------------------------------ */
/*  Reverse Engineer — analyze campaign and produce strategic summary   */
/* ------------------------------------------------------------------ */

export async function reverseEngineerCampaign(campaignId: string): Promise<{ summary: string }> {
  const campaign = await Campaign.findByPk(campaignId) as any;
  if (!campaign) throw new Error('Campaign not found');

  let sequence: any = null;
  if (campaign.sequence_id) {
    sequence = await FollowUpSequence.findByPk(campaign.sequence_id);
  }

  const steps = Array.isArray(sequence?.steps) ? sequence.steps : [];

  const stepsOverview = steps.map((s: any, i: number) => {
    const timing = s.minutes_before_call
      ? `T-${s.minutes_before_call >= 1440 ? s.minutes_before_call / 1440 + 'd' : s.minutes_before_call >= 60 ? s.minutes_before_call / 60 + 'h' : s.minutes_before_call + 'min'}`
      : `Day ${s.delay_days || 0}`;
    return `Step ${i + 1}: ${s.channel} at ${timing} — goal: ${s.step_goal || 'N/A'}`;
  }).join('\n');

  const client = getClient();
  const model = (await getSetting('ai_model')) || env.aiModel;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.5,
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content: `You are a campaign strategist. Analyze the campaign configuration below and write a concise strategic summary (2-4 sentences).

Describe WHAT the campaign does at a high level — its purpose, audience, channel strategy, messaging approach, and key outcomes.

Do NOT list individual steps like "Email 1: ...", "SMS 2: ...". Instead, describe the overall arc, tone, and strategy.

The summary should be usable as a campaign system prompt — someone should be able to read it and understand the full campaign strategy.`,
      },
      {
        role: 'user',
        content: `Campaign: ${campaign.name}
Type: ${campaign.type}
Description: ${campaign.description || 'N/A'}
Goals: ${campaign.goals || 'N/A'}
GTM Notes: ${campaign.gtm_notes || 'N/A'}
Current AI System Prompt: ${campaign.ai_system_prompt || 'N/A'}

Sequence (${steps.length} steps):
${stepsOverview || 'No steps defined'}

Write a strategic summary of this campaign.`,
      },
    ],
  });

  const summary = response.choices[0]?.message?.content?.trim() || '';
  return { summary };
}

/* ------------------------------------------------------------------ */
/*  Rebuild — regenerate entire campaign from updated system prompt     */
/* ------------------------------------------------------------------ */

export interface RebuildResult {
  campaign: any;
  sequence: any;
}

export async function rebuildCampaignFromPrompt(
  campaignId: string,
  newPrompt: string
): Promise<RebuildResult> {
  const campaign = await Campaign.findByPk(campaignId) as any;
  if (!campaign) throw new Error('Campaign not found');

  // Save the new prompt immediately
  await campaign.update({ ai_system_prompt: newPrompt });

  const client = getClient();
  const model = (await getSetting('ai_model')) || env.aiModel;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.7,
    max_tokens: 3000,
    messages: [
      {
        role: 'system',
        content: `You are a B2B campaign strategist for Colaberry Enterprise AI Division.

Given a campaign system prompt (persona/strategy), generate a complete campaign structure.

RULES:
- The ai_instructions for each step should describe WHAT the AI should write, not the actual content
- Keep step subjects short and natural (not marketing-y)
- Use appropriate channels: email for detailed content, SMS for quick nudges (under 160 chars), voice for personal touch
- Sequence should flow naturally: introduce → add value → social proof → urgency → close
- Goals should be measurable and specific
- GTM notes should cover messaging themes, positioning, and audience context
- Description should be 2-3 sentences explaining the campaign

Respond with ONLY valid JSON, no markdown fences:
{
  "description": "...",
  "goals": "...",
  "gtm_notes": "...",
  "steps": [
    {
      "channel": "email|voice|sms",
      "delay_days": 0,
      "subject": "...",
      "step_goal": "...",
      "ai_instructions": "...",
      "ai_tone": "professional|casual|consultative|urgent|friendly",
      "max_attempts": 1,
      "fallback_channel": null,
      "body_template": "",
      "voice_prompt": "",
      "sms_template": ""
    }
  ]
}`,
      },
      {
        role: 'user',
        content: `Campaign Name: ${campaign.name}
Campaign Type: ${campaign.type}

AI System Prompt:
${newPrompt}

Generate the full campaign structure.`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() || '';

  // Parse JSON — strip markdown fences if present
  let parsed: any;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    console.error('[CampaignRebuild] Failed to parse AI response:', raw.substring(0, 500));
    throw new Error(`AI returned invalid JSON: ${err.message}`);
  }

  // Validate required fields
  if (!parsed.description || !parsed.steps || !Array.isArray(parsed.steps)) {
    throw new Error('AI response missing required fields (description, steps)');
  }

  // Normalize steps
  const normalizedSteps = parsed.steps.map((s: any) => ({
    channel: s.channel || 'email',
    delay_days: s.delay_days ?? 0,
    subject: s.subject || '',
    step_goal: s.step_goal || '',
    ai_instructions: s.ai_instructions || '',
    ai_tone: s.ai_tone || 'professional',
    ai_context_notes: s.ai_context_notes || '',
    max_attempts: s.max_attempts || (s.channel === 'voice' ? 2 : 1),
    fallback_channel: s.fallback_channel || null,
    body_template: s.body_template || '',
    voice_prompt: s.voice_prompt || '',
    sms_template: s.sms_template || '',
  }));

  // Update campaign fields
  await campaign.update({
    description: parsed.description,
    goals: parsed.goals || campaign.goals,
    gtm_notes: parsed.gtm_notes || campaign.gtm_notes,
  });

  // Update or create sequence
  let sequence: any = null;
  if (campaign.sequence_id) {
    sequence = await FollowUpSequence.findByPk(campaign.sequence_id);
    if (sequence) {
      await sequence.update({ steps: normalizedSteps });
    }
  }

  if (!sequence) {
    sequence = await createSequence({
      name: `${campaign.name} Sequence`,
      description: `Auto-generated sequence for ${campaign.name}`,
      steps: normalizedSteps,
    });
    await campaign.update({ sequence_id: sequence.id });
  }

  // Reload for response
  await campaign.reload();

  return {
    campaign: {
      id: campaign.id,
      description: campaign.description,
      goals: campaign.goals,
      gtm_notes: campaign.gtm_notes,
      ai_system_prompt: campaign.ai_system_prompt,
      sequence_id: campaign.sequence_id,
    },
    sequence: {
      id: sequence.id,
      name: sequence.name,
      steps: sequence.steps,
    },
  };
}
