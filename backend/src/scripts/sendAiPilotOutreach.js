// sendAiPilotOutreach.js — send the AI ROI Pilot 7-email cold campaign (plain text)
// from ali@colaberry.com via Mandrill. Reads the reviewed list from the finalized
// leads file. Copy: docs/AI_ROI_PILOT_EMAIL_SEQUENCE.md.
//
// Batch staggered across the business day via Mandrill scheduled sends
// (X-MC-SendAt) so it never looks like a blast. Touches 2-7 on later runs.
//
// LIABILITY CONTROLS (added after the pre-launch audit):
//   - OPT-OUT / SUPPRESSION: skips anyone in ai-pilot-replied.json OR
//     ai-pilot-suppression.json (opt-outs + bounces + complaints). Those files are
//     refreshed before every touch by the mandatory inbox sweep (see the email
//     sequence doc). The cold sender NEVER emails a suppressed address.
//   - CAN-SPAM: refuses to send live unless ADDRESS is a real postal address (has a
//     number); footer carries the address + opt-out; adds List-Unsubscribe headers.
//   - Non-deceptive subjects (no fabricated "re:").
//   - IDEMPOTENCY: the sent-log entry is written BEFORE the network send (atomic
//     temp+rename) and rolled back only on a clean failure, so a crash can never
//     re-send the same touch. Em/en-dash guard. DRY-RUN by default.
//
// Env: MANDRILL_API_KEY, ADDRESS, TOUCH (1..7, default 1), LIMIT (default 100),
//   SEND_DATE (YYYY-MM-DD; enables staggered scheduling), START_CT/END_CT (9/17),
//   CT_OFFSET (5 = CDT), CALENDAR_LINK (touch 6), LEADS_FILE, OUT_DIR (./tmp).

const fs = require('fs');
const path = require('path');
function req(name) { try { return require(name); } catch { return require(path.resolve(__dirname, '../../node_modules/' + name)); } }
const nodemailer = req('nodemailer');

const SEND = process.argv.includes('--send');
const TOUCH = String(process.env.TOUCH || '1');
const LIMIT = parseInt(process.env.LIMIT || '100', 10);
const OUT_DIR = process.env.OUT_DIR || path.resolve(process.cwd(), 'tmp');
const FROM = 'ali@colaberry.com';
const ADDRESS = process.env.ADDRESS || '';
const CALENDAR_LINK = process.env.CALENDAR_LINK || '';
const SENT_LOG = path.join(OUT_DIR, 'ai-pilot-sent.json');
const REPLIED_FILE = path.join(OUT_DIR, 'ai-pilot-replied.json');       // anyone who replied (incl. opt-outs)
const SUPPRESS_FILE = path.join(OUT_DIR, 'ai-pilot-suppression.json');  // opt-outs + bounces + complaints

const SEND_DATE = process.env.SEND_DATE || '';
const START_CT = parseInt(process.env.START_CT || '9', 10);
const END_CT = parseInt(process.env.END_CT || '17', 10);
const CT_OFFSET = parseInt(process.env.CT_OFFSET || '5', 10);

const SIGNATURE = ['', 'Ali Muwwakkil', 'Colaberry AI', 'ali@colaberry.com | enterprise.colaberry.ai'].join('\n');

