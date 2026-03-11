import { createCampaign, enrollLeadsInCampaign } from './campaignService';
import { createSequence } from './sequenceService';
import {
  createICPProfile,
  searchApolloFromProfileBulk,
  type CreateICPProfileParams,
} from './icpProfileService';
import { importApolloResults } from './apolloService';
import { Campaign } from '../models';
import type { SequenceStep } from '../models/FollowUpSequence';
import OpenAI from 'openai';
import { env } from '../config/env';
import { getSetting } from './settingsService';

// ── Sequence Templates ──────────────────────────────────────────────────

const STANDARD_COLD_STEPS: SequenceStep[] = [
  {
    channel: 'email',
    delay_days: 0,
    subject: 'AI Leadership for {{company}}',
    body_template: '',
    ai_instructions:
      "Write a personalized cold outreach email introducing Colaberry's Enterprise AI Leadership Accelerator. Reference {{company}}'s industry and {{name}}'s role. Focus on the pain of falling behind on AI adoption. Keep it under 150 words. No hard sell.",
    step_goal: 'initial_outreach',
    ai_tone: 'professional',
    max_attempts: 1,
  },
  {
    channel: 'email',
    delay_days: 2,
    subject: 'AI in {{industry}} — a quick insight',
    body_template: '',
    ai_instructions:
      "Follow up on the initial email. Share a specific insight about how {{industry}} companies are using AI leadership training. Mention the executive briefing. Ask a soft discovery question.",
    step_goal: 'value_add',
    ai_tone: 'consultative',
    max_attempts: 1,
  },
  {
    channel: 'email',
    delay_days: 5,
    subject: 'How {{industry}} leaders are upskilling on AI',
    body_template: '',
    ai_instructions:
      "Reference how similar {{industry}} companies have enrolled their leadership teams. Include a specific outcome or transformation. Suggest a brief strategy call.",
    step_goal: 'social_proof',
    ai_tone: 'conversational',
    max_attempts: 1,
  },
  {
    channel: 'voice',
    delay_days: 8,
    subject: 'Strategy call with {{name}}',
    voice_agent_type: 'interest',
    body_template: '',
    ai_instructions:
      "Call {{name}} at {{company}}. Introduce yourself as calling from Colaberry about AI leadership development for {{industry}} executives. Ask if they've been exploring AI training for their team.",
    fallback_channel: 'email',
    step_goal: 'discovery_call',
    ai_tone: 'warm',
    max_attempts: 2,
  },
  {
    channel: 'email',
    delay_days: 12,
    subject: 'Case study: AI transformation in {{industry}}',
    body_template: '',
    ai_instructions:
      "Send a compelling case study relevant to {{industry}}. Mention limited seats in the upcoming cohort. Include a clear CTA to book a strategy call.",
    step_goal: 'case_study_urgency',
    ai_tone: 'persuasive',
    max_attempts: 1,
  },
  {
    channel: 'email',
    delay_days: 16,
    subject: 'Last note from Colaberry',
    body_template: '',
    ai_instructions:
      "Final touchpoint. Acknowledge they're busy. Leave the door open. Mention the resource will remain available. Professional and respectful close.",
    step_goal: 'breakup',
    ai_tone: 'respectful',
    max_attempts: 1,
  },
];

const AGGRESSIVE_COLD_STEPS: SequenceStep[] = [
  {
    channel: 'email',
    delay_days: 0,
    subject: 'AI readiness for {{company}}',
    body_template: '',
    ai_instructions:
      "Direct cold outreach introducing Colaberry's Enterprise AI Leadership Accelerator. Be bold — reference specific AI trends in {{industry}} and why {{name}}'s team needs to act now. Under 120 words.",
    step_goal: 'initial_outreach',
    ai_tone: 'direct',
    max_attempts: 1,
  },
  {
    channel: 'voice',
    delay_days: 2,
    subject: 'Call {{name}} at {{company}}',
    voice_agent_type: 'interest',
    body_template: '',
    ai_instructions:
      "Call {{name}}. Reference the email sent 2 days ago. Ask directly if they're exploring AI training. Offer to share case study results.",
    fallback_channel: 'email',
    step_goal: 'follow_up_call',
    ai_tone: 'confident',
    max_attempts: 2,
  },
  {
    channel: 'email',
    delay_days: 5,
    subject: '{{company}} + AI leadership — last chance',
    body_template: '',
    ai_instructions:
      "Combine social proof with urgency. Share a specific ROI outcome from a similar company. Mention the upcoming cohort start date. CTA: book a 15-minute strategy call.",
    step_goal: 'urgency',
    ai_tone: 'persuasive',
    max_attempts: 1,
  },
  {
    channel: 'email',
    delay_days: 9,
    subject: 'Moving on',
    body_template: '',
    ai_instructions:
      "Final breakup email. Short, respectful, leaves door open. Mention they can reach out anytime.",
    step_goal: 'breakup',
    ai_tone: 'respectful',
    max_attempts: 1,
  },
];

