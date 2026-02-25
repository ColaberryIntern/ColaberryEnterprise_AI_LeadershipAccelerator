import OpenAI from 'openai';
import { env } from '../config/env';
import { getSetting } from './settingsService';
import { Activity } from '../models';

export type AIChannel = 'email' | 'sms' | 'voice';

export interface GenerateMessageParams {
  channel: AIChannel;
  ai_instructions: string;
  lead: {
    name: string;
    company?: string;
    title?: string;
    industry?: string;
    lead_score?: number;
    source_type?: string;
    interest_area?: string;
    email?: string;
    phone?: string;
  };
  conversationHistory?: string;
  campaignContext?: {
    type?: string;
    name?: string;
    step_goal?: string;
    step_number?: number;
    total_steps?: number;
    system_prompt?: string;
  };
  cohortContext?: {
    name?: string;
    start_date?: string;
    seats_remaining?: number;
  };
  tone?: string;
  context_notes?: string;
}

export interface GenerateMessageResult {
  subject?: string;
  body: string;
  tokens_used: number;
  model: string;
}

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = env.openaiApiKey;
    if (!apiKey) throw new Error('OpenAI API key not configured');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function buildSystemPrompt(channel: AIChannel, params: GenerateMessageParams): string {
  const campaignPrompt = params.campaignContext?.system_prompt || '';

  const channelInstructions: Record<AIChannel, string> = {
    email: `You are writing a professional business email for Colaberry Enterprise AI Division.
OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{"subject": "...", "body": "..."}
The "body" must be HTML suitable for email. Use <p>, <h2>, <strong>, <a> tags.
Include a clear CTA. Keep it concise (150-250 words). Sign off as the Colaberry Enterprise AI team.
Never include unsubscribe links or footer — those are added automatically.`,

    sms: `You are writing a short SMS message for Colaberry Enterprise AI Division.
OUTPUT FORMAT — respond with ONLY the SMS text, no JSON, no quotes.
Max 160 characters. Be direct with a clear CTA. Include a way to reply (e.g., "Reply YES").
No hashtags, no emojis unless natural.`,

    voice: `You are writing AI agent instructions for a voice call (Synthflow AI).
OUTPUT FORMAT — respond with ONLY the voice prompt instructions, no JSON, no quotes.
Write in second person ("You are calling..."). Include:
- The objective of the call
- Key talking points based on the lead's context
- How to handle objections
- What constitutes a successful outcome
Keep it conversational and natural. The AI agent will use these instructions to guide the call.`,
  };

  const defaultPersona = `You are a professional outreach specialist for Colaberry Enterprise AI Division. You write personalized, consultative messages that feel like 1:1 conversations, not marketing templates. You reference the lead's specific context naturally. You never sound like a mass email.`;

  return `${campaignPrompt || defaultPersona}

${channelInstructions[channel]}

IMPORTANT RULES:
- Never fabricate information about the lead or their company
- Reference their actual context (title, company, industry) naturally
- If this is a cold outreach, be respectful and value-driven, not pushy
- If there's conversation history, reference prior interactions naturally
- Adapt tone to the lead's seniority level`;
}

