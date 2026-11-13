/**
 * Mint a Gmail refresh token that can ARCHIVE, not just read and send.
 *
 * WHY THIS EXISTS
 *
 * Inbox work currently depends on the claude.ai Gmail connector, which belongs to
 * whichever claude.ai account is signed in. When Ali runs out of credits and moves
 * to Dhee's account, that connector is Dhee's, and Ali's own mailbox goes out of
 * reach mid-task.
 *
 * The repo's own credentials in .env do NOT have that problem - they are tied to a
 * Google account, not to a claude.ai account. They already carry:
 *     gmail.readonly   gmail.send
 * which is why reading and sending keep working across the switch. They lack
 * gmail.modify, so archiving fails with:
 *     403 Request had insufficient authentication scopes
 *
 * This script re-consents the SAME OAuth client with gmail.modify added, so inbox
 * management stops depending on the connector.
 *
 * SAFETY
 *   - The refresh token is written straight into .env. It is never printed to the
 *     terminal, never echoed, and never returned to the agent.
 *   - .env is gitignored (verified: .gitignore line 10).
 *   - The previous GMAIL_REFRESH_TOKEN line is backed up to .env.bak-<timestamp>
 *     so a bad mint is one copy away from being undone.
 *   - Consent MUST be given as the mailbox you want to manage. If you sign in as
 *     the wrong Google account, the new token reads the wrong mailbox - the script
 *     prints which address it ended up with so you can check before trusting it.
 *
 * USAGE
 *   cd <repo> && set -a && . ./.env && set +a
 *   node scripts/mintGmailToken.js .
 *
 * NOTE: that is bash. In PowerShell the `&&` is a parse error - source the env
 * another way, or let an agent run it, which is the normal case here.
 *
 * It prints a URL, waits for you to approve in the browser, catches the redirect
 * on localhost, exchanges the code, verifies the scopes, and writes .env.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const CID = process.env.GMAIL_CLIENT_ID;
const CSEC = process.env.GMAIL_CLIENT_SECRET;
// Port and path are NOT free choices: they must match a redirect URI already
// registered on this OAuth client, or Google answers 400 redirect_uri_mismatch.
// scripts/inbox-auth-helper.js is the original minting tool for this same client
// and registers http://localhost:9876/gmail/colaberry/callback, so reuse exactly
// that rather than inventing a port.
const PORT = Number(process.env.MINT_PORT || 9876);
const REDIRECT = 'http://localhost:' + PORT + '/gmail/colaberry/callback';

// gmail.modify covers read + label changes (it cannot permanently delete).
// gmail.send is kept so nothing that sends today regresses.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

const ENV_PATH = path.resolve(process.argv[2] || process.cwd(), '.env');

if (!CID || !CSEC) {
  console.error('missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET - source the repo .env first');
  process.exit(2);
}
if (!fs.existsSync(ENV_PATH)) {
  console.error('no .env found at ' + ENV_PATH + ' - pass the repo path as argv[2]');
  process.exit(2);
}

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: CID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPES.join(' '),
  access_type: 'offline',
  prompt: 'consent',            // force a refresh token even if one was issued before
  include_granted_scopes: 'true',
}).toString();

console.log('\n1. Open this URL and approve. Sign in as the mailbox you want to manage:\n');
console.log(authUrl);
console.log('\n2. Waiting for the redirect on ' + REDIRECT + ' ...\n');

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error');

  if (err) {
    res.end('Consent denied: ' + err + '. You can close this tab.');
    console.error('consent denied: ' + err);
    server.close(); process.exit(1);
  }
  if (!code) { res.end('waiting'); return; }

  res.end('Done. Token minted and written to .env. You can close this tab.');
  server.close();

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: CID, client_secret: CSEC,
        redirect_uri: REDIRECT, grant_type: 'authorization_code',
      }).toString(),
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) {
      console.error('token exchange failed: HTTP ' + r.status + ' ' + (j.error_description || j.error || ''));
      if (!j.refresh_token && r.ok) console.error('no refresh_token returned - re-run, prompt=consent is required');
      process.exit(1);
    }

    // Verify what we actually got BEFORE writing it anywhere.
    const ti = await (await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + j.access_token)).json();
    const granted = String(ti.scope || '').split(' ');
    const haveModify = granted.includes('https://www.googleapis.com/auth/gmail.modify');

    console.log('mailbox  : ' + (ti.email || '(not exposed by these scopes)'));
    console.log('scopes   :');
    granted.forEach((s) => console.log('   ' + s));

    if (!haveModify) {
      console.error('\ngmail.modify was NOT granted. Nothing written. Re-run and approve all boxes.');
      process.exit(1);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(ENV_PATH, ENV_PATH + '.bak-' + stamp);

    const raw = fs.readFileSync(ENV_PATH, 'utf8');
    const line = 'GMAIL_REFRESH_TOKEN=' + j.refresh_token;
    const next = /^GMAIL_REFRESH_TOKEN=.*$/m.test(raw)
      ? raw.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, line)
      : raw.replace(/\s*$/, '\n') + line + '\n';
    fs.writeFileSync(ENV_PATH, next);

    console.log('\nWritten to ' + ENV_PATH);
    console.log('Backup     : ' + path.basename(ENV_PATH + '.bak-' + stamp));
    console.log('\nThe token itself was not printed. Archiving should now work from any claude.ai account.');
    process.exit(0);
  } catch (e) {
    console.error('FATAL: ' + (e.message || e));
    process.exit(1);
  }
});

server.listen(PORT);
