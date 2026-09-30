/**
 * Mint a Hotmail (MS Graph) refresh token WITH the Mail.Send scope.
 *
 * Run this on Ali's own machine — it opens a browser for the interactive
 * consent and listens on http://localhost:9877 for the redirect, which is the
 * registered redirect_uri for this app.
 *
 * Why it is needed: the stored refresh token was consented for Mail.Read /
 * Mail.ReadWrite only. AAD rejects the whole token request for an unconsented
 * scope (AADSTS70000), so Hotmail replies cannot be sent until a token exists
 * that carries Mail.Send. Only a human sign-in can grant that.
 *
 * Usage:  node mintHotmailToken.js
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { URL, URLSearchParams } = require('url');

const CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID || 'd741c4fa-1b0b-43c9-b6a5-500c2b6acc5f';
const REDIRECT_URI = 'http://localhost:9877';
const PORT = 9877;
const SCOPE = 'Mail.Read Mail.ReadWrite Mail.Send offline_access';

const AUTH_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?'
  + new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: SCOPE,
    prompt: 'consent', // force the consent screen even if already signed in
  }).toString();

function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(`${parsed.error}: ${parsed.error_description || ''}`));
            resolve(parsed);
          } catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.end(`Consent failed: ${error} — ${url.searchParams.get('error_description') || ''}`);
    console.error(`\nConsent failed: ${error}`);
    server.close();
    process.exit(1);
  }
  if (!code) { res.end('Waiting for the consent redirect...'); return; }

  res.end('Consent granted. You can close this tab and return to the terminal.');

  try {
    const tokens = await exchangeCode(code);
    const grantedSend = /Mail\.Send/i.test(tokens.scope || '');

    // The refresh token is a live credential. It is written to a file rather
    // than stdout so it never lands in a terminal transcript, a scrollback
    // buffer, or an assistant's context (root CLAUDE.md: no secrets in logs).
    const outPath = path.join(__dirname, 'hotmail-refresh-token.txt');
    fs.writeFileSync(outPath, tokens.refresh_token, { mode: 0o600 });

    console.log('\n──────────────────────────────────────────────────────────');
    console.log(`Granted scopes : ${tokens.scope}`);
    console.log(`Mail.Send      : ${grantedSend ? 'YES' : 'NO — consent did not include it'}`);
    console.log(`Token length   : ${String(tokens.refresh_token || '').length} chars`);
    console.log('──────────────────────────────────────────────────────────\n');
    console.log(`Refresh token written to:\n  ${outPath}\n`);
    console.log('It is NOT printed here on purpose — open that file, copy the value to');
    console.log('MS_GRAPH_REFRESH_TOKEN on the prod host, then delete the file.\n');
  } catch (err) {
    console.error(`\nToken exchange failed: ${err.message}`);
    process.exitCode = 1;
  }
  server.close();
});

server.listen(PORT, () => {
  console.log(`Listening on ${REDIRECT_URI} for the consent redirect...`);
  console.log('\nOpening the Microsoft consent page. Sign in as ali_muwwakkil@hotmail.com and approve.');
  console.log('If the browser does not open, paste this URL manually:\n');
  console.log(AUTH_URL + '\n');
  exec(`start "" "${AUTH_URL}"`, { shell: 'cmd.exe' }, () => {});
});
