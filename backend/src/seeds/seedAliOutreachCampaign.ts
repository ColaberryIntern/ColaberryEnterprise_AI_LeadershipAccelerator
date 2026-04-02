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
      ai_instructions: `Write a SHORT personal email from Ali Muwwakkil. Under 100 words. No sign-off needed (signature appended automatically).

IMPORTANT CONTEXT RULES:
- Check the lead's original campaign from compositeContext.campaign.type AND metadata.original_campaign_type
- If alumni: reference the Alumni AI Champion Program, $250 referral opportunity, and their Colaberry bootcamp background. Do NOT imply they took the Accelerator before.
- If cold_outbound: DO NOT say "good to hear from you" or imply prior relationship. Say you noticed their engagement with our content. Focus on exploring AI initiatives at their company, not pushing enrollment.
- NEVER assume they want to enroll unless compositeContext.engagement shows booking attempts or they explicitly expressed interest
- If no clear enrollment signal, frame the conversation as: "I'd love to explore what AI initiatives your team is working on" or "happy to walk you through how the program works if you're curious"

CRITICAL — Read the COMPOSITE CONTEXT to determine who this lead is and what they care about:

IF ALUMNI (campaign type includes "alumni" OR alumni_context exists):
- This lead is a Colaberry Data Analytics/BI bootcamp graduate. They have NOT taken the AI Leadership Accelerator before — it is a completely new program.
- Reference their data analytics background and career growth through Colaberry's bootcamp. Example: "As a Colaberry bootcamp graduate, you understand the power of structured learning."
- Do NOT say "since you went through the Accelerator" or "great to reconnect" or imply they have taken the AI Leadership Accelerator before.
- The Alumni AI Champion Program lets them: (1) Enroll in the Accelerator at exclusive alumni pricing, OR (2) Earn $250 for each executive/leader they refer.
- Link: https://enterprise.colaberry.ai/alumni-ai-champion
- Tone: Warm, respectful of their Colaberry history. Professional but personal.

IF COLD (campaign type includes "cold_outbound"):
- They do NOT know you. Be professional but warm. Reference their role and company.
- Do NOT pitch the Accelerator as if they want to sign up. Instead, explore what AI initiatives their team has.
- Only mention the program details if compositeContext.engagement.bookingAttempts > 0 AND there are page events showing booking_modal_opened or booking_date_selected. Clicking a link to the booking page is NOT the same as trying to book. If you only see link clicks without modal/date events, say "I noticed you have been looking at our content" NOT "I noticed you tried to book."
- Frame it as: "I'd love to learn about what AI work your team is doing" or "happy to share how the program works if it's relevant."
- Next cohort April 14, limited to 15 participants — mention ONLY if they showed enrollment interest (bookingAttempts > 0).
- Link: https://enterprise.colaberry.ai/ai-architect

IF WARM/INBOUND (other types):
- They showed interest organically. Be consultative, reference their engagement.
- Link: https://enterprise.colaberry.ai/ai-architect

IF they clicked specific URLs (shown in RECENT CLICKS context), reference what they were looking at. But do NOT say "I noticed you tried to book" just because they clicked a link — only reference booking attempts if bookingAttempts > 0.
Say they can reply directly to this email.
CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. No "Best," no "Looking forward," no "The Colaberry team," no "Warm regards." Just end the message naturally. The signature block is appended automatically.
- Do NOT say "good to hear from you" to cold leads who have never spoken to you.
- For cold leads, say things like "I noticed you've been exploring" or "I saw you were looking at" — reference their CLICKS, not a conversation that never happened.
- Write in plain text style. No HTML formatting, no bold, no fancy links. Just a normal email like you'd write in Gmail.
- No opt-out language. No emdashes.`,
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
      ai_instructions: `Write a SHORT follow-up from Ali Muwwakkil. Under 80 words. No sign-off (signature appended automatically).

IMPORTANT CONTEXT RULES:
- Check the lead's original campaign from compositeContext.campaign.type AND metadata.original_campaign_type
- If alumni: reference the Alumni AI Champion Program, $250 referral opportunity, and their Colaberry bootcamp background. Do NOT imply they took the Accelerator before.
- If cold_outbound: DO NOT say "good to hear from you" or imply prior relationship. Say you noticed their engagement with our content. Focus on exploring AI initiatives at their company, not pushing enrollment.
- NEVER assume they want to enroll unless compositeContext.engagement shows booking attempts or they explicitly expressed interest
- If no clear enrollment signal, frame the conversation as: "I'd love to explore what AI initiatives your team is working on" or "happy to walk you through how the program works if you're curious"

Stay consistent with who they are:
- Alumni: "Just checking in" tone. Ask if they thought about the Accelerator program or referring anyone in their network. They are bootcamp graduates — do NOT imply they took the Accelerator before.
- Cold: Do NOT follow up by pushing the Accelerator. Share one insight relevant to their industry/role about AI adoption. Only mention the cohort if compositeContext.engagement.bookingAttempts > 0 (actual booking modal interactions, not just link clicks).
- Warm: Reference what they were looking at (from RECENT CLICKS if available).
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

IMPORTANT CONTEXT RULES:
- Check the lead's original campaign from compositeContext.campaign.type AND metadata.original_campaign_type
- If alumni: reference the Alumni AI Champion Program, $250 referral opportunity, and their Colaberry bootcamp background. Do NOT imply they took the Accelerator before.
- If cold_outbound: DO NOT say "good to hear from you" or imply prior relationship. Focus on being a resource for their AI initiatives, not pushing enrollment.
- NEVER assume they want to enroll unless compositeContext.engagement shows booking attempts or they explicitly expressed interest
- If no clear enrollment signal, frame the conversation as: "If exploring AI initiatives comes up, I'm always happy to chat"

Stay consistent with their campaign context:
- Alumni: "If you think of anyone who'd benefit from the Accelerator, the referral link is always there — and the alumni pricing is still available for you too."
- Cold: "If you ever want to talk through AI strategy for your team, I'm here." Do NOT frame it as "AI leadership training is on your radar" — frame it as a resource for their AI work.
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
- These are Colaberry Data Analytics/BI bootcamp graduates. They have NOT taken the AI Leadership Accelerator — it is a completely new program.
- Reference their data analytics background and career growth through Colaberry's bootcamp.
- Do NOT say "since you went through the Accelerator" or "great to reconnect" or imply they took this program before.
- The Alumni AI Champion Program lets them: (1) Enroll in the Accelerator at exclusive alumni pricing, OR (2) Earn $250 for each executive/leader they refer.
- Alumni Champion page: https://enterprise.colaberry.ai/alumni-ai-champion
- Tone: Warm, respectful of their Colaberry history. Professional but personal.
- Frame it as: "As a Colaberry graduate, you understand the power of structured learning. The AI Leadership Accelerator is our new executive program..."

FOR COLD OUTBOUND (campaign type includes "cold"):
- These are executives who do NOT know you personally. Be professional but warm.
- Do NOT pitch the Accelerator upfront. Instead, explore what AI initiatives their team is working on.
- Frame the conversation as curiosity about THEIR work, not selling a program.
- Only mention program specifics (5-day intensive, $4,500, April 14 cohort) if compositeContext.engagement.bookingAttempts > 0 (actual booking modal interactions, not just link clicks to /ai-architect).
- If no enrollment signals, say things like "I'd love to learn about what AI work your team is doing" or "happy to walk you through how the program works if it's relevant."
- Booking link (only if relevant): https://enterprise.colaberry.ai/ai-architect

For cold leads who have not booked: you can mention the AI Workforce Designer as a gentle discovery step. Example: "If you want to take 5 minutes to see what AI could look like at [Company], I built a quick tool for exactly that: https://advisor.colaberry.ai/advisory/"

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
