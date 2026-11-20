// Fetches the most recent "Gov pursuit morning" email and writes its plaintext body.
//
//   node fetchRunEmail.js <out.txt> [--query "<gmail query>"]
//
// Dependency-free: Node's built-in fetch against the Gmail REST API, because
// node_modules under OneDrive is not reliably readable (see the skill's notes).
// Reads GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN from the env
// (source the repo .env first). Never prints the access token.
const fs = require('fs');

const OUT = process.argv[2];
const qi = process.argv.indexOf('--query');
const QUERY = qi !== -1 ? process.argv[qi + 1]
  : 'from:info@colaberry.com subject:"Gov pursuit" newer_than:2d';
if (!OUT) { console.error('usage: fetchRunEmail.js <out.txt> [--query "..."]'); process.exit(2); }

const CID = process.env.GMAIL_CLIENT_ID, CSEC = process.env.GMAIL_CLIENT_SECRET, RTOK = process.env.GMAIL_REFRESH_TOKEN;
for (const [k, v] of [['GMAIL_CLIENT_ID', CID], ['GMAIL_CLIENT_SECRET', CSEC], ['GMAIL_REFRESH_TOKEN', RTOK]]) {
  if (!v) { console.error('MISSING ENV ' + k); process.exit(2); }
}

async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CID, client_secret: CSEC, refresh_token: RTOK, grant_type: 'refresh_token' }).toString(),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('token exchange failed: HTTP ' + r.status + ' ' + (j.error || ''));
  return j.access_token;
}

function decodeB64Url(s) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }

// Walk the MIME tree for text/plain; fall back to stripping text/html.
function extractPlain(payload) {
  let plain = null, html = null;
  (function walk(p) {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body && p.body.data && !plain) plain = decodeB64Url(p.body.data);
    if (p.mimeType === 'text/html' && p.body && p.body.data && !html) html = decodeB64Url(p.body.data);
    (p.parts || []).forEach(walk);
  })(payload);
  if (plain) return plain;
  if (html) {
    return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, ' <$1> ')
      .replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n');
  }
  return null;
}

(async () => {
  const tok = await token();
  const H = { Authorization: 'Bearer ' + tok };
  const base = 'https://gmail.googleapis.com/gmail/v1/users/me/';

  const list = await (await fetch(base + 'messages?maxResults=5&q=' + encodeURIComponent(QUERY), { headers: H })).json();
  if (!list.messages || !list.messages.length) { console.error('NO MATCHING EMAIL for query: ' + QUERY); process.exit(1); }

  const msg = await (await fetch(base + 'messages/' + list.messages[0].id + '?format=full', { headers: H })).json();
  const subj = (msg.payload.headers.find(h => h.name.toLowerCase() === 'subject') || {}).value || '(no subject)';
  const date = (msg.payload.headers.find(h => h.name.toLowerCase() === 'date') || {}).value || '';

  const text = extractPlain(msg.payload);
  if (!text) { console.error('COULD NOT EXTRACT A BODY'); process.exit(1); }

  fs.writeFileSync(OUT, text, 'utf8');
  console.log('message : ' + msg.id);
  console.log('subject : ' + subj);
  console.log('date    : ' + date);
  console.log('wrote   : ' + OUT + '  ' + text.length + ' chars');
  // Emit the id so the caller can archive this exact message later.
  fs.writeFileSync(OUT + '.id', msg.id, 'utf8');
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