const GENTLE_COLD_STEPS: SequenceStep[] = [
  {
    channel: 'email',
    delay_days: 0,
    subject: 'Quick thought on AI for {{company}}',
    body_template: '',
    ai_instructions:
      "Gentle introduction to Colaberry's Enterprise AI Leadership Accelerator. Focus on sharing value, not selling. Ask about their current AI adoption journey. Under 100 words.",
    step_goal: 'soft_intro',
    ai_tone: 'warm',
    max_attempts: 1,
  },
  {
    channel: 'email',
    delay_days: 3,
    subject: 'AI insight for {{industry}} leaders',
    body_template: '',
    ai_instructions:
      "Share a relevant industry insight or trend about AI adoption in {{industry}}. No CTA — purely value-add.",
    step_goal: 'value_share',
    ai_tone: 'educational',
    max_attempts: 1,
  },
  {
    channel: 'email',
    delay_days: 7,
    subject: 'How peers in {{industry}} are approaching AI',
    body_template: '',
    ai_instructions:
      "Share what similar companies in {{industry}} are doing about AI training. Keep it peer-comparison focused. Soft mention of Colaberry as one option.",
    step_goal: 'peer_comparison',
    ai_tone: 'consultative',
    max_attempts: 1,
  },
  {
    channel: 'email',
    delay_days: 11,
    subject: 'Resource: AI leadership readiness checklist',
    body_template: '',
    ai_instructions:
      "Offer a free resource (AI readiness checklist). Ask if they'd find it useful for their team. Soft CTA: reply to get it.",
    step_goal: 'resource_offer',
    ai_tone: 'helpful',
    max_attempts: 1,
  },
  {
    channel: 'email',
    delay_days: 15,
    subject: 'Quick question, {{name}}',
    body_template: '',
    ai_instructions:
      "Ask a genuine discovery question about their AI adoption plans. Offer to share relevant case study if interested. No pressure.",
    step_goal: 'discovery',
    ai_tone: 'curious',
    max_attempts: 1,
  },
  {
    channel: 'voice',
    delay_days: 19,
    subject: 'Brief call with {{name}}',
    voice_agent_type: 'interest',
    body_template: '',
    ai_instructions:
      "Warm call. Reference the email sequence. Ask if they received the resources and found them useful. Offer a no-pressure strategy conversation.",
    fallback_channel: 'email',
    step_goal: 'warm_call',
    ai_tone: 'friendly',
    max_attempts: 2,
  },
  {
    channel: 'email',
    delay_days: 23,
    subject: 'Upcoming AI leadership cohort',
    body_template: '',
    ai_instructions:
      "Mention the upcoming cohort with specific dates. Share one more transformation story. Gentle CTA to explore if it's a fit.",
    step_goal: 'cohort_mention',
    ai_tone: 'inviting',
    max_attempts: 1,
  },
  {
    channel: 'email',
    delay_days: 28,
    subject: 'Thanks, {{name}}',
    body_template: '',
    ai_instructions:
      "Graceful close. Thank them for their time. Leave the door wide open. Mention they can reach out whenever the timing is right.",
    step_goal: 'graceful_close',
    ai_tone: 'grateful',
    max_attempts: 1,
  },
];

export type SequenceTemplate = 'standard_cold' | 'aggressive' | 'gentle';

const SEQUENCE_TEMPLATES: Record<SequenceTemplate, { name: string; steps: SequenceStep[] }> = {
  standard_cold: { name: 'Standard Cold Outbound (6 steps)', steps: STANDARD_COLD_STEPS },
  aggressive: { name: 'Aggressive Cold Outbound (4 steps)', steps: AGGRESSIVE_COLD_STEPS },
  gentle: { name: 'Gentle Cold Outbound (8 steps)', steps: GENTLE_COLD_STEPS },
};

export function getSequenceTemplates() {
  return Object.entries(SEQUENCE_TEMPLATES).map(([key, val]) => ({
    id: key,
    name: val.name,
    stepCount: val.steps.length,
    steps: val.steps,
  }));
}

export function getSequenceTemplate(templateId: SequenceTemplate) {
  return SEQUENCE_TEMPLATES[templateId] || SEQUENCE_TEMPLATES.standard_cold;
}

