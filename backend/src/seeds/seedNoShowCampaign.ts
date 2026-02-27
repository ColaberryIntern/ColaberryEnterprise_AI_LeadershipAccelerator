import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { FollowUpSequence, Campaign } from '../models';

export const NO_SHOW_SEQUENCE_NAME = 'Strategy Call No-Show Recovery';
const NO_SHOW_CAMPAIGN_NAME = 'Strategy Call No-Show Recovery Campaign';

const NO_SHOW_SEQUENCE = {
  name: NO_SHOW_SEQUENCE_NAME,
  description: 'Auto-enrolled when a strategy call is detected as a no-show (30+ min past scheduled time). 3-step recovery: email, voice, final email.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'We missed you — let\'s reschedule',
      body_template: '',
      ai_instructions: `Write a warm, understanding email to an executive who missed their scheduled strategy call. Do NOT guilt-trip them — things come up. Express genuine understanding. Offer to reschedule at their convenience. Include a link to the booking page (use the frontend URL from context). Emphasize that you're still holding their preparation data and the rescheduled call will pick up right where they left off. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'warm, understanding, no pressure',
      ai_context_notes: '',
      step_goal: 'Acknowledge missed call warmly, offer reschedule',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 2,
      channel: 'voice' as const,
      subject: 'Friendly follow-up about missed strategy call',
      body_template: '',
      ai_instructions: `You are calling to follow up with an executive who missed their strategy call with Colaberry Enterprise AI Division. Be warm and understanding — don't mention "no-show" or make them feel bad. Say something like "I know things get busy" and offer to reschedule at a time that works better. If they express continued interest, offer to book a new time right on the call. If they're no longer interested, be gracious and thank them for their time.`,
      voice_agent_type: 'interest' as const,
      voice_prompt: `You are Alex from Colaberry's Enterprise AI Division. You're calling {{name}}{{company ? ' at ' + company : ''}} to follow up on a strategy call they weren't able to make.

TONE: Warm, understanding, not accusatory. Things come up — you get it.

GOAL: Offer to reschedule their strategy call. If they're still interested in AI leadership development, book a new time. If not, be gracious.

DO NOT: Say "no-show" or make them feel guilty. Be pushy. Read a script.`,
      ai_tone: 'warm, understanding',
      step_goal: 'Voice follow-up to reschedule missed call',
      max_attempts: 2,
      fallback_channel: 'sms' as const,
    },
    {
      delay_days: 5,
      channel: 'email' as const,
      subject: 'Last note — your AI strategy session',
      body_template: '',
      ai_instructions: `Write a final follow-up email for an executive who missed their strategy call and hasn't rescheduled yet. Keep it brief and respectful. Offer two clear options: (1) reschedule the strategy call, or (2) if AI leadership isn't a priority right now, that's completely fine — you'll keep their preparation data on file for when they're ready. Include the booking page link. This is the last touchpoint in the recovery sequence, so make it warm but final. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'respectful, brief, final',
      ai_context_notes: '',
      step_goal: 'Final attempt to reschedule with gracious close',
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
    where: { name: NO_SHOW_SEQUENCE_NAME },
  });

  if (sequence) {
    console.log('No-show recovery sequence exists. Updating steps...');
    await sequence.update({
      steps: NO_SHOW_SEQUENCE.steps,
      description: NO_SHOW_SEQUENCE.description,
      is_active: true,
    });
  } else {
    sequence = await FollowUpSequence.create(NO_SHOW_SEQUENCE as any);
    console.log('Created no-show recovery sequence. ID:', sequence.id);
  }

  // Upsert campaign
  let campaign = await Campaign.findOne({
    where: { name: NO_SHOW_CAMPAIGN_NAME },
  });

  if (!campaign) {
    campaign = await Campaign.create({
      name: NO_SHOW_CAMPAIGN_NAME,
      description: 'Auto-campaign for strategy call no-show recovery. Leads are enrolled when a no-show is detected.',
      type: 'warm_nurture',
      status: 'active',
      sequence_id: sequence.id,
      ai_system_prompt: `You are writing recovery messages for Colaberry Enterprise AI Division. The recipient missed their scheduled strategy call. Be warm, understanding, and never guilt-trip them. Offer to reschedule and emphasize that their preparation data is saved. Focus on making it easy for them to re-engage.`,
      settings: {
        test_mode_enabled: false,
        delay_between_sends: 60,
        max_leads_per_cycle: 20,
      },
    } as any);
    console.log('Created no-show recovery campaign. ID:', campaign.id);
  } else {
    await campaign.update({ sequence_id: sequence.id, status: 'active' });
    console.log('Updated no-show recovery campaign. ID:', campaign.id);
  }

  console.log('Steps:');
  NO_SHOW_SEQUENCE.steps.forEach((s, i) => {
    console.log(`  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.subject}`);
  });

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
