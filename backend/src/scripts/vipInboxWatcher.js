#!/usr/bin/env node
// A1.6 — VIP Inbox Watcher.
//
// Polls `inbox_emails` for new rows since last tick. For each new email,
// calls routeInboundEmail() from vipSmsRouter. The existing Inbox COS sync
// (running every 60s) writes to that table; we just react to new entries.
//
// State: tmp/ops-engine/vip-watcher-state.json — tracks last-seen received_at
//   so we don't re-process the same email.
//
// Cron: */2 * * * * (every 2 min; inbox sync runs every 1 min so we follow it).

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { routeInboundEmail, readMode } = require(path.resolve(__dirname, './lib/vipSmsRouter'));

const STATE_PATH = path.resolve(__dirname, '../../../tmp/ops-engine/vip-watcher-state.json');
const LOG_PREFIX = '[vip-watcher]';

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { lastReceivedAt: null, lastTickAt: null, processed: {} }; }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

function pgQueryJson(sql) {
  // Run psql with JSON output via row_to_json
  const r = spawnSync('docker', ['exec', '-i', 'accelerator-db', 'psql', '-U', 'accelerator', '-d', 'accelerator_prod', '-tA', '-c', sql], { encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0) throw new Error(`pg: ${(r.stderr || '').trim()}`);
  return (r.stdout || '').trim();
}

function fetchNewEmails(sinceReceivedAt) {
  const where = sinceReceivedAt
    ? `WHERE received_at > '${sinceReceivedAt}'::timestamptz`
    : `WHERE received_at > NOW() - INTERVAL '15 minutes'`; // first-run safety
  const sql = `SELECT row_to_json(t) FROM (
    SELECT id, provider, provider_message_id, from_address, from_name, subject, body_text, received_at::text
    FROM inbox_emails
    ${where}
    ORDER BY received_at ASC
    LIMIT 50
  ) t`;
  const out = pgQueryJson(sql);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

(async () => {
  const startedAt = new Date();
  const mode = readMode();
  console.log(`${LOG_PREFIX} tick ${startedAt.toISOString()} mode=${mode}`);
  const state = loadState();

  const newEmails = fetchNewEmails(state.lastReceivedAt);
  console.log(`${LOG_PREFIX} ${newEmails.length} new email(s) since ${state.lastReceivedAt || '(15min)'}`);

  let routed = 0;
  let fired = 0;
  let skipped = 0;
  for (const e of newEmails) {
    if (state.processed[e.id]) { skipped++; continue; }

    // Skip self-sent (we cc gmail on everything; don't trigger VIP on our own outbound)
    if ((e.from_address || '').toLowerCase().includes('ali@colaberry.com')) {
      console.log(`${LOG_PREFIX}   skip self-sent: ${e.subject?.slice(0, 50)}`);
      state.processed[e.id] = { at: startedAt.toISOString(), outcome: 'self-sent' };
      skipped++;
      continue;
    }

    try {
      const result = await routeInboundEmail({
        senderEmail: e.from_address,
        senderName: e.from_name || e.from_address,
        subject: e.subject || '',
        body: e.body_text || '',
        gmailMessageUrl: e.provider === 'gmail_colaberry'
          ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(e.provider_message_id)}`
          : null,
      });
      routed++;
      if (result.fired) {
        fired++;
        console.log(`${LOG_PREFIX}   FIRED VIP alert: ${result.vipName} - ${result.summary?.slice(0, 60)}`);
      } else if (result.vip) {
        console.log(`${LOG_PREFIX}   VIP but not fired (${result.reason}): ${e.from_address}`);
      }
      state.processed[e.id] = { at: startedAt.toISOString(), outcome: result.fired ? 'fired' : (result.vip ? 'vip-blocked' : 'non-vip') };
    } catch (err) {
      console.error(`${LOG_PREFIX}   error processing ${e.id}: ${err.message}`);
      state.processed[e.id] = { at: startedAt.toISOString(), outcome: 'error', error: err.message };
    }

    // Update lastReceivedAt to this email's time
    if (!state.lastReceivedAt || e.received_at > state.lastReceivedAt) {
      state.lastReceivedAt = e.received_at;
    }
  }

  // Trim processed cache to last 1000 entries to keep state file small
  const entries = Object.entries(state.processed);
  if (entries.length > 1000) {
    state.processed = Object.fromEntries(entries.slice(-1000));
  }

  state.lastTickAt = startedAt.toISOString();
  saveState(state);
  console.log(`${LOG_PREFIX} done routed=${routed} fired=${fired} skipped=${skipped}`);
})().catch((e) => { console.error(`${LOG_PREFIX} FATAL: ${e.message}`); process.exit(1); });
