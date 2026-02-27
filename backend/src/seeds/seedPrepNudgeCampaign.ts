import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { FollowUpSequence, Campaign } from '../models';

export const PREP_NUDGE_SEQUENCE_NAME = 'Strategy Call Prep Nudge';
const PREP_NUDGE_CAMPAIGN_NAME = 'Strategy Call Prep Nudge Campaign';

const NUDGE_SEQUENCE = {
  name: PREP_NUDGE_SEQUENCE_NAME,
  description: 'Auto-enrolled on booking. 3-step nudge to complete strategy call prep form. Cancelled when prep is submitted.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'Quick 5-min prep for your strategy call',
      body_template: '',
      ai_instructions: `Write a warm, concise email encouraging the executive to complete a 5-minute strategy call preparation form before their upcoming call. Emphasize that filling it out will make their strategy call 2x more productive and save 15 minutes during the actual call. The prep form link will be provided in context notes — include it as a prominent CTA button. Keep the tone professional but friendly. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'professional, encouraging',
      ai_context_notes: '',
      step_goal: 'Get executive to start the prep form immediately after booking',
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
      subject: 'Your strategy call is coming up — are you ready?',
      body_template: '',
      ai_instructions: `Write a brief email reminding the executive that their strategy call is approaching. If they haven't completed the prep form yet, encourage them to spend 5 minutes on it. Mention that executives who prepare have 42% shorter decision cycles and 2x more productive sessions. Include the prep form link from context notes. If they've already completed it, this email won't be sent (it will be auto-cancelled). Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'professional, slightly urgent',
      ai_context_notes: '',
      step_goal: 'Final nudge before strategy call with urgency angle',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  // Upsert sequence
  let sequence = await FollowUpSequence.findOne({
    where: { name: PREP_NUDGE_SEQUENCE_NAME },
  });

  if (sequence) {
    console.log('Prep nudge sequence exists. Updating steps...');
    await sequence.update({
      steps: NUDGE_SEQUENCE.steps,
      description: NUDGE_SEQUENCE.description,
      is_active: true,
    });
  } else {
    sequence = await FollowUpSequence.create(NUDGE_SEQUENCE as any);
    console.log('Created prep nudge sequence. ID:', sequence.id);
  }

  // Upsert campaign
  let campaign = await Campaign.findOne({
    where: { name: PREP_NUDGE_CAMPAIGN_NAME },
  });

  if (!campaign) {
    campaign = await Campaign.create({
      name: PREP_NUDGE_CAMPAIGN_NAME,
      description: 'Auto-campaign for strategy call prep nudges. Leads are enrolled automatically on booking.',
      type: 'warm_nurture',
      status: 'active',
      sequence_id: sequence.id,
      ai_system_prompt: `You are writing follow-up messages for Colaberry Enterprise AI Division. The recipient has booked a strategy call and needs to complete a short preparation form. Be warm, professional, and value-driven. Emphasize that the prep form makes their call more productive — it's not busywork. Never be pushy or salesy.`,
      settings: {
        test_mode_enabled: false,
        delay_between_sends: 60,
        max_leads_per_cycle: 50,
      },
    } as any);
    console.log('Created prep nudge campaign. ID:', campaign.id);
  } else {
    await campaign.update({ sequence_id: sequence.id, status: 'active' });
    console.log('Updated prep nudge campaign. ID:', campaign.id);
  }

  console.log('Steps:');
  NUDGE_SEQUENCE.steps.forEach((s, i) => {
    console.log(`  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.subject}`);
  });

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
