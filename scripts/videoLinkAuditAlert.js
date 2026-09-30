// Runs the curriculum video link audit inside the backend container and emails
// Ali when a student-facing video link goes dead (or when a known-dead one is
// fixed).
//
// Why a wrapper: backend/src/scripts/auditCurriculumVideoLinks.ts is read-only
// and reports via stdout + exit code. That is the right shape for a script, but
// an audit nobody reads catches nothing. This is the notification half, kept
// separate so the audit itself stays a pure diagnostic.
//
// Alerts on CHANGE, not on state. A dead link that is already known does not
// generate a fresh email every day, because a daily email about a thing you
// already decided not to fix is how people learn to filter the sender. The set
// of dead card ids is persisted; an email goes out only when a card enters or
// leaves that set.
//
// Run (host, via the cron env wrapper so MANDRILL_API_KEY is present):
//   scripts/cron-env-wrapper.sh /opt/colaberry-accelerator/scripts/videoLinkAuditAlert.js
// Flags: --dry-run (report, never send, never persist), --force (ignore state)
//
// Always exits 0. A cron job that exits non-zero mails root a stack trace, which
// is noise on top of an alerting system that already has a channel.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const STATE_DIR = process.env.VIDEO_AUDIT_STATE_DIR || '/var/lib/colaberry/video-link-audit';
const STATE_FILE = path.join(STATE_DIR, 'known-dead.json');
const CONTAINER = process.env.ACCELERATOR_BACKEND_CONTAINER || 'accelerator-backend';
const AUDIT_PATH = '/app/dist/scripts/auditCurriculumVideoLinks.js';
const EXEC_TIMEOUT_MS = 180000;
const RECIPIENT = process.env.VIDEO_AUDIT_RECIPIENT || 'ali@colaberry.com';

const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

function log(msg) {
  console.log(`[VideoLinkAlert] ${new Date().toISOString()} ${msg}`);
}

/**
 * Pure: decide whether this run is worth an email.
 *
 * Exported for tests. `cleared` matters as much as `appeared` - closing the loop
 * is what tells you the alert channel is honest rather than write-only.
 */
function decideAlert(previousIds, currentIds) {
  const prev = new Set(previousIds || []);
  const cur = new Set(currentIds || []);
  const appeared = [...cur].filter((id) => !prev.has(id)).sort();
  const cleared = [...prev].filter((id) => !cur.has(id)).sort();
  return { alert: appeared.length > 0 || cleared.length > 0, appeared, cleared };
}

function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.deadCardIds) ? parsed.deadCardIds : [];
  } catch (err) {
    // Missing or corrupt state means "nothing known dead yet". Treating a
    // corrupt file as empty re-alerts once, which is the safe direction.
    if (err.code !== 'ENOENT') log(`state unreadable (${err.code || err.name}), treating as empty`);
    return [];
  }
}

function writeState(deadCardIds) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ deadCardIds, updated_at: new Date().toISOString() }, null, 2));
  } catch (err) {
    // Losing the state file means the next run re-alerts. Annoying, not broken,
    // and certainly not worth failing the job over.
    log(`WARN could not persist state: ${err.message}`);
  }
}

function runAudit() {
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      ['exec', CONTAINER, 'node', AUDIT_PATH, '--json'],
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        // The audit exits 1 when it finds a student-facing dead link. That is a
        // successful run reporting bad news, not a failed run, so a non-zero
        // code with parseable stdout is not an error here.
        if (stdout && stdout.trim().startsWith('{')) {
          try {
            return resolve(JSON.parse(stdout));
          } catch (parseErr) {
            return reject(new Error(`audit returned unparseable JSON: ${parseErr.message}`));
          }
        }
        if (err) return reject(new Error(`audit could not run: ${err.message}${stderr ? ` | ${stderr.trim().slice(0, 300)}` : ''}`));
        return reject(new Error('audit produced no JSON on stdout'));
      },
    );
  });
}

