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
    // Enrichment fields
    technology_stack?: string[];
    annual_revenue?: string;
    employee_count?: number;
    company_size?: string;
    lead_temperature?: string;
    pipeline_stage?: string;
    status?: string;
    interest_level?: string;
    evaluating_90_days?: boolean;
    notes?: string;
    linkedin_url?: string;
    source?: string;
    form_type?: string;
    // ICP intelligence (from campaign's ICP profile)
    pain_indicators?: string[];
    buying_signals?: string[];
    // Alumni context (derived from MSSQL data)
    alumni_context?: Record<string, any> | null;
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
  appointmentContext?: {
    scheduled_at: string;
    timezone: string;
    meet_link: string;
  };
  compositeContext?: import('./contextGraphService').CompositeContext;
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

    sms: `You are writing a short SMS text message.
OUTPUT FORMAT — respond with ONLY the SMS text, no JSON, no quotes, no subject line.
Max 160 characters.
CRITICAL RULES:
- Do NOT include any opt-out language. No "Reply STOP", no "opt out", no "unsubscribe", no "text STOP". The carrier adds compliance automatically.
- Do NOT sign off as "Agent Cory AI" or "Cory" or any AI agent name.
- Follow the tone, voice, and campaign context from the CAMPAIGN SYSTEM PROMPT below exactly.
- Keep it human, warm, and conversational — not automated or salesy.
- No hashtags, no emojis unless natural.`,

    voice: `You are writing AI agent instructions for a voice call by Maya, Director of Admissions at Colaberry Enterprise AI Division.
OUTPUT FORMAT — respond with ONLY the voice prompt instructions, no JSON, no quotes.
Write in second person ("You are Maya, calling..."). Include:
- The objective of the call
- Key talking points based on the lead's context
- How to handle objections
- What constitutes a successful outcome
Keep it conversational and natural. The AI agent will use these instructions to guide the call.
CRITICAL: The voice agent's name is Maya. NEVER use placeholder brackets like [Your name], [Name], or [Agent Name]. Always use "Maya" directly.
CRITICAL: Always address the lead by their actual name from the LEAD PROFILE below. NEVER use placeholder brackets like [Lead Name] or [Name] for the lead either.`,
  };

  const defaultPersona = `You are a professional outreach specialist for Colaberry Enterprise AI Division. You write personalized, consultative messages that feel like 1:1 conversations, not marketing templates. You reference the lead's specific context naturally. You never sound like a mass email.`;

  return `${campaignPrompt || defaultPersona}

${channelInstructions[channel]}

IMPORTANT RULES:
- The sender identity comes from the campaign settings (agent_name). Use that identity consistently. For ALUMNI campaigns ONLY: mention Ali Muwwakkil (Managing Director) by name as the person behind the outreach — "Ali asked me to reach out." For COLD OUTBOUND or non-alumni campaigns: do NOT mention Ali — these prospects do not know him. Just use the campaign agent identity.
- CRITICAL: When including a link to book a strategy call or learn more, ONLY use these exact URLs:
  - Strategy call / booking: https://enterprise.colaberry.ai/ai-architect
  - Alumni landing page: https://enterprise.colaberry.ai/alumni-ai-champion
  - Main site: https://enterprise.colaberry.ai
  NEVER use calendly.com, scheduling-link, your-link, or any placeholder URL. NEVER invent or guess a URL.
- Never fabricate information about the lead or their company
- Reference their actual context (title, company, industry) naturally
- If this is a cold outreach, be respectful and value-driven, not pushy
- If there's conversation history, reference prior interactions naturally
- Adapt tone to the lead's seniority level${params.campaignContext?.type === 'alumni' || params.campaignContext?.type === 'alumni_re_engagement' ? `

ALUMNI MESSAGING RULES:
- If career_stage = early_alumni: Use recent graduate framing, emphasize skill building and career launch
- If career_stage = mid_alumni: Use career advancement framing, emphasize leadership and upskilling
- If career_stage = senior_alumni: Use leadership/AI transformation framing, emphasize strategic impact
- You may reference: ClassName, years_since_registration, career_stage, engagement_status, Mentor
- You MUST NOT invent: job title, salary, company, employment status
- Always reference Ali, Colaberry, and the alumni community` : ''}`;
}

