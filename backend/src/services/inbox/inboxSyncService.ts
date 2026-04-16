/**
 * Inbox Sync Service — Polls all 3 mailboxes, normalizes messages, upserts to inbox_emails.
 * Supports incremental sync via Gmail historyId and MS Graph deltaLink.
 */
import { google, gmail_v1 } from 'googleapis';
import InboxEmail, { InboxProvider } from '../../models/InboxEmail';
import SystemSetting from '../../models/SystemSetting';
import { fetchNewMessages, isConfigured as isMsGraphConfigured, GraphMessage } from './msGraphService';

const LOG_PREFIX = '[InboxCOS][Sync]';

// ─── Types ──────────────────────────────────────────────────────────────────

interface NormalizedEmail {
  provider: InboxProvider;
  provider_message_id: string;
  provider_thread_id: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: any[];
  cc_addresses: any[];
  subject: string;
  body_text: string | null;
  body_html: string | null;
  headers: Record<string, string>;
  received_at: Date;
  has_attachments: boolean;
}

interface SyncState {
  gmail_colaberry: { lastHistoryId?: string };
  gmail_personal: { lastHistoryId?: string };
  hotmail: { deltaLink?: string };
}

const SYNC_STATE_KEY = 'inbox_cos_sync_state';

// ─── Sync State Persistence ─────────────────────────────────────────────────

let syncState: SyncState = {
  gmail_colaberry: {},
  gmail_personal: {},
  hotmail: {},
};

async function loadSyncState(): Promise<void> {
  try {
    const setting = await SystemSetting.findOne({ where: { key: SYNC_STATE_KEY } });
    if (setting?.value) {
      syncState = {
        gmail_colaberry: setting.value.gmail_colaberry || {},
        gmail_personal: setting.value.gmail_personal || {},
        hotmail: setting.value.hotmail || {},
      };
      console.log(`${LOG_PREFIX} Loaded sync state from DB`);
    }
  } catch (error: any) {
    console.warn(`${LOG_PREFIX} Failed to load sync state, starting fresh: ${error.message}`);
  }
}

