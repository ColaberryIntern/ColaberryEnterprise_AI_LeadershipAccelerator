import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { FollowUpSequence, Campaign } from '../models';

export const PAYMENT_READINESS_SEQUENCE_NAME = 'Payment Readiness Reminder';
const PAYMENT_READINESS_CAMPAIGN_NAME = 'Payment Readiness Campaign';

const PAYMENT_READINESS_SEQUENCE = {
  name: PAYMENT_READINESS_SEQUENCE_NAME,
  description: 'Auto-enrolled when an enrollment is created with unpaid status (failed credit card or pending invoice). 5-step email cadence over 8 days to secure payment.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: "You're enrolled — secure your spot",
      body_template: '',
      ai_instructions: `Write a warm welcome email to someone who just enrolled in the Colaberry Enterprise AI Leadership Accelerator but hasn't completed payment yet. Thank them for enrolling. Explain that their spot is reserved but not confirmed until payment is complete. Include a link to complete payment (use the enrollment portal URL from context). Mention the cohort start date and that seats are limited. Keep it professional and encouraging — this is an executive audience. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'warm, professional, encouraging',
      ai_context_notes: '',
      step_goal: 'Welcome + drive immediate payment completion',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 2,
      channel: 'email' as const,
      subject: 'Reminder: Complete payment to confirm your spot',
      body_template: '',
      ai_instructions: `Write a friendly reminder email to an executive who enrolled but hasn't completed payment. Reference that they enrolled 2 days ago and their spot is still being held. Emphasize that the cohort is approaching and seats are filling. Include the payment link again. Mention one key benefit they'll get from the program (e.g., production-ready AI deployment artifacts). Keep it brief and action-oriented. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'friendly, brief, action-oriented',
      ai_context_notes: '',
      step_goal: 'Friendly payment reminder with benefit reinforcement',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 4,
      channel: 'email' as const,
      subject: 'Spots are being finalized for your cohort',
      body_template: '',
      ai_instructions: `Write an email with increased urgency to an executive who enrolled but still hasn't paid after 4 days. Mention that the cohort roster is being finalized and unpaid seats may be released to the waitlist. Reference the specific value they'll receive: AI Deployment Readiness Scan, Enterprise AI Deployment Roadmap, Governance Framework, and 90-Day Deployment Plan. Include the payment link. Be professional but create genuine urgency. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'professional, urgent but respectful',
      ai_context_notes: '',
      step_goal: 'Increase urgency — seats being finalized',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 6,
      channel: 'email' as const,
      subject: 'Final reminder before your cohort begins',
      body_template: '',
      ai_instructions: `Write a last-chance email to an executive who enrolled but hasn't paid. This is the penultimate reminder. Emphasize that the cohort starts very soon and their unpaid seat will be released if payment isn't completed. Offer to help if there are any questions or issues with payment (suggest replying to the email or contacting support). Include the payment link prominently. Be empathetic — they may have a legitimate reason for delay. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'empathetic, direct, final-warning',
      ai_context_notes: '',
      step_goal: 'Last chance — offer help if payment issues exist',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 8,
      channel: 'email' as const,
      subject: 'Cohort access requires completed payment',
      body_template: '',
      ai_instructions: `Write a final notice email to an executive who enrolled but never completed payment. This is the last email in the sequence. State clearly that access to the cohort requires completed payment and their reserved seat will be released. Offer two options: (1) complete payment now via the link to secure their spot, or (2) if AI leadership development isn't a priority right now, that's completely fine — they can re-enroll when a future cohort opens. Be gracious and professional. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'gracious, clear, final',
      ai_context_notes: '',
      step_goal: 'Final notice — pay or seat released',
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
    where: { name: PAYMENT_READINESS_SEQUENCE_NAME },
  });

  if (sequence) {
    console.log('Payment readiness sequence exists. Updating steps...');
    await sequence.update({
      steps: PAYMENT_READINESS_SEQUENCE.steps,
      description: PAYMENT_READINESS_SEQUENCE.description,
      is_active: true,
    });
  } else {
    sequence = await FollowUpSequence.create(PAYMENT_READINESS_SEQUENCE as any);
    console.log('Created payment readiness sequence. ID:', sequence.id);
  }

  // Upsert campaign
  let campaign = await Campaign.findOne({
    where: { name: PAYMENT_READINESS_CAMPAIGN_NAME },
  });

  if (!campaign) {
    campaign = await Campaign.create({
      name: PAYMENT_READINESS_CAMPAIGN_NAME,
      description: 'Auto-campaign for unpaid enrollment recovery. Leads are enrolled when an enrollment is created without payment. Auto-exits when payment is confirmed.',
      type: 'payment_readiness',
      status: 'active',
      sequence_id: sequence.id,
      ai_system_prompt: `You are writing payment reminder messages for Colaberry Enterprise AI Division. The recipient enrolled in the Enterprise AI Leadership Accelerator but hasn't completed payment. Be professional, encouraging, and create appropriate urgency without being pushy. This is an executive audience — treat them with respect. Focus on the value they'll receive and make it easy to complete payment.`,
      channel_config: {
        email: { enabled: true, daily_limit: 50 },
      },
      settings: {
        test_mode_enabled: false,
        delay_between_sends: 60,
        max_leads_per_cycle: 50,
      },
    } as any);
    console.log('Created payment readiness campaign. ID:', campaign.id);
  } else {
    await campaign.update({ sequence_id: sequence.id, status: 'active' });
    console.log('Updated payment readiness campaign. ID:', campaign.id);
  }

  console.log('Steps:');
  PAYMENT_READINESS_SEQUENCE.steps.forEach((s, i) => {
    console.log(`  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.subject}`);
  });

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
