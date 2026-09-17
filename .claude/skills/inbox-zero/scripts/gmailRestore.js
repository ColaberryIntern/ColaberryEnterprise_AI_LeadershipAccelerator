// gmailRestore.js: put messages BACK in ali@colaberry.com's inbox when Ali asks ("put this back in
// my inbox"). Adds the INBOX label to each message id and re-fetches to prove it.
//   ssh root@95.216.199.47 "docker exec -i -e IDS=id1,id2 accelerator-backend node -" < gmailRestore.js
const { getColaberryGmailClient } = require('/app/dist/services/inbox/inboxSyncService');
const fs = require('fs');
(async () => {
  const g = await getColaberryGmailClient();
  const ids = String(process.env.IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const id of ids) {
    await g.users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds: ['INBOX'] } });
    const m = await g.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From'] });
    const h = Object.fromEntries((m.data.payload.headers || []).map((x) => [x.name, x.value]));
    out.push({ id, subject: (h.Subject || '').slice(0, 70), from: (h.From || '').replace(/<.*/, '').trim(), in_inbox: (m.data.labelIds || []).includes('INBOX') });
  }
  fs.writeSync(1, JSON.stringify(out, null, 1) + '\n');
  process.exit(out.every((o) => o.in_inbox) ? 0 : 2);
})().catch((e) => { fs.writeSync(2, 'ERR ' + (e.stack || e) + '\n'); process.exit(1); });
