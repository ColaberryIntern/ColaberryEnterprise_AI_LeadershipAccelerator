import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { FollowUpSequence, Campaign } from '../models';

export const STRATEGY_READINESS_SEQUENCE_NAME = 'Strategy Call Readiness';
const STRATEGY_READINESS_CAMPAIGN_NAME = 'Strategy Call Readiness Campaign';

const READINESS_SEQUENCE = {
  name: STRATEGY_READINESS_SEQUENCE_NAME,
  description:
    'Auto-enrolled on booking. 5-step readiness campaign to ensure executives are prepared for their strategy call. Replaces the old 3-step Prep Nudge. Cancelled when prep form is submitted.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'Quick 5-min prep for your strategy call',
      body_template: '',
      ai_instructions: `Write a warm, concise email encouraging the executive to complete a 5-minute strategy call preparation form before their upcoming call. Emphasize that filling it out will make their strategy call 2x more productive and save 15 minutes during the actual call. The prep form link will be provided in context notes — include it as a prominent CTA button. Also briefly preview what the call will cover: AI readiness assessment, high-impact use cases, and a 90-day action plan. Keep the tone professional but friendly. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'professional, encouraging',
      ai_context_notes: '',
      step_goal: 'Get executive to start the prep form immediately after booking',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 1,
      channel: 'email' as const,
      subject: 'What to expect in your strategy call',
      body_template: '',
      ai_instructions: `Write an email previewing the strategy call agenda. Cover what will happen during the 30-minute session: (1) We will review their AI readiness based on their prep form responses, (2) We will identify 2-3 high-impact AI use cases specific to their organization, (3) We will map out a 90-day action plan, (4) We will discuss whether the 5-day Accelerator program is the right next step. Encourage them to come prepared by thinking about: What AI projects have they tried? What blocked them? What would success look like in 6 months? Do NOT include the prep form link here — this is purely readiness content to set expectations. Sign off as Ali Merchant.`,
      ai_tone: 'consultative, informative',
      ai_context_notes: '',
      step_goal: 'Set expectations and get the executive thinking about their AI challenges before the call',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 1,
      channel: 'sms' as const,
      subject: 'Prep form reminder',
      body_template: '',
      sms_template: '',
      ai_instructions: `Write a brief SMS (under 160 chars) reminding the executive to complete their strategy call prep form. Include the prep link from context notes. Keep it casual and direct.`,
      ai_tone: 'casual, direct',
      ai_context_notes: '',
      step_goal: 'Quick SMS nudge to complete prep form',
      max_attempts: 1,
      fallback_channel: 'email' as const,
    },
    {
      delay_days: 2,
      channel: 'email' as const,
      subject: '3 things the most productive strategy calls have in common',
      body_template: '',
      ai_instructions: `Write a brief, helpful email sharing 3 things that make strategy calls most productive: (1) Completing the prep form so we can personalize the discussion to their specific challenges, (2) Having a specific AI challenge or use case in mind to discuss — the more concrete the better, (3) Being prepared to discuss timeline and budget so we can give realistic, actionable recommendations instead of generic advice. If they have not completed the prep form yet, include the prep link from context notes. Frame this as helping them get maximum value from their 30 minutes, not as a sales pitch. Sign off as Ali Merchant.`,
      ai_tone: 'professional, helpful',
      ai_context_notes: '',
      step_goal: 'Help executive prepare mentally and complete prep form if not done',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'Your strategy call is coming up — final prep',
      body_template: '',
      ai_instructions: `Write a final prep email the day before the strategy call. Include: (1) Meeting logistics — the meeting time and Google Meet link will be in context notes, include them prominently, (2) Last chance to complete the prep form if not done (include link from context notes), (3) Brief reminder of what to expect. Keep it short and logistical, not salesy. Even if they have already completed the prep form, this should still feel useful as a meeting reminder with logistics. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'professional, slightly urgent',
      ai_context_notes: '',
      step_goal: 'Final logistics reminder and last chance prep form nudge',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  // Upsert new readiness sequence
  let sequence = await FollowUpSequence.findOne({
    where: { name: STRATEGY_READINESS_SEQUENCE_NAME },
  });

  if (sequence) {
    console.log('Strategy Call Readiness sequence exists. Updating steps...');
    await sequence.update({
      steps: READINESS_SEQUENCE.steps,
      description: READINESS_SEQUENCE.description,
      is_active: true,
    });
  } else {
    sequence = await FollowUpSequence.create(READINESS_SEQUENCE as any);
    console.log('Created Strategy Call Readiness sequence. ID:', sequence.id);
  }

  // Upsert new readiness campaign
  let campaign = await Campaign.findOne({
    where: { name: STRATEGY_READINESS_CAMPAIGN_NAME },
  });

  if (!campaign) {
    campaign = await Campaign.create({
      name: STRATEGY_READINESS_CAMPAIGN_NAME,
      description:
        'Auto-campaign for strategy call bookings. Leads are enrolled automatically on booking. Ensures executives are prepared and excited for their meeting. Replaces the old 3-step Prep Nudge.',
      type: 'warm_nurture',
      status: 'active',
      sequence_id: sequence.id,
      channel_config: {
        email: { enabled: true, daily_limit: 50 },
        voice: { enabled: false },
        sms: { enabled: true },
      },
      ai_system_prompt: `You are writing follow-up messages for Colaberry Enterprise AI Division. The recipient is an executive who has booked a 30-minute strategy call. Your goal is to ensure they are prepared, excited, and show up ready to have a productive conversation. Never be salesy — they have already committed to the call. Focus on helping them get maximum value from their 30 minutes. Ali Merchant is the sender.`,
      settings: {
        test_mode_enabled: false,
        delay_between_sends: 60,
        max_leads_per_cycle: 50,
      },
    } as any);
    console.log('Created Strategy Call Readiness campaign. ID:', campaign.id);
  } else {
    await campaign.update({ sequence_id: sequence.id, status: 'active' });
    console.log('Updated Strategy Call Readiness campaign. ID:', campaign.id);
  }

  // Deactivate old Prep Nudge sequence and campaign (if they exist)
  const oldSequence = await FollowUpSequence.findOne({
    where: { name: 'Strategy Call Prep Nudge' },
  });
  if (oldSequence) {
    await oldSequence.update({ is_active: false });
    console.log('Deactivated old Prep Nudge sequence.');
  }

  const oldCampaign = await Campaign.findOne({
    where: { name: 'Strategy Call Prep Nudge Campaign' },
  });
  if (oldCampaign) {
    await oldCampaign.update({ status: 'completed' });
    console.log('Completed old Prep Nudge campaign.');
  }

  console.log('Steps:');
  READINESS_SEQUENCE.steps.forEach((s, i) => {
    console.log(`  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.subject}`);
  });

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
