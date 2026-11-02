// gmailUntrash.js: take mail OUT of Trash on ali@colaberry.com WITHOUT putting it back in the
// inbox - the retain-but-filed state Gmail calls archived. Trash purges after 30 days; archive
// never does. Use this when mail was Deleted where it should have been Archived and Ali wants it
// kept (Ali, 2026-11-02: "build untrash").
//
// This is NOT gmailRestore.js. That one ADDS INBOX and hands the mail back to Ali, which is the
// opposite of filing it. This one removes TRASH and nothing else, and fails the run if INBOX ever
// appears.
//   ssh root@95.216.199.47 "docker exec -i -e ITEMS_JSON='[{\"id\":\"<msgId>\",\"expect\":\"<subject regex>\"}]' -e SCOPE=thread -e APPLY=1 accelerator-backend node -" < gmailUntrash.js
//
// Env: ITEMS_JSON (required), SCOPE=message|thread (default message), APPLY=1 to write.
//   - Dry by default: it prints exactly what it would change and touches nothing.
//   - `expect` is a guard on the anchor message's live subject. On mismatch the item is skipped
//     rather than restored, so a stale id from an earlier listing cannot resurrect the wrong mail.
//   - SCOPE=thread untrashes every trashed message in the conversation, which is what a client
//     "delete conversation" produced in the first place.
//
// Idempotent: TRASH is removed only where present, and a second run reports already_out and leaves
// the identical end state. SPAM is reported and skipped, never silently cleared - taking mail out
// of Spam is a different decision and needs Ali to make it.
const { getColaberryGmailClient } = require('/app/dist/services/inbox/inboxSyncService');
const fs = require('fs');

const APPLY = process.env.APPLY === '1';
const SCOPE = (process.env.SCOPE || 'message').toLowerCase();

function errorClass(err) {
  const code = (err && (err.code || err.status)) || 0;
  if (code === 404) return 'NotFoundError';
  if (code === 401 || code === 403) return 'AuthError';
  if (code === 429) return 'RateLimitError';
  if (code >= 500) return 'UpstreamUnavailable';
  return 'ContractViolation';
}

function subjectOf(msg) {
  const headers = (msg.payload && msg.payload.headers) || [];
  return ((headers.find((h) => h.name === 'Subject') || {}).value || '');
}

// The anchor message decides the subject guard; SCOPE decides how many messages come with it.
async function resolveTargets(g, id) {
  const anchor = await g.users.messages.get({
    userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject'],
  });
  const subject = subjectOf(anchor.data);
  if (SCOPE !== 'thread') {
    return { subject, messages: [{ id: anchor.data.id, labels: anchor.data.labelIds || [] }] };
  }
  const thread = await g.users.threads.get({ userId: 'me', id: anchor.data.threadId, format: 'minimal' });
  const messages = (thread.data.messages || []).map((m) => ({ id: m.id, labels: m.labelIds || [] }));
  return { subject, thread: anchor.data.threadId, messages };
}

async function untrashOne(g, item) {
  const { subject, thread, messages } = await resolveTargets(g, item.id);
  if (item.expect && !new RegExp(item.expect, 'i').test(subject)) {
    return { id: item.id, skipped: 'subject mismatch', subject: subject.slice(0, 70) };
  }

  const planned = [];
  const result = { id: item.id, thread, subject: subject.slice(0, 70), scope: SCOPE, in_thread: messages.length, untrashed: 0, already_out: 0, in_spam: 0 };
  for (const m of messages) {
    if (m.labels.includes('SPAM')) { result.in_spam++; continue; }
    if (!m.labels.includes('TRASH')) { result.already_out++; continue; }
    planned.push(m);
  }

  if (!APPLY) {
    result.dry_run = true;
    result.would_untrash = planned.length;
    return result;
  }

  for (const m of planned) {
    await g.users.messages.modify({ userId: 'me', id: m.id, requestBody: { removeLabelIds: ['TRASH'] } });
    result.untrashed++;
  }

  // Post-condition from a re-fetch, not from the modify call returning 200. Two things must hold:
  // TRASH is gone, and INBOX was NOT added - the whole point of this script over gmailRestore.js.
  let stillTrashed = 0;
  let inboxAdded = 0;
  for (const m of planned) {
    const back = await g.users.messages.get({ userId: 'me', id: m.id, format: 'minimal' });
    const labels = back.data.labelIds || [];
    if (labels.includes('TRASH')) stillTrashed++;
    if (labels.includes('INBOX') && !m.labels.includes('INBOX')) inboxAdded++;
  }
  result.still_trashed = stillTrashed;
  result.inbox_wrongly_added = inboxAdded;
  return result;
}

(async () => {
  const g = await getColaberryGmailClient();
  const items = JSON.parse(process.env.ITEMS_JSON || '[]');
  if (!items.length) { fs.writeSync(2, 'ERR: ITEMS_JSON is required and must be a non-empty array\n'); process.exit(2); }

  const out = [];
  for (const item of items) {
    try {
      out.push(await untrashOne(g, item));
    } catch (err) {
      out.push({ id: item.id, error_class: errorClass(err), error: String(err.message || err).slice(0, 160) });
    }
  }

  fs.writeSync(1, JSON.stringify(out, null, 1) + '\n');
  if (!APPLY) fs.writeSync(1, 'DRY RUN. Nothing was changed. Re-run with APPLY=1 to write.\n');
  const bad = out.some((o) => o.error_class || o.still_trashed || o.inbox_wrongly_added);
  process.exit(bad ? 2 : 0);
})().catch((e) => { fs.writeSync(2, 'ERR ' + (e.stack || e) + '\n'); process.exit(1); });
