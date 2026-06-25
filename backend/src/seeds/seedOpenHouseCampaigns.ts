import { Campaign, FollowUpSequence } from '../models';
import { createCampaign } from '../services/campaignService';
import { createSequence } from '../services/sequenceService';
import type { SequenceStep } from '../models/FollowUpSequence';
import { env } from '../config/env';

/**
 * AI Systems Architect Accelerator — Open House campaign (Founding Cohort launch).
 *
 * Converts the Sohail/Ali-approved 5-email plan (BC todo 9946499631) into this repo's native,
 * prompt-based campaign engine. Three audience segments (alumni, dropouts, prospects) share ONE
 * 5-step email sequence; each segment is its own Campaign with a segment-specific
 * `ai_system_prompt`, so every email is generated per-lead at send time (no hardcoded body).
 *
 * Status on seed: DRAFT. This function only creates the sequence + draft campaigns. It does NOT
 * enroll leads or activate anything, so zero ScheduledEmail rows are created and nothing can send
 * until a human approves + activates each campaign (the build-out-after-approval gate).
 *
 * Landing/registration page is owned by BC 9946499609 ("Draft landing pages...") on
 * training.colaberry.com. Email CTAs link to `env.openHouseLandingUrl` (+ UTM); registrations
 * return as leads via form_type `open_house_*` -> POST /api/leads.
 *
 * TIMING CAVEAT: `delay_days` is a forward cadence from enrollment (enroll a segment ~14 days
 * before the Open House so step 5 lands the day before). Confirmed dates (2026-06-19): Open House
 * Thu 2026-07-16, orientation Thu 2026-07-23, classes start Mon 2026-07-27, so the Open House
 * correctly precedes the cohort it feeds. To peg sends to a fixed event date instead of a forward cadence,
 * convert to the `days_before_cohort_start` countdown mode used by Strategy Call Readiness.
 */

const REGISTER_LINK =
  `${env.openHouseLandingUrl}?utm_source=accelerator&utm_medium=email&utm_campaign=open_house_2026`;

const SEQUENCE_NAME = 'AI Systems Architect — Open House Launch';

// Shared brand voice. Per-segment framing is appended in SEGMENTS below.
const BASE_SYSTEM_PROMPT = `You are Cory, writing on behalf of Ali Muwwakkil at Colaberry, inviting people to the FREE AI Systems Architect Accelerator Open House.

Positioning: Learn With Claude. Build Through Colaberry. Deploy In The Real World.
The program is a 12-week, implementation-focused program that takes working professionals from AI consumer to AI builder. Campaign goal: drive free Open House registrations, then convert attendees into the Founding Cohort (40 seats).

Hard rules (do not break):
- Do NOT state any price. Pricing and enrollment details are revealed at the Open House.
- No em-dashes anywhere. Use commas, periods, or colons.
- Keep each email under 200 words. Warm, confident, concrete. No hype, no marketing cliches.
- Always include the Open House registration link: ${REGISTER_LINK}
- Generate fresh, personalized content each send using the lead's name and context. Never reuse hardcoded copy.`;

interface SegmentDef {
  key: 'alumni' | 'dropouts' | 'prospects';
  campaignName: string;
  type: 'warm_nurture' | 're_engagement';
  utm_source: string;
  framing: string;
}

const SEGMENTS: SegmentDef[] = [
  {
    key: 'alumni',
    campaignName: 'Open House — Alumni',
    type: 're_engagement',
    utm_source: 'open_house_alumni',
    framing: `AUDIENCE: a past Colaberry learner who already trusts the brand. Frame: you have already invested in your future, now learn to build with AI. Reference their prior Colaberry journey. Do NOT assume they took this new Accelerator program before.`,
  },
  {
    key: 'dropouts',
    campaignName: 'Open House — Dropouts',
    type: 're_engagement',
    utm_source: 'open_house_dropouts',
    framing: `AUDIENCE: someone who started a previous Colaberry program but did not finish. Frame: your journey does not have to end here, this is a clean fresh start built for today's AI economy. No guilt, no pressure.`,
  },
  {
    key: 'prospects',
    campaignName: 'Open House — Prospects',
    type: 'warm_nurture',
    utm_source: 'open_house_prospects',
    framing: `AUDIENCE: a new lead interested in AI and career growth who has never enrolled. Frame: most people consume AI, very few learn to build with it. Establish credibility and curiosity.`,
  },
];

