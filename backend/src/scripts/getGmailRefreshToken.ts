/**
 * One-time interactive Gmail OAuth consent flow — obtains a GMAIL_REFRESH_TOKEN
 * for whichever Google account approves the consent screen, and writes it
 * directly into the repo-root .env (never printed to the console).
 *
 * Requires GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET already set in .env (a
 * Google Cloud "Desktop app" OAuth client — those accept any http://localhost
 * redirect port without pre-registering it). Scope requested is gmail.send
 * only (least privilege — this repo's Cora test-send path only ever calls
 * gmail.users.messages.send).
 *
 * Run: `npx ts-node backend/src/scripts/getGmailRefreshToken.ts` (from repo root)
 * Then open the printed URL in a browser, sign in with the Gmail account you
 * want Cora's test send to use, and approve. The script exits automatically
 * once the token is written.
 */
import path from 'path';
import fs from 'fs';
import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const PORT = 45678;
const ENV_PATH = path.resolve(__dirname, '../../../.env');
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

function writeRefreshTokenToEnv(token: string): void {
  const contents = fs.readFileSync(ENV_PATH, 'utf8');
  const line = `GMAIL_REFRESH_TOKEN=${token}`;
  const updated = /^GMAIL_REFRESH_TOKEN=.*$/m.test(contents)
    ? contents.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, line)
    : contents.trimEnd() + `\n${line}\n`;
  fs.writeFileSync(ENV_PATH, updated, 'utf8');
}

async function run(): Promise<void> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('FATAL: GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET not set in .env.');
    process.exit(1);
  }

  const { google } = await import('googleapis');
  const redirectUri = `http://localhost:${PORT}`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token even if this account consented before
    scope: [SCOPE],
  });

  console.log('\nOpen this URL, sign in with the Gmail account you want to authorize, and approve:\n');
  console.log(authUrl);
  console.log('\nWaiting for you to approve in the browser...\n');

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '', redirectUri);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.end('Authorization denied. You can close this tab.');
        console.error(`FAILED: consent denied (${error})`);
        server.close();
        process.exit(1);
      }

      if (!code) {
        res.end('No code received. You can close this tab.');
        return;
      }

      res.end('Authorized. You can close this tab and return to the terminal.');

      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.refresh_token) {
        console.error('FAILED: Google did not return a refresh_token. Revoke prior access at https://myaccount.google.com/permissions and re-run.');
        server.close();
        process.exit(1);
      }

      writeRefreshTokenToEnv(tokens.refresh_token);
      console.log(`Refresh token written to .env (starts with: ${tokens.refresh_token.slice(0, 8)}...)`);
      console.log('Rebuild/restart the backend container to pick it up.');
      server.close();
      process.exit(0);
    } catch (err: any) {
      console.error('FAILED:', err.message);
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT);
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
