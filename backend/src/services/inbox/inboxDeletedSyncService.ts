// Deleted/Spam ingestion for the Missed Opportunities "Deleted But Potentially
// Valuable" recovery section. Pulls Gmail TRASH + SPAM (both accounts) and
// Hotmail Deleted Items + Junk into inbox_deleted_emails. These never enter the
// Inbox COS classification pipeline, so they live in their own table and are
// scored on read by the report. Idempotent (unique provider+message_id),
// bounded (trailing window + capped fetch) so it never walks an entire trash.

import { gmail_v1 } from 'googleapis';
import {
  getColaberryGmailClient,
  getPersonalGmailClient,
  extractGmailHeaders,
  parseFromHeader,
  parseAddressList,
  extractBodyText,
  extractBodyHtml,
} from './inboxSyncService';
import { isConfigured as graphConfigured, fetchFolderMessages, GraphMessage } from './graphMailService';
import { InboxDeletedEmail } from '../../models';
import type { InboxProvider } from '../../models/InboxEmail';
import type { DeletedFolder } from '../../models/InboxDeletedEmail';

const LOG_PREFIX = '[InboxCOS][Deleted]';
const GMAIL_QUERY = 'newer_than:2d';   // bound how far back we look
const GMAIL_MAX = 60;                   // cap per label per account
const GRAPH_TOP = 60;                   // cap per Hotmail folder

interface DeletedRow {
  provider: InboxProvider;
  provider_message_id: string;
  folder: DeletedFolder;
  from_address: string;
  from_name: string | null;
  to_addresses: any[];
  subject: string;
  body_text: string | null;
  body_html: string | null;
  headers: Record<string, string>;
  received_at: Date;
  has_attachments: boolean;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Gmail ───────────────────────────────────────────────────────────────
async function syncGmailLabel(
  provider: 'gmail_colaberry' | 'gmail_personal',
  gmail: gmail_v1.Gmail,
  labelId: 'TRASH' | 'SPAM',
): Promise<DeletedRow[]> {
  const folder: DeletedFolder = labelId === 'TRASH' ? 'trash' : 'spam';
  const rows: DeletedRow[] = [];
  try {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds: [labelId],
      q: GMAIL_QUERY,
      maxResults: GMAIL_MAX,
    });
    const ids = (listRes.data.messages || []).map((m) => m.id).filter((id): id is string => !!id);
    for (const id of ids) {
      try {
        const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
        const msg = full.data;
        if (!msg.id) continue;
        const headers = extractGmailHeaders(msg);
        const { name, address } = parseFromHeader(headers['from'] || '');
        rows.push({
          provider,
          provider_message_id: msg.id,
          folder,
          from_address: address,
          from_name: name,
          to_addresses: parseAddressList(headers['to'] || ''),
          subject: headers['subject'] || '(no subject)',
          body_text: extractBodyText(msg.payload),
          body_html: extractBodyHtml(msg.payload),
          headers,
          received_at: new Date(parseInt(msg.internalDate || '0', 10)),
          has_attachments: (msg.payload?.parts || []).some((p) => p.filename && p.filename.length > 0),
        });
      } catch (err: any) {
        console.error(`${LOG_PREFIX} [${provider}/${folder}] fetch ${id} failed: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} [${provider}/${folder}] list failed: ${err.message}`);
  }
  return rows;
}

// ─── Hotmail (Graph) ───────────────────────────────────────────────────────
function normalizeGraph(msg: GraphMessage, folder: DeletedFolder): DeletedRow {
  const headers: Record<string, string> = {};
  for (const h of msg.internetMessageHeaders || []) {
    if (h.name && h.value) headers[h.name.toLowerCase()] = h.value;
  }
  const isHtml = (msg.body?.contentType || '').toLowerCase() === 'html';
  const content = msg.body?.content || '';
  return {
    provider: 'hotmail',
    provider_message_id: msg.id,
    folder,
    from_address: (msg.from?.emailAddress?.address || '').toLowerCase(),
    from_name: msg.from?.emailAddress?.name || null,
    to_addresses: (msg.toRecipients || []).map((r) => ({ address: r.emailAddress.address, name: r.emailAddress.name })),
    subject: msg.subject || '(no subject)',
    body_text: isHtml ? stripHtml(content) : content,
    body_html: isHtml ? content : null,
    headers,
    received_at: new Date(msg.receivedDateTime),
    has_attachments: !!msg.hasAttachments,
  };
}

async function syncHotmailFolder(graphFolder: string, folder: DeletedFolder): Promise<DeletedRow[]> {
  try {
    const messages = await fetchFolderMessages(graphFolder, GRAPH_TOP);
    return messages.filter((m) => m.from?.emailAddress?.address).map((m) => normalizeGraph(m, folder));
  } catch (err: any) {
    console.error(`${LOG_PREFIX} [hotmail/${folder}] fetch failed: ${err.message}`);
    return [];
  }
}

// ─── Upsert ────────────────────────────────────────────────────────────────
async function upsertDeleted(rows: DeletedRow[]): Promise<number> {
  let created = 0;
  const now = new Date();
  for (const r of rows) {
    if (!r.from_address) continue;
    try {
      const [, wasCreated] = await InboxDeletedEmail.findOrCreate({
        where: { provider: r.provider, provider_message_id: r.provider_message_id },
        defaults: { ...r, discovered_at: now },
      });
      if (wasCreated) created += 1;
    } catch (err: any) {
      console.error(`${LOG_PREFIX} upsert ${r.provider}/${r.provider_message_id} failed: ${err.message}`);
    }
  }
  return created;
}

// ─── Public entry ──────────────────────────────────────────────────────────
export async function syncDeletedAndSpam(): Promise<{ created: number; scanned: number }> {
  const all: DeletedRow[] = [];

  const colaberry = getColaberryGmailClient();
  if (colaberry) {
    all.push(...await syncGmailLabel('gmail_colaberry', colaberry, 'TRASH'));
    all.push(...await syncGmailLabel('gmail_colaberry', colaberry, 'SPAM'));
  }
  const personal = getPersonalGmailClient();
  if (personal) {
    all.push(...await syncGmailLabel('gmail_personal', personal, 'TRASH'));
    all.push(...await syncGmailLabel('gmail_personal', personal, 'SPAM'));
  }
  if (graphConfigured()) {
    all.push(...await syncHotmailFolder('deleteditems', 'trash'));
    all.push(...await syncHotmailFolder('junkemail', 'spam'));
  }

  const created = await upsertDeleted(all);
  console.log(`${LOG_PREFIX} scanned ${all.length}, ${created} new deleted/spam emails stored`);
  return { created, scanned: all.length };
}
