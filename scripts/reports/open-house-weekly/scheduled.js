#!/usr/bin/env node
/**
 * C124: cron entry for the Wednesday 08:00 CT Open House weekly email to Taiwo, Sohail and Ali.
 *
 * WHY THE SCHEDULE LIVES HERE: the VPS runs UTC with no CRON_TZ, so cron fires at both UTC hours that can be 08:00
 * Central (13:00 in CDT, 14:00 in CST) and this script decides. Same house pattern as sendInternDeliveryScheduled.js.
 *
 *   0 13,14 * * 3  /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh \
 *                  /opt/colaberry-accelerator/scripts/reports/open-house-weekly/scheduled.js >> /var/log/open-house-weekly.log 2>&1
 *
 * WHY IT RUNS THE CODE ON MAIN, NOT THE HOST TREE: the prod tree is only partly updated by deploys (registry mode), so
 * this file extracts the report, the decision ledger and the email kit fresh from origin/main into a work dir on every
 * run. A merged decision or playbook change is in the next Wednesday's email with no deploy step.
 *
 *   node scheduled.js                 # cron: sends only inside the Wed 08:00 CT slot, once
 *   node scheduled.js --force         # ignore slot and ledger (operator re-send)
 *   node scheduled.js --dry-run       # build everything, send nothing
 *   node scheduled.js --to a@x --force --ref origin/<branch>   # test send of a branch
 *
 * Failure modes: outside the slot (exit 0, quiet); already sent (exit 0); git fetch/archive fails, SQL fails or Mandrill
 * fails (exit 1, and a short alert email to Ali with a distinct subject so a missed Wednesday is never silent).
 * Idempotency: ledger key = recipients + "Wed YYYY-MM-DD 08:00 CT", in /var/lib/colaberry/open-house-weekly.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = '/opt/colaberry-accelerator';
const STATE = process.env.OPEN_HOUSE_WEEKLY_STATE_DIR || '/var/lib/colaberry/open-house-weekly';
const ZONE = 'America/Chicago';
const SLOT = { day: 3, hour: 8, minute: 0 };    // Wednesday 08:00 CT
const TOLERANCE_MIN = 20;
const PATHS = ['scripts/reports/open-house-weekly', 'scripts/audits/open-house-funnel', 'backend/src/scripts/lib'];

const argv = process.argv;
const arg = (f, d = null) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const log = (event, msg, extra = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'open-house-weekly', event, msg, ...extra }));

/** Wall-clock parts in Central time for a Date. */
function centralParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { day, ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** The occurrence key when `d` falls inside the slot window, else null. */
function matchSlot(d, slot = SLOT, tol = TOLERANCE_MIN) {
  const c = centralParts(d);
  const mins = c.hour * 60 + c.minute - (slot.hour * 60 + slot.minute);
  return c.day === slot.day && mins >= 0 && mins <= tol ? `Wed ${c.ymd} 08:00 CT` : null;
}

function sh(cmd, args, opts = {}) { return execFileSync(cmd, args, { encoding: 'utf8', timeout: 300000, ...opts }); }

async function alert(message) {
  try {
    if (!process.env.MANDRILL_API_KEY) return;
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({ host: 'smtp.mandrillapp.com', port: 587, auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY }, connectionTimeout: 20000, socketTimeout: 30000 });
    await t.sendMail({ from: '"Colaberry Reports" <ali@colaberry.com>', to: 'ali@colaberry.com', subject: 'ALERT: Open House weekly report did not send',
      text: `The Wednesday Open House weekly report failed and was not sent to Taiwo and Sohail.\n\n${message}\n\nLog: /var/log/open-house-weekly.log\nRe-send after fixing: node ${REPO}/scripts/reports/open-house-weekly/scheduled.js --force`,
      headers: { 'X-MC-Track': 'none' } });
  } catch (e) { log('alert_failed', e.message, { level: 'error', error_class: 'UpstreamUnavailable' }); }
}

async function main() {
  const force = argv.includes('--force');
  const key = force ? `manual ${new Date().toISOString().slice(0, 16)}` : matchSlot(new Date());
  if (!key) return;                                   // outside the slot: quiet, every other cron tick
  const ref = arg('--ref', 'origin/main');
  const ymd = centralParts(new Date()).ymd;
  const work = path.join(STATE, `work-${Date.now()}`);
  fs.mkdirSync(path.join(STATE, 'snapshots'), { recursive: true });
  try {
    log('start', `slot ${key}, code from ${ref}`);
    sh('git', ['-C', REPO, 'fetch', '-q', 'origin', ref.replace(/^origin\//, '')]);
    fs.mkdirSync(work, { recursive: true });
    const tar = path.join(work, 'code.tar');
    sh('git', ['-C', REPO, 'archive', '-o', tar, ref.startsWith('origin/') ? `refs/remotes/${ref}` : ref, ...PATHS]);
    sh('tar', ['-xf', tar, '-C', work]);
    const dir = path.join(work, 'scripts', 'reports', 'open-house-weekly');
    sh('bash', [path.join(dir, 'run.sh')], { cwd: work, stdio: ['ignore', 'inherit', 'inherit'] });
    const snap = path.join(STATE, 'snapshots', `${ymd}.json`);
    fs.copyFileSync('/tmp/open-house-weekly/snapshot.json', snap);
    const args = [path.join(dir, 'sendWeekly.js'), '--snapshot', snap, '--out-dir', path.join(STATE, 'out', ymd),
      '--key', key, '--ledger', path.join(STATE, 'sent-ledger.json')];
    if (arg('--to')) args.push('--to', arg('--to'));
    if (force) args.push('--force');
    if (argv.includes('--dry-run')) args.push('--dry-run');
    sh(process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, NODE_PATH: path.join(REPO, 'node_modules') } });
    log('done', `slot ${key} complete`);
  } catch (e) {
    log('failed', e.message.slice(0, 500), { level: 'error', error_class: e.error_class || 'JobFailed' });
    if (!argv.includes('--dry-run')) await alert(e.message.slice(0, 1500));
    process.exitCode = 1;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (require.main === module) main();
module.exports = { matchSlot, centralParts, SLOT, TOLERANCE_MIN };
