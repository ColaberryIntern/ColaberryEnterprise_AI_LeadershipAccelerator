/**
 * Archive one Gmail thread by removing the INBOX label.
 *
 * Uses the repo's own GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN
 * (source .env first), the same path fetchRunEmail.js uses, so it does not depend
 * on the claude.ai Gmail connector session.
 *
 * Reads the thread BEFORE and AFTER the write and verifies from the server that
 * INBOX is actually gone, rather than trusting the modify call's status code.
 *
 * Usage: node scripts/archiveGmailThread.js <threadId> [--go]
 *        without --go it only reports the current labels and changes nothing.
 *
 * Needs a GMAIL_REFRESH_TOKEN carrying gmail.modify. A readonly token answers
 * 403 "Request had insufficient authentication scopes" - mint a modify-scoped
 * one with scripts/mintGmailToken.js.
 */
const CID = process.env.GMAIL_CLIENT_ID;
const CSEC = process.env.GMAIL_CLIENT_SECRET;
const RTOK = process.env.GMAIL_REFRESH_TOKEN;

const THREAD = process.argv[2];
const GO = process.argv.includes('--go');

for (const [k, v] of [['GMAIL_CLIENT_ID', CID], ['GMAIL_CLIENT_SECRET', CSEC], ['GMAIL_REFRESH_TOKEN', RTOK]]) {
  if (!v) { console.error('missing ' + k + ' in env (source the repo .env first)'); process.exit(2); }
}
if (!THREAD) { console.error('usage: archiveThread.js <threadId> [--go]'); process.exit(2); }

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me/';

async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CID, client_secret: CSEC, refresh_token: RTOK, grant_type: 'refresh_token',
    }).toString(),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('token exchange failed: HTTP ' + r.status + ' ' + (j.error || ''));
  return j.access_token;
}

async function labelsOf(tok) {
  const r = await fetch(BASE + 'threads/' + THREAD + '?format=metadata', {
    headers: { Authorization: 'Bearer ' + tok },
  });
  if (!r.ok) throw new Error('read thread HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  const set = new Set();
  (j.messages || []).forEach((m) => (m.labelIds || []).forEach((l) => set.add(l)));
  const subj = (((j.messages || [])[0] || {}).payload || {}).headers || [];
  const s = subj.find((h) => h.name.toLowerCase() === 'subject');
  return { labels: [...set].sort(), subject: s ? s.value : '(no subject)', count: (j.messages || []).length };
}

(async () => {
  const tok = await token();

  const before = await labelsOf(tok);
  console.log('subject : ' + before.subject);
  console.log('messages: ' + before.count);
  console.log('BEFORE  : ' + before.labels.join(', '));

  if (!before.labels.includes('INBOX')) {
    console.log('\nAlready archived - INBOX is not on this thread. Nothing to do.');
    process.exit(0);
  }
  if (!GO) {
    console.log('\nDRY RUN - would remove INBOX. Re-run with --go to apply.');
    process.exit(0);
  }

  const r = await fetch(BASE + 'threads/' + THREAD + '/modify', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
  });
  if (!r.ok) {
    const body = (await r.text()).slice(0, 400);
    console.error('\nmodify FAILED: HTTP ' + r.status);
    console.error(body);
    if (r.status === 403) console.error('\n403 usually means the refresh token only carries a readonly Gmail scope.');
    process.exit(1);
  }

  const after = await labelsOf(tok);
  console.log('AFTER   : ' + after.labels.join(', '));
  console.log('\n' + (after.labels.includes('INBOX')
    ? '*** INBOX still present - archive did NOT take ***'
    : 'VERIFIED: INBOX removed, thread archived.'));
  process.exit(after.labels.includes('INBOX') ? 1 : 0);
})().catch((e) => { console.error('FATAL: ' + (e.message || e)); process.exit(1); });
