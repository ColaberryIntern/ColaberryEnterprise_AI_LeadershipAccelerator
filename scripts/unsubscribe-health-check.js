#!/usr/bin/env node
/**
 * Unsubscribe pipeline watchdog.
 *
 * WHY: the primary opt-out path (Inbox COS scanner in inboxStateManager) runs as
 * in-process setInterval timers. If the backend restarts without re-registering
 * them, or the loop wedges, unsubscribe requests pile up in the inbox unprocessed
 * and the campaign keeps emailing people who asked to stop — a CAN-SPAM problem
 * that otherwise fails SILENTLY. This external watchdog detects that from the DB
 * (an outside observer the dying process cannot suppress) and emails Ali.
 *
 * WHAT IT CHECKS (read-only):
 *   1. Sync liveness  — seconds since inbox_emails.max(synced_at). Stale ⇒ scanner down.
 *   2. Opt-out backlog — leads (status <> 'unsubscribed') with an inbox email in the
 *      last 2h whose SUBJECT looks like an unsubscribe. >0 ⇒ requests not being honored.
 *
 * FAILURE MODEL: read-only; safe to run repeatedly (idempotent). Every external call
 * (docker/psql, SMTP) has an explicit timeout. On its own failure it alerts too, so a
 * dead watchdog is itself visible. Exit: 0 healthy, 1 unhealthy (alert sent), 2 error.
 *
 * DEPLOY (host cron, matches scripts/ops-engine/*): runs on the prod host where
 * `docker exec accelerator-db` is local. Example crontab (every 15 min):
 *   *\/15 * * * * /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh \
 *     /opt/colaberry-accelerator/scripts/unsubscribe-health-check.js
 * Env: MANDRILL_API_KEY (for alert). Optional overrides: UNSUB_STALE_SYNC_SECONDS
 * (default 1500), UNSUB_BACKLOG_HOURS (2), CB_DB_CONTAINER (accelerator-db),
 * CB_PSQL_USER (accelerator), CB_PSQL_DB (accelerator_prod), DRY_RUN=1 (skip email).
 */
const { execFileSync } = require('child_process');

const STALE_SYNC_SECONDS = parseInt(process.env.UNSUB_STALE_SYNC_SECONDS || '1500', 10); // 25 min
const BACKLOG_HOURS = parseInt(process.env.UNSUB_BACKLOG_HOURS || '2', 10);
const DB_CONTAINER = process.env.CB_DB_CONTAINER || 'accelerator-db';
const PSQL_USER = process.env.CB_PSQL_USER || 'accelerator';
const PSQL_DB = process.env.CB_PSQL_DB || 'accelerator_prod';
const DRY = process.env.DRY_RUN === '1' || process.argv.includes('--dry');

function log(level, event, context) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'unsubscribe-watchdog', event, ...context,
  }));
}

/** Run one SQL statement inside the DB container; return trimmed scalar text. */
function psqlScalar(sql) {
  const out = execFileSync(
    'docker',
    ['exec', DB_CONTAINER, 'psql', '-U', PSQL_USER, '-d', PSQL_DB, '-t', '-A', '-c', sql],
    { encoding: 'utf8', timeout: 20_000 },
  );
  return (out || '').trim();
}

async function sendAlert(subject, body) {
  if (DRY) { log('warn', 'alert_suppressed_dry_run', { subject }); return; }
  if (!process.env.MANDRILL_API_KEY) { log('error', 'alert_skipped_no_mandrill_key', { subject }); return; }
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 20_000,
  });
  const r = await transport.sendMail({
    from: '"Unsubscribe Watchdog" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    subject,
    text: body,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  log('info', 'alert_sent', { subject, message_id: r.messageId });
}

(async () => {
  let syncAgeSec = null;
  let backlog = null;
  try {
    const ageRaw = psqlScalar('SELECT COALESCE(EXTRACT(EPOCH FROM (now() - max(synced_at)))::int, 999999) FROM inbox_emails;');
    syncAgeSec = parseInt(ageRaw, 10);
    const backlogRaw = psqlScalar(
      "SELECT count(*) FROM inbox_emails e JOIN leads l ON lower(l.email)=lower(e.from_address) " +
      "WHERE l.status <> 'unsubscribed' AND e.subject ~* '^(re:\\s*)?unsubscribe' " +
      `AND e.synced_at > now() - interval '${BACKLOG_HOURS} hours';`,
    );
    backlog = parseInt(backlogRaw, 10);
  } catch (err) {
    // error_class: DbProbeError — could not read the DB (docker/psql failed or timed out).
    log('error', 'db_probe_failed', { error_class: 'DbProbeError', message: err.message });
    await sendAlert('[Unsubscribe Watchdog] PROBE FAILED — cannot read DB',
      `The unsubscribe watchdog could not query the database.\n\nError: ${err.message}\n\n` +
      `This means unsubscribe health is currently UNKNOWN. Check the backend/db containers on the prod host.`).catch(() => {});
    process.exit(2);
  }

  const flags = [];
  if (!Number.isFinite(syncAgeSec) || syncAgeSec > STALE_SYNC_SECONDS) {
    flags.push(`Inbox scanner stale: last sync ${syncAgeSec}s ago (threshold ${STALE_SYNC_SECONDS}s). The opt-out scanner may be down.`);
  }
  if (Number.isFinite(backlog) && backlog > 0) {
    flags.push(`${backlog} unsubscribe request(s) from active lead(s) in the last ${BACKLOG_HOURS}h are NOT yet marked unsubscribed. Opt-outs are not being honored.`);
  }

  if (flags.length === 0) {
    log('info', 'healthy', { outcome: 'success', sync_age_sec: syncAgeSec, backlog });
    process.exit(0);
  }

  log('warn', 'unhealthy', { outcome: 'failure', sync_age_sec: syncAgeSec, backlog, flags });
  await sendAlert(
    `[Unsubscribe Watchdog] ATTENTION — ${flags.length} issue(s)`,
    `The unsubscribe pipeline has ${flags.length} issue(s):\n\n` +
    flags.map((f, i) => `${i + 1}. ${f}`).join('\n\n') +
    `\n\nSync age: ${syncAgeSec}s | Backlog: ${backlog}\n\n` +
    `Runbook: confirm accelerator-backend is up and the Inbox COS timers are registered ` +
    `(startInboxScheduler), then verify opt-outs resume. Meanwhile, any queued campaign sends ` +
    `to unhonored opt-outs should be paused via the kill switch.`,
  ).catch((e) => log('error', 'alert_send_failed', { error_class: 'AlertSendError', message: e.message }));
  process.exit(1);
})();
