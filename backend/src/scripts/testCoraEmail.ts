/**
 * Cora Shadow Test — validate reply quality before go-live.
 *
 * Runs a set of synthetic inquiry emails through Cora's OpenAI call and
 * prints the generated subject + body for each one. DB connection is
 * attempted (needed for real persona/KB routing) but optional — falls back
 * to the generic prompt if unavailable. No email is ever sent.
 *
 * Usage:
 *   npx ts-node src/scripts/testCoraEmail.ts        (from backend/, uses root .env)
 *
 * What to check in the output:
 *   ✅ Persona matches the question's topic — Cory for admissions/pricing/
 *      enrollment/Open House, Cora for everything else (BC #10109319420)
 *   ✅ Style gate score >= 70 with no violations (or a passing retry if not)
 *   ✅ Subject is descriptive (not just "Re: Hello")
 *   ✅ Body answers the specific question without hallucinating program facts
 *   ✅ Tone is professional and concise — not salesy
 *   ✅ Refund/escalation case does NOT attempt to resolve — escalates to Ali
 *   ✅ Sign-off matches the resolved persona (Cora or Cory)
 *   ✅ Every reply ends with a clear next step (enroll URL or strategy call)
 */

import { connectDatabase } from '../config/database';
import { generateCoraReply } from '../services/inbox/coraAgentService';
import { PERSONA_PROFILES } from '../services/inbox/coraPersonaRouter';

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
  {
    label: '8. OUT OF SCOPE — legacy bootcamp billing (must NOT quote Accelerator price)',
    fromName: 'Andre Mills',
    subject: 'IPBC payment question',
    body: `Hi,

I'm in the IPBC / Job Readiness Program and I got a payment notice.
I thought I only start paying after I get placed in a job. Can you
explain my balance and when payments start?

Andre`,
  },
  {
    label: '9. OUT OF SCOPE — employment verification (should redirect to everify@)',
    fromName: 'HR Verifications Inc',
    subject: 'Employment verification request',
    body: `Hello,

We need to verify the enrollment and completion dates for a former
student as part of a background check. Where do we send the request?

Thank you`,
  },
  {
    label: '10. OUT OF SCOPE — tax document / 1098 (no 1098; receipt in account)',
    fromName: 'Dana Cho',
    subject: '1098 tax form',
    body: `Hi, can you send me my 1098-T form for last year's tuition for my taxes? Thanks.`,
  },
  {
    label: '11. PERSONA CHECK — clear admissions question (expect Cory)',
    fromName: 'Open House Attendee',
    subject: 'Open House RSVP',
    body: `Hi, I'd like to RSVP for the upcoming Open House. Is it still free to attend, and do I need to register in advance?`,
  },
  {
    label: '12. PERSONA CHECK — clear support question (expect Cora)',
    fromName: 'Enrolled Student',
    subject: "Can't log into the portal",
    body: `Hi, I can't log into the student portal, it says my password is wrong even after I reset it. Can you help?`,
  },
];

async function runTests(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY is not set. Export it before running.');
    process.exit(1);
  }

  await connectDatabase();

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

      const profile = PERSONA_PROFILES[reply.persona];
      console.log(`PERSONA: ${reply.persona} (${profile.displayName})`);
      console.log(`STYLE GATE: ${reply.styleGateScore}/100${reply.styleGateViolations.length ? ` — ${reply.styleGateViolations.join('; ')}` : ' — clean'}`);
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