const TEMPLATES = {
  '1': { subject: 'a quick AI idea for {{company}}', body: [
    'Hi {{first_name}},', '',
    'I run a small team that builds AI systems for owner-led companies, and {{company}} is exactly the kind of business we tend to help most.', '',
    'Most CEOs I talk to are not short on AI ideas. They are short on a low-risk way to prove one. So we do a 6-week AI ROI Pilot: $2,500 flat, and we build one real working system against the workflow most likely to return time or money for you. If you continue after that, the $2,500 is credited forward.', '',
    'Worth a 20-minute call to find your first win?'].join('\n') },
  '2': { subject: 'one more AI idea for {{company}}', body: [
    'Hi {{first_name}},', '',
    'Quick proof this is real and not a pitch. For one transportation company we built a system that finds and contacts prospects across email and phone, and reads inbound requests around the clock to prepare priced quotes in seconds. Production software, in about three months.', '',
    'The same method would look different for {{company}}, which is the whole point of starting with a small pilot.', '',
    'Open to a short call?'].join('\n') },
  '3': { subject: 'two things we would build for {{company}}', body: [
    'Hi {{first_name}},', '',
    'I took a few minutes on {{company}}. Two places AI usually pays off fastest for a business like yours:', '',
    '1. The repetitive inbox or intake work that eats your team\'s hours.',
    '2. The follow-up that quietly slips through the cracks and costs you deals.', '',
    'In a pilot we would pick the one with the clearest payback and build it. Want me to send a third idea specific to {{company}}, or just grab 20 minutes?'].join('\n') },
  '4': { subject: 'why the pilot is only $2,500', body: [
    'Hi {{first_name}},', '',
    'In case the price made you wonder where the catch is: there is none. The pilot is $2,500 because it is meant to be a low-risk way to see what it is like to work with us before any bigger commitment. We pick the one project most likely to pay off, build it, and measure the result. No retainer until you have seen it work, and the $2,500 credits forward if you continue.', '',
    'Reply with one line about your biggest time sink and I will tell you, honestly, whether a pilot makes sense for it.'].join('\n') },
  '5': { subject: 'pilot slots this cycle', body: [
    'Hi {{first_name}},', '',
    'A quick honest note: we only take a handful of new pilots at a time so each one gets real attention, and this cycle is filling up.', '',
    'If building your first AI win is something you want to move on in the next few weeks, let us talk before the slots are gone. If the timing is wrong, no problem, just let me know.'].join('\n') },
  '6': { subject: '20 minutes to map your first AI win?', body: [
    'Hi {{first_name}},', '',
    'Making this as easy as possible: a 20-minute call where we find the one workflow at {{company}} worth building first. No prep, no slides.', '',
    '{{calendar_line}}Or just reply with two or three times and I will send an invite.'].join('\n') },
  '7': { subject: 'should I close this out?', body: [
    'Hi {{first_name}},', '',
    'I do not want to crowd your inbox, so this is my last note for now. If the timing is off I will close this out and check back later in the year.', '',
    'If there is even one workflow at {{company}} you have wished AI could handle, reply with one line and I will tell you whether a pilot makes sense for it.', '',
    'Either way, thanks for the time.'].join('\n') },
};

function firstName(row) { return (row.first_name || (row.name || 'there').trim().split(/\s+/)[0]).trim(); }
function render(tpl, row) {
  const fn = firstName(row);
  const co = (row.company || 'your company').trim();
  const calLine = CALENDAR_LINK ? `Grab whatever time works here: ${CALENDAR_LINK}\n\n` : '';
  const fill = (s) => s.replace(/\{\{first_name\}\}/g, fn).replace(/\{\{company\}\}/g, co).replace(/\{\{calendar_line\}\}/g, calLine);
  const footer = `\n\nColaberry Inc. | You can opt out any time: reply STOP or "unsubscribe" and you are removed immediately.\n${ADDRESS || '[mailing address to be confirmed before send]'}`;
  return { sub: fill(tpl.subject), body: fill(tpl.body) + SIGNATURE + footer };
}
function hasDash(s) { return /[—–]/.test(s); }

function sendAtFor(i, n) {
  if (!SEND_DATE) return null;
  const [y, m, d] = SEND_DATE.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d, START_CT + CT_OFFSET, 0, 0);
  const windowMin = Math.max(0, END_CT - START_CT) * 60;
  const offsetMin = Math.round(i * (windowMin / Math.max(n - 1, 1)));
  const t = new Date(base + offsetMin * 60000);
  const p = (x) => String(x).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}
function newestLeadsFile() {
  if (process.env.LEADS_FILE) return process.env.LEADS_FILE;
  if (!fs.existsSync(OUT_DIR)) return null;
  const files = fs.readdirSync(OUT_DIR).filter((f) => /^ai-pilot-(leads|final)-.*\.json$/.test(f)).sort();
  return files.length ? path.join(OUT_DIR, files[files.length - 1]) : null;
}
function loadJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }
function writeSent(obj) { const tmp = SENT_LOG + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); fs.renameSync(tmp, SENT_LOG); } // atomic

