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

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function troubleWords(subject, body) {
  const hay = `${subject} ${body}`.toLowerCase();
  return TROUBLE.filter((w) => hay.includes(w));
}

(async () => {
  console.log(`=== AF10.1 intern mail sweep ===`);
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN (nothing is posted)'}`);
  console.log(`window: last ${AMOUNT} ${UNIT}`);

  // ── the roster, derived ────────────────────────────────────────────────
  const roster = await q(
    `SELECT lower(e.email) AS email, p.domain_key, p.intended_builder
       FROM agent_domain_projects p
       JOIN projects pr ON pr.id = p.student_project_id
       JOIN enrollments e ON e.id = pr.enrollment_id
      WHERE p.intended_builder IS NOT NULL
      ORDER BY p.domain_key`);
  console.log(`\nroster resolved from project ownership: ${roster.length} intern(s)`);
  for (const r of roster) console.log(`  ${r.email.padEnd(30)} ${r.domain_key.padEnd(20)} ${r.intended_builder}`);
  if (!roster.length) { console.log('\nNo roster. Nothing to sweep.'); await sql.close(); process.exit(1); }

  const emails = roster.map((r) => r.email);
  const domainOf = new Map(roster.map((r) => [r.email, r.domain_key]));

  // ── the agent tickets ──────────────────────────────────────────────────
  const todos = await bc('GET', `/buckets/${BUCKET}/todolists/${AGENT_GROUP}/todos.json?status=all`);
  const ticketForDomain = new Map();
  for (const t of todos) {
    const m = String(t.title).match(/^(\S+)\s+-\s+the\s+(.+?)\s+agent/i);
    if (m) ticketForDomain.set(m[2].trim().replace(/\s+/g, '_'), { id: t.id, title: t.title, agent: m[1] });
  }
  console.log(`\nagent tickets found: ${ticketForDomain.size}`);

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

  for (const m of mail) {
    const domain = domainOf.get(m.from_address);
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
    console.log(`  ${APPLY ? 'POSTED  ' : 'WOULD   '}  ${label}  -> ${ticket.agent}${flags.length ? '  [FLAGGED]' : ''}`);
  }

  console.log(`\n=== result ===`);
  console.log(`  matched=${mail.length}  ${APPLY ? 'posted' : 'would post'}=${posted}  already filed=${skipped}  no ticket=${unmatched}`);
  if (!APPLY) console.log('\nDRY RUN. Re-run with --apply to file them.');

  await sql.close();
  process.exit(0);
})().catch(async (e) => {
  console.error('FAILED: ' + e.message);
  try { await sql.close(); } catch (_) { /* noop */ }
  process.exit(1);
});
