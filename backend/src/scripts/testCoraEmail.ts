/**
 * Cora Shadow Test — validate reply quality before go-live.
 *
 * Runs a set of synthetic inquiry emails through Cora's OpenAI call and
 * prints the generated subject + body for each one. No DB connection needed,
 * no email is sent.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx ts-node src/scripts/testCoraEmail.ts
 *
 * What to check in the output:
 *   ✅ Subject is descriptive (not just "Re: Hello")
 *   ✅ Body answers the specific question without hallucinating program facts
 *   ✅ Tone is professional and concise — not salesy
 *   ✅ Refund/escalation case does NOT attempt to resolve — escalates to Ali
 *   ✅ Sign-off is "Cora | Colaberry Enterprise AI Support"
 *   ✅ Every reply ends with a clear next step (enroll URL or strategy call)
 */

import { generateCoraReply } from '../services/inbox/coraAgentService';

interface TestCase {
  label: string;
  fromName: string;
  subject: string;
  body: string;
}

const TEST_CASES: TestCase[] = [
  {
    label: '1. Pricing inquiry (specific subject)',
    fromName: 'Jennifer Walsh',
    subject: 'How much does the Executive AI Accelerator cost?',
    body: `Hi,

I came across your program online and I'm interested in learning more about the pricing.
Can you tell me how much it costs and what's included?

Thanks,
Jennifer`,
  },
  {
    label: '2. Technical experience question (generic subject)',
    fromName: 'Marcus Thompson',
    subject: 'Question',
    body: `Hello,

I'm a VP of Operations and I don't have a technical background at all.
I'm wondering if this program is appropriate for someone like me,
or if it's more geared toward engineers and developers?

Best,
Marcus`,
  },
  {
    label: '3. Group enrollment — 3 team members',
    fromName: 'Sarah Chen',
    subject: 'Team Enrollment Inquiry',
    body: `Hi there,

We have three leaders at our company (a CTO, VP of Product, and VP of Engineering)
who are all interested in the program. Is there group pricing available?
What does that process look like?

Thanks,
Sarah Chen
Head of Learning & Development
Apex Financial Group`,
  },
  {
    label: '4. Schedule / format question',
    fromName: 'David Okonkwo',
    subject: 'Hello',
    body: `Hello,

I wanted to know more about the schedule for this program.
I travel a lot for work — what days and times are the sessions held?
Is it flexible if I miss a session?

David`,
  },
  {
    label: '5. Refund request (escalation trigger)',
    fromName: 'Rachel Nguyen',
    subject: 'Refund Request',
    body: `Hi,

I enrolled in the program last week but my situation has changed and
I need to request a refund. Can you help me with this?

Rachel Nguyen`,
  },
  {
    label: '6. Payment plan / monthly billing question',
    fromName: 'Priya Raman',
    subject: 'Payment options',
    body: `Hi,

Is there a way to pay for the program monthly instead of all at once?
I'd like to understand my options before I bring this to my manager.

Thanks,
Priya`,
  },
  {
    label: '7. Next cohort start date (dynamic — pulled from DB if connected)',
    fromName: 'Tom Becker',
    subject: 'When is the next cohort?',
    body: `Hello,

When does the next cohort start? I want to make sure I can clear my
calendar before I enroll.

Tom`,
  },
];

async function runTests(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY is not set. Export it before running.');
    process.exit(1);
  }

  console.log('='.repeat(72));
  console.log('CORA SHADOW TEST — ' + new Date().toISOString());
  console.log('='.repeat(72));
  console.log();

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    console.log(`── ${tc.label} ──`);
    console.log(`From:    ${tc.fromName}`);
    console.log(`Subject: ${tc.subject}`);
    console.log();

    try {
      const reply = await generateCoraReply(tc.body, tc.subject, tc.fromName);

      console.log(`REPLY SUBJECT: ${reply.subject}`);
      console.log('-'.repeat(60));
      console.log(reply.body);
      passed++;
    } catch (err: any) {
      console.error(`FAILED: ${err.message}`);
      failed++;
    }

    console.log();
    console.log('='.repeat(72));
    console.log();
  }

  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