async function saveSyncState(): Promise<void> {
  try {
    const [setting] = await SystemSetting.findOrCreate({
      where: { key: SYNC_STATE_KEY },
      defaults: {
        key: SYNC_STATE_KEY,
        value: syncState,
        updated_by: null,
      } as any,
    });

    await setting.update({ value: syncState });
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Failed to save sync state: ${error.message}`);
  }
}

// ─── Gmail Client Factory ───────────────────────────────────────────────────

function getColaberryGmailClient(): gmail_v1.Gmail | null {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function getPersonalGmailClient(): gmail_v1.Gmail | null {
  const clientId = process.env.GMAIL_PERSONAL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_PERSONAL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_PERSONAL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// ─── Gmail Sync Helper ──────────────────────────────────────────────────────

async function syncGmailAccount(
  provider: 'gmail_colaberry' | 'gmail_personal',
  gmail: gmail_v1.Gmail
): Promise<NormalizedEmail[]> {
  const normalized: NormalizedEmail[] = [];
  const stateEntry = syncState[provider];
  const lastHistoryId = stateEntry.lastHistoryId;

  try {
    let messageIds: string[] = [];

    if (lastHistoryId) {
      // Incremental sync via history API
      try {
        const historyRes = await gmail.users.history.list({
          userId: 'me',
          startHistoryId: lastHistoryId,
          historyTypes: ['messageAdded'],
        });

        const histories = historyRes.data.history || [];
        for (const history of histories) {
          const added = history.messagesAdded || [];
          for (const item of added) {
            if (item.message?.id) {
              messageIds.push(item.message.id);
            }
          }
        }

        // Update history ID for next sync
        if (historyRes.data.historyId) {
          stateEntry.lastHistoryId = historyRes.data.historyId;
        }
      } catch (error: any) {
        // historyId may be expired (404/400), fall back to list
        if (error.code === 404 || error.code === 400) {
          console.warn(`${LOG_PREFIX} [${provider}] History expired, falling back to list query`);
          stateEntry.lastHistoryId = undefined;
          messageIds = await fetchRecentMessageIds(gmail);
        } else {
          throw error;
        }
      }
    } else {
      // Initial sync — fetch recent messages
      messageIds = await fetchRecentMessageIds(gmail);
    }

    // Deduplicate
    const uniqueIds = [...new Set(messageIds)];
    console.log(`${LOG_PREFIX} [${provider}] Found ${uniqueIds.length} messages to sync`);

    for (const msgId of uniqueIds) {
      try {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'full',
        });

        const msg = full.data;
        if (!msg.id) continue;

        const headers = extractGmailHeaders(msg);
        const fromHeader = headers['from'] || '';
        const { name, address } = parseFromHeader(fromHeader);

        // Get history ID from the message for tracking
        if (msg.historyId && (!stateEntry.lastHistoryId || msg.historyId > stateEntry.lastHistoryId)) {
          stateEntry.lastHistoryId = msg.historyId;
        }

        normalized.push({
          provider,
          provider_message_id: msg.id,
          provider_thread_id: msg.threadId || null,
          from_address: address,
          from_name: name,
          to_addresses: parseAddressList(headers['to'] || ''),
          cc_addresses: parseAddressList(headers['cc'] || ''),
          subject: headers['subject'] || '(no subject)',
          body_text: extractBodyText(msg.payload),
          body_html: extractBodyHtml(msg.payload),
          headers,
          received_at: new Date(parseInt(msg.internalDate || '0', 10)),
          has_attachments: (msg.payload?.parts || []).some(
            (p) => p.filename && p.filename.length > 0
          ),
        });
      } catch (error: any) {
        console.error(`${LOG_PREFIX} [${provider}] Failed to fetch message ${msgId}: ${error.message}`);
      }
    }
  } catch (error: any) {
    console.error(`${LOG_PREFIX} [${provider}] Sync failed: ${error.message}`);
    throw error;
  }

  return normalized;
}

async function fetchRecentMessageIds(gmail: gmail_v1.Gmail): Promise<string[]> {
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: 'newer_than:1d',
    maxResults: 100,
  });

  return (listRes.data.messages || [])
    .map((m) => m.id)
    .filter((id): id is string => !!id);
}

// ─── Hotmail Sync ───────────────────────────────────────────────────────────

async function syncHotmail(): Promise<NormalizedEmail[]> {
  const normalized: NormalizedEmail[] = [];
  const deltaLink = syncState.hotmail.deltaLink;

  const result = await fetchNewMessages(deltaLink || undefined);
  syncState.hotmail.deltaLink = result.nextDeltaLink;

  for (const msg of result.messages) {
    const headers = graphHeadersToMap(msg.internetMessageHeaders || []);
    const bodyText = msg.body.contentType === 'text'
      ? msg.body.content
      : stripHtml(msg.body.content);

    normalized.push({
      provider: 'hotmail',
      provider_message_id: msg.id,
      provider_thread_id: msg.conversationId || null,
      from_address: msg.from?.emailAddress?.address || '',
      from_name: msg.from?.emailAddress?.name || null,
      to_addresses: (msg.toRecipients || []).map((r: any) => ({
        address: r.emailAddress?.address || '',
        name: r.emailAddress?.name || '',
      })),
      cc_addresses: (msg.ccRecipients || []).map((r: any) => ({
        address: r.emailAddress?.address || '',
        name: r.emailAddress?.name || '',
      })),
      subject: msg.subject || '(no subject)',
      body_text: bodyText,
      body_html: msg.body.contentType === 'html' ? msg.body.content : null,
      headers,
      received_at: new Date(msg.receivedDateTime),
      has_attachments: msg.hasAttachments || false,
    });
  }

  return normalized;
}

// ─── Upsert Logic ───────────────────────────────────────────────────────────

async function upsertEmails(emails: NormalizedEmail[]): Promise<number> {
  let newCount = 0;

  for (const email of emails) {
    try {
      const [, created] = await InboxEmail.findOrCreate({
        where: {
          provider: email.provider,
          provider_message_id: email.provider_message_id,
        },
        defaults: {
          provider: email.provider,
          provider_message_id: email.provider_message_id,
          provider_thread_id: email.provider_thread_id,
          from_address: email.from_address,
          from_name: email.from_name,
          to_addresses: email.to_addresses,
          cc_addresses: email.cc_addresses,
          subject: email.subject,
          body_text: email.body_text,
          body_html: email.body_html,
          headers: email.headers,
          received_at: email.received_at,
          synced_at: new Date(),
          has_attachments: email.has_attachments,
        },
      });

      if (created) newCount++;
    } catch (error: any) {
      console.error(
        `${LOG_PREFIX} Upsert failed for ${email.provider}/${email.provider_message_id}: ${error.message}`
      );
    }
  }

  return newCount;
}

// ─── Main Sync Entry Point ──────────────────────────────────────────────────

/**
 * Syncs all configured mailboxes. Returns count of new emails synced and any errors.
 */
export async function syncAllMailboxes(): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let totalNew = 0;

  // Load persisted sync state on first run
  await loadSyncState();

  // --- Gmail (Colaberry) ---
  const colaberryGmail = getColaberryGmailClient();
  if (colaberryGmail) {
    try {
      const emails = await syncGmailAccount('gmail_colaberry', colaberryGmail);
      const newCount = await upsertEmails(emails);
      totalNew += newCount;
      console.log(`${LOG_PREFIX} [gmail_colaberry] Synced ${emails.length} messages, ${newCount} new`);
    } catch (error: any) {
      const msg = `gmail_colaberry: ${error.message}`;
      console.error(`${LOG_PREFIX} ${msg}`);
      errors.push(msg);
    }
  } else {
    console.log(`${LOG_PREFIX} [gmail_colaberry] Skipped — not configured`);
  }

  // --- Gmail (Personal) ---
  const personalGmail = getPersonalGmailClient();
  if (personalGmail) {
    try {
      const emails = await syncGmailAccount('gmail_personal', personalGmail);
      const newCount = await upsertEmails(emails);
      totalNew += newCount;
      console.log(`${LOG_PREFIX} [gmail_personal] Synced ${emails.length} messages, ${newCount} new`);
    } catch (error: any) {
      const msg = `gmail_personal: ${error.message}`;
      console.error(`${LOG_PREFIX} ${msg}`);
      errors.push(msg);
    }
  } else {
    console.log(`${LOG_PREFIX} [gmail_personal] Skipped — not configured`);
  }

  // --- Hotmail ---
  if (isMsGraphConfigured()) {
    try {
      const emails = await syncHotmail();
      const newCount = await upsertEmails(emails);
      totalNew += newCount;
      console.log(`${LOG_PREFIX} [hotmail] Synced ${emails.length} messages, ${newCount} new`);
    } catch (error: any) {
      const msg = `hotmail: ${error.message}`;
      console.error(`${LOG_PREFIX} ${msg}`);
      errors.push(msg);
    }
  } else {
    console.log(`${LOG_PREFIX} [hotmail] Skipped — not configured`);
  }

  // Persist sync state for crash recovery
  await saveSyncState();

  console.log(`${LOG_PREFIX} Sync complete: ${totalNew} new emails, ${errors.length} errors`);
  return { synced: totalNew, errors };
}

// ─── Parsing Helpers ────────────────────────────────────────────────────────

function extractGmailHeaders(msg: gmail_v1.Schema$Message): Record<string, string> {
  const headers: Record<string, string> = {};
  const parts = msg.payload?.headers || [];
  for (const header of parts) {
    if (header.name && header.value) {
      headers[header.name.toLowerCase()] = header.value;
    }
  }
  return headers;
}

function parseFromHeader(from: string): { name: string | null; address: string } {
  // "John Doe <john@example.com>" or "john@example.com"
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return {
      name: match[1].replace(/^["']|["']$/g, '').trim() || null,
      address: match[2].trim().toLowerCase(),
    };
  }
  return { name: null, address: from.trim().toLowerCase() };
}

function parseAddressList(header: string): Array<{ address: string; name: string }> {
  if (!header) return [];

  return header.split(',').map((entry) => {
    const match = entry.trim().match(/^(.+?)\s*<(.+?)>$/);
    if (match) {
      return {
        name: match[1].replace(/^["']|["']$/g, '').trim(),
        address: match[2].trim().toLowerCase(),
      };
    }
    return { name: '', address: entry.trim().toLowerCase() };
  }).filter((a) => a.address);
}

function extractBodyText(payload: gmail_v1.Schema$MessagePart | undefined): string | null {
  if (!payload) return null;

  // Direct text/plain body
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  // Search parts recursively
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBodyText(part);
      if (text) return text;
    }
  }

  // Fallback: strip HTML from text/html part
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    return stripHtml(html);
  }

  return null;
}

function extractBodyHtml(payload: gmail_v1.Schema$MessagePart | undefined): string | null {
  if (!payload) return null;

  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const html = extractBodyHtml(part);
      if (html) return html;
    }
  }

  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function graphHeadersToMap(headers: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    if (h.name && h.value) {
      map[h.name.toLowerCase()] = h.value;
    }
  }
  return map;
}
