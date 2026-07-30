/**
 * Cora Gmail send verification — sends one real Cora-generated reply to a
 * chosen inbox to confirm the actual Gmail-send pipeline works end to end.
 *
 * Unlike testCoraEmail.ts (prints generated replies only, never sends), this
 * script calls generateCoraReply() + the exported sendCoraReplyViaGmail()
 * directly — bypassing CORA_DRY_RUN and inbox_audit_logs entirely, since the
 * synthetic inquiry below has no real inbox_emails row to attach an audit
 * event to. This is a manual, human-triggered verification, not part of the
 * production inbox pipeline — safe to re-run, but it DOES send a real email
 * every time via the real support@colaberry.com Gmail account.
 *
 * Requires (see backend/.env.dev): GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
 * GMAIL_REFRESH_TOKEN (or GMAIL_COLABERRY_REFRESH_TOKEN), OPENAI_API_KEY.
 *
 * Run: `npx ts-node backend/src/scripts/sendCoraTestEmail.ts [recipient-email] [subject] [body]`
 *   (from repo root, or `node dist/scripts/sendCoraTestEmail.js [recipient-email] [subject] [body]`
 *   inside the backend container once compiled)
 *
 * Defaults recipient to kesetebirhan@gmail.com and a canned pricing inquiry
 * if subject/body args are not given.
 */

import { connectDatabase } from '../config/database';
import { generateCoraReply, sendCoraReplyViaGmail } from '../services/inbox/coraAgentService';

const DEFAULT_RECIPIENT = 'kesetebirhan@gmail.com';
const DEFAULT_SUBJECT = 'How much does the AI Systems Architect Accelerator cost?';
const DEFAULT_BODY = `Hi,

I came across the program and I'm interested in learning more about pricing
and what's included. Could you send me the details?

Thanks,
Kes`;

async function run(): Promise<void> {
  const recipient = process.argv[2] || DEFAULT_RECIPIENT;
  const testSubject = process.argv[3] || DEFAULT_SUBJECT;
  const testBody = process.argv[4] || DEFAULT_BODY;

  for (const [name, value] of [
    ['GMAIL_CLIENT_ID', process.env.GMAIL_CLIENT_ID],
    ['GMAIL_CLIENT_SECRET', process.env.GMAIL_CLIENT_SECRET],
    ['GMAIL_REFRESH_TOKEN / GMAIL_COLABERRY_REFRESH_TOKEN', process.env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_COLABERRY_REFRESH_TOKEN],
    ['OPENAI_API_KEY', process.env.OPENAI_API_KEY],
  ]) {
    if (!value) {
      console.error(`FATAL: ${name} is not set. Populate it in backend/.env.dev before running this script.`);
      process.exit(1);
    }
  }

  try {
    await connectDatabase();
  } catch (err: any) {
    console.warn(`[sendCoraTestEmail] DB connection failed (${err.message}) — Cora will fall back to its generic system prompt.`);
  }

  console.log(`Generating Cora reply for a test inquiry, then sending a REAL email to: ${recipient}`);

  const reply = await generateCoraReply(testBody, testSubject, 'Kes (test)');
  console.log(`Persona: ${reply.persona}`);
  console.log(`Style gate: ${reply.styleGateScore}/100${reply.styleGateViolations.length ? ` — ${reply.styleGateViolations.join('; ')}` : ' — clean'}`);
  console.log(`Generated subject: ${reply.subject}`);
  console.log(`needsHuman: ${reply.needsHuman}`);

  await sendCoraReplyViaGmail(
    {
      from_address: recipient,
      subject: testSubject,
      provider_message_id: `test-${Date.now()}`,
      provider_thread_id: null,
      headers: {},
    },
    reply
  );

  console.log(`Sent. Check ${recipient} for subject: "${reply.subject}"`);
  process.exit(0);
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
