// sendAiPilotOutreach.js — send the AI ROI Pilot cold-email sequence (plain text)
// from ali@colaberry.com via Mandrill. Reads the reviewed list produced by
// pullAiPilotLeads.js. Copy lives in docs/AI_ROI_PILOT_EMAIL_SEQUENCE.md.
//
// Hard safety rails (per CLAUDE.md operating doctrine):
//   - DRY-RUN by default. Prints rendered emails + recipients. Pass --send to send.
//   - Idempotent: a per-email sent-log prevents re-sending the same touch twice.
//   - Batch cap (LIMIT, default 25) so a small first batch protects deliverability.
//   - Em-dash guard: refuses to send any body containing an em/en dash.
//   - CAN-SPAM: refuses to send live until a real mailing ADDRESS is provided.
//   - Throttle between sends. Stop the sequence for anyone who has replied
//     (maintain a REPLIED list; this script will not contact addresses in it).
//
// Env: MANDRILL_API_KEY (prod), ADDRESS (physical mailing address line),
//   LEADS_FILE (default newest tmp/ai-pilot-leads-*.json), TOUCH (1|2|3, default 1),
//   LIMIT (default 25), OUT_DIR (default ./tmp).

const fs = require('fs');
const path = require('path');

function req(name) {
  try { return require(name); }
  catch { return require(path.resolve(__dirname, '../../node_modules/' + name)); }
}
const nodemailer = req('nodemailer');

const SEND = process.argv.includes('--send');
const TOUCH = String(process.env.TOUCH || '1');
const LIMIT = parseInt(process.env.LIMIT || '25', 10);
const OUT_DIR = process.env.OUT_DIR || path.resolve(process.cwd(), 'tmp');
const FROM = 'ali@colaberry.com';
const ADDRESS = process.env.ADDRESS || '';
const SENT_LOG = path.join(OUT_DIR, 'ai-pilot-sent.json');
const REPLIED_FILE = path.join(OUT_DIR, 'ai-pilot-replied.json'); // optional array of emails

const SIGNATURE = [
  '',
  'Ali Muwwakkil',
  'Colaberry AI',
  'ali@colaberry.com | enterprise.colaberry.ai',
].join('\n');

const TEMPLATES = {
  '1': {
    subject: 'a quick AI idea for {{company}}',
    body: [
      'Hi {{first_name}},',
      '',
      'I run a small team that builds AI systems for owner-led companies, and {{company}} is exactly the kind of business we tend to help most.',
      '',
      'Most CEOs I talk to are not short on AI ideas. They are short on a low-risk way to prove one. So we do a 6-week AI ROI Pilot: $2,500 flat, and we build one real working system against the workflow most likely to return time or money for you. If you continue after that, the $2,500 is credited forward.',
      '',
      'For one transportation company we built a system that finds and contacts prospects and prices inbound quotes in seconds. Same approach would look different for {{company}}, which is the point of the pilot.',
      '',
      'Worth a 20-minute call to find your first win?',
    ].join('\n'),
  },
  '2': {
    subject: 're: a quick AI idea for {{company}}',
    body: [
      'Hi {{first_name}},',
      '',
      'Quick follow-up. The reason the pilot is only $2,500 is that it is meant to be a low-risk way to see what it is like to work with us before any bigger commitment. We pick the one project most likely to pay off, build it, and measure the result. No retainer until you have seen it work.',
      '',
      'If now is not the time, just say so and I will stop following up. If you are curious, I will send two or three ideas specific to {{company}} before we even talk.',
    ].join('\n'),
  },
  '3': {
    subject: 'should I close this out?',
    body: [
      'Hi {{first_name}},',
      '',
      'I do not want to crowd your inbox. If the timing is off I will close this out and check back later in the year.',
      '',
      'If there is even one workflow at {{company}} you have wished AI could handle, reply with one line and I will tell you, honestly, whether a pilot makes sense for it.',
      '',
      'Either way, thanks for the time.',
    ].join('\n'),
  },
};

function firstName(row) {
  if (row.first_name) return row.first_name.trim();
  return (row.name || 'there').trim().split(/\s+/)[0];
}

