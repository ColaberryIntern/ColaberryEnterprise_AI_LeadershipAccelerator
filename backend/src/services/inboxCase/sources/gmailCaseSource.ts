import { gmail_v1 } from 'googleapis';
import {
  getColaberryGmailClient,
  getPersonalGmailClient,
  extractGmailHeaders,
  parseFromHeader,
  parseAddressList,
  extractBodyText,
} from '../../inbox/inboxSyncService';
import { CaseProvider } from '../../../types/inboxCase';
import { extractBasecampReferences, normalizeSubject } from '../textNormalization';
import { CaseSourceAdapter, DiscoveryParams, RawCandidateItem, withTimeout } from './caseSourceAdapter';

// Gmail case-discovery adapter. Reuses the SAME OAuth2 clients as the
// existing Inbox COS sync (services/inbox/inboxSyncService.ts) — no second
// Gmail auth flow. Deliberately does NOT touch inboxSyncService's own
// incremental-sync state (lastHistoryId) — this is a read-only, on-demand
// search, run entirely independently of the 1-minute background sync.
//
// The `-in:sent` guard in inboxSyncService's normal sync exists to prevent a
// self-reply loop (see that file's fetchRecentMessageIds comment). That
// protection is intentionally NOT carried over here: case discovery queries
// `in:sent` on purpose, as a SEPARATE query, to pull prior sent replies as
// context (root directive section 14: "Sent mail is queried separately only
// during case discovery").

const MAX_RESULTS_PER_QUERY = 40;
const MAX_BODY_EXCERPT_CHARS = 2000;

function buildPersonQuery(emails: string[], names: string[], windowDays: number | null): string {
  const clauses: string[] = [];
  for (const e of emails) clauses.push(`from:${e}`, `to:${e}`, `cc:${e}`);
  for (const n of names) {
    if (n && n.length > 1) clauses.push(`"${n}"`);
  }
  const scope = clauses.length > 0 ? `(${clauses.join(' OR ')})` : '';
  const window = windowDays ? `newer_than:${windowDays}d` : '';
  return [scope, window].filter(Boolean).join(' ');
}

function buildTopicQuery(exactPhrase: string, subjectVariants: string[], windowDays: number | null): string {
  const terms = Array.from(new Set([exactPhrase, ...subjectVariants].filter(Boolean)));
  const scope = terms.length > 0 ? `(${terms.map((t) => `"${t}"`).join(' OR ')})` : '';
  const window = windowDays ? `newer_than:${windowDays}d` : '';
  return [scope, window].filter(Boolean).join(' ');
}

async function searchAndNormalize(
  gmail: gmail_v1.Gmail,
  provider: CaseProvider,
  query: string,
  sourceType: 'email' | 'sent_email'
): Promise<RawCandidateItem[]> {
  if (!query.trim()) return [];

  const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: MAX_RESULTS_PER_QUERY });
  const ids = (listRes.data.messages || []).map((m) => m.id).filter((id): id is string => !!id);

  const items: RawCandidateItem[] = [];
  for (const id of ids) {
    try {
      const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const msg = full.data;
      if (!msg.id) continue;

      const headers = extractGmailHeaders(msg);
      const { name: fromName, address: fromAddress } = parseFromHeader(headers['from'] || '');
      const toAddrs = parseAddressList(headers['to'] || '').map((a) => a.address);
      const ccAddrs = parseAddressList(headers['cc'] || '').map((a) => a.address);
      const subject = headers['subject'] || '(no subject)';
      const bodyText = extractBodyText(msg.payload) || '';
      const attachmentNames = (msg.payload?.parts || [])
        .filter((p) => p.filename && p.filename.length > 0)
        .map((p) => p.filename as string);

      items.push({
        source_type: sourceType,
        source_id: msg.id,
        provider,
        // Gmail's web UI opens a specific message when the id is passed as
        // the #all/<id> fragment — works across any label/folder view.
        // Assumes the first Google account slot (u/0) in the browser
        // session, which matches how this integration authenticates (one
        // fixed mailbox per provider, not an ambiguous multi-account login).
        source_url: `https://mail.google.com/mail/u/0/#all/${msg.id}`,
        title: subject,
        occurred_at: new Date(parseInt(msg.internalDate || '0', 10) || Date.now()),
        participants: [fromAddress, ...toAddrs, ...ccAddrs].filter(Boolean),
        subject_normalized: normalizeSubject(subject),
        thread_id: msg.threadId || null,
        message_id: headers['message-id'] || null,
        in_reply_to: [headers['in-reply-to'], headers['references']].filter(Boolean) as string[],
        basecamp_refs: extractBasecampReferences(bodyText),
        attachment_names: attachmentNames,
        body_excerpt: bodyText.slice(0, MAX_BODY_EXCERPT_CHARS),
        snapshot: {
          from_name: fromName,
          from_address: fromAddress,
          to_addresses: toAddrs,
          cc_addresses: ccAddrs,
          subject,
          has_attachments: attachmentNames.length > 0,
        },
      });
    } catch (err: any) {
      console.error(`[InboxCase][Gmail] Failed to fetch message ${id}: ${err?.message}`);
    }
  }
  return items;
}

function makeAdapter(provider: 'gmail_colaberry' | 'gmail_personal', getClient: () => gmail_v1.Gmail | null): CaseSourceAdapter {
  return {
    provider,
    isConfigured: () => getClient() !== null,
    async findCandidates(params: DiscoveryParams): Promise<RawCandidateItem[]> {
      const gmail = getClient();
      if (!gmail) return [];

      const inboxQuery =
        params.mode === 'PERSON'
          ? buildPersonQuery(params.knownEmails, params.knownDisplayNames, params.windowDays)
          : buildTopicQuery(params.exactPhrase, params.subjectVariants, params.windowDays);
      const sentQuery = `in:sent ${inboxQuery}`.trim();

      const run = async () => {
        const [inboxItems, sentItems] = await Promise.all([
          searchAndNormalize(gmail, provider, inboxQuery, 'email'),
          searchAndNormalize(gmail, provider, sentQuery, 'sent_email'),
        ]);
        return [...inboxItems, ...sentItems];
      };

      try {
        return await withTimeout(run(), provider, params.timeoutMs);
      } catch (err: any) {
        console.error(`[InboxCase][${provider}] discovery failed: ${err?.message}`);
        return [];
      }
    },
  };
}

export const gmailColaberryCaseSource = makeAdapter('gmail_colaberry', getColaberryGmailClient);
export const gmailPersonalCaseSource = makeAdapter('gmail_personal', getPersonalGmailClient);