// One shared 5-email sequence (D-14 -> D-1). Content is prompt-generated per lead at send time;
// body_template is intentionally empty (ai_instructions is the source of truth).
const OPEN_HOUSE_STEPS: SequenceStep[] = [
  {
    delay_days: 0,
    channel: 'email',
    subject: 'Most people use AI. Very few build with it.',
    body_template: '',
    step_goal: 'Awareness: introduce the shift, drive a free Open House registration',
    ai_tone: 'confident, curious',
    ai_instructions: `THEME: The shift is already happening. Open with the segment framing above.
Make the point that AI is changing every industry and the advantage is moving to people who can BUILD with it, not just prompt it. Introduce the free Open House as the place to see how that shift happens and who it is for. No price.
CTA: Reserve your free seat. Link: ${REGISTER_LINK}
Alternate subject ideas: "The biggest career opportunity in AI isn't what you think." / "AI isn't replacing people. It's replacing people who can't build with it."`,
  },
  {
    delay_days: 4,
    channel: 'email',
    subject: 'The difference between AI users and AI builders',
    body_template: '',
    step_goal: 'Introduce the Open House: user vs builder',
    ai_tone: 'concrete, credible',
    ai_instructions: `THEME: From AI user to AI builder. Contrast people who use AI tools with builders who create AI systems that run on their own.
Explain that at the Open House they will see how professionals use Claude, AI agents, and modern workflows to ship real solutions. Invite them to bring a problem they want to solve. No price.
CTA: Register for the Open House. Link: ${REGISTER_LINK}
Alternate subjects: "What if you could turn your idea into a real AI system?" / "Why prompts are no longer enough"`,
  },
  {
    delay_days: 8,
    channel: 'email',
    subject: 'Bring your idea. Leave with a working AI system.',
    body_template: '',
    step_goal: 'Show the 12-week path',
    ai_tone: 'clear, structured',
    ai_instructions: `THEME: See what you'll build. Walk the 12-week path as four 3-week blocks, each ending in something built:
Weeks 1 to 3 Build your AI foundation. Weeks 4 to 6 Create your AI team (multiple agents working together). Weeks 7 to 9 Connect AI to the real world (live data, tools, APIs). Weeks 10 to 12 Design AI that scales (reliable enough to deploy).
Say the full structure is walked through live at the Open House. No price.
CTA: Reserve your seat. Link: ${REGISTER_LINK}
Alternate subjects: "What happens during the 12 weeks?" / "Inside the AI Systems Architect Accelerator"`,
  },
  {
    delay_days: 11,
    channel: 'email',
    subject: 'Only 40 seats in the Founding Cohort',
    body_template: '',
    step_goal: 'Scarcity + urgency for the Founding Cohort',
    ai_tone: 'warm, slight urgency',
    ai_instructions: `THEME: Meet the Founding Cohort. The first cohort is intentionally limited to 40 seats, which keeps the cohort focused and build support real.
Founding Cohort members get the first-cohort experience and Founding Cohort pricing, both shared FIRST with Open House attendees. Do NOT state a price. Registration closes soon.
CTA: Register before seats fill. Link: ${REGISTER_LINK}
Alternate subjects: "Founding Cohort enrollment opens soon" / "This is your invitation to build"`,
  },
  {
    delay_days: 13,
    channel: 'email',
    subject: 'Your Open House starts tomorrow',
    body_template: '',
    step_goal: 'Final reminder, maximize attendance',
    ai_tone: 'friendly, brief',
    ai_instructions: `THEME: Final reminder. The Open House is tomorrow. Recap what they get in one session: a live look at how AI builders work, the full 12-week path, Founding Cohort pricing and enrollment details, and time for questions.
Ask them to add it to their calendar so they don't miss it. No price in the body.
CTA: Add to calendar. Link: ${REGISTER_LINK}
Alternate subjects: "We're live tomorrow" / "Last chance to join us"`,
  },
];

export interface OpenHouseSeedResult {
  sequence_id: string;
  campaign_ids: string[];
  created: number;
}

/**
 * Idempotent. Creates the shared sequence + 3 DRAFT segment campaigns if they do not exist.
 * Never enrolls or activates; go-live is a separate, human-approved step.
 */
export async function seedOpenHouseCampaigns(createdBy: string): Promise<OpenHouseSeedResult> {
  // 1. Shared sequence (find-or-create to stay idempotent)
  let sequence = await FollowUpSequence.findOne({ where: { name: SEQUENCE_NAME } });
  if (!sequence) {
    sequence = await createSequence({
      name: SEQUENCE_NAME,
      description: '5-email Open House launch funnel (D-14 to D-1). Prompt-based: content generated per lead at send time. Drives free Open House registration, converts to Founding Cohort.',
      steps: OPEN_HOUSE_STEPS,
    });
  }

  // 2. One DRAFT campaign per segment, all sharing the sequence
  const campaign_ids: string[] = [];
  let created = 0;
  for (const seg of SEGMENTS) {
    const existing = await Campaign.findOne({ where: { name: seg.campaignName } });
    if (existing) {
      await (existing as any).update({ sequence_id: sequence.id });
      campaign_ids.push(existing.id);
      continue;
    }
    const campaign = await createCampaign({
      name: seg.campaignName,
      description: `Open House / Founding Cohort launch, ${seg.key} segment. Draft pending approval (BC 9946499631). Landing page owned by BC 9946499609.`,
      type: seg.type,
      sequence_id: sequence.id,
      ai_system_prompt: `${BASE_SYSTEM_PROMPT}\n\n${seg.framing}`,
      channel_config: { email: { enabled: true, daily_limit: 100 }, sms: { enabled: false }, voice: { enabled: false } },
      targeting_criteria: {
        segment: seg.key,
        utm_source: seg.utm_source,
        utm_medium: 'email',
        utm_campaign: 'open_house_2026',
      },
      created_by: createdBy,
    });
    campaign_ids.push(campaign.id);
    created++;
  }

  return { sequence_id: sequence.id, campaign_ids, created };
}
