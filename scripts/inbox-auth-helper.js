/**
 * Inbox COS — One-click auth helper for Gmail (Colaberry + Personal) + Hotmail
 *
 * Run: node scripts/inbox-auth-helper.js
 *
 * Opens a local web server on http://localhost:9876 and walks you through
 * authorizing each account. Captured refresh tokens print to the terminal —
 * paste them into your .env or VPS env file as the matching variables shown.
 *
 * IMPORTANT scope note (fixed 2026-04-24): we now request gmail.modify
 * (not gmail.readonly) so the InboxCOS auto-archive job can remove the
 * INBOX label on classified emails. A modify-scope token can do everything
 * a readonly one can — no functionality is lost.
 */
require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');

const app = express();
const PORT = 9876;

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

function buildGmailClient(account) {
  const clientId = account === 'colaberry'
    ? (process.env.GMAIL_CLIENT_ID || process.env.GMAIL_COS_CLIENT_ID)
    : (process.env.GMAIL_PERSONAL_CLIENT_ID || process.env.GMAIL_CLIENT_ID);
  const clientSecret = account === 'colaberry'
    ? (process.env.GMAIL_CLIENT_SECRET || process.env.GMAIL_COS_CLIENT_SECRET)
    : (process.env.GMAIL_PERSONAL_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    return null;
  }
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `http://localhost:${PORT}/gmail/${account}/callback`
  );
}