function render(tpl, row) {
  const fn = firstName(row);
  const co = (row.company || 'your company').trim();
  const sub = tpl.subject.replace(/\{\{first_name\}\}/g, fn).replace(/\{\{company\}\}/g, co);
  const footer = `\n\nColaberry Inc. | Reply STOP or "unsubscribe" and I will remove you immediately.\n${ADDRESS || '[mailing address to be confirmed before send]'}`;
  const body = tpl.body.replace(/\{\{first_name\}\}/g, fn).replace(/\{\{company\}\}/g, co) + SIGNATURE + footer;
  return { sub, body };
}

function hasDash(s) { return /[—–]/.test(s); } // em / en dash

function newestLeadsFile() {
  if (process.env.LEADS_FILE) return process.env.LEADS_FILE;
  if (!fs.existsSync(OUT_DIR)) return null;
  const files = fs.readdirSync(OUT_DIR).filter((f) => /^ai-pilot-leads-.*\.json$/.test(f)).sort();
  return files.length ? path.join(OUT_DIR, files[files.length - 1]) : null;
}

function loadJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }

(async () => {
  console.log(`MODE: ${SEND ? 'SEND (live)' : 'DRY-RUN (no email sent)'} | touch ${TOUCH} | cap ${LIMIT}`);

  const tpl = TEMPLATES[TOUCH];
  if (!tpl) { console.error(`FAILED: unknown TOUCH=${TOUCH} (use 1, 2, or 3).`); process.exit(1); }

  const leadsFile = newestLeadsFile();
  if (!leadsFile || !fs.existsSync(leadsFile)) {
    console.error('FAILED: no leads file. Run pullAiPilotLeads.js --enrich first.');
    process.exit(1);
  }
  const leads = loadJson(leadsFile, []).filter((r) => r.email && /@/.test(r.email));
  console.log(`[leads] ${leads.length} with email from ${leadsFile}`);

  const sent = loadJson(SENT_LOG, {});
  const replied = new Set((loadJson(REPLIED_FILE, [])).map((e) => String(e).toLowerCase()));

  // Live-send guards.
  if (SEND) {
    if (!process.env.MANDRILL_API_KEY) { console.error('FAILED: MANDRILL_API_KEY not set.'); process.exit(1); }
    if (!ADDRESS) { console.error('FAILED: set ADDRESS env to a real mailing address (CAN-SPAM) before live send.'); process.exit(1); }
  }

  const transporter = SEND ? nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587, secure: false,
    auth: { user: 'apikey', pass: process.env.MANDRILL_API_KEY },
  }) : null;

  let queued = 0, skipped = 0, done = 0, blocked = 0;
  for (const row of leads) {
    if (queued >= LIMIT) break;
    const email = row.email.trim().toLowerCase();

    if (replied.has(email)) { skipped++; continue; }
    if (sent[email] && sent[email][TOUCH]) { skipped++; continue; }
    // Don't send touch 2/3 unless touch 1 went out.
    if (TOUCH !== '1' && !(sent[email] && sent[email]['1'])) { skipped++; continue; }

    const { sub, body } = render(tpl, row);
    if (hasDash(sub) || hasDash(body)) {
      console.warn(`[block] em/en dash in content for ${email}. Skipping (doctrine: no em-dashes).`);
      blocked++;
      continue;
    }
    queued++;

    if (!SEND) {
      if (queued <= 3) console.log(`\n--- ${email} ---\nSubject: ${sub}\n${body}\n`);
      else console.log(`[would send] ${email} | ${sub}`);
      continue;
    }

    try {
      await transporter.sendMail({
        from: `"Ali Muwwakkil" <${FROM}>`,
        to: row.email,
        subject: sub,
        text: body,
        headers: { 'X-MC-Tags': 'ai-pilot-cold', 'X-MC-Subaccount': 'ai-pilot' },
      });
      sent[email] = sent[email] || {};
      sent[email][TOUCH] = new Date().toISOString();
      fs.writeFileSync(SENT_LOG, JSON.stringify(sent, null, 2)); // persist after each send (idempotent on crash)
      console.log(`[sent] ${email} | ${sub}`);
      done++;
      await new Promise((r) => setTimeout(r, 1500)); // throttle
    } catch (err) {
      console.error(`[error] ${email}: ${err.message}`);
    }
  }

  console.log(`\nDONE. ${SEND ? `sent=${done}` : `would_send=${queued}`} skipped=${skipped} dash_blocked=${blocked} cap=${LIMIT}`);
  if (!SEND) console.log('Re-run with --send (and ADDRESS set) to send for real.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