(async () => {
  console.log(`MODE: ${SEND ? 'SEND (live)' : 'DRY-RUN (no email sent)'} | touch ${TOUCH} | cap ${LIMIT} | ${SEND_DATE ? `staggered ${SEND_DATE} ${START_CT}:00-${END_CT}:00 CT` : 'immediate'}`);
  const tpl = TEMPLATES[TOUCH];
  if (!tpl) { console.error(`FAILED: unknown TOUCH=${TOUCH} (use 1..7).`); process.exit(1); }
  if (TOUCH === '6' && !CALENDAR_LINK) console.warn('[warn] touch 6 with no CALENDAR_LINK — the calendar line is dropped.');

  const leadsFile = newestLeadsFile();
  if (!leadsFile || !fs.existsSync(leadsFile)) { console.error('FAILED: no leads file. Run the Apollo pull/finalizer first.'); process.exit(1); }
  const leads = loadJson(leadsFile, []).filter((r) => r.email && /@/.test(r.email));
  console.log(`[leads] ${leads.length} with email from ${leadsFile}`);

  const sent = loadJson(SENT_LOG, {});
  // Suppression = everyone who replied/opted-out + everyone bounced/complained.
  const optedOut = new Set([...loadJson(REPLIED_FILE, []), ...loadJson(SUPPRESS_FILE, [])].map((e) => String(e).toLowerCase()));
  console.log(`[suppression] ${optedOut.size} addresses on the opt-out/bounce list (will be skipped)`);

  if (SEND) {
    if (!process.env.MANDRILL_API_KEY) { console.error('FAILED: MANDRILL_API_KEY not set.'); process.exit(1); }
    if (!ADDRESS || !/\d/.test(ADDRESS)) { console.error('FAILED: set ADDRESS to a real physical mailing address (must contain a street/PO number) for CAN-SPAM.'); process.exit(1); }
  }
  const transporter = SEND ? nodemailer.createTransport({ host: 'smtp.mandrillapp.com', port: 587, secure: false, auth: { user: 'apikey', pass: process.env.MANDRILL_API_KEY } }) : null;

  const eligible = [];
  for (const row of leads) {
    if (eligible.length >= LIMIT) break;
    const email = row.email.trim().toLowerCase();
    if (optedOut.has(email)) continue;                                   // opted out or bounced -> never send
    if (sent[email] && sent[email][TOUCH]) continue;                     // already got this touch
    if (TOUCH !== '1' && !(sent[email] && sent[email]['1'])) continue;   // never send a follow-up to someone who never got touch 1
    eligible.push({ row, email });
  }
  console.log(`[eligible] ${eligible.length} recipients for touch ${TOUCH}`);

  let done = 0, blocked = 0;
  for (let i = 0; i < eligible.length; i++) {
    const { row, email } = eligible[i];
    const { sub, body } = render(tpl, row);
    if (hasDash(sub) || hasDash(body)) { console.warn(`[block] em/en dash for ${email}. skip.`); blocked++; continue; }
    const at = sendAtFor(i, eligible.length);

    if (!SEND) {
      if (i < 3) console.log(`\n--- ${email}${at ? ' @ ' + at + ' UTC' : ''} ---\nSubject: ${sub}\n${body}\n`);
      else console.log(`[would send] ${email} | ${sub}${at ? ' | ' + at + ' UTC' : ''}`);
      continue;
    }

    const headers = {
      'X-MC-Tags': 'ai-pilot-cold', 'X-MC-Subaccount': 'ai-pilot',
      'List-Unsubscribe': `<mailto:${FROM}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
    if (at) headers['X-MC-SendAt'] = at;
    // Idempotency: record intent BEFORE the network call so a crash between accept
    // and log-write cannot duplicate on re-run (favors no-double-send over re-send).
    sent[email] = sent[email] || {};
    sent[email][TOUCH] = new Date().toISOString();
    writeSent(sent);
    try {
      await transporter.sendMail({ from: `"Ali Muwwakkil" <${FROM}>`, to: row.email, subject: sub, text: body, headers });
      console.log(`[queued] ${email} | ${sub}${at ? ' | deliver ' + at + ' UTC' : ''}`);
      done++;
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      delete sent[email][TOUCH]; writeSent(sent);                        // clean failure -> roll back so a retry can resend
      console.error(`[error] ${email}: ${err.message}`);
    }
  }

  console.log(`\nDONE. ${SEND ? `queued=${done}` : `would_send=${eligible.length - blocked}`} dash_blocked=${blocked} suppressed_total=${optedOut.size} cap=${LIMIT}`);
  if (!SEND) console.log('Re-run with --send (ADDRESS set, SEND_DATE for staggering) to send for real. Run the opt-out/bounce inbox sweep before EVERY touch.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