const MS_CLIENT_ID = process.env.MS_OAUTH_CLIENT_ID || '';
const MS_CLIENT_SECRET = process.env.MS_OAUTH_CLIENT_SECRET || '';
const MS_REDIRECT = `http://localhost:${PORT}/hotmail/callback`;
const MS_SCOPES = 'https://outlook.office365.com/IMAP.AccessAsUser.All offline_access';

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const colaberry = buildGmailClient('colaberry');
  const personal  = buildGmailClient('personal');

  const colaberryUrl = colaberry && colaberry.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    login_hint: 'ali@colaberry.com',
  });
  const personalUrl = personal && personal.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    login_hint: 'alimuwwakkil@gmail.com',
  });

  const msUrl = MS_CLIENT_ID
    ? `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=${MS_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(MS_REDIRECT)}&response_mode=query&scope=${encodeURIComponent(MS_SCOPES)}&prompt=consent&login_hint=ali_muwwakkil@hotmail.com`
    : null;

  res.send(`
    <html>
    <body style="font-family: Arial; max-width: 640px; margin: 50px auto; line-height: 1.7;">
      <h2>Inbox COS &mdash; Email Authorization</h2>
      <p style="color:#555;">Each button opens Google/Microsoft consent. After you approve, the new refresh token prints in this terminal &mdash; copy it into your <code>.env</code> as the matching variable.</p>

      <h3>1. Gmail &mdash; ali@colaberry.com (Colaberry workspace)</h3>
      ${colaberryUrl
        ? `<p><a href="${colaberryUrl}" style="background:#4285f4;color:white;padding:10px 24px;border-radius:4px;text-decoration:none;font-size:16px;">Authorize Colaberry Gmail</a></p>
           <p style="color:#666;">Token will be saved as <code>GMAIL_REFRESH_TOKEN</code>. Scope: <code>gmail.modify</code> (read + archive).</p>`
        : `<p style="color:#e53e3e;">GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET not set in .env. Add them, then restart this script.</p>`
      }

      <hr/>

      <h3>2. Gmail &mdash; alimuwwakkil@gmail.com (personal)</h3>
      ${personalUrl
        ? `<p><a href="${personalUrl}" style="background:#4285f4;color:white;padding:10px 24px;border-radius:4px;text-decoration:none;font-size:16px;">Authorize Personal Gmail</a></p>
           <p style="color:#666;">Token will be saved as <code>GMAIL_PERSONAL_REFRESH_TOKEN</code>. Scope: <code>gmail.modify</code>.</p>`
        : `<p style="color:#e53e3e;">No GMAIL_PERSONAL_CLIENT_ID and no fallback GMAIL_CLIENT_ID. Add credentials and restart.</p>`
      }

      <hr/>

      <h3>3. Hotmail &mdash; ali_muwwakkil@hotmail.com</h3>
      ${msUrl
        ? `<p><a href="${msUrl}" style="background:#0078d4;color:white;padding:10px 24px;border-radius:4px;text-decoration:none;font-size:16px;">Authorize Hotmail</a></p>
           <p style="color:#666;">Token will be saved as <code>MS_GRAPH_REFRESH_TOKEN</code>.</p>`
        : `<p style="color:#e53e3e;">Microsoft OAuth not configured yet. Set <code>MS_OAUTH_CLIENT_ID</code> and <code>MS_OAUTH_CLIENT_SECRET</code> in <code>.env</code>.</p>
           <p>Setup: <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank">Azure App Registrations</a> &rarr; New registration &rarr; redirect URI <code>http://localhost:9876/hotmail/callback</code> (Web) &rarr; "Personal Microsoft accounts only" &rarr; copy Application (client) ID and create a client secret.</p>`
      }
    </body>
    </html>
  `);
});

async function handleGmailCallback(account, req, res) {
  const code = req.query.code;
  if (!code) return res.send('No code received');
  const oauth = buildGmailClient(account);
  if (!oauth) return res.send(`<h2 style="color:red">Gmail (${account}) not configured</h2>`);

  try {
    const { tokens } = await oauth.getToken(code);
    const envVar = account === 'colaberry' ? 'GMAIL_REFRESH_TOKEN' : 'GMAIL_PERSONAL_REFRESH_TOKEN';
    console.log(`\nGMAIL ${account.toUpperCase()} REFRESH TOKEN (paste into .env as ${envVar}):`);
    console.log(tokens.refresh_token);
    console.log('');
    res.send(`
      <h2 style="color:green;font-family:Arial;">Gmail (${account}) authorized</h2>
      <p>Refresh token captured. Paste into your <code>.env</code> as:</p>
      <pre style="background:#f0f0f0;padding:10px;font-size:13px;">${envVar}=${tokens.refresh_token}</pre>
    `);
  } catch (e) {
    console.error(`Gmail (${account}) token exchange failed:`, e.message);
    res.send(`<h2 style="color:red">Error</h2><p>${e.message}</p>`);
  }
}

app.get('/gmail/colaberry/callback', (req, res) => handleGmailCallback('colaberry', req, res));
app.get('/gmail/personal/callback',  (req, res) => handleGmailCallback('personal',  req, res));

app.get('/hotmail/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code received');

  try {
    const tokenRes = await axios.post('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      code,
      redirect_uri: MS_REDIRECT,
      grant_type: 'authorization_code',
      scope: MS_SCOPES,
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { refresh_token } = tokenRes.data;
    console.log('\nHOTMAIL REFRESH TOKEN (paste into .env as MS_GRAPH_REFRESH_TOKEN):');
    console.log(refresh_token);
    console.log('');
    res.send(`
      <h2 style="color:green;font-family:Arial;">Hotmail authorized</h2>
      <p>Refresh token captured. Paste into your <code>.env</code> as:</p>
      <pre style="background:#f0f0f0;padding:10px;font-size:13px;">MS_GRAPH_REFRESH_TOKEN=${refresh_token}</pre>
    `);
  } catch (e) {
    console.error('Hotmail token exchange failed:', e.response?.data || e.message);
    res.send(`<h2 style="color:red">Error</h2><pre>${JSON.stringify(e.response?.data || e.message, null, 2)}</pre>`);
  }
});

app.listen(PORT, () => {
  console.log(`\nInbox COS Auth Helper running at http://localhost:${PORT}\n`);
  console.log('Open http://localhost:' + PORT + ' in your browser and click each button to authorize.\n');
});
