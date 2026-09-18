// gmailInbox.js: list what is in ali@colaberry.com's inbox RIGHT NOW, newest first, with ids.
// The inbox is the thing; the case engine's snapshot is only the signal. Run inside the prod
// backend container (it holds the Gmail credential; nothing is read locally):
//   ssh root@95.216.199.47 "docker exec -i accelerator-backend node -" < gmailInbox.js
// Env: Q (extra Gmail search terms appended to `in:inbox`, optional), MAX (default 50).
const { getColaberryGmailClient } = require('/app/dist/services/inbox/inboxSyncService');
const fs = require('fs');
(async () => {
  const g = await getColaberryGmailClient();
  const q = ('in:inbox ' + (process.env.Q || '')).trim();
  const s = await g.users.messages.list({ userId: 'me', q, maxResults: Number(process.env.MAX || 50) });
  const rows = [];
  for (const m of s.data.messages || []) {
    const d = await g.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] });
    const h = Object.fromEntries((d.data.payload.headers || []).map((x) => [x.name, x.value]));
    rows.push({ id: m.id, thread: d.data.threadId, date: h.Date || '', from: (h.From || '').replace(/<.*/, '').trim(), subject: h.Subject || '', unread: (d.data.labelIds || []).includes('UNREAD') });
  }
  // Dates stay as the provider gives them here; render in Central at the skill layer.
  fs.writeSync(1, 'INBOX (' + rows.length + ')\n' + rows.map((r) => (r.unread ? '* ' : '  ') + r.date.slice(0, 22) + ' | ' + r.from.slice(0, 28).padEnd(28) + ' | ' + r.subject.slice(0, 85) + ' | ' + r.id).join('\n') + '\n');
  process.exit(0);
})().catch((e) => { fs.writeSync(2, 'ERR ' + (e.stack || e) + '\n'); process.exit(1); });
