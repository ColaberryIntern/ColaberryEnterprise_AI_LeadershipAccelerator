import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { FollowUpSequence, Campaign, AdminUser } from '../models';

const COLD_SEQUENCE = {
  name: 'Cold Outbound AI Leadership Sequence',
  description: '7-step AI-generated cold outreach sequence for Apollo-sourced leads. Every message is uniquely written by AI at send time.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'AI strategy for {{company}}',
      body_template: '',
      ai_instructions: 'Write a cold intro email. Research their industry context and identify likely AI pain points. Mention the 5-day Enterprise AI Leadership Accelerator where executives build a working AI proof of concept, executive presentation, and 90-day roadmap. Ask which AI challenge resonates most. Keep it concise and consultative, not salesy.',
      ai_tone: 'professional',
      step_goal: 'Cold intro — establish relevance, spark curiosity, invite a reply',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 2,
      channel: 'email' as const,
      subject: 'What executives are building in AI right now',
      body_template: '',
      ai_instructions: 'Write a follow-up to the cold intro. Share 2-3 specific examples of what program graduates accomplished: (1) VP of Engineering at Fortune 500 built AI document analysis saving 70% time, (2) Director of Data Science created AI readiness dashboard that secured $2M budget, (3) CTO deployed churn prediction model with 89% accuracy in 30 days. Tie examples to the lead\'s industry if possible. End with a soft question about their AI priorities.',
      ai_tone: 'consultative',
      step_goal: 'Social proof — show real outcomes, build credibility',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 5,
      channel: 'voice' as const,
      subject: 'Intro call — connect on AI challenges',
      body_template: '',
      ai_instructions: 'Generate voice agent instructions for a cold outreach call. The agent should introduce themselves as Alex from Colaberry Enterprise AI Division, reference the two emails sent previously, and transition into a consultative conversation about the lead\'s AI challenges. Goal is to identify pain points and book a 15-minute strategy call with Ali Merchant. Be warm and peer-like, not pushy.',
      ai_tone: 'friendly',
      voice_agent_type: 'interest' as const,
      step_goal: 'First call — establish human connection, identify pain, book strategy call',
      max_attempts: 2,
      fallback_channel: 'email' as const,
    },
    {
      delay_days: 8,
      channel: 'email' as const,
      subject: 'The ROI math on AI leadership training',
      body_template: '',
      ai_instructions: 'Write an ROI-focused email. Present the business case: $4,500 program vs $50K-$150K consulting, 10-50x ROI from first deployed project, permanent internal capability. Reference their specific industry and how AI leaders in their sector are building capability. Include a clear CTA to schedule a 15-minute call.',
      ai_tone: 'professional',
      step_goal: 'ROI justification — help them build the internal business case',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 12,
      channel: 'voice' as const,
      subject: 'Follow-up call — close on meeting',
      body_template: '',
      ai_instructions: 'Generate voice agent instructions for a follow-up call. Reference all prior emails and any responses. The agent should be familiar and warm since this is a continuation. Focus on addressing any hesitations (timing, budget, relevance). If they express interest, book a strategy call. If not interested, be gracious and offer to stay in touch. Share that the next cohort has limited seats.',
      ai_tone: 'consultative',
      voice_agent_type: 'interest' as const,
      step_goal: 'Follow-up call — overcome objections, close on strategy call',
      max_attempts: 2,
      fallback_channel: 'sms' as const,
    },
    {
      delay_days: 16,
      channel: 'email' as const,
      subject: 'One insight for {{company}}\'s AI strategy',
      body_template: '',
      ai_instructions: 'Write a value-add email that shares a specific, actionable AI insight relevant to the lead\'s industry. Don\'t just sell the program — provide genuine value. This could be a trend, a framework, or a specific approach companies in their industry are using. Then naturally tie it back to how the accelerator helps executives implement these strategies. Light CTA.',
      ai_tone: 'consultative',
      step_goal: 'Value-add — provide genuine insight, maintain relationship',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 21,
      channel: 'email' as const,
      subject: 'Closing the loop, {{name}}',
      body_template: '',
      ai_instructions: 'Write a polite breakup email. Acknowledge that you\'ve reached out several times. Respect their time. Leave the door open by summarizing: (1) direct enrollment link, (2) schedule a call option, (3) reply with questions. Close warmly and wish them well on their AI journey. This should feel like a genuine human ending a conversation gracefully, not a marketing template.',
      ai_tone: 'friendly',
      step_goal: 'Breakup — last chance CTA, warm close, leave door open',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  // Create or update the cold outbound sequence
  let sequence = await FollowUpSequence.findOne({
    where: { name: COLD_SEQUENCE.name },
  });

  if (sequence) {
    console.log('Cold outbound sequence already exists. Updating...');
    await sequence.update({
      steps: COLD_SEQUENCE.steps,
      description: COLD_SEQUENCE.description,
      is_active: true,
    });
  } else {
    sequence = await FollowUpSequence.create(COLD_SEQUENCE as any);
    console.log('Created cold outbound sequence. ID:', sequence.id);
  }

  console.log('Steps:');
  COLD_SEQUENCE.steps.forEach((s, i) => {
    console.log(`  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.step_goal}`);
  });

  // Create the campaign linked to this sequence
  const existingCampaign = await Campaign.findOne({
    where: { name: 'AI Leadership Cold Outbound Q1' },
  });

  if (!existingCampaign) {
    // Get the first admin user for created_by
    const admin = await AdminUser.findOne();
    if (!admin) {
      console.log('No admin user found. Create an admin first, then re-run.');
      process.exit(1);
    }

    const campaign = await Campaign.create({
      name: 'AI Leadership Cold Outbound Q1',
      description: 'Cold outbound campaign targeting AI-interested executives sourced from Apollo. All messages AI-generated at send time.',
      type: 'cold_outbound',
      status: 'draft',
      sequence_id: sequence.id,
      targeting_criteria: {
        industries: ['SaaS', 'Technology', 'Financial Services', 'Healthcare', 'Manufacturing'],
        title_patterns: ['CTO', 'VP Engineering', 'Director AI', 'Chief Data', 'Head of AI'],
        company_size_min: 51,
        company_size_max: 1000,
        score_min: 40,
        lead_source_type: 'cold',
      },
      channel_config: {
        email: { enabled: true, daily_limit: 50 },
        voice: { enabled: true },
        sms: { enabled: false },
      },
      ai_system_prompt: `You are a professional outreach specialist for Colaberry Enterprise AI Division. You write personalized, consultative messages that feel like genuine 1:1 conversations.

Key messaging points:
- Enterprise AI Leadership Accelerator: 5-day intensive program
- Executives build a working AI proof of concept, executive presentation, and 90-day roadmap
- Limited to 15 participants per cohort
- $4,500 investment vs $50K-$150K consulting alternative
- Recent graduates achieved: 70% time savings, $2M budget approvals, 89% accuracy ML models

Tone: Professional, peer-level, consultative. Never sound like marketing. Always reference the lead's specific context.`,
      created_by: admin.id,
    } as any);

    console.log('\nCreated campaign:', campaign.name, '(ID:', campaign.id, ')');
    console.log('Status: draft (activate when ready to start outreach)');
  } else {
    console.log('\nCampaign already exists:', existingCampaign.name);
    // Update sequence_id if needed
    if (existingCampaign.sequence_id !== sequence.id) {
      await existingCampaign.update({ sequence_id: sequence.id } as any);
      console.log('Updated campaign to use new sequence.');
    }
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