// ── Campaign Builder Pipeline ───────────────────────────────────────────

interface ICPProfileInput {
  name: string;
  description?: string;
  role: 'primary' | 'secondary';
  person_titles?: string[];
  person_seniorities?: string[];
  industries?: string[];
  company_size_min?: number;
  company_size_max?: number;
  person_locations?: string[];
  keywords?: string[];
  apollo_filters?: Record<string, any>;
  pain_indicators?: string[];
  buying_signals?: string[];
}

interface BuildColdCampaignParams {
  name: string;
  description?: string;
  icpProfiles: ICPProfileInput[];
  apolloImport: boolean;
  maxLeads?: number;
  sequenceTemplate?: SequenceTemplate;
  sequenceSteps?: SequenceStep[]; // Custom steps override template
  aiSystemPrompt?: string;
  channelConfig?: Record<string, any>;
  created_by: string;
}

interface BuildColdCampaignResult {
  campaign: any;
  profiles: any[];
  leadsImported: number;
  leadsDuplicated: number;
  sequence: any;
}

export async function buildColdCampaign(
  params: BuildColdCampaignParams,
): Promise<BuildColdCampaignResult> {
  // 1. Create the sequence from template or custom steps
  const templateId = params.sequenceTemplate || 'standard_cold';
  const template = getSequenceTemplate(templateId);
  const steps = params.sequenceSteps || template.steps;

  const sequence = await createSequence({
    name: `${params.name} — Sequence`,
    description: `Auto-generated cold outbound sequence for campaign: ${params.name}`,
    steps,
  });

  // 2. Build targeting criteria from ICP profiles
  const allIndustries: string[] = [];
  const allTitles: string[] = [];
  let sizeMin: number | undefined;
  let sizeMax: number | undefined;

  for (const p of params.icpProfiles) {
    if (p.industries?.length) allIndustries.push(...p.industries);
    if (p.person_titles?.length) allTitles.push(...p.person_titles);
    if (p.company_size_min != null) {
      sizeMin = sizeMin == null ? p.company_size_min : Math.min(sizeMin, p.company_size_min);
    }
    if (p.company_size_max != null) {
      sizeMax = sizeMax == null ? p.company_size_max : Math.max(sizeMax, p.company_size_max);
    }
  }

  const targeting_criteria: Record<string, any> = {
    industries: [...new Set(allIndustries)],
    title_patterns: [...new Set(allTitles)],
    lead_source_types: ['cold'],
  };
  if (sizeMin != null) targeting_criteria.company_size_min = sizeMin;
  if (sizeMax != null) targeting_criteria.company_size_max = sizeMax;

  // 3. Create the campaign
  const campaign = await createCampaign({
    name: params.name,
    description: params.description,
    type: 'cold_outbound',
    sequence_id: sequence.id,
    targeting_criteria,
    channel_config: params.channelConfig || {
      email: { enabled: true, daily_limit: 50 },
      voice: { enabled: true },
      sms: { enabled: false },
    },
    ai_system_prompt: params.aiSystemPrompt || buildDefaultColdPrompt(params.name),
    created_by: params.created_by,
  });

  // 4. Create ICP profiles linked to campaign
  const profiles: any[] = [];
  for (const p of params.icpProfiles) {
    const profile = await createICPProfile({
      ...p,
      campaign_id: campaign.id,
      created_by: params.created_by,
    });
    profiles.push(profile);
  }

  // 5. Search Apollo and import leads (if requested)
  let totalImported = 0;
  let totalDuplicates = 0;

  if (params.apolloImport) {
    const maxPerProfile = Math.ceil((params.maxLeads || 100) / params.icpProfiles.length);

    for (const profile of profiles) {
      try {
        const people = await searchApolloFromProfileBulk(profile.id, maxPerProfile);
        const result = await importApolloResults(people, {
          campaign_id: campaign.id,
          scoring_criteria: {
            target_industries: profile.industries || [],
            company_size_min: profile.company_size_min,
            company_size_max: profile.company_size_max,
          },
        });
        totalImported += result.imported;
        totalDuplicates += result.duplicates;

        // Enroll imported leads in campaign
        if (result.leads.length > 0) {
          const leadIds = result.leads.map((l: any) => l.id);
          await enrollLeadsInCampaign(campaign.id, leadIds).catch((err) =>
            console.error(`[CampaignBuilder] Enrollment error: ${err.message}`),
          );
        }
      } catch (err: any) {
        console.error(`[CampaignBuilder] Apollo search/import for profile ${profile.id}: ${err.message}`);
      }
    }
  }

  return {
    campaign,
    profiles,
    leadsImported: totalImported,
    leadsDuplicated: totalDuplicates,
    sequence,
  };
}

