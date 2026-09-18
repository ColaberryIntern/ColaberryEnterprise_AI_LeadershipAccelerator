// gmailArchive.js: take whole threads OUT of ali@colaberry.com's inbox, only after Ali chose that
// for the item, and prove it by re-fetching. An addressed email leaves the inbox (Ali, 2026-09-12);
// so do acknowledgements and FYIs (Ali, 2026-09-15). NOT the BCC copy of a reply sent as Ali: that
// copy is his receipt of what went out and stays in the inbox until he clears it (Ali, 2026-09-17:
// "always bcc me on everything you send out on my behalf"). Nothing is deleted: the INBOX label
// comes off the other messages in the thread and the SENT / other labels stay.
//   ssh root@95.216.199.47 "docker exec -i -e THREADS_JSON='[{\"id\":\"<msgId>\",\"expect\":\"<subject regex>\"}]' accelerator-backend node -" < gmailArchive.js
// `expect` is a guard: if the live subject does not match, the item is skipped rather than archived,
// so a stale id from an earlier listing can never file the wrong mail. Gmail shows a thread while
// ANY message in it carries INBOX, so every message is modified except Ali's own SENT copies; a
// thread that carries a fresh reply from him therefore stays visible, by design (kept_sent_copies).
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
    const t = await g.users.threads.get({ userId: 'me', id: tid, format: 'minimal' });
    let kept = 0;
    for (const x of t.data.messages) {
      const labels = x.labelIds || [];
      if (!labels.includes('INBOX')) continue;
      if (labels.includes('SENT')) { kept++; continue; }
      await g.users.messages.modify({ userId: 'me', id: x.id, requestBody: { removeLabelIds: ['INBOX'] } });
    }
    const back = await g.users.threads.get({ userId: 'me', id: tid, format: 'minimal' });
    const inbox = back.data.messages.filter((x) => (x.labelIds || []).includes('INBOX'));
    out.push({ thread: tid, subject: subj.slice(0, 70), messages: back.data.messages.length, still_in_inbox: inbox.length, kept_sent_copies: kept, unexpected_in_inbox: inbox.filter((x) => !(x.labelIds || []).includes('SENT')).length });
  }
  fs.writeSync(1, JSON.stringify(out, null, 1) + '\n');
  process.exit(out.some((o) => o.unexpected_in_inbox) ? 2 : 0);
})().catch((e) => { fs.writeSync(2, 'ERR ' + (e.stack || e) + '\n'); process.exit(1); });
