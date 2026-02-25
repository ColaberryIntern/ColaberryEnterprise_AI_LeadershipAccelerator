import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { FollowUpSequence } from '../models';

const DEFAULT_SEQUENCE = {
  name: 'New Lead Nurture Campaign',
  description: 'Automated 5-step email sequence for all incoming leads. Drives toward enrollment.',
  is_active: true,
  steps: [
    {
      delay_days: 1,
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
    },
    {
      delay_days: 3,
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
    },
    {
      delay_days: 7,
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
    },
    {
      delay_days: 14,
      subject: 'Last few seats — {{name}}, are you in?',
      body_template: `<p>Hi {{name}},</p>

<p>Quick update: the next cohort of the Enterprise AI Leadership Accelerator is almost full. We keep it to <strong>15 participants max</strong> so everyone gets hands-on attention.</p>

<p><strong>What you'll walk away with:</strong></p>
<ol>
  <li>A working AI Proof of Concept scoped to your organization's top use case</li>
  <li>An executive-ready presentation deck for stakeholder buy-in</li>
  <li>A 90-Day AI expansion roadmap with measurable milestones</li>
  <li>Access to ongoing Enterprise AI Advisory Labs</li>
</ol>

<p>If you've been considering this, now's the time to lock in your seat: <a href="https://colaberry.com/enroll"><strong>Enroll Now</strong></a></p>

<p>Still have questions? Reply to this email or <a href="https://colaberry.com/contact">book a call</a>.</p>

<p>Best,<br>
Ali Merchant<br>
Colaberry Enterprise AI Division</p>`,
    },
    {
      delay_days: 21,
      subject: 'Final follow-up: your AI leadership journey',
      body_template: `<p>Hi {{name}},</p>

<p>This is my final follow-up. I don't want to crowd your inbox, but I also don't want you to miss this opportunity.</p>

<p>The executives who get the most from this program are the ones who:</p>
<ul>
  <li>Know AI is critical to their organization's future</li>
  <li>Want to lead the initiative rather than delegate it</li>
  <li>Are ready to build something real — not just attend another lecture</li>
</ul>

<p>If that sounds like you, I'm here when you're ready:</p>
<ul>
  <li><a href="https://colaberry.com/enroll"><strong>Enroll directly</strong></a> ($4,500)</li>
  <li><a href="https://colaberry.com/contact"><strong>Schedule a call</strong></a> to discuss fit</li>
  <li>Reply to this email with any questions</li>
</ul>

<p>Either way, I wish you the best on your AI leadership journey.</p>

<p>Best,<br>
Ali Merchant<br>
Colaberry Enterprise AI Division</p>`,
    },
  ],
};

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  // Check if default sequence already exists
  const existing = await FollowUpSequence.findOne({
    where: { name: DEFAULT_SEQUENCE.name },
  });

  if (existing) {
    console.log('Default nurture sequence already exists. Updating steps...');
    await existing.update({
      steps: DEFAULT_SEQUENCE.steps,
      description: DEFAULT_SEQUENCE.description,
      is_active: true,
    });
    console.log('Updated sequence ID:', existing.id);
  } else {
    const seq = await FollowUpSequence.create(DEFAULT_SEQUENCE as any);
    console.log('Created default nurture sequence. ID:', seq.id);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
