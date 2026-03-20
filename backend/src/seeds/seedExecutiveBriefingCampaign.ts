import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { FollowUpSequence, Campaign } from '../models';

export const EXEC_BRIEFING_SEQUENCE_NAME = 'Executive Briefing Interest';
const EXEC_BRIEFING_CAMPAIGN_NAME = 'Executive Briefing Interest Campaign';

const BRIEFING_SEQUENCE = {
  name: EXEC_BRIEFING_SEQUENCE_NAME,
  description:
    'Auto-enrolled when a lead downloads the Executive Briefing. 5-step nurture focused on converting briefing readers to strategy call bookings. Day 0 voice call + overview email are handled separately by automationService.',
  is_active: true,
  steps: [
    {
      delay_days: 1,
      channel: 'email' as const,
      subject: 'Thoughts on the Executive Briefing, {{name}}?',
      body_template: '',
      ai_instructions: `Write a follow-up email referencing the Executive Briefing on AI Leadership the lead downloaded yesterday. Ask which section resonated most — the ROI Framework, the Case Studies, or the Architecture Blueprint. Offer to discuss their specific situation in a quick call. Do NOT repeat generic program details — assume they read the briefing. Keep it conversational. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'professional, curious',
      ai_context_notes: '',
      step_goal: 'Re-engage briefing reader and surface their specific pain points',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'What executives are doing after reading the briefing',
      body_template: '',
      ai_instructions: `Write a social proof email for an executive who downloaded the AI Leadership Briefing. Share 2-3 examples of what program graduates accomplished — real outcomes like building AI POCs, presenting to boards, getting budget approval. Connect these outcomes to the briefing themes (AI readiness assessment, building internal capability, executive-level AI strategy). Soft CTA: offer a 15-minute strategy call to discuss how this applies to their organization. Sign off as Ali Merchant.`,
      ai_tone: 'consultative, confident',
      ai_context_notes: '',
      step_goal: 'Build credibility through social proof tied to briefing themes',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 6,
      channel: 'voice' as const,
      subject: 'Follow-up call referencing Executive Briefing',
      body_template: '',
      voice_agent_type: 'interest' as const,
      ai_instructions: `You are Maya, Director of Admissions at Colaberry, calling an executive who downloaded the Executive Briefing on AI Leadership about a week ago and received two follow-up emails. Reference the briefing naturally: "I wanted to follow up on the Executive Briefing you downloaded — were you able to review the ROI framework and case studies?" Identify their current AI challenges and goals. If there is fit, offer to book a 15-minute strategy call with Ali Merchant to discuss a tailored approach. Be consultative, not pushy. If they are not interested, thank them and close gracefully.`,
      ai_tone: 'consultative, warm',
      ai_context_notes: '',
      step_goal: 'Convert briefing reader to strategy call booking via personal touch',
      max_attempts: 2,
      fallback_channel: 'sms' as const,
    },
    {
      delay_days: 9,
      channel: 'email' as const,
      subject: 'The ROI of acting on the briefing insights',
      body_template: '',
      ai_instructions: `Write an ROI-focused email that ties back to specific themes from the Executive Briefing. Present the business case: the 5-day Accelerator delivers production-ready AI systems and permanent team capability in 3 weeks. Reference that the briefing outlined the problem (AI readiness gap, lack of internal capability); the program is the solution. Include a specific example: "One VP of Engineering used the ROI Framework from the briefing to justify internal AI training — saved their company $120K in the first year." CTA: Book a 15-minute strategy call. Sign off as Ali Merchant.`,
      ai_tone: 'professional, persuasive',
      ai_context_notes: '',
      step_goal: 'Make the business case for acting on briefing insights',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 14,
      channel: 'email' as const,
      subject: 'Last note about your Executive Briefing, {{name}}',
      body_template: '',
      ai_instructions: `Write a warm breakup email. Reference the Executive Briefing download as the starting point of this conversation. Acknowledge they may be busy or the timing may not be right. Leave the door open with three clear options: (1) Enroll in the next cohort, (2) Schedule a 15-minute strategy call, (3) Reply to this email with any questions. Be genuine and appreciative. This is the last email in the sequence. Sign off as Ali Merchant, Colaberry Enterprise AI Division.`,
      ai_tone: 'friendly, genuine, final',
      ai_context_notes: '',
      step_goal: 'Graceful close with clear next-step options',
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
    where: { name: EXEC_BRIEFING_SEQUENCE_NAME },
  });

  if (sequence) {
    console.log('Executive Briefing sequence exists. Updating steps...');
    await sequence.update({
      steps: BRIEFING_SEQUENCE.steps,
      description: BRIEFING_SEQUENCE.description,
      is_active: true,
    });
  } else {
    sequence = await FollowUpSequence.create(BRIEFING_SEQUENCE as any);
    console.log('Created Executive Briefing sequence. ID:', sequence.id);
  }

  // Upsert campaign
  let campaign = await Campaign.findOne({
    where: { name: EXEC_BRIEFING_CAMPAIGN_NAME },
  });

  if (!campaign) {
    campaign = await Campaign.create({
      name: EXEC_BRIEFING_CAMPAIGN_NAME,
      description:
        'Auto-campaign for executive briefing downloaders. Leads are enrolled automatically when they submit the Get Executive Briefing form. Starts at Day 1 since Day 0 voice call + email are handled by automationService.',
      type: 'warm_nurture',
      status: 'active',
      sequence_id: sequence.id,
      channel_config: {
        email: { enabled: true, daily_limit: 50 },
        voice: { enabled: true },
        sms: { enabled: false },
      },
      ai_system_prompt: `You are writing follow-up messages for Colaberry Enterprise AI Division. The recipient is an executive who recently downloaded the Executive Briefing on AI Leadership. They are evaluating AI training programs and internal capability building. Reference the briefing naturally — they have read it. Be consultative, not salesy. Focus on helping them understand how to act on the briefing insights. Ali Merchant is the sender.`,
      settings: {
        test_mode_enabled: false,
        delay_between_sends: 120,
        max_leads_per_cycle: 50,
      },
    } as any);
    console.log('Created Executive Briefing campaign. ID:', campaign.id);
  } else {
    await campaign.update({ sequence_id: sequence.id, status: 'active' });
    console.log('Updated Executive Briefing campaign. ID:', campaign.id);
  }

  console.log('Steps:');
  BRIEFING_SEQUENCE.steps.forEach((s, i) => {
    console.log(`  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.subject}`);
  });

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
