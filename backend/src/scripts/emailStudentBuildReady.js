/**
 * Mail every student whose build the audit calls READY: your project is set up,
 * here is the one thing to do next.
 *
 * Consumes auditStudentBuilds.js --json (or re-runs the audit itself), refuses
 * to mail anyone the audit did not clear, and dedups per (recipient, project) so
 * a re-run cannot send twice. Sends through the same Mandrill SMTP path every
 * other send script in this folder uses.
 *
 * DRY RUN BY DEFAULT. Nothing leaves the building without --send. A dry run
 * prints exactly who would be mailed and the full rendered body, and writes
 * nothing at all, not even the ledger table.
 *
 * Run:  node backend/src/scripts/emailStudentBuildReady.js [--audit audit.json] [--cohort "July 2026"]
 *       node backend/src/scripts/emailStudentBuildReady.js --send            # actually sends
 *
 * Flags:
 *   --audit <path>   read a saved `auditStudentBuilds.js --json` file instead of re-querying
 *   --cohort <id|name fragment>   scope, when re-running the audit itself
 *   --send           required to send. Without it this is a dry run.
 *   --only <email>   restrict to one recipient, for a careful first send
 *
 * Output: dry-run report or send log to stdout. With --send, writes rows to
 * student_build_ready_sends and nothing else.
 */

const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { Client } = require('pg');

try { require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); } catch (_) { /* container has real env */ }

const { runAudit } = require('./lib/studentBuildAudit');
const { deriveVerdict } = require('./lib/studentBuildVerdict');
const { renderStudentBuildReadyEmail, SUBJECT } = require('./lib/renderStudentBuildReadyEmail');
const { validateBeforeSend } = require('./lib/mandrillPreflight');

// The business event this dedup is keyed on. Bump it only to deliberately
// re-mail everyone; the ledger's unique index is on (recipient, project, event).
const BUSINESS_EVENT = 'student_build_ready_v1';
const FROM = '"Ali Muwwakkil" <ali@colaberry.com>';

function flag(name) { return process.argv.includes(`--${name}`); }
function value(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
}

const doSend = flag('send');
const auditPath = value('audit');
const onlyEmail = (value('only') || '').toLowerCase() || null;


// ------------------------------------------------------------ the send ledger

// (recipient, project, business event) is the idempotency key, enforced by a
// unique index rather than by a SELECT-then-INSERT, because two operators
// running this at once must not both win the race.
//
// Claim then commit: the row is inserted as 'claimed' BEFORE the SMTP call and
// upgraded to 'sent' after. A crash in between leaves a claim, and a claim
// blocks the recipient exactly as firmly as a completed send. That is
// deliberate. On an ambiguous outcome we would rather skip a student than mail
// them twice, and recovery is a human looking at the sent folder.
const LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS student_build_ready_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email VARCHAR(255) NOT NULL,
  project_id UUID,
  enrollment_id UUID,
  business_event VARCHAR(80) NOT NULL,
  subject VARCHAR(300) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'claimed',
  message_id TEXT,
  error TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
)`;
const LEDGER_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS student_build_ready_sends_unique
  ON student_build_ready_sends (lower(recipient_email), project_id, business_event)`;

async function ledgerExists(db) {
  const { rows } = await db.query(`SELECT to_regclass('public.student_build_ready_sends') AS t`);
  return !!rows[0].t;
}

async function ensureLedger(db) {
  await db.query(LEDGER_DDL);
  await db.query(LEDGER_INDEX);
}

async function alreadyHandled(db, row) {
  const { rows } = await db.query(
    `SELECT status, sent_at FROM student_build_ready_sends
      WHERE lower(recipient_email) = lower($1) AND project_id = $2 AND business_event = $3`,
    [row.email, row.projectId, BUSINESS_EVENT],
  );
  return rows[0] || null;
}

