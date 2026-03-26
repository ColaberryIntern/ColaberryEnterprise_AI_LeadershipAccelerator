import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { FollowUpSequence, Campaign } from '../models';

export const CLASS_READINESS_SEQUENCE_NAME = 'Class Readiness Onboarding';
const CLASS_READINESS_CAMPAIGN_NAME = 'Class Readiness Campaign';

const CLASS_READINESS_SEQUENCE = {
  name: CLASS_READINESS_SEQUENCE_NAME,
  description: 'Auto-enrolled after payment is confirmed. 7-step T-minus onboarding sequence (T-14, T-7, T-3, T-1 email+SMS, T-0 email+SMS) relative to cohort start date. Late enrollments auto-skip past steps.',
  is_active: true,
  steps: [
    // T-14: Welcome + orientation
    {
      delay_days: 0,
      days_before_cohort_start: 14,
      channel: 'email' as const,
      subject: "You're In — Let's Get Ready",
      body_template: '',
      ai_instructions: `Write a warm, celebratory welcome email to a new student who just enrolled and paid for the Colaberry Enterprise AI Leadership Accelerator. Their cohort starts in 14 days. Include: (1) Congratulations on their decision, (2) What to expect from the program — 5-day intensive, production-ready AI deployment artifacts, (3) Pre-class requirements they should prepare NOW: Claude Code paid account (Max or Team plan), company-approved LLM API key (OpenAI, Anthropic, or equivalent), GitHub account with repository creation access, (4) Encourage them to block calendar time for the cohort dates. Be energetic but professional — this is an executive audience who just invested $4,500. Sign off as Ali Muwwakkil, Colaberry Enterprise AI Division.`,
      ai_tone: 'celebratory, professional, energetic',
      ai_context_notes: 'T-14 days — first touchpoint after payment. Set the tone for the onboarding journey.',
      step_goal: 'Welcome + orientation + tools checklist',
      max_attempts: 1,
      fallback_channel: null,
    },
    // T-7: Preparation guidance
    {
      delay_days: 0,
      days_before_cohort_start: 7,
      channel: 'email' as const,
      subject: 'Set Yourself Up for Success',
      body_template: '',
      ai_instructions: `Write an actionable preparation email to a student whose AI Leadership Accelerator cohort starts in 7 days. Focus on: (1) Environment setup — have they set up Claude Code? Do they have their LLM API key ready? Is their GitHub account active? (2) Mindset preparation — what makes successful participants stand out (come with a real project in mind, be ready to build not just learn), (3) Brief success story or example of what past participants have accomplished. Include a checklist format for the technical prerequisites. Be encouraging — they're about to start something transformative. Sign off as Ali Muwwakkil, Colaberry Enterprise AI Division.`,
      ai_tone: 'actionable, encouraging, practical',
      ai_context_notes: 'T-7 days — preparation checkpoint. Make sure they are technically ready.',
      step_goal: 'Environment setup + preparation guidance',
      max_attempts: 1,
      fallback_channel: null,
    },
    // T-3: Commitment + readiness
    {
      delay_days: 0,
      days_before_cohort_start: 3,
      channel: 'email' as const,
      subject: "You're Starting Soon",
      body_template: '',
      ai_instructions: `Write a readiness check email to a student whose AI Leadership Accelerator cohort starts in 3 days. Include: (1) Reminder of their session schedule — cohort name, start date, core day and time, optional lab day if applicable, (2) Quick readiness checklist — Claude Code installed? API key tested? Calendar blocked? (3) What to expect on Day 1 — overview of the first session, what to bring, (4) Offer help — if they have any technical setup issues, reply to this email. Build excitement while ensuring they're prepared. Sign off as Ali Muwwakkil, Colaberry Enterprise AI Division.`,
      ai_tone: 'excited, supportive, detail-oriented',
      ai_context_notes: 'T-3 days — final readiness check. Ensure no technical blockers.',
      step_goal: 'Readiness check + commitment reinforcement',
      max_attempts: 1,
      fallback_channel: null,
    },
    // T-1: Final reminder (email)
    {
      delay_days: 0,
      days_before_cohort_start: 1,
      channel: 'email' as const,
      subject: 'Tomorrow is Day 1',
      body_template: '',
      ai_instructions: `Write a final reminder email to a student whose AI Leadership Accelerator cohort starts TOMORROW. Be brief and high-energy. Include: (1) "We start tomorrow!" opening, (2) Exact session time and how to join (reference cohort core_day and core_time from context), (3) Final checklist — one last reminder to have Claude Code and API key ready, (4) Express genuine excitement about having them in the cohort. Keep it short — they know the details by now. This is about energy and anticipation. Sign off as Ali Muwwakkil, Colaberry Enterprise AI Division.`,
      ai_tone: 'high-energy, brief, anticipatory',
      ai_context_notes: 'T-1 day — tomorrow is Day 1. Build excitement.',
      step_goal: 'Final reminder with session details',
      max_attempts: 1,
      fallback_channel: null,
    },
    // T-1: Final reminder (SMS)
    {
      delay_days: 0,
      days_before_cohort_start: 1,
      channel: 'sms' as const,
      subject: '',
      body_template: '',
      sms_template: 'Hi {{name}}, your AI Leadership Accelerator starts tomorrow. Check your email for session details and make sure your tools are ready!',
      ai_instructions: '',
      step_goal: 'SMS reminder — Day 1 is tomorrow',
      max_attempts: 1,
      fallback_channel: null,
    },
    // T-0: Day 1 start (email)
    {
      delay_days: 0,
      days_before_cohort_start: 0,
      channel: 'email' as const,
      subject: 'Today is Day 1',
      body_template: '',
      ai_instructions: `Write a Day 1 kickoff email to a student whose AI Leadership Accelerator cohort starts TODAY. Be energizing and brief. Include: (1) "Today is the day!" opening, (2) Session time and join link (reference cohort core_day and core_time), (3) What they'll accomplish in the first session, (4) Encourage them to come with questions and be ready to build. End with a motivational note about the journey they're starting. Sign off as Ali Muwwakkil, Colaberry Enterprise AI Division.`,
      ai_tone: 'energizing, motivational, concise',
      ai_context_notes: 'T-0 — cohort starts today. Maximum energy.',
      step_goal: 'Day 1 kickoff with join details',
      max_attempts: 1,
      fallback_channel: null,
    },
    // T-0: Day 1 start (SMS)
    {
      delay_days: 0,
      days_before_cohort_start: 0,
      channel: 'sms' as const,
      subject: '',
      body_template: '',
      sms_template: 'Hi {{name}}, we start today! Your AI Leadership Accelerator begins now. Check your email for join details.',
      ai_instructions: '',
      step_goal: 'SMS notification — Day 1 starts now',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

export async function seedClassReadinessCampaign() {
  // Upsert sequence
  let sequence = await FollowUpSequence.findOne({
    where: { name: CLASS_READINESS_SEQUENCE_NAME },
  });

  if (sequence) {
    console.log('[Seed] Class readiness sequence exists. Updating steps...');
    await sequence.update({
      steps: CLASS_READINESS_SEQUENCE.steps,
      description: CLASS_READINESS_SEQUENCE.description,
      is_active: true,
    });
  } else {
    sequence = await FollowUpSequence.create(CLASS_READINESS_SEQUENCE as any);
    console.log('[Seed] Created class readiness sequence. ID:', sequence.id);
  }

  // Upsert campaign
  let campaign = await Campaign.findOne({
    where: { name: CLASS_READINESS_CAMPAIGN_NAME },
  });

  if (!campaign) {
    campaign = await Campaign.create({
      name: CLASS_READINESS_CAMPAIGN_NAME,
      description: 'Auto-enrolled after payment confirmation. T-minus onboarding sequence (T-14 → T-0) relative to cohort_start_date. Email + SMS for critical steps. Auto-exits past steps for late enrollments.',
      type: 'payment_readiness',
      status: 'active',
      sequence_id: sequence.id,
      ai_system_prompt: `You are writing class readiness onboarding messages for Colaberry Enterprise AI Division. The recipient has PAID and is confirmed for the Enterprise AI Leadership Accelerator. They are an executive audience. Be professional, encouraging, and action-oriented. Focus on preparation, technical readiness (Claude Code, LLM API key, GitHub), and building excitement. Reference their specific cohort details (name, start date, schedule) when available. Always sign off as Ali Muwwakkil, Colaberry Enterprise AI Division.`,
      channel_config: {
        email: { enabled: true, daily_limit: 100 },
        sms: { enabled: true },
      },
      settings: {
        test_mode_enabled: false,
        delay_between_sends: 60,
        max_leads_per_cycle: 100,
      },
    } as any);
    console.log('[Seed] Created class readiness campaign. ID:', campaign.id);
  } else {
    await campaign.update({
      sequence_id: sequence.id,
      status: 'active',
      description: 'Auto-enrolled after payment confirmation. T-minus onboarding sequence (T-14 → T-0) relative to cohort_start_date. Email + SMS for critical steps.',
    });
    console.log('[Seed] Updated class readiness campaign. ID:', campaign.id);
  }

  console.log('[Seed] Class readiness steps:');
  CLASS_READINESS_SEQUENCE.steps.forEach((s, i) => {
    console.log(`  ${i + 1}. T-${s.days_before_cohort_start}d [${s.channel}] ${s.subject || s.sms_template?.substring(0, 50) || '(SMS)'}`);
  });
}

// Allow standalone execution
if (require.main === module) {
  (async () => {
    await connectDatabase();
    await sequelize.sync();
    await seedClassReadinessCampaign();
    process.exit(0);
  })().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}
