import { isConfigured, fetchFolderMessages, GraphMessage } from '../../inbox/graphMailService';
import { extractBasecampReferences, normalizeEmailAddress, normalizeSubject } from '../textNormalization';
import { CaseSourceAdapter, DiscoveryParams, RawCandidateItem, withTimeout } from './caseSourceAdapter';

// Hotmail/MS Graph case-discovery adapter. Reuses graphMailService.ts (the
// simpler client inboxSyncService itself prefers over the full-MSAL
// msGraphService.ts — see architecture doc) rather than adding a third
// Graph client. graphMailService exposes no server-side search/query
// parameter, so this adapter fetches a bounded recent window per folder and
// filters client-side against the resolved identity/topic terms — the same
// deterministic scoring in matchScoring.ts still gates inclusion, this just
// bounds what's pulled over the wire.

const MAX_MESSAGES_PER_FOLDER = 75;
const MAX_BODY_EXCERPT_CHARS = 2000;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function withinWindow(receivedAt: Date, windowDays: number | null): boolean {
  if (windowDays === null) return true;
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  return receivedAt.getTime() >= cutoff;
}

function matchesQuery(msg: GraphMessage, params: DiscoveryParams): boolean {
  const participants = [
    msg.from?.emailAddress?.address,
    ...(msg.toRecipients || []).map((r) => r.emailAddress?.address),
    ...(msg.ccRecipients || []).map((r) => r.emailAddress?.address),
  ]
    .filter(Boolean)
    .map((a) => normalizeEmailAddress(a as string));

  if (params.mode === 'PERSON') {
    const knownEmailsNorm = params.knownEmails.map(normalizeEmailAddress);
    if (participants.some((p) => knownEmailsNorm.includes(p))) return true;
    const subjectLower = (msg.subject || '').toLowerCase();
    return params.knownDisplayNames.some((n) => n.length > 1 && subjectLower.includes(n.toLowerCase()));
  }

  const haystack = normalizeSubject(msg.subject || '');
  return [params.exactPhrase, ...params.subjectVariants].some(
    (term) => term && haystack.includes(normalizeSubject(term))
  );
}

function toCandidate(msg: GraphMessage, sourceType: 'email' | 'sent_email'): RawCandidateItem {
  const bodyText = msg.body?.contentType === 'html' ? stripHtml(msg.body.content || '') : msg.body?.content || '';
  const headerMap = new Map((msg.internetMessageHeaders || []).map((h) => [h.name.toLowerCase(), h.value]));

  return {
    source_type: sourceType,
    source_id: msg.id,
    provider: 'hotmail',
    source_url: null,
    title: msg.subject || '(no subject)',
    occurred_at: new Date(msg.receivedDateTime),
    participants: [
      msg.from?.emailAddress?.address,
      ...(msg.toRecipients || []).map((r) => r.emailAddress?.address),
      ...(msg.ccRecipients || []).map((r) => r.emailAddress?.address),
    ].filter(Boolean) as string[],
    subject_normalized: normalizeSubject(msg.subject || ''),
    thread_id: msg.conversationId || null,
    message_id: headerMap.get('message-id') || null,
    in_reply_to: [headerMap.get('in-reply-to'), headerMap.get('references')].filter(Boolean) as string[],
    basecamp_refs: extractBasecampReferences(bodyText),
    attachment_names: msg.hasAttachments ? ['(attachment metadata not fetched at discovery time)'] : [],
    body_excerpt: bodyText.slice(0, MAX_BODY_EXCERPT_CHARS),
    snapshot: {
      from_name: msg.from?.emailAddress?.name,
      from_address: msg.from?.emailAddress?.address,
      subject: msg.subject,
      has_attachments: msg.hasAttachments,
    },
  };
}

export const hotmailCaseSource: CaseSourceAdapter = {
  provider: 'hotmail',
  isConfigured,
  async findCandidates(params: DiscoveryParams): Promise<RawCandidateItem[]> {
    if (!isConfigured()) return [];

    const run = async () => {
      const [inbox, sent] = await Promise.all([
        fetchFolderMessages('inbox', MAX_MESSAGES_PER_FOLDER),
        fetchFolderMessages('sentitems', MAX_MESSAGES_PER_FOLDER),
      ]);

      const inboxCandidates = inbox
        .filter((m) => withinWindow(new Date(m.receivedDateTime), params.windowDays) && matchesQuery(m, params))
        .map((m) => toCandidate(m, 'email'));
      const sentCandidates = sent
        .filter((m) => withinWindow(new Date(m.receivedDateTime), params.windowDays) && matchesQuery(m, params))
        .map((m) => toCandidate(m, 'sent_email'));

      return [...inboxCandidates, ...sentCandidates];
    };

    try {
      return await withTimeout(run(), 'hotmail', params.timeoutMs);
    } catch (err: any) {
      console.error(`[InboxCase][hotmail] discovery failed: ${err?.message}`);
      return [];
    }
  },
};
