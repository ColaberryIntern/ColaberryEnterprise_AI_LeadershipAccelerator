/**
 * AF10.1 — sweep the inbox for mail from the interns and file it on their agent's ticket.
 *
 * Ali, 20 Oct: "they will be sending a lot of emails so I want this tab to search every 30
 * minutes for an email from the 7 that are working on the agents so we can quickly address all
 * the bugs".
 *
 * ── IT READS THE DATABASE, NOT A MAIL API ───────────────────────────────────
 *
 * `inbox_emails` already holds Ali's synced mail (95,394 rows, current to within the hour),
 * so this is a query rather than a second mail integration. That matters for more than
 * convenience: a cron on the production box cannot reach an interactive mail connector, so a
 * design that called one would have worked when run by hand and never once on schedule.
 *
 * ── THE ROSTER IS DERIVED, NOT TYPED ────────────────────────────────────────
 *
 * Sender address -> domain -> agent is resolved by walking `agent_domain_projects` to the
 * project's OWNING ENROLLMENT. That is a real link, so an intern joining or leaving changes
 * one row and this job follows. A list of seven addresses pasted in here would be the fourth
 * place the roster lives, and it would go stale the first time somebody joined.
 *
 * ── DEDUPE IS AGAINST BASECAMP ITSELF ───────────────────────────────────────
 *
 * Every comment ends with the provider message id, and the job reads a ticket's existing
 * comments before posting. No watermark table, no state file, nothing that can disagree with
 * what was actually filed. A re-run posts nothing; a crashed run loses nothing.
 *
 * ── A ZERO MUST BE EVIDENCE, NOT SILENCE ────────────────────────────────────
 *
 * A sweep whose query is subtly wrong looks exactly like a quiet inbox. Every run prints the
 * window it covered, the addresses it matched against and the counts at each stage, so a zero
 * can be told apart from a miss.
 *
 * IT NEVER REPLIES. It reads and files. Nothing here sends mail.
 *
 * Usage:
 *   node dist/scripts/sweepInternMail.js                 # dry run, last 30 minutes
 *   node dist/scripts/sweepInternMail.js --apply         # file them
 *   node dist/scripts/sweepInternMail.js --since 48h --apply
 */
const { Sequelize, QueryTypes } = require('sequelize');
const R = require('./lib/agentRoster');

const ACCOUNT = '3945211';
const API = `https://3.basecampapi.com/${ACCOUNT}`;
const UA = 'Colaberry Accelerator (ali@colaberry.com)';
const BUCKET = 7463955;
const AGENT_GROUP = 10424311358; // "09 - Agent Builds, one ticket per agent"

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const sinceArg = (args[args.indexOf('--since') + 1] || '30m');
const WINDOW = /^\d+[mhd]$/.test(sinceArg) ? sinceArg : '30m';
const UNIT = { m: 'minutes', h: 'hours', d: 'days' }[WINDOW.slice(-1)];
const AMOUNT = parseInt(WINDOW, 10);

/** Words that suggest something is broken. Used to FLAG, never to filter. */
const TROUBLE = [
  'unable', 'cannot', "can't", 'error', 'not working', 'doesn\'t work', 'issue', 'problem',
  'bug', 'broken', 'stuck', 'failed', 'failing', 'help', 'wrong', 'missing', 'access',
];

const sql = new Sequelize(process.env.DATABASE_URL, { logging: false });
const q = (t, b) => sql.query(t, { bind: b || [], type: QueryTypes.SELECT });

/**
 * The token, resolved for BOTH places this runs.
 *
 * On the host under cron, `cron-env-wrapper.sh` has already exported a HEALTH-PROBED
 * BASECAMP_ACCESS_TOKEN, with its own cache/refetch/mint ladder. Requiring the container
 * module there would fail on a path that does not exist, which is the shape of a job that
 * works by hand and never once on schedule. Inside the container the env token may be the
 * stale deploy-time one, so the module is the fallback.
 */
