import { FollowUpSequence, Campaign, AdminUser } from '../models';

const ALI_OUTREACH_SEQUENCE = {
  name: 'Ali Personal Outreach Sequence',
  description: '3-step personal outreach from Ali Muwwakkil to high-intent leads. Short, personal emails — not campaign blasts.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'Quick note, {{name}}',
      body_template: '',
      ai_instructions: `Write a SHORT personal email from Ali Muwwakkil to this lead.
This is a personal, 1-on-1 email — not a campaign email. Keep it under 100 words.
Reference their specific engagement: clicks, booking attempts, Maya conversations, emails opened.
If they clicked a booking link, acknowledge it and make it easy.
Offer to jump on a quick call. Include the booking link: https://enterprise.colaberry.ai/ai-architect
Also say they can just reply to this email.
Tone: Personal, warm, direct. Like Ali is personally writing to them.
Do NOT include a signature — it will be appended automatically.
Do NOT include opt-out language.`,
      ai_tone: 'personal',
      step_goal: 'Personal intro from Ali — acknowledge their interest, open a direct conversation',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'Following up, {{name}}',
      body_template: '',
      ai_instructions: `Write a SHORT follow-up from Ali Muwwakkil. This is the second personal email.
Keep it under 80 words. Reference that you reached out a few days ago.
If they have continued engaging (more clicks, opens), mention that you noticed continued interest.
Share one specific thing about the program relevant to their role/industry.
Reiterate: they can reply directly or book at https://enterprise.colaberry.ai/ai-architect
Tone: Casual, warm, like a real person checking in. Not salesy.
Do NOT include a signature — it will be appended automatically.
Do NOT include opt-out language.`,
      ai_tone: 'personal',
      step_goal: 'Gentle follow-up — keep the conversation warm, provide one relevant insight',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 7,
      channel: 'email' as const,
      subject: 'Last thought, {{name}}',
      body_template: '',
      ai_instructions: `Write a SHORT final personal email from Ali Muwwakkil. Under 60 words.
This is a graceful close. Acknowledge you've reached out a couple times.
Leave the door open: "If the timing isn't right, no worries — I just wanted to make sure you knew the offer was there."
One last CTA: reply or book at https://enterprise.colaberry.ai/ai-architect
Tone: Respectful, no pressure, genuine.
Do NOT include a signature — it will be appended automatically.
Do NOT include opt-out language.`,
      ai_tone: 'personal',
      step_goal: 'Graceful close — leave the door open, no pressure',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const ALI_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI. You are personally reaching out to someone who has shown strong interest in your AI Leadership Accelerator program. Write as yourself — warm, direct, executive but approachable. No hype. No marketing language. Just a genuine personal note.

Key facts:
- Enterprise AI Leadership Accelerator: 5-day intensive where executives build a working AI proof of concept
- Limited to 15 participants per cohort
- You personally work with every participant
- Booking link: https://enterprise.colaberry.ai/ai-architect

Rules:
- Keep emails SHORT (under 100 words for step 1, shorter for follow-ups)
- Reference the lead's specific behavior and engagement
- Never sound like a campaign — this is a personal 1-on-1 email
- No signature (appended automatically)
- No opt-out language
- No emdashes`;

export async function seedAliOutreachCampaign(): Promise<string | null> {
  // Find or create sequence
  let sequence = await FollowUpSequence.findOne({
    where: { name: ALI_OUTREACH_SEQUENCE.name },
  });

  if (sequence) {
    await sequence.update({
      steps: ALI_OUTREACH_SEQUENCE.steps,
      description: ALI_OUTREACH_SEQUENCE.description,
      is_active: true,
    });
  } else {
    sequence = await FollowUpSequence.create(ALI_OUTREACH_SEQUENCE as any);
  }

  // Find or create campaign
  const campaignName = 'Ali Personal Outreach';
  let campaign = await Campaign.findOne({ where: { name: campaignName } });

  if (campaign) {
    await campaign.update({
      sequence_id: sequence.id,
      ai_system_prompt: ALI_SYSTEM_PROMPT,
    } as any);
    console.log(`[Seed] Ali Personal Outreach campaign exists — synced sequence steps.`);
    return campaign.id;
  }

  const admin = await AdminUser.findOne();
  campaign = await Campaign.create({
    name: campaignName,
    description: 'Personal emails from Ali Muwwakkil to high-intent leads. Runs independently — does NOT remove leads from other campaigns. Max 10 enrollments per day.',
    type: 'executive_outreach',
    status: 'active',
    sequence_id: sequence.id,
    ai_system_prompt: ALI_SYSTEM_PROMPT,
    channel_config: {
      email: { enabled: true, daily_limit: 10 },
      voice: { enabled: false },
      sms: { enabled: false },
    },
    settings: {
      sender_email: 'ali@colaberry.com',
      sender_name: 'Ali Muwwakkil',
      agent_name: 'Ali Muwwakkil',
      test_mode_enabled: false,
      delay_between_sends: 120,
      max_leads_per_cycle: 10,
      send_time_start: '09:00',
      send_time_end: '17:00',
      send_active_days: [1, 2, 3, 4, 5],
      ali_signature: true, // Flag to append Ali's signature in email processing
    },
    targeting_criteria: {
      intent_signals: ['3+ clicks', 'booking attempt', 'maya conversation >30s', 'hot/qualified temperature'],
      auto_enroll: true,
    },
    goals: 'Convert high-intent leads to booked strategy calls through personal touch from Ali. These leads have shown strong engagement but haven\'t booked yet.',
    created_by: admin?.id || null,
  } as any);

  console.log(`[Seed] Created Ali Personal Outreach campaign. ID: ${campaign.id}`);
  console.log('[Seed] Sequence steps:');
  ALI_OUTREACH_SEQUENCE.steps.forEach((s, i) => {
    console.log(`  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.step_goal}`);
  });

  return campaign.id;
}
