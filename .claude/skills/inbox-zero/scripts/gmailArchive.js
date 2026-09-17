// gmailArchive.js: take whole threads OUT of ali@colaberry.com's inbox, only after Ali chose that
// for the item, and prove it by re-fetching. An addressed email leaves the inbox (Ali, 2026-09-12);
// so do acknowledgements, FYIs and BCC copies of mail sent as Ali (Ali, 2026-09-15). Nothing is
// deleted: the INBOX label comes off the thread and the SENT / other labels stay.
//   ssh root@95.216.199.47 "docker exec -i -e THREADS_JSON='[{\"id\":\"<msgId>\",\"expect\":\"<subject regex>\"}]' accelerator-backend node -" < gmailArchive.js
// `expect` is a guard: if the live subject does not match, the item is skipped rather than archived,
// so a stale id from an earlier listing can never file the wrong mail. Gmail shows a thread while
// ANY message in it carries INBOX, which is why the whole thread is modified, not one message.
const { getColaberryGmailClient } = require('/app/dist/services/inbox/inboxSyncService');
const fs = require('fs');
(async () => {
  const g = await getColaberryGmailClient();
  const items = JSON.parse(process.env.THREADS_JSON || '[]');
  const out = [];
  for (const it of items) {
    const m = await g.users.messages.get({ userId: 'me', id: it.id, format: 'metadata', metadataHeaders: ['Subject'] });
    const subj = (m.data.payload.headers.find((h) => h.name === 'Subject') || {}).value || '';
    if (it.expect && !new RegExp(it.expect, 'i').test(subj)) { out.push({ id: it.id, skipped: 'subject mismatch', subject: subj.slice(0, 70) }); continue; }
    const tid = m.data.threadId;
    await g.users.threads.modify({ userId: 'me', id: tid, requestBody: { removeLabelIds: ['INBOX'] } });
    const back = await g.users.threads.get({ userId: 'me', id: tid, format: 'minimal' });
    out.push({ thread: tid, subject: subj.slice(0, 70), messages: back.data.messages.length, still_in_inbox: back.data.messages.filter((x) => (x.labelIds || []).includes('INBOX')).length });
  }
  fs.writeSync(1, JSON.stringify(out, null, 1) + '\n');
  process.exit(out.some((o) => o.still_in_inbox) ? 2 : 0);
})().catch((e) => { fs.writeSync(2, 'ERR ' + (e.stack || e) + '\n'); process.exit(1); });