function buildUserPrompt(params: GenerateMessageParams): string {
  const { lead, conversationHistory, campaignContext, cohortContext, ai_instructions, tone, context_notes } = params;

  const parts: string[] = [];

  parts.push(`STEP INSTRUCTIONS: ${ai_instructions}`);

  if (tone) parts.push(`TONE: ${tone}`);
  if (context_notes) parts.push(`ADDITIONAL CONTEXT: ${context_notes}`);

  parts.push(`\nLEAD PROFILE:`);
  parts.push(`- Name: ${lead.name}`);
  if (lead.company) parts.push(`- Company: ${lead.company}`);
  if (lead.title) parts.push(`- Title: ${lead.title}`);
  if (lead.industry) parts.push(`- Industry: ${lead.industry}`);
  if (lead.interest_area) parts.push(`- Interest Area: ${lead.interest_area}`);
  if (lead.lead_score !== undefined) parts.push(`- Lead Score: ${lead.lead_score}/100`);
  if (lead.source_type) parts.push(`- Lead Type: ${lead.source_type}`);

  if (campaignContext) {
    parts.push(`\nCAMPAIGN CONTEXT:`);
    if (campaignContext.name) parts.push(`- Campaign: ${campaignContext.name}`);
    if (campaignContext.type) parts.push(`- Type: ${campaignContext.type}`);
    if (campaignContext.step_number !== undefined && campaignContext.total_steps !== undefined) {
      parts.push(`- Step: ${campaignContext.step_number + 1} of ${campaignContext.total_steps}`);
    }
    if (campaignContext.step_goal) parts.push(`- Step Goal: ${campaignContext.step_goal}`);
  }

  if (cohortContext) {
    parts.push(`\nCOHORT INFO:`);
    if (cohortContext.name) parts.push(`- Program: ${cohortContext.name}`);
    if (cohortContext.start_date) parts.push(`- Starts: ${cohortContext.start_date}`);
    if (cohortContext.seats_remaining !== undefined) parts.push(`- Seats Remaining: ${cohortContext.seats_remaining}`);
  }

  if (conversationHistory && conversationHistory !== 'No prior interactions with this lead.') {
    parts.push(`\nCONVERSATION HISTORY:\n${conversationHistory}`);
  } else {
    parts.push(`\nNO PRIOR INTERACTIONS — this is the first touchpoint.`);
  }

  return parts.join('\n');
}

export async function generateMessage(params: GenerateMessageParams): Promise<GenerateMessageResult> {
  const client = getClient();

  const model = (await getSetting('ai_model')) || env.aiModel;
  const maxTokens = (await getSetting('ai_max_tokens')) || env.aiMaxTokens;

  const systemPrompt = buildSystemPrompt(params.channel, params);
  const userPrompt = buildUserPrompt(params);

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim() || '';
  const tokensUsed = response.usage?.total_tokens || 0;

  if (params.channel === 'email') {
    try {
      // Try to parse JSON response for email
      const cleaned = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(cleaned);
      return {
        subject: parsed.subject || 'Colaberry Enterprise AI',
        body: parsed.body || content,
        tokens_used: tokensUsed,
        model,
      };
    } catch {
      // If JSON parse fails, use the raw content
      return {
        subject: 'Colaberry Enterprise AI',
        body: content,
        tokens_used: tokensUsed,
        model,
      };
    }
  }

  // SMS and voice return plain text
  return {
    body: content,
    tokens_used: tokensUsed,
    model,
  };
}

/** Build conversation history string from Activity records for a lead */
export async function buildConversationHistory(leadId: number): Promise<string> {
  const activities = await Activity.findAll({
    where: { lead_id: leadId },
    order: [['created_at', 'ASC']],
    limit: 20,
  });

  if (activities.length === 0) return 'No prior interactions with this lead.';

  const lines = activities.map((a) => {
    const date = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const type = a.type.replace(/_/g, ' ');
    return `- ${date}: ${type}${a.subject ? ` — ${a.subject}` : ''}`;
  });

  return lines.join('\n');
}

/** Generate a preview message with sample data (for the admin UI "Preview AI Output" button) */
export async function generatePreview(
  channel: AIChannel,
  ai_instructions: string,
  tone?: string,
  systemPrompt?: string,
): Promise<GenerateMessageResult> {
  return generateMessage({
    channel,
    ai_instructions,
    tone,
    lead: {
      name: 'Sarah Chen',
      company: 'TechVentures Inc.',
      title: 'VP of Engineering',
      industry: 'SaaS / Technology',
      lead_score: 75,
      source_type: 'cold',
      interest_area: 'AI Strategy',
    },
    conversationHistory: 'No prior interactions with this lead.',
    campaignContext: {
      type: 'cold_outbound',
      name: 'AI Leadership Q1 Campaign',
      step_goal: 'Initial introduction',
      step_number: 0,
      total_steps: 7,
      system_prompt: systemPrompt,
    },
    cohortContext: {
      name: 'AI Leadership Accelerator - March 2026',
      start_date: 'March 15, 2026',
      seats_remaining: 12,
    },
  });
}
