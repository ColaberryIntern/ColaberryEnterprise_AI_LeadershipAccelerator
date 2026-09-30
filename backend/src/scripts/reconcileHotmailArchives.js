/**
 * Reconcile Hotmail messages that InboxCOS RECORDED as archived but which are
 * still sitting in the inbox.
 *
 * Why this exists: archiveHotmail() used to return quietly when it could not
 * reach Graph, while archiveEmail() went on to write an `archived` audit event.
 * The database therefore recorded ~1,638 Hotmail archives, 171 of which never
 * moved a message. Nothing retries them — the system believes the work is done —
 * so they need a deliberate sweep.
 *
 * Safe by construction:
 *   - Only touches messages that are BOTH classified AUTOMATION AND already
 *     marked `archived` in our own audit log. It never makes a NEW filing
 *     decision; it only completes one already recorded.
 *   - Archives = MOVE to the _Automation folder. Nothing is deleted.
 *   - --dry-run (default) reports and changes nothing. Pass --apply to act.
 *   - Re-runnable: a message already out of the inbox is skipped.
 *
 * Usage:
 *   node dist/scripts/reconcileHotmailArchives.js            # dry run
 *   node dist/scripts/reconcileHotmailArchives.js --apply
 */
const path = require('path');

const DIST = path.resolve(__dirname, '..');
const { sequelize } = require(path.join(DIST, 'config/database'));
const { archiveMessage } = require(path.join(DIST, 'services/inbox/graphMailService'));
const { getRefreshToken } = require(path.join(DIST, 'services/inbox/graphTokenStore'));
const axios = require('axios');

const APPLY = process.argv.includes('--apply');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function graphToken() {
  const p = new URLSearchParams({
    client_id: process.env.MS_GRAPH_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: await getRefreshToken(),
    scope: 'Mail.Read Mail.ReadWrite offline_access',
  });
  const r = await axios.post(
    'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    p.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  return r.data.access_token;
}

/** Every message id currently in the Hotmail inbox. */
async function liveInboxIds(headers) {
  let url = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages'
    + '?$select=id&$top=200';
  const ids = new Set();
  let pages = 0;
  while (url && pages < 60) {
    const res = await axios.get(url, { headers, timeout: 30000 });
    for (const m of res.data.value || []) ids.add(m.id);
    url = res.data['@odata.nextLink'];
    pages++;
  }
  return ids;
}

async function main() {
  const headers = { Authorization: `Bearer ${await graphToken()}` };
  const inboxIds = await liveInboxIds(headers);
  console.log(`Live Hotmail inbox: ${inboxIds.size} message(s)`);

  const [rows] = await sequelize.query(`
    SELECT e.provider_message_id AS id, e.subject, e.from_address
    FROM inbox_emails e
    JOIN inbox_classifications c ON c.email_id = e.id
    WHERE e.provider = 'hotmail'
      AND c.state = 'AUTOMATION'
      AND EXISTS (
        SELECT 1 FROM inbox_audit_logs a
        WHERE a.email_id = e.id AND a.action = 'archived'
      )`);

  // Only those our records call archived that are demonstrably still in the inbox.
  const stranded = rows.filter((r) => inboxIds.has(r.id));
  console.log(`Marked archived AND still in inbox: ${stranded.length}\n`);

  if (stranded.length === 0) {
    console.log('Nothing to reconcile.');
    process.exit(0);
  }

  const bySender = {};
  for (const s of stranded) {
    const k = (s.from_address || 'unknown').toLowerCase();
    bySender[k] = (bySender[k] || 0) + 1;
  }
  console.log('--- by sender ---');
  Object.entries(bySender).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));

  if (!APPLY) {
    console.log('\nDRY RUN — nothing moved. Re-run with --apply to file these into _Automation.');
    process.exit(0);
  }

  console.log('\nApplying...');
  let ok = 0;
  let failed = 0;
  for (const s of stranded) {
    try {
      await archiveMessage(s.id);
      ok++;
    } catch (err) {
      failed++;
      console.error(`  FAILED ${(s.subject || '').slice(0, 50)}: ${err.message}`);
    }
    if ((ok + failed) % 25 === 0) console.log(`  ...${ok + failed}/${stranded.length}`);
    await sleep(80); // Graph throttles aggressive loops
  }

  console.log(`\nFiled into _Automation: ${ok}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('RECONCILE FAILED:', e.response?.data?.error?.message || e.message);
  process.exit(1);
});
