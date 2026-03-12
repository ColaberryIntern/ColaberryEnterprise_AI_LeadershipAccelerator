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
    openaiClient = new OpenAI({ apiKey, timeout: 90_000 });
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
  const settings = campaign.settings || {};

  // Build detailed step-by-step breakdown for AI analysis
  const stepsDetail = steps.map((s: any, i: number) => {
    const timing = s.minutes_before_call
      ? `T-${s.minutes_before_call >= 1440 ? s.minutes_before_call / 1440 + 'd' : s.minutes_before_call >= 60 ? s.minutes_before_call / 60 + 'h' : s.minutes_before_call + 'min'}`
      : `Day ${s.delay_days || 0}`;
    const parts = [
      `Step ${i + 1}: ${s.channel} at ${timing}`,
      s.step_goal ? `  Goal: ${s.step_goal}` : null,
      s.ai_instructions ? `  AI Instructions: ${s.ai_instructions}` : null,
      s.ai_tone ? `  Tone: ${s.ai_tone}` : null,
      s.subject ? `  Subject: ${s.subject}` : null,
      s.fallback_channel ? `  Fallback: ${s.fallback_channel}` : null,
      s.max_attempts && s.max_attempts > 1 ? `  Max attempts: ${s.max_attempts}` : null,
      s.voice_prompt ? `  Voice prompt: ${s.voice_prompt.substring(0, 300)}` : null,
      s.sms_template ? `  SMS template: ${s.sms_template}` : null,
      s.body_template ? `  Email body: ${s.body_template.substring(0, 300)}` : null,
    ].filter(Boolean);
    return parts.join('\n');
  }).join('\n\n');

  // Channel breakdown
  const channelCounts = steps.reduce((acc: Record<string, number>, s: any) => {
    acc[s.channel || 'email'] = (acc[s.channel || 'email'] || 0) + 1;
    return acc;
  }, {});
  const channelSummary = Object.entries(channelCounts).map(([ch, count]) => `${count} ${ch}`).join(', ');

  // Timeline
  const totalDays = steps.length > 0 ? Math.max(...steps.map((s: any) => s.delay_days || 0)) : 0;

  const client = getClient();
  const model = (await getSetting('ai_model')) || env.aiModel;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.5,
    max_tokens: 2000,
    messages: [
      {
        role: 'system',
        content: `You are a senior B2B campaign strategist. Analyze the complete campaign configuration below and produce a DETAILED system prompt that could be used to rebuild this exact campaign from scratch.

Your output must be a structured campaign system prompt using this EXACT format. Include ALL sections, filled in with specific details from the campaign analysis:

You are [role], an AI assistant working on behalf of [company/division], role of [specific company].

You are reaching out to [audience definition — be specific about who they are, their relationship to the company, and why they matter] about the [product/program name].

Key messaging pillars:
- [pillar 1 — specific to this campaign's content and value props]
- [pillar 2]
- [pillar 3]
- [additional pillars as needed]
- Landing page: [URL if found in the data, otherwise describe the destination]

Tone: [specific tone — e.g., "Warm, professional, personal. Like a colleague reaching out, not a marketer."]
Voice: [describe the writing style and what NOT to do — e.g., "Write as if personally reaching out. Not salesy. Use their first name. Reference shared history."]
Goal: [primary conversion goal — be specific about what success looks like]

Sequence arc: [describe the narrative flow across all steps — what comes first, how it builds, and how it closes. Reference specific themes like value, proof, urgency, etc.]

Channel strategy:
- Email: [when and why emails are used in this campaign]
- SMS: [when and why SMS is used, if applicable]
- Voice: [when and why voice calls are used, if applicable]

Key constraints:
- [content rules — e.g., "Keep emails under 300 words", "SMS under 160 chars"]
- [audience rules — e.g., "These are alumni — reference shared Colaberry history"]
- [timing rules — e.g., "Space touches 2-3 days apart", "Campaign runs over X days"]
- [any specific offers, discounts, referral bonuses, or CTAs found in the data]

RULES FOR YOUR OUTPUT:
1. Be SPECIFIC — use actual details from the campaign data, not generic placeholders
2. Reference actual content/themes from the steps (subjects, goals, instructions, body text)
3. Include the campaign's specific value propositions, offers, and audience context
4. The output should be detailed enough that the Rebuild function can recreate the entire campaign from it
5. Do NOT list individual steps like "Email 1: ...", "SMS 2: ..." — describe the STRATEGY and ARC
6. If the campaign has specific offers (discounts, referral bonuses, deadlines), include them
7. Output ONLY the prompt text — no explanatory preamble, commentary, or markdown formatting`,
      },
      {
        role: 'user',
        content: `Campaign: ${campaign.name}
Type: ${campaign.type}
Status: ${campaign.status || 'N/A'}
Description: ${campaign.description || 'N/A'}
Goals: ${campaign.goals || 'N/A'}
GTM Notes: ${campaign.gtm_notes || 'N/A'}
Current AI System Prompt: ${campaign.ai_system_prompt || 'N/A'}

Agent Identity:
- Agent Name: ${settings.agent_name || 'N/A'}
- Agent Greeting: ${settings.agent_greeting || 'N/A'}

Campaign Stats:
- ${steps.length} steps across ${channelSummary || 'no channels'}
- Timeline: ${totalDays} days
- Has voice steps: ${steps.some((s: any) => s.channel === 'voice') ? 'Yes' : 'No'}
- Has SMS steps: ${steps.some((s: any) => s.channel === 'sms') ? 'Yes' : 'No'}

Detailed Step Breakdown:
${stepsDetail || 'No steps defined'}

Produce the detailed campaign system prompt.`,
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

  console.log(`[CampaignRebuild] Starting rebuild for campaign ${campaignId}, model: ${model}`);

  const response = await client.chat.completions.create({
    model,
    temperature: 0.7,
    max_tokens: 4500,
    messages: [
      {
        role: 'system',
        content: `You are a B2B campaign strategist for Colaberry Enterprise AI Division.

Given a campaign system prompt (persona/strategy), generate a complete campaign structure with highly detailed step-level instructions.

CONTEXT ON HOW STEPS ARE USED:
The campaign system prompt becomes the AI's persona/system message. Each step's "ai_instructions" becomes the user-level prompt that tells the AI exactly what to write for that touchpoint. The AI then generates the actual email/SMS/voice content by combining the persona with the step instructions and the specific lead's profile data.

This means ai_instructions must be EXTREMELY detailed and specific — they are the primary driver of what gets generated. Vague instructions like "Write an introductory email" produce generic, forgettable content.

RULES FOR ai_instructions (CRITICAL):
- Write 4-8 sentences minimum per step
- Specify EXACTLY what content to include (specific offers, numbers, links, product names)
- Specify what lead context to reference (e.g., "Reference their company name and industry", "Mention their class year and mentor if alumni")
- Specify the CTA explicitly (e.g., "End with a link to the landing page at /alumni-ai-champion", "Ask them to reply YES to schedule a call")
- Specify how this step builds on previous steps in the sequence (e.g., "This is the follow-up to the intro email — acknowledge they may not have seen it, add new value")
- For email: specify the structure (opening hook, value points, proof, CTA)
- For SMS: specify the exact intent (e.g., "Quick nudge to check email, mention the subject line of Email 1")
- For voice: specify talking points, objection handling, and success criteria
- Include specific messaging themes from the campaign prompt (discounts, referral commissions, program names, etc.)

RULES FOR step_goal:
- Must be specific and measurable (e.g., "Get alumni to click through to the landing page" not just "Introduce program")
- Should describe the desired outcome, not the action

OTHER RULES:
- Keep step subjects short and natural (not marketing-y) — 5-8 words max
- Use appropriate channels: email for detailed content, SMS for quick nudges, voice for personal touch
- Sequence should flow naturally: introduce → add value → social proof → urgency → close
- Each step must feel distinct — no two steps should cover the same ground
- Goals should be measurable and specific
- GTM notes should cover messaging themes, positioning, audience context, and competitive angle
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
      "ai_instructions": "... (4-8 detailed sentences) ...",
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

AI System Prompt (this is the persona/strategy the AI will use as its system message when generating content for each step):
${newPrompt}

Generate the full campaign structure. Remember: the ai_instructions for each step must be highly detailed and specific because they directly drive the AI content generation. Include specific offers, CTAs, messaging themes, and lead context references from the system prompt above.`,
      },
    ],
  });

  console.log(`[CampaignRebuild] AI response received, parsing...`);
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
