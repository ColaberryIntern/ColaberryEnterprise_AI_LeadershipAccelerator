/**
 * Full inbox scan — pulls ALL current inbox messages from both Gmail accounts
 * and classifies them.
 *
 * Run: node scripts/full-inbox-scan.js
 */
require('dotenv').config();
const { google } = require('googleapis');

async function fullSyncGmail(provider, clientId, clientSecret, refreshToken, maxMessages) {
  // Dynamic imports for compiled backend modules
  const InboxEmail = require('./backend/dist/models/InboxEmail').default || require('./backend/dist/models/InboxEmail');

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  let allIds = [];
  let pageToken = null;

  do {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX'],
      maxResults: 100,
      pageToken,
    });
    const ids = (listRes.data.messages || []).map(m => m.id);
    allIds = allIds.concat(ids);
    pageToken = listRes.data.nextPageToken;
  } while (pageToken && allIds.length < maxMessages);

  console.log(`[${provider}] Found ${allIds.length} messages in INBOX`);

  let synced = 0, skipped = 0;
  for (const msgId of allIds) {
    const exists = await InboxEmail.findOne({ where: { provider, provider_message_id: msgId } });
    if (exists) { skipped++; continue; }

    try {
      const msg = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'full' });
      const headers = {};
      (msg.data.payload.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

      let bodyText = '';
      function extractText(part) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          bodyText += Buffer.from(part.body.data, 'base64').toString('utf8');
        }
        if (part.parts) part.parts.forEach(extractText);
      }
      extractText(msg.data.payload);
      if (!bodyText && msg.data.snippet) bodyText = msg.data.snippet;

      const from = headers['from'] || '';
      let fromAddr = from, fromName = null;
      const ltIdx = from.indexOf('<');
      if (ltIdx > -1) {
        fromName = from.slice(0, ltIdx).trim().replace(/^"|"$/g, '');
        fromAddr = from.slice(ltIdx + 1).replace('>', '').trim();
      }

      await InboxEmail.create({
        provider,
        provider_message_id: msgId,
        provider_thread_id: msg.data.threadId,
        from_address: fromAddr,
        from_name: fromName,
        to_addresses: (headers['to'] || '').split(',').map(s => s.trim()),
        cc_addresses: (headers['cc'] || '').split(',').map(s => s.trim()).filter(Boolean),
        subject: headers['subject'] || '(no subject)',
        body_text: bodyText.slice(0, 50000),
        body_html: null,
        headers,
        received_at: new Date(parseInt(msg.data.internalDate)),
        synced_at: new Date(),
        has_attachments: (msg.data.payload.parts || []).some(p => p.filename),
      });
      synced++;
      if (synced % 25 === 0) console.log(`[${provider}] Synced ${synced}...`);
    } catch (e) {
      // skip individual message errors silently
    }
  }
  console.log(`[${provider}] Done: ${synced} new, ${skipped} already existed`);
  return synced;
}

async function main() {
  console.log('=== FULL INBOX SCAN ===\n');

  const colaberry = await fullSyncGmail(
    'gmail_colaberry',
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REFRESH_TOKEN,
    500
  );

  const personal = await fullSyncGmail(
    'gmail_personal',
    process.env.GMAIL_PERSONAL_CLIENT_ID,
    process.env.GMAIL_PERSONAL_CLIENT_SECRET,
    process.env.GMAIL_PERSONAL_REFRESH_TOKEN,
    500
  );

  console.log(`\nTotal new emails synced: ${colaberry + personal}`);

  console.log('\n=== CLASSIFYING ALL NEW EMAILS ===\n');
  const { processNewEmails } = require('./backend/dist/services/inbox/inboxStateManager');
  const result = await processNewEmails();
  console.log('\nClassification result:', JSON.stringify(result, null, 2));

  const { sequelize } = require('./backend/dist/config/database');
  const [totals] = await sequelize.query("SELECT provider, COUNT(*)::int as c FROM inbox_emails GROUP BY provider");
  const [states] = await sequelize.query("SELECT state, COUNT(*)::int as c FROM inbox_classifications GROUP BY state ORDER BY state");
  const [draftCount] = await sequelize.query("SELECT COUNT(*)::int as c FROM inbox_reply_drafts WHERE status='pending_approval'");
  console.log('\n=== FINAL TOTALS ===');
  console.log('Emails by provider:', JSON.stringify(totals));
  console.log('By classification state:', JSON.stringify(states));
  console.log('Pending reply drafts:', draftCount[0].c);

  process.exit();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
