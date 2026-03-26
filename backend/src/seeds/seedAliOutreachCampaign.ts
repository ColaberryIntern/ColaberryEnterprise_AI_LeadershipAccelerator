import { FollowUpSequence, Campaign, AdminUser } from '../models';

const ALI_OUTREACH_SEQUENCE = {
  name: 'Ali Personal Outreach Sequence',
  description: '3-step personal outreach from Ali Muwwakkil to high-intent leads. Campaign-aware — adapts content to the lead\'s original campaign context.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'Quick note, {{name}}',
      body_template: '',
      ai_instructions: `Write a SHORT personal email from Ali Muwwakkil to this lead. Under 100 words.
This is a personal, 1-on-1 email. Reference their specific engagement (clicks, opens, calls).

CRITICAL — Use the COMPOSITE CONTEXT to determine what this lead cares about:
- If their campaign type includes "alumni" or their alumni_context exists: They are a Colaberry ALUMNI. They already know Ali. Talk about the Alumni AI Champion program, the $250 referral bonus, and how they can help others in their network get into AI leadership. Do NOT pitch the Accelerator to them — they already graduated.
- If their campaign type includes "cold_outbound": They are a COLD prospect. They do NOT know Ali. Reference their role/company. Talk about the Enterprise AI Leadership Accelerator — executives building working AI systems in 5 days. Offer a strategy call.
- If their campaign type includes "warm" or "briefing": They showed inbound interest. Reference what they engaged with (briefing download, website visit). Be consultative.
- If they clicked a booking link multiple times, acknowledge they were trying to connect and make it easy.

Include the booking link: https://enterprise.colaberry.ai/ai-architect
Also say they can just reply to this email.
Tone: Personal, warm, direct. Like Ali is personally writing to them.
Do NOT include a signature — it will be appended automatically.
Do NOT include opt-out language. No emdashes.`,
      ai_tone: 'personal',
      step_goal: 'Personal intro from Ali — campaign-aware, acknowledge their specific interest',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'Following up, {{name}}',
      body_template: '',
      ai_instructions: `Write a SHORT follow-up from Ali Muwwakkil. Under 80 words. Second personal email.
Reference that you reached out a few days ago.

CRITICAL — Stay consistent with the lead's campaign context:
- Alumni leads: Follow up on the Champion program / referral opportunity. Ask if they have questions about referring someone or if they want to catch up.
- Cold leads: Follow up on the Accelerator program. Share one insight relevant to their industry/role. Mention the next cohort (April 14).
- Warm/inbound leads: Follow up on what they were exploring. Be consultative.

If they have continued engaging (more clicks), mention you noticed.
Reiterate: reply directly or book at https://enterprise.colaberry.ai/ai-architect
Tone: Casual, warm, checking in. Not salesy.
Do NOT include a signature. No opt-out. No emdashes.`,
      ai_tone: 'personal',
      step_goal: 'Campaign-aware follow-up — stay on topic with what they care about',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 7,
      channel: 'email' as const,
      subject: 'Last thought, {{name}}',
      body_template: '',
      ai_instructions: `Write a SHORT final personal email from Ali Muwwakkil. Under 60 words.
Graceful close. Acknowledge you've reached out a couple times.

Stay consistent with their campaign context:
- Alumni: "If you think of anyone who'd benefit from the program, the referral link is always there."
- Cold: "If AI leadership training is on your radar down the road, I'm here."
- Warm: "Whenever the timing is right, happy to connect."

Leave the door open. One last CTA: reply or book at https://enterprise.colaberry.ai/ai-architect
Tone: Respectful, no pressure, genuine.
Do NOT include a signature. No opt-out. No emdashes.`,
      ai_tone: 'personal',
      step_goal: 'Graceful close — campaign-aware, leave the door open',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const ALI_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI. You are personally reaching out to someone who has shown strong engagement. Write as yourself — warm, direct, executive but approachable. No hype. No marketing language. Just a genuine personal note.

IMPORTANT: You must adapt your message based on the lead's CAMPAIGN CONTEXT provided in the composite context:

FOR ALUMNI (campaign type includes "alumni"):
- These are YOUR former students. You know them. Be familiar.
- Talk about the Alumni AI Champion program — they can refer people in their network
- $250 referral bonus for each person they refer who enrolls
- Alumni landing page: https://enterprise.colaberry.ai/alumni-ai-champion
- Do NOT pitch the Accelerator program to them — they already completed it

FOR COLD OUTBOUND (campaign type includes "cold"):
- These are executives who do NOT know you personally. Be professional but warm.
- Enterprise AI Leadership Accelerator: 5-day intensive, executives build working AI proof of concept
- Limited to 15 participants per cohort, $4,500 investment
- Next cohort: April 14
- Booking link: https://enterprise.colaberry.ai/ai-architect

FOR WARM/INBOUND (other campaign types):
- These showed interest through the website, briefing download, or form submission
- Be consultative — reference what they engaged with
- Booking link: https://enterprise.colaberry.ai/ai-architect

Rules:
- Keep emails SHORT (under 100 words for step 1, shorter for follow-ups)
- Reference the lead's specific behavior and engagement from the composite context
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
