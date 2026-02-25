import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { FollowUpSequence } from '../models';

const DEFAULT_SEQUENCE = {
  name: 'New Lead Nurture Campaign',
  description: 'Multi-channel 6-step campaign: voice + email + SMS. Follows spec cadence (Day 0 Voice, Day 1 Email, Day 3 Email, Day 6 Voice, Day 9 Email, Day 14 Email).',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'voice' as const,
      subject: 'Intro call — identify pain, book strategy session',
      body_template: `Hi {{name}}, this is Alex from Colaberry. I noticed you expressed interest in our Enterprise AI Leadership Accelerator. I'm reaching out because most executives I speak with are trying to build internal AI capability rather than depending on consultants. Is that something you're exploring at {{company}}?`,
      voice_agent_type: 'welcome' as const,
      max_attempts: 2,
      fallback_channel: 'email' as const,
      step_goal: 'Intro call — identify pain points, qualify interest, book 15-min strategy session',
    },
    {
      delay_days: 1,
      channel: 'email' as const,
      subject: 'Quick question about your AI goals, {{name}}',
      body_template: `<p>Hi {{name}},</p>

<p>Thanks for your interest in the Colaberry Enterprise AI Leadership Accelerator. I wanted to follow up personally.</p>

<p>Most executives I speak with are dealing with one of these challenges:</p>
<ul>
  <li>Their team has experimented with AI tools but hasn't built anything production-ready</li>
  <li>They need a working proof of concept to get stakeholder buy-in</li>
  <li>They want to build internal AI capability instead of depending on consultants</li>
</ul>

<p>Which of these resonates most with you? Just hit reply — I read every response.</p>

<p>Best,<br>
Ali Merchant<br>
Colaberry Enterprise AI Division</p>`,
      max_attempts: 1,
      fallback_channel: null,
      step_goal: 'Cold email — pain recognition, invite reply to start conversation',
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'What our graduates built in 5 days',
      body_template: `<p>Hi {{name}},</p>

<p>I wanted to share what recent program graduates accomplished:</p>

<ul>
  <li><strong>VP of Engineering at a Fortune 500:</strong> Built an AI-powered document analysis system that reduced manual review time by 70%</li>
  <li><strong>Director of Data Science:</strong> Created an executive AI readiness dashboard that secured $2M in AI budget</li>
  <li><strong>CTO at a mid-market SaaS:</strong> Developed a customer churn prediction model with 89% accuracy — deployed to production within 30 days</li>
</ul>

<p>Each of them walked in with an idea and walked out with a working proof of concept, executive presentation, and 90-day roadmap.</p>

<p><strong>The next cohort is limited to 15 seats.</strong> Would a 15-minute call be helpful to see if the program fits your situation?</p>

<p>Best,<br>
Ali Merchant<br>
Colaberry Enterprise AI Division</p>`,
      max_attempts: 1,
      fallback_channel: null,
      step_goal: 'Value-add email — social proof with real outcomes, soft CTA for call',
    },
    {
      delay_days: 6,
      channel: 'voice' as const,
      subject: 'Follow-up call — reference prior touchpoints, close on meeting',
      body_template: `Hi {{name}}, this is Alex from Colaberry again. I sent you some information about our Enterprise AI Leadership Accelerator. I'm checking in to see if you had a chance to review it. Our recent graduates have built AI proofs of concept that saved their organizations significant time and budget. Would you have 15 minutes this week for a quick strategy call?`,
      voice_agent_type: 'interest' as const,
      max_attempts: 2,
      fallback_channel: 'sms' as const,
      step_goal: 'Follow-up call — reference prior emails, push for strategy call booking',
    },
    {
      delay_days: 9,
      channel: 'email' as const,
      subject: 'The ROI case for AI leadership training',
      body_template: `<p>Hi {{name}},</p>

<p>I often hear executives say: "We know AI is important, but we can't justify the investment without a clear ROI."</p>

<p>Here's the math our graduates use:</p>

<div style="background:#f7fafc;border-left:4px solid #1a365d;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
  <strong>Program Investment:</strong> $4,500 per participant<br>
  <strong>Average consulting engagement for similar outcomes:</strong> $50,000–$150,000<br>
  <strong>ROI from first AI project deployed:</strong> 10–50x within 12 months<br>
  <strong>Internal capability built:</strong> Permanent (not dependent on external consultants)
</div>

<p>The program pays for itself with the first project your team deploys. Everything after that is pure upside.</p>

<p>I'd love to walk you through the ROI framework in a quick call. <a href="https://colaberry.com/contact">Schedule 15 minutes here</a>.</p>

<p>Best,<br>
Ali Merchant<br>
Colaberry Enterprise AI Division</p>`,
      max_attempts: 1,
      fallback_channel: null,
      step_goal: 'ROI email — justify investment, case study proof, CTA for call',
    },
    {
      delay_days: 14,
      channel: 'email' as const,
      subject: 'Closing the file — {{name}}, one last thought',
      body_template: `<p>Hi {{name}},</p>

<p>I've reached out a few times and I respect your time, so this will be my last note unless I hear back.</p>

<p>If AI leadership is still on your radar, here's what I'd leave you with:</p>

<ul>
  <li>The executives who move fastest on AI capability-building are the ones who <strong>build, not just plan</strong></li>
  <li>Our program produces a working proof of concept, executive deck, and 90-day roadmap — all in 5 days</li>
  <li>The next cohort is limited to 15 participants</li>
</ul>

<p>If and when you're ready:</p>
<ul>
  <li><a href="https://colaberry.com/enroll"><strong>Enroll directly</strong></a> ($4,500)</li>
  <li><a href="https://colaberry.com/contact"><strong>Schedule a call</strong></a> to discuss fit</li>
  <li>Reply to this email with any questions</li>
</ul>

<p>Either way, I wish you the best on your AI leadership journey.</p>

<p>Best,<br>
Ali Merchant<br>
Colaberry Enterprise AI Division</p>`,
      max_attempts: 1,
      fallback_channel: null,
      step_goal: 'Breakup email — last chance CTA, warm close',
    },
  ],
};

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  const existing = await FollowUpSequence.findOne({
    where: { name: DEFAULT_SEQUENCE.name },
  });

  if (existing) {
    console.log('Default nurture sequence already exists. Updating to multi-channel...');
    await existing.update({
      steps: DEFAULT_SEQUENCE.steps,
      description: DEFAULT_SEQUENCE.description,
      is_active: true,
    });
    console.log('Updated sequence ID:', existing.id);
    console.log('Steps:', DEFAULT_SEQUENCE.steps.map((s, i) => `  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.subject}`).join('\n'));
  } else {
    const seq = await FollowUpSequence.create(DEFAULT_SEQUENCE as any);
    console.log('Created default multi-channel nurture sequence. ID:', seq.id);
    console.log('Steps:', DEFAULT_SEQUENCE.steps.map((s, i) => `  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.subject}`).join('\n'));
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