/** @returns {boolean} true when this run won the claim and may send. */
async function claim(db, row) {
  const { rowCount } = await db.query(
    `INSERT INTO student_build_ready_sends (recipient_email, project_id, enrollment_id, business_event, subject)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [row.email, row.projectId, row.enrollmentId, BUSINESS_EVENT, SUBJECT],
  );
  return rowCount === 1;
}

async function commit(db, row, messageId) {
  await db.query(
    `UPDATE student_build_ready_sends SET status = 'sent', sent_at = NOW(), message_id = $4
      WHERE lower(recipient_email) = lower($1) AND project_id = $2 AND business_event = $3`,
    [row.email, row.projectId, BUSINESS_EVENT, messageId || null],
  );
}

// Only called when the transport itself threw, which means the mail never left.
// A timeout after handoff is NOT this case and must keep its claim.
async function release(db, row, err) {
  await db.query(
    `DELETE FROM student_build_ready_sends
      WHERE lower(recipient_email) = lower($1) AND project_id = $2 AND business_event = $3 AND status = 'claimed'`,
    [row.email, row.projectId, BUSINESS_EVENT],
  );
  console.error(`  released claim for ${row.email}: ${err.message}`);
}

// ------------------------------------------------------------------- the run

async function loadRows() {
  if (auditPath) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(auditPath), 'utf8'));
    if (!raw || !Array.isArray(raw.rows)) {
      const e = new Error(`${auditPath} is not an auditStudentBuilds --json file (no rows array)`);
      e.error_class = 'ValidationError';
      throw e;
    }
    return { rows: raw.rows, source: `audit file ${auditPath} generated ${raw.generatedAt}` };
  }
  const result = await runAudit({ cohort: value('cohort') });
  return { rows: result.rows, source: `live audit of ${result.summary.enrollments} active enrollment(s)` };
}

/**
 * Re-derive the verdict from the row's own facts rather than trusting the
 * verdict string on it. A hand-edited audit file, or a stale one from before a
 * rule changed, must not be able to talk this script into mailing someone whose
 * build is not actually ready.
 */
function isReady(row) {
  const v = deriveVerdict({
    hasProject: !!row.projectId,
    intakeStatus: row.intakeStatus,
    planStatus: row.planStatus,
    planGateOk: row.planGateOk,
    gateViolationRules: row.gateViolationRules,
    hasPublishedPlan: row.hasPublishedPlan,
    taskCount: row.taskCount,
    hasStory000: row.hasStory000,
    datedTaskCount: row.datedTaskCount,
    isActiveProject: row.isActiveProject,
    cohortStartDate: row.cohortStartDate,
  });
  return { ready: v.verdict === 'READY', reason: v.reason, claimed: row.verdict };
}

async function main() {
  const { rows, source } = await loadRows();

  const candidates = [];
  const refused = [];
  for (const row of rows) {
    if (onlyEmail && String(row.email || '').toLowerCase() !== onlyEmail) continue;
    const check = isReady(row);
    if (!check.ready) {
      // Only worth reporting when the audit disagreed with us; the other 300
      // NOT_READY rows are not news.
      if (check.claimed === 'READY') refused.push({ row, reason: check.reason });
      continue;
    }
    if (!row.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) {
      refused.push({ row, reason: `unusable email address "${row.email}"` });
      continue;
    }
    candidates.push(row);
  }

  console.log('');
  console.log(`emailStudentBuildReady  ${new Date().toISOString()}`);
  console.log(`Source: ${source}`);
  console.log(`Mode:   ${doSend ? 'SEND (live)' : 'DRY RUN (no mail, no writes)'}`);
  console.log('');

  for (const r of refused) {
    console.log(`REFUSED  ${r.row.email}: ${r.reason}`);
  }
  if (refused.length) console.log('');

  if (!candidates.length) {
    console.log('No READY students. Nothing to send.');
    return;
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 30000 });
  await db.connect();
  try {
    // A dry run must not create the ledger table. When it does not exist yet,
    // nothing has ever been sent, so every candidate is a would-send.
    const haveLedger = doSend ? (await ensureLedger(db), true) : await ledgerExists(db);

    const plan = [];
    for (const row of candidates) {
      const prior = haveLedger ? await alreadyHandled(db, row) : null;
      plan.push({ row, prior, email: renderStudentBuildReadyEmail(row) });
    }

    // Style gate before anything is sent or even shown as final copy. Failing
    // here is a build defect, not a runtime condition, so it stops the run.
    for (const p of plan) validateBeforeSend(p.email.html, p.email.text);

    const toSend = plan.filter((p) => !p.prior);
    const skipped = plan.filter((p) => p.prior);

    for (const p of skipped) {
      console.log(`SKIP     ${p.row.email} (project ${p.row.projectId}): already ${p.prior.status}${p.prior.sent_at ? ` at ${p.prior.sent_at.toISOString()}` : ''}`);
    }
    if (skipped.length) console.log('');

    if (!doSend) {
      console.log(`WOULD MAIL ${toSend.length} student(s):`);
      console.log('');
      for (const p of toSend) {
        console.log(`  ${p.row.email}  (${p.row.fullName || 'no name'})`);
        console.log(`    project : ${p.row.projectName || '(unnamed)'}  ${p.row.projectId}`);
        console.log(`    cohort  : ${p.row.cohortName || 'none'}`);
        console.log(`    tasks   : ${p.row.datedTaskCount}/${p.row.taskCount} dated, STORY-000 present`);
        console.log('');
      }
      if (toSend.length) {
        console.log('-'.repeat(78));
        console.log(`RENDERED BODY (as ${toSend[0].row.email} would receive it)`);
        console.log('-'.repeat(78));
        console.log(`From:    ${FROM}`);
        console.log(`To:      ${toSend[0].row.email}`);
        console.log(`Subject: ${toSend[0].email.subject}`);
        console.log('');
        console.log(toSend[0].email.text);
        console.log('-'.repeat(78));
      }
      console.log('');
      console.log('Dry run. Nothing was sent and nothing was written. Re-run with --send to mail these.');
      return;
    }

    if (!process.env.MANDRILL_API_KEY) {
      const e = new Error('MANDRILL_API_KEY is not set. Refusing to attempt a send.');
      e.error_class = 'ConfigError';
      throw e;
    }
    const transport = nodemailer.createTransport({
      host: 'smtp.mandrillapp.com',
      port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 30000,
    });

    let sent = 0;
    for (const p of toSend) {
      const won = await claim(db, p.row);
      if (!won) {
        console.log(`SKIP     ${p.row.email}: another run claimed this recipient first`);
        continue;
      }
      try {
        const info = await transport.sendMail({
          from: FROM,
          to: p.row.email,
          bcc: 'ali@colaberry.com',
          subject: p.email.subject,
          text: p.email.text,
          html: p.email.html,
          headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
        });
        await commit(db, p.row, info.messageId);
        sent += 1;
        console.log(`SENT     ${p.row.email}  ${info.messageId}`);
      } catch (err) {
        await release(db, p.row, err);
      }
    }
    console.log('');
    console.log(`Sent ${sent} of ${toSend.length} candidate(s).`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(`[emailStudentBuildReady] ${e.error_class || 'Error'}: ${e.message}`);
  process.exit(1);
});