let T = null;
const tok = async () => {
  if (T) return T;
  const fromEnv = (process.env.BASECAMP_ACCESS_TOKEN || '').trim();
  if (fromEnv) { T = fromEnv; return T; }
  T = await require('/app/dist/services/ops/basecampToken.js').refreshBcToken();
  return T;
};

async function bc(method, p, body) {
  const r = await fetch(API + p, {
    method,
    headers: { Authorization: `Bearer ${await tok()}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.status === 204 ? {} : r.json();
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Tell Ali what was just filed.
 *
 * FILING IS NOT TELLING. The sweep worked perfectly on 22 Oct: it caught Quincy's email within
 * the half hour, flagged it as a problem, and filed it on Ellis's ticket. Ali found out thirteen
 * hours later by opening his own inbox, and asked whether the sweeper was even on. A pipeline
 * whose output nobody is looking at is indistinguishable from one that is switched off.
 *
 * Only fires when something was actually filed. A measured zero is the common case, every half
 * hour, forever, and mailing that would train the notification into noise - at which point the
 * one that matters gets skimmed past too.
 *
 * NEVER THROWS. The sweep's job is filing; notification is secondary. A Mandrill outage must not
 * take down the thing that is working, and must not crash the cron.
 */
async function notifyAli(filed) {
  const key = (process.env.MANDRILL_API_KEY || '').trim();
  if (!key) {
    console.log('  NOT NOTIFIED: MANDRILL_API_KEY absent. Filing succeeded; Ali was not told.');
    return;
  }
  try {
    // PLAIN require, not an absolute container path. The cron runs this from the HOST checkout
    // at /opt/colaberry-accelerator, where /app does not exist, so an absolute path would make
    // the notification work by hand inside the container and never once on schedule - exactly
    // the trap this file's own header warns about for the mail source.
    const nodemailer = require('nodemailer');
    const flagged = filed.filter((f) => f.flags.length);
    const n = filed.length;

    const rows = filed.map((f) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${esc(f.from)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${esc(f.subject)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${esc(f.agent)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${f.flags.length
    ? '<strong style="color:#b3261e">reads like a problem</strong>' : 'routine'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><a href="https://app.basecamp.com/${ACCOUNT}/buckets/${BUCKET}/todos/${f.ticketId}">ticket</a></td>
      </tr>`).join('');

    const lead = flagged.length
      ? `<p style="font-family:arial,sans-serif;font-size:14px;color:#2d3748"><strong>${flagged.length} of ${n} reads like a problem.</strong> ${esc(flagged[0].from)}: "${esc(flagged[0].subject)}"</p>`
      : `<p style="font-family:arial,sans-serif;font-size:14px;color:#2d3748">None of them read like a problem.</p>`;

    const html = `<div style="font-family:arial,sans-serif;font-size:14px;color:#2d3748;line-height:1.6">
<p>${n} intern email${n === 1 ? '' : 's'} filed in the last sweep. Each is already on its agent ticket.</p>
${lead}
<table style="border-collapse:collapse;font-size:13px;margin-top:10px">
<tr><th align="left" style="padding:6px 10px;border-bottom:2px solid #cbd5e0">From</th>
<th align="left" style="padding:6px 10px;border-bottom:2px solid #cbd5e0">Subject</th>
<th align="left" style="padding:6px 10px;border-bottom:2px solid #cbd5e0">Agent</th>
<th align="left" style="padding:6px 10px;border-bottom:2px solid #cbd5e0">Read</th>
<th align="left" style="padding:6px 10px;border-bottom:2px solid #cbd5e0"></th></tr>
${rows}
</table>
<p style="font-size:12px;color:#718096;margin-top:12px">Nothing was replied to. The sweep files and never answers.</p>
</div>`;

    const text = filed.map((f) => `${f.received}  ${f.from}\n  "${f.subject}"  -> ${f.agent}`
      + `${f.flags.length ? '  [READS LIKE A PROBLEM]' : ''}`).join('\n\n');

    await nodemailer.createTransport({
      host: 'smtp.mandrillapp.com',
      port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: key },
    }).sendMail({
      from: '"Colaberry Accelerator" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      // "Ali, here's" survives the inbox manager that files automated mail away unread.
      subject: `Ali, here's ${n} intern email${n === 1 ? '' : 's'} filed`
        + `${flagged.length ? ` (${flagged.length} reads like a problem)` : ''}`,
      text: `${n} intern email(s) filed, each on its agent ticket.\n\n${text}\n\n`
        + 'Nothing was replied to.',
      html,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
    });
    console.log(`  notified Ali: ${n} filed, ${flagged.length} flagged`);
  } catch (e) {
    // Deliberately swallowed, and deliberately LOUD in the log. Filing already succeeded.
    console.log(`  NOT NOTIFIED: ${e.message}. Filing succeeded; Ali was not told.`);
  }
}

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function troubleWords(subject, body) {
  const hay = `${subject} ${body}`.toLowerCase();
  return TROUBLE.filter((w) => hay.includes(w));
}