function buildDefaultColdPrompt(campaignName: string): string {
  return `You are a professional outreach assistant for Colaberry's Enterprise AI Leadership Accelerator program.

Campaign: ${campaignName}

Context: Colaberry offers an executive-level AI leadership training program designed for enterprise leaders who need to understand and lead AI transformation initiatives. The program covers AI strategy, implementation leadership, team upskilling, and ROI measurement.

Tone: Professional, consultative, peer-to-peer. You are reaching out as an advisor, not a salesperson. Focus on value, relevance, and genuine curiosity about their AI journey.

Key value propositions:
- Executive-level AI training designed for leaders, not engineers
- Practical frameworks for leading AI transformation
- Peer learning with other enterprise executives
- Measurable ROI through applied AI projects

Rules:
- Never be pushy or aggressive
- Always personalize using the lead's name, company, industry, and role
- Reference specific industry AI trends when possible
- Keep emails concise (under 150 words for cold outreach)
- Use professional but approachable language
- Include clear but soft CTAs`;
}

// ── NLP Campaign Builder ────────────────────────────────────────────────

export interface NLPCampaignConfig {
  name: string;
  description: string;
  campaign_type: 'cold_outbound' | 'warm_nurture' | 'event_follow_up' | 'reengagement';
  sequence_template: SequenceTemplate;
  target_audience: {
    industries: string[];
    titles: string[];
    seniorities: string[];
    company_size_min?: number;
    company_size_max?: number;
    locations: string[];
  };
  channels: {
    email: boolean;
    voice: boolean;
    sms: boolean;
  };
  tone: string;
  num_steps: number;
  estimated_duration_days: number;
  ai_system_prompt: string;
}

/**
 * Parse a natural language campaign description into a structured campaign config.
 * Example: "Create a 3-step email nurture for enterprise CTOs in healthcare"
 * → Returns structured NLPCampaignConfig ready for buildColdCampaign()
 */
export async function parseNaturalLanguageCampaign(
  description: string,
): Promise<NLPCampaignConfig> {
  const apiKey = env.openaiApiKey;
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const client = new OpenAI({ apiKey });
  const model = (await getSetting('ai_model')) || env.aiModel;

  const systemPrompt = `You are an expert campaign strategist for Colaberry Enterprise AI Division.

Given a natural language description of a desired campaign, extract a structured campaign configuration.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "name": "Short campaign name (max 60 chars)",
  "description": "1-2 sentence campaign description",
  "campaign_type": "cold_outbound" | "warm_nurture" | "event_follow_up" | "reengagement",
  "sequence_template": "standard_cold" | "aggressive" | "gentle",
  "target_audience": {
    "industries": ["array of target industries"],
    "titles": ["array of target job titles"],
    "seniorities": ["from: c_suite, vp, director, manager, senior"],
    "company_size_min": number or null,
    "company_size_max": number or null,
    "locations": ["array of locations, default ['United States']"]
  },
  "channels": {
    "email": true/false,
    "voice": true/false,
    "sms": true/false
  },
  "tone": "professional/consultative/aggressive/warm/educational",
  "num_steps": number (3-8),
  "estimated_duration_days": number,
  "ai_system_prompt": "Campaign-specific system prompt for AI message generation"
}

RULES:
- Infer as much as possible from the description
- Default to cold_outbound if campaign type is unclear
- Default to standard_cold template
- Always include at least email channel
- If voice is mentioned, enable it
- If the user mentions urgency or aggression, use the aggressive template
- If the user mentions gentle/educational/nurture, use the gentle template
- Generate a relevant ai_system_prompt that captures the campaign's intent`;

  const response = await client.chat.completions.create({
    model,
    max_tokens: 1000,
    temperature: 0.5,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Parse this campaign description:\n\n"${description}"` },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim() || '';

  try {
    const cleaned = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned) as NLPCampaignConfig;
  } catch {
    // Return sensible defaults
    return {
      name: description.substring(0, 60),
      description,
      campaign_type: 'cold_outbound',
      sequence_template: 'standard_cold',
      target_audience: {
        industries: ['Technology', 'Financial Services'],
        titles: ['CTO', 'VP of Engineering', 'Director of AI'],
        seniorities: ['c_suite', 'vp', 'director'],
        locations: ['United States'],
      },
      channels: { email: true, voice: false, sms: false },
      tone: 'professional',
      num_steps: 6,
      estimated_duration_days: 16,
      ai_system_prompt: buildDefaultColdPrompt(description.substring(0, 60)),
    };
  }
}
