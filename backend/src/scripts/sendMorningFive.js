#!/usr/bin/env node
/**
 * Send the Morning Five email to Ali: the report as the body, plus one attachment,
 *   backlog-navigator-<date>.html  the interactive board, to slice the whole backlog
 * (the PDF of the report was dropped at Ali's request, 2026-11-12),
 * and record the send as a comment on its Basecamp ticket (sendWithBcAttach, house doctrine).
 *
 *   node backend/src/scripts/sendMorningFive.js --test        to Ali only, "[TEST]" subject, no lock
 *   node backend/src/scripts/sendMorningFive.js --dry-run     build everything, send nothing
 *   node backend/src/scripts/sendMorningFive.js               the daily send (once per Central day)
 *
 * Runs where the database lives (inside accelerator-backend). Both reports are built by their own
 * scripts as child processes, with args and no shell, so this file only assembles and sends.
 *
 * IDEMPOTENCY: the daily send writes a lock keyed on the Central date and refuses a second send
 * that day unless --force. --test never locks, so testing cannot consume the day's send.
 *
 * FAILURE MODES, all before anything is sent, so a failure never produces a partial email:
 *   - either report fails or times out (120s / 300s)  -> exit 1, nothing sent
 *   - the Basecamp preflight fails                     -> sendWithBcAttach throws before Mandrill
 * Not handled: Mandrill accepting the message and then bouncing it; that surfaces in Mandrill.
 * No retry: a failed morning send is re-run by hand, and the lock makes that safe.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const { centralDate, attachmentNames, subjectFor, textFor } = require(path.resolve(__dirname, './lib/aliTaskAgent/morningFiveEmail'));

const has = (k) => process.argv.includes(`--${k}`);
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const TEST = has('test');
const DRY = has('dry-run');
const FORCE = has('force');
const TICKET = arg('ticket', '10501226498');   // "Morning Five + Backlog Navigator: daily backlog report, test week"
const BUCKET = 7463955;                         // Ali Personal
const ROOT = path.resolve(__dirname, '../../..');
const log = (o) => console.log(JSON.stringify({ service: 'morning-five-send', ...o }));

function run(script, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [script, ...args], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, cwd: '/app' },
      (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr: String(stderr).slice(-600) })) : resolve(stdout)));
  });
}

(async () => {
  const t0 = Date.now();
  const now = new Date();
  const date = centralDate(now);
  const names = attachmentNames(date);
  const lock = path.join(os.tmpdir(), `morning-five-sent-${date}.lock`);
  if (!TEST && !DRY && !FORCE && fs.existsSync(lock)) {
    log({ level: 'info', event: 'skipped', outcome: 'success', reason: 'already sent today', lock });
    return;
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'morning-five-'));
  const f = (n) => path.join(work, n);
  await run(path.join(ROOT, 'scripts/ataMorningFive.js'), ['--out', f('mf.html'), '--json', f('mf.json'),
    '--board-note', `The full interactive board is attached as ${names.board}: open it in a browser to filter and slice everything.`], 120000);
  await run(path.join(ROOT, 'scripts/ataTriageBoard.js'), ['--out', f('board.html'), '--days', '60', '--limit', '3000'], 300000);
  const html = fs.readFileSync(f('mf.html'), 'utf8');
  const board = fs.readFileSync(f('board.html'));
  const summary = JSON.parse(fs.readFileSync(f('mf.json'), 'utf8'));
  const subject = subjectFor(summary, { test: TEST, now });

  if (DRY) {
    log({ level: 'info', event: 'dry_run', outcome: 'success', subject, bodyBytes: html.length,
      boardBytes: board.length, work, duration_ms: Date.now() - t0 });
    return;
  }

  const r = await sendWithBcAttach({
    ticketId: TICKET,
    bucketId: BUCKET,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    replyTo: 'ali@colaberry.com',
    subject,
    html,
    text: textFor(summary, names),
    attachments: [
      { filename: names.board, content: board, contentType: 'text/html' },
    ],
    bcSummary: `<p>${TEST ? '[TEST] ' : ''}Morning Five sent to Ali only. One move: ${String(((summary.items || []).find((i) => i.golden) || {}).title || 'none').replace(/[<>&]/g, '')}. `
      + `Attached: ${names.board}.</p>`,
  });
  if (!TEST) fs.writeFileSync(lock, `${new Date().toISOString()}\n${r.mandrillId}\n`);
  log({ level: 'info', event: 'sent', outcome: 'success', test: TEST, subject, mandrillId: r.mandrillId,
    commentUrl: r.commentUrl, boardBytes: board.length, duration_ms: Date.now() - t0 });
})().catch((e) => {
  log({ level: 'error', event: 'failed', outcome: 'failure', error_class: (e && e.name) || 'Error',
    message: e && e.message, stderr: e && e.stderr });
  process.exit(1);
});