function buildEmail(appeared, cleared, deadRows, checked) {
  const row = (r) => {
    const wk = r.week === null || r.week === undefined ? 'no week' : `Week ${r.week}`;
    return `<li style="margin-bottom:8px;"><b>${r.title}</b><br>${wk} &middot; ${r.bucket}/${r.type} &middot; channel: ${r.subtitle || 'unknown'}<br>video id <code>${r.video_id}</code> &middot; card <code>${r.id}</code></li>`;
  };

  const appearedRows = deadRows.filter((r) => appeared.includes(r.id));

  let html = '<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6;">';
  if (appearedRows.length) {
    html += `<p style="margin:0 0 14px 0;">${appearedRows.length === 1 ? 'A curriculum video has' : `${appearedRows.length} curriculum videos have`} gone dead. ${appearedRows.length === 1 ? 'A student who reaches this card' : 'Students who reach these cards'} will see an unplayable video, and because a dead video never reports watch time, the card cannot be completed and anything gated behind it stays locked.</p>`;
    html += `<ul style="margin:0 0 16px 0; padding-left:20px;">${appearedRows.map(row).join('')}</ul>`;
    html += '<p style="margin:0 0 14px 0;">Fix by replacing the video on the card. If the card is seeded (metadata.source is set), change the seed file instead, or the fix reverts on the next deploy.</p>';
  }
  if (cleared.length) {
    html += `<p style="margin:0 0 14px 0;">${cleared.length === 1 ? 'One previously dead video is' : `${cleared.length} previously dead videos are`} now resolving again. No action needed.</p>`;
  }
  html += `<p style="margin:0; color:#718096; font-size:13px;">Checked ${checked} video-bearing cards.</p></div>`;

  const text = [
    appearedRows.length ? `${appearedRows.length} curriculum video(s) went dead:` : '',
    ...appearedRows.map((r) => `  - ${r.title} (${r.week === null ? 'no week' : `Week ${r.week}`}, ${r.bucket}/${r.type}) video ${r.video_id} card ${r.id}`),
    cleared.length ? `${cleared.length} previously dead video(s) now resolve again.` : '',
    `Checked ${checked} video-bearing cards.`,
  ].filter(Boolean).join('\n');

  const subject = appearedRows.length
    ? `[Curriculum] ${appearedRows.length} dead video link${appearedRows.length === 1 ? '' : 's'} found`
    : '[Curriculum] Dead video links resolved';

  return { subject, html, text };
}

async function sendAlert(subject, html, text) {
  if (!process.env.MANDRILL_API_KEY) {
    log('WARN MANDRILL_API_KEY not set, skipping send');
    return false;
  }
  const nodemailer = require('/opt/colaberry-accelerator/node_modules/nodemailer');
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const info = await transport.sendMail({
    from: '"Colaberry Curriculum Watch" <ali@colaberry.com>',
    to: RECIPIENT,
    replyTo: 'ali@colaberry.com',
    subject,
    html,
    text,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  log(`alert sent to ${RECIPIENT} messageId=${info.messageId}`);
  return true;
}

async function main() {
  let result;
  try {
    result = await runAudit();
  } catch (err) {
    // Cannot audit is not the same as nothing is wrong. Say so loudly in the log
    // and leave state untouched so a later successful run still alerts.
    log(`ERROR ${err.message}`);
    return;
  }

  const deadRows = (result.results || []).filter((r) => r.state === 'DEAD' && r.visibility === 'published');
  const currentIds = deadRows.map((r) => r.id).sort();
  const previousIds = FORCE ? [] : readState();
  const { alert, appeared, cleared } = decideAlert(previousIds, currentIds);

  log(`checked=${result.checked} dead=${result.dead} student_facing=${currentIds.length} appeared=${appeared.length} cleared=${cleared.length}`);

  if (!alert) {
    log('no change since last run, not sending');
    return;
  }

  const { subject, html, text } = buildEmail(appeared, cleared, deadRows, result.checked);

  if (DRY) {
    log(`[dry-run] would send: ${subject}`);
    return;
  }

  try {
    await sendAlert(subject, html, text);
  } catch (err) {
    // Do not persist state if the notification failed, so the next run retries
    // rather than silently swallowing the only warning anyone would have seen.
    log(`ERROR send failed, state not advanced: ${err.message}`);
    return;
  }
  writeState(currentIds);
}

if (require.main === module) {
  main().catch((err) => {
    log(`ERROR unhandled: ${err.message}`);
    process.exit(0);
  });
}

module.exports = { decideAlert, buildEmail };