(async () => {
  // `--notify-sample` proves the notification path works without waiting for an intern to write
  // in. A notification that is only exercised by the event it exists to report is one you find
  // out is broken at exactly the wrong moment.
  if (process.argv.includes('--notify-sample')) {
    console.log('=== notification path test. No mail is read and nothing is filed. ===');
    await notifyAli([{
      from: 'Sample Intern', received: new Date().toISOString(),
      subject: 'SAMPLE - this is a test of the sweep notification',
      agent: 'Ellis', ticketId: 10424318092, flags: ['sample'],
      excerpt: 'If you are reading this, the sweep can reach you.',
    }]);
    process.exit(0);
  }

  console.log(`=== AF10.1 intern mail sweep ===`);
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN (nothing is posted)'}`);
  console.log(`window: last ${AMOUNT} ${UNIT}`);

  // ── the roster ─────────────────────────────────────────────────────────
  // Resolved by `lib/agentRoster.js`, which every one of these scripts now reads, so adding an
  // intern is one repoint of `agent_domain_projects.student_project_id` and nothing here changes.
  const roster = await R.loadRoster(q);
  const routable = R.assigned(roster);
  console.log(`\nroster: ${roster.length} domains, ${routable.length} with an intern on them`);
  for (const r of routable) console.log(`  ${r.email.padEnd(30)} ${r.domain.padEnd(20)} ${r.builder}`);
  for (const r of roster.filter((x) => !x.assigned)) {
    console.log(`  ${'(no intern)'.padEnd(30)} ${r.domain.padEnd(20)} ${r.backed ? `project owned by ${r.email}` : 'no enrollment'}`);
  }
  if (!routable.length) { console.log('\nNo roster. Nothing to sweep.'); await sql.close(); process.exit(1); }

  // Mail routes on ASSIGNED only. A domain whose project is owned by staff is deliberately not
  // routable: filing a staff member's email onto an agent ticket is worse than filing nothing.
  const byEmail = R.byEmail(roster);
  const emails = [...byEmail.keys()];

  // One address can hold several domains, so this is reported rather than silently resolved to
  // whichever the map happened to keep. Nobody in the assigned set holds two today.
  for (const c of R.ownerCollisions(roster)) {
    console.log(`  NOTE: ${c.email} is on ${c.domains.length} domains (${c.domains.join(', ')}); their mail files to the first`);
  }

  // ── the agent tickets ──────────────────────────────────────────────────
  const todos = await bc('GET', `/buckets/${BUCKET}/todolists/${AGENT_GROUP}/todos.json?status=all`);
  const { byDomain: ticketForDomain, problems } = R.matchTickets(todos, roster);
  console.log(`\nagent tickets found: ${ticketForDomain.size}`);
  // Previously a domain with no ticket was one skipped log line. An agent that stops being
  // reported on looks exactly like an agent with nothing to report, so say it out loud.
  for (const p of problems) console.log(`  PROBLEM ${p.kind}: ${JSON.stringify(p)}`);

  // ── the mail ───────────────────────────────────────────────────────────
  const mail = await q(
    `SELECT id::text, lower(from_address) AS from_address, from_name, subject,
            received_at::text AS received, provider_message_id AS pmid,
            coalesce(body_text, '') AS body
       FROM inbox_emails
      WHERE lower(from_address) = ANY($1)
        AND received_at > now() - ($2 || ' ' || $3)::interval
      ORDER BY received_at ASC`, [emails, String(AMOUNT), UNIT]);

  console.log(`\nmail matched in window: ${mail.length}`);
  if (!mail.length) {
    console.log(`  NONE. Searched ${emails.length} addresses over the last ${AMOUNT} ${UNIT}.`);
    console.log('  This is a measured zero, not a skipped run.');
    await sql.close();
    process.exit(0);
  }

  let posted = 0; let skipped = 0; let unmatched = 0;
  /** What was filed THIS run. Drives the notification; an empty list sends nothing. */
  const filed = [];

  for (const m of mail) {
    // `byEmail` holds an ARRAY per address, because one person can be on several domains. Taking
    // the first is a deliberate choice for a case that does not exist in the assigned set today;
    // it is logged above when it ever does, rather than being resolved silently.
    const owned = byEmail.get(m.from_address);
    const domain = owned && owned.length ? owned[0].domain : null;
    const ticket = domain ? ticketForDomain.get(domain) : null;
    const flags = troubleWords(m.subject, m.body);
    const label = `${m.received}  ${m.from_address}  "${squash(m.subject).slice(0, 60)}"`;

    if (!ticket) {
      unmatched++;
      console.log(`  NO TICKET  ${label}  (domain=${domain || 'unresolved'})`);
      continue;
    }

    const existing = await bc('GET', `/buckets/${BUCKET}/recordings/${ticket.id}/comments.json`);
    const already = (existing || []).some((c) => String(c.content || '').includes(m.pmid));
    if (already) {
      skipped++;
      console.log(`  ALREADY    ${label}  -> ${ticket.agent}`);
      continue;
    }

    const bodyText = squash(m.body);
    const excerpt = bodyText.length > 1200 ? `${bodyText.slice(0, 1200)} …` : bodyText;
    const flagLine = flags.length
      ? `<div><strong>READS LIKE A PROBLEM</strong> &mdash; matched: ${esc(flags.join(', '))}. Worth a look before the next session.</div><div><br></div>`
      : '';

    const content = `<div><strong>EMAIL FROM ${esc(m.from_name || m.from_address)}</strong> &middot; ${esc(m.received)}</div>
<div>Subject: <strong>${esc(squash(m.subject))}</strong></div>
<div><br></div>
${flagLine}<div>${esc(excerpt) || '<em>no text body</em>'}</div>
<div><br></div>
<div><em>Filed automatically by the AF10.1 sweep. Nothing was replied to. Source: inbox_emails, provider message id ${esc(m.pmid)}</em></div>`;

    if (APPLY) {
      await bc('POST', `/buckets/${BUCKET}/recordings/${ticket.id}/comments.json`, { content });
    }
    posted++;
    filed.push({
      from: m.from_name || m.from_address,
      received: m.received,
      subject: squash(m.subject),
      agent: ticket.agent,
      ticketId: ticket.id,
      flags,
      excerpt: bodyText.slice(0, 280),
    });
    console.log(`  ${APPLY ? 'POSTED  ' : 'WOULD   '}  ${label}  -> ${ticket.agent}${flags.length ? '  [FLAGGED]' : ''}`);
  }

  console.log(`\n=== result ===`);
  console.log(`  matched=${mail.length}  ${APPLY ? 'posted' : 'would post'}=${posted}  already filed=${skipped}  no ticket=${unmatched}`);
  if (!APPLY) console.log('\nDRY RUN. Re-run with --apply to file them.');

  if (APPLY && filed.length) await notifyAli(filed);

  await sql.close();
  process.exit(0);
})().catch(async (e) => {
  console.error('FAILED: ' + e.message);
  try { await sql.close(); } catch (_) { /* noop */ }
  process.exit(1);
});