function buildUserPrompt(params: GenerateMessageParams): string {
  const { lead, conversationHistory, campaignContext, cohortContext, ai_instructions, tone, context_notes, compositeContext } = params;

  const parts: string[] = [];

  // If composite context is available, use grounded facts instead of scattered context
  if (compositeContext) {
    parts.push(`VERIFIED CONTEXT (use ONLY this data - do not invent any URLs, names, or facts):`);
    parts.push(`Lead: ${compositeContext.lead.name} | ${compositeContext.lead.title || 'No title'} at ${compositeContext.lead.company || 'Unknown company'}`);
    parts.push(`Campaign: ${compositeContext.campaign.name} | Step ${compositeContext.campaign.step + 1} of ${compositeContext.campaign.totalSteps}`);
    parts.push(`You are: ${compositeContext.campaign.senderName}`);
    parts.push(`Relationship: ${compositeContext.campaign.senderRelationship}`);
    parts.push('');
    parts.push('ENGAGEMENT DATA:');
    parts.push(`- Emails sent: ${compositeContext.engagement.emailsSent} | Opened: ${compositeContext.engagement.emailsOpened} | Clicked: ${compositeContext.engagement.linksClicked}`);
    if (compositeContext.engagement.bookingAttempts > 0) parts.push(`- BOOKING ATTEMPTS: ${compositeContext.engagement.bookingAttempts} (they tried to book a strategy call)`);
    if (compositeContext.engagement.repliesReceived > 0) parts.push(`- Replies received: ${compositeContext.engagement.repliesReceived}`);
    if (compositeContext.engagement.voiceCallsMade > 0) parts.push(`- Voice calls made: ${compositeContext.engagement.voiceCallsMade} | Last outcome: ${compositeContext.engagement.lastCallOutcome || 'unknown'}`);
    parts.push(`- Temperature trend: ${compositeContext.engagement.temperatureTrend}`);
    parts.push('');

    if (compositeContext.previousMessages.length > 0) {
      parts.push('PREVIOUS MESSAGES SENT (maintain tone continuity - do not repeat the same content):');
      for (const m of compositeContext.previousMessages) {
        parts.push(`- ${m.sentAt} [${m.channel}] "${m.subject}" - ${m.bodyPreview.substring(0, 200)}`);
        parts.push(`  Outcome: ${m.outcome}`);
      }
      parts.push('');
    }

    parts.push('ALLOWED URLs (use ONLY these - NEVER invent a URL):');
    parts.push(`- Booking/Strategy call: ${compositeContext.allowedUrls.booking}`);
    parts.push(`- Landing page: ${compositeContext.allowedUrls.landingPage}`);
    parts.push(`- Main site: ${compositeContext.allowedUrls.mainSite}`);
    parts.push('');

    if (compositeContext.cohort) {
      parts.push(`COHORT: ${compositeContext.cohort.name} | Starts ${compositeContext.cohort.startDate} (${compositeContext.cohort.daysUntilStart} days away) | ${compositeContext.cohort.seatsRemaining} seats remaining`);
      parts.push('');
    }

    if (compositeContext.lead.notes) {
      parts.push(`NOTES: ${compositeContext.lead.notes}`);
      parts.push('');
    }

    parts.push(`STEP INSTRUCTIONS: ${ai_instructions}`);
    if (tone) parts.push(`TONE: ${tone}`);

    return parts.join('\n');
  }

  // Fallback: original prompt builder (for backward compatibility)
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
  if (lead.technology_stack?.length) parts.push(`- Technology Stack: ${lead.technology_stack.join(', ')}`);
  if (lead.employee_count) parts.push(`- Company Size: ${lead.employee_count} employees`);
  if (lead.annual_revenue) parts.push(`- Annual Revenue: ${lead.annual_revenue}`);
  if (lead.lead_temperature && lead.lead_temperature !== 'cold') parts.push(`- Lead Temperature: ${lead.lead_temperature}`);
  if (lead.pipeline_stage) parts.push(`- Pipeline Stage: ${lead.pipeline_stage}`);
  if (lead.interest_level) parts.push(`- Interest Level: ${lead.interest_level}`);
  if (lead.evaluating_90_days) parts.push(`- Actively evaluating solutions (within 90 days)`);
  if (lead.notes) parts.push(`- Admin Notes: ${lead.notes.substring(0, 500)}`);
  if (lead.source) parts.push(`- Source: ${lead.source}`);

  if (lead.pain_indicators?.length || lead.buying_signals?.length) {
    parts.push(`\nICP INTELLIGENCE:`);
    if (lead.pain_indicators?.length) parts.push(`- Pain Indicators: ${lead.pain_indicators.join(', ')}`);
    if (lead.buying_signals?.length) parts.push(`- Buying Signals: ${lead.buying_signals.join(', ')}`);
  }

  if (lead.alumni_context) {
    const ac = lead.alumni_context;

    // Referral context — lead was referred by a Colaberry alumni
    if (ac.referred_by_name) {
      parts.push(`\nREFERRAL CONTEXT:`);
      parts.push(`- Referred by: ${ac.referred_by_name} (Colaberry alumni)`);
      if (ac.referral_type) parts.push(`- Referral type: ${ac.referral_type}`);
      parts.push(`- IMPORTANT: Mention ${ac.referred_by_name} naturally in the message to establish trust and warmth. This is a warm introduction, not a cold pitch.`);
    } else {
      // Standard alumni context (lead IS an alumni)
      parts.push(`\nALUMNI CONTEXT:`);
      if (ac.years_since_registration) parts.push(`- Years Since Registration: ${ac.years_since_registration}`);
      if (ac.career_stage) parts.push(`- Career Stage: ${ac.career_stage}`);
      if (ac.program_type) parts.push(`- Program: ${ac.program_type}`);
      if (ac.engagement_status) parts.push(`- Engagement Status: ${ac.engagement_status}`);
      if (ac.mentor) parts.push(`- Mentor: ${ac.mentor}`);
      if (ac.alumni_cohort) parts.push(`- Alumni Cohort: ${ac.alumni_cohort}`);
      if (ac.class_name) parts.push(`- Class: ${ac.class_name}`);
    }
  }

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

  if (params.appointmentContext) {
    const appt = params.appointmentContext;
    const apptDate = new Date(appt.scheduled_at);
    const formatted = apptDate.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: appt.timezone,
      timeZoneName: 'short',
    });
    parts.push(`\nAPPOINTMENT DETAILS:`);
    parts.push(`- Scheduled: ${formatted}`);
    parts.push(`- Timezone: ${appt.timezone}`);
    if (appt.meet_link) parts.push(`- Meeting Link: ${appt.meet_link}`);
    parts.push(`- IMPORTANT: Reference the EXACT appointment date and time. Do NOT use vague phrases like "soon" or "in a few days".`);
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
      let emailBody = parsed.body || content;
      // Run validator on email content too
      if (params.compositeContext) {
        const { validateGeneratedMessage } = require('./messageValidatorService');
        const validation = validateGeneratedMessage(emailBody, params.compositeContext, 'email');
        emailBody = validation.content;
      }
      return {
        subject: parsed.subject || 'Colaberry Enterprise AI',
        body: emailBody,
        tokens_used: tokensUsed,
        model,
      };
    } catch {
      let fallbackBody = content;
      if (params.compositeContext) {
        const { validateGeneratedMessage } = require('./messageValidatorService');
        const validation = validateGeneratedMessage(fallbackBody, params.compositeContext, 'email');
        fallbackBody = validation.content;
      }
      return {
        subject: 'Colaberry Enterprise AI',
        body: fallbackBody,
        tokens_used: tokensUsed,
        model,
      };
    }
  }

  // Clean up AI-generated content
  let cleanedBody = content;

  // Strip emdashes from all channels (replace with comma, hyphen, or nothing)
  cleanedBody = cleanedBody.replace(/\s*—\s*/g, ' - ').replace(/\s*–\s*/g, ' - ');

  // Replace any hallucinated Calendly/placeholder URLs with real booking link
  cleanedBody = cleanedBody
    .replace(/https?:\/\/calendly\.com\/[^\s"<)]+/gi, 'https://enterprise.colaberry.ai/ai-architect')
    .replace(/https?:\/\/[^\s"<)]*your-link[^\s"<)]*/gi, 'https://enterprise.colaberry.ai/ai-architect')
    .replace(/https?:\/\/[^\s"<)]*your-scheduling[^\s"<)]*/gi, 'https://enterprise.colaberry.ai/ai-architect')
    .replace(/https?:\/\/[^\s"<)]*your-appointment[^\s"<)]*/gi, 'https://enterprise.colaberry.ai/ai-architect')
    .replace(/https?:\/\/[^\s"<)]*booking-link[^\s"<)]*/gi, 'https://enterprise.colaberry.ai/ai-architect')
    .replace(/https?:\/\/enterprise\.colaberry\.ai\/schedule[^\s"<)]*/gi, 'https://enterprise.colaberry.ai/ai-architect')
    .replace(/https?:\/\/enterprise\.colaberry\.ai\/program[^\s"<)]*/gi, 'https://enterprise.colaberry.ai/ai-architect');

  // SMS-specific: strip opt-out language and AI agent names
  if (params.channel === 'sms') {
    cleanedBody = cleanedBody
      .replace(/\n*Reply STOP to opt[- ]?out\.?/gi, '')
      .replace(/\n*Reply STOP to unsubscribe\.?/gi, '')
      .replace(/\n*Text STOP to opt[- ]?out\.?/gi, '')
      .replace(/\n*Thanks,?\s*Agent Cory AI\.?/gi, '')
      .replace(/\n*-?\s*Agent Cory AI\.?/gi, '')
      .replace(/\n*-?\s*Cory AI\.?/gi, '')
      .trim();
  }

  // Run deterministic validator if composite context is available
  if (params.compositeContext) {
    const { validateGeneratedMessage } = require('./messageValidatorService');
    const validation = validateGeneratedMessage(cleanedBody, params.compositeContext, params.channel);
    cleanedBody = validation.content;
  }

  return {
    body: cleanedBody,
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

/** Generate the ideal ICP profile for a campaign using AI */
export async function generateICPProfile(campaign: {
  name: string;
  description?: string;
  type?: string;
  goals?: string;
  gtm_notes?: string;
  ai_system_prompt?: string;
}): Promise<{
  name: string;
  description: string;
  person_titles: string[];
  person_seniorities: string[];
  industries: string[];
  company_size_min: number;
  company_size_max: number;
  person_locations: string[];
  keywords: string[];
  pain_indicators: string[];
  buying_signals: string[];
}> {
  const client = getClient();

  const model = (await getSetting('ai_model')) || env.aiModel;

  const systemPrompt = `You are an expert B2B sales strategist and Ideal Customer Profile (ICP) designer for Colaberry Enterprise AI Division, which offers AI Leadership training programs and enterprise AI consulting.

Given a campaign's context, generate the PERFECT Ideal Customer Profile — the exact type of person and company most likely to convert.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "name": "Short descriptive name for this ICP (e.g. 'Enterprise AI Decision Makers')",
  "description": "1-2 sentence description of who this profile targets and why they're ideal",
  "person_titles": ["array of 5-8 specific job titles to target, e.g. 'CTO', 'VP of Engineering', 'Director of AI', 'Chief Data Officer'"],
  "person_seniorities": ["array from: c_suite, vp, director, manager, senior — pick the 2-3 most relevant"],
  "industries": ["array of 4-6 specific industries where these buyers exist"],
  "company_size_min": 50,
  "company_size_max": 5000,
  "person_locations": ["array of 1-3 geographic locations, e.g. 'United States'"],
  "keywords": ["array of 4-6 keywords that appear in ideal prospects' profiles or companies"],
  "pain_indicators": ["array of 4-6 specific business pain points these prospects face that our offering solves"],
  "buying_signals": ["array of 4-6 observable signals that indicate readiness to buy"]
}

RULES:
- Be SPECIFIC — not "Technology" but "SaaS", "FinTech", "HealthTech"
- Job titles should be EXACT titles found on LinkedIn, not generic descriptions
- Pain indicators should be real business problems, not vague statements
- Buying signals should be observable behaviors (hiring patterns, budget cycles, tech adoption)
- Company size should reflect realistic mid-market to enterprise targets
- Keywords should be terms that appear in Apollo/LinkedIn profiles of ideal buyers`;

  const userPrompt = `Generate the ideal customer profile for this campaign:

CAMPAIGN NAME: ${campaign.name}
CAMPAIGN TYPE: ${campaign.type || 'cold_outbound'}
${campaign.description ? `DESCRIPTION: ${campaign.description}` : ''}
${campaign.goals ? `GOALS: ${campaign.goals}` : ''}
${campaign.gtm_notes ? `GTM STRATEGY NOTES: ${campaign.gtm_notes}` : ''}
${campaign.ai_system_prompt ? `AI SYSTEM PROMPT (for context on messaging approach): ${campaign.ai_system_prompt}` : ''}

Based on this campaign context, generate the perfect ICP that will maximize conversion rates.`;

  const response = await client.chat.completions.create({
    model,
    max_tokens: 1000,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim() || '';

  try {
    const cleaned = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned);
  } catch {
    // Return sensible defaults if parse fails
    return {
      name: `${campaign.name} - ICP`,
      description: 'AI-generated ideal customer profile',
      person_titles: ['CTO', 'VP of Engineering', 'Director of AI', 'Chief Data Officer'],
      person_seniorities: ['c_suite', 'vp', 'director'],
      industries: ['SaaS', 'Financial Services', 'Healthcare', 'Technology'],
      company_size_min: 100,
      company_size_max: 5000,
      person_locations: ['United States'],
      keywords: ['enterprise ai', 'digital transformation', 'machine learning'],
      pain_indicators: ['Manual processes', 'AI adoption challenges', 'Data strategy gaps'],
      buying_signals: ['Hiring AI roles', 'Budget planning season', 'Recent funding'],
    };
  }
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

// ── Message Effectiveness Scoring ───────────────────────────────────────

export interface MessageMetrics {
  open_rate?: number;
  click_rate?: number;
  reply_rate?: number;
  conversion_rate?: number;
  bounce_rate?: number;
  unsubscribe_rate?: number;
}

export interface MessageScore {
  effectiveness_score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    deliverability: number;   // 0-25
    engagement: number;       // 0-35
    conversion: number;       // 0-25
    retention: number;        // 0-15
  };
  suggestions: string[];
}

/**
 * Score a message's effectiveness based on post-send metrics.
 * Returns a 0-100 score with grade and improvement suggestions.
 */
export function scoreMessageEffectiveness(metrics: MessageMetrics): MessageScore {
  const suggestions: string[] = [];

  // Deliverability (25 points) — inverse of bounce rate
  const bounceRate = metrics.bounce_rate || 0;
  let deliverability = 25;
  if (bounceRate > 0.1) {
    deliverability = 5;
    suggestions.push('High bounce rate — verify email addresses before sending');
  } else if (bounceRate > 0.05) {
    deliverability = 15;
    suggestions.push('Moderate bounce rate — consider email verification');
  } else if (bounceRate > 0.02) {
    deliverability = 20;
  }

  // Engagement (35 points) — open rate + click/reply
  let engagement = 0;
  const openRate = metrics.open_rate || 0;
  const clickRate = metrics.click_rate || 0;
  const replyRate = metrics.reply_rate || 0;

  // Open score (15 of 35)
  if (openRate >= 0.35) engagement += 15;
  else if (openRate >= 0.25) engagement += 12;
  else if (openRate >= 0.15) engagement += 8;
  else if (openRate >= 0.08) engagement += 4;
  else {
    suggestions.push('Low open rate — test shorter, more personalized subject lines');
  }

  // Reply/click score (20 of 35)
  const interactionRate = Math.max(clickRate, replyRate);
  if (interactionRate >= 0.08) engagement += 20;
  else if (interactionRate >= 0.05) engagement += 15;
  else if (interactionRate >= 0.02) engagement += 10;
  else if (interactionRate >= 0.01) engagement += 5;
  else if (openRate >= 0.15) {
    suggestions.push('Good opens but low interaction — strengthen the CTA and value proposition');
  }

  // Conversion (25 points)
  let conversion = 0;
  const convRate = metrics.conversion_rate || 0;
  if (convRate >= 0.05) conversion = 25;
  else if (convRate >= 0.03) conversion = 20;
  else if (convRate >= 0.01) conversion = 12;
  else if (convRate > 0) conversion = 5;
  else if (replyRate >= 0.03) {
    suggestions.push('Replies happening but no conversions — improve follow-up process');
  }

  // Retention (15 points) — inverse of unsubscribe rate
  let retention = 15;
  const unsubRate = metrics.unsubscribe_rate || 0;
  if (unsubRate > 0.05) {
    retention = 0;
    suggestions.push('High unsubscribe rate — reduce send frequency or improve targeting');
  } else if (unsubRate > 0.02) {
    retention = 5;
    suggestions.push('Moderate unsubscribes — review message relevance');
  } else if (unsubRate > 0.01) {
    retention = 10;
  }

  const effectiveness_score = deliverability + engagement + conversion + retention;

  const grade: MessageScore['grade'] =
    effectiveness_score >= 80 ? 'A' :
    effectiveness_score >= 65 ? 'B' :
    effectiveness_score >= 50 ? 'C' :
    effectiveness_score >= 35 ? 'D' : 'F';

  return {
    effectiveness_score,
    grade,
    breakdown: { deliverability, engagement, conversion, retention },
    suggestions,
  };
}
