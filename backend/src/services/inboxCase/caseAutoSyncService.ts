import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import SystemSetting from '../../models/SystemSetting';
import InboxEmail from '../../models/InboxEmail';
import InboxClassification from '../../models/InboxClassification';
import InboxCaseItem from '../../models/InboxCaseItem';
import OpsBcTodo from '../../models/OpsBcTodo';
import { getColaberryGmailClient, getPersonalGmailClient } from '../inbox/inboxSyncService';
import { isConfigured as isHotmailConfigured, fetchFolderMessages } from '../inbox/graphMailService';
import { searchAndNormalize } from './sources/gmailCaseSource';
import { toCandidate as hotmailToCandidate } from './sources/hotmailCaseSource';
import { todoToCandidate } from './sources/basecampCaseSource';
import { RawCandidateItem } from './sources/caseSourceAdapter';
import { ScoredCandidate, groupCandidates } from './caseGroupingService';
import { computeSourceHash } from './textNormalization';
import { persistClusterAsCase, DiscoveredCaseSummary } from './caseDiscoveryService';

// Hourly + manual "Sync Now" ingestion of Ali's real inbox into Cases,
// per his explicit request: "I would like the Cases to be in sync with my
// inbox... grouped through by subject or person but represent everything
// in my inbox." Deliberately DOES NOT make Inbox COS's tables the primary
// fetch source (Ali's own answer to the scoping question) — this keeps
// Cases' independent Gmail/Hotmail/Basecamp fetch exactly as it already
// is, and only READS Inbox COS's classification as a filter, never writes
// to it. Every auto-synced item is set INCLUDED directly and lands in a
// fresh case via the same persistClusterAsCase() path manual "Discover
// Related Work" already uses — no Assess/Plan is triggered automatically,
// preserving the approval-gate philosophy established earlier this
// session (Ali still explicitly clicks Run Assessment).

const CURSOR_KEY = 'inbox_case_auto_sync_cursor';
const DEFAULT_LOOKBACK_MS = 2 * 60 * 60 * 1000; // 2h on first run
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000; // safety cap on a delayed run

export interface AutoSyncResult {
  newCasesCreated: number;
  itemsAdded: number;
  emailsSkippedUnclassified: number;
}

async function readCursor(): Promise<Date> {
  const setting = await SystemSetting.findOne({ where: { key: CURSOR_KEY } });
  if (setting?.value?.cursor) {
    const parsed = new Date(setting.value.cursor);
    const floor = new Date(Date.now() - MAX_WINDOW_MS);
    return parsed < floor ? floor : parsed; // safety cap on a long-delayed run
  }
  return new Date(Date.now() - DEFAULT_LOOKBACK_MS);
}

async function writeCursor(at: Date): Promise<void> {
  await SystemSetting.upsert({ key: CURSOR_KEY, value: { cursor: at.toISOString() }, updated_by: null } as any);
}

function gmailWindowQuery(sinceHoursAgo: number): string {
  const hours = Math.max(1, Math.ceil(sinceHoursAgo));
  return `newer_than:${hours}h -in:sent`;
}

async function fetchRecentEmailCandidates(cursor: Date): Promise<RawCandidateItem[]> {
  const hoursAgo = (Date.now() - cursor.getTime()) / (60 * 60 * 1000);
  const items: RawCandidateItem[] = [];

  // Each mailbox is isolated behind its own try/catch — a broken credential
  // on ONE mailbox (e.g. a revoked OAuth grant) must never take down the
  // other two, healthy sources. This mirrors the resilience every
  // query-based case-source adapter already has via its own findCandidates()
  // wrapper (see gmailCaseSource.ts/hotmailCaseSource.ts's own try/catch) —
  // calling searchAndNormalize/fetchFolderMessages directly here (instead of
  // through those adapters, since auto-sync has no query to build
  // DiscoveryParams from) bypassed that existing isolation, so it's
  // reproduced here explicitly.
  const colaberryGmail = getColaberryGmailClient();
  if (colaberryGmail) {
    try {
      items.push(...(await searchAndNormalize(colaberryGmail, 'gmail_colaberry', gmailWindowQuery(hoursAgo), 'email')));
    } catch (err: any) {
      console.error(`[InboxCase][AutoSync] gmail_colaberry fetch failed, skipping this source: ${err?.message}`);
    }
  }

  const personalGmail = getPersonalGmailClient();
  if (personalGmail) {
    try {
      items.push(...(await searchAndNormalize(personalGmail, 'gmail_personal', gmailWindowQuery(hoursAgo), 'email')));
    } catch (err: any) {
      console.error(`[InboxCase][AutoSync] gmail_personal fetch failed, skipping this source: ${err?.message}`);
    }
  }

  if (isHotmailConfigured()) {
    try {
      const inbox = await fetchFolderMessages('inbox', 75);
      for (const msg of inbox) {
        if (new Date(msg.receivedDateTime) > cursor) items.push(hotmailToCandidate(msg, 'email'));
      }
    } catch (err: any) {
      console.error(`[InboxCase][AutoSync] hotmail fetch failed, skipping this source: ${err?.message}`);
    }
  }

  return items;
}

async function fetchRecentBasecampCandidates(cursor: Date): Promise<RawCandidateItem[]> {
  try {
    const todos = await OpsBcTodo.findAll({ where: { bc_updated_at: { [Op.gt]: cursor } } });
    return todos.map(todoToCandidate);
  } catch (err: any) {
    console.error(`[InboxCase][AutoSync] Basecamp fetch failed, skipping this source: ${err?.message}`);
    return [];
  }
}

// Only INBOX/ASK_USER-classified email counts as "in scope," per Ali's own
// answer — AUTOMATION (Cora already handled it) and SILENT_HOLD (already
// deliberately ignored) are excluded. An email Inbox COS hasn't classified
// yet is skipped for THIS run — its own classifier runs every ~65s, well
// inside the hourly cadence, so it will be picked up on a later run, not
// lost. This is a read-only cross-reference; Inbox COS's tables are never
// written to from here.
async function filterToInScopeEmails(
  items: RawCandidateItem[]
): Promise<{ kept: RawCandidateItem[]; skippedUnclassified: number }> {
  const kept: RawCandidateItem[] = [];
  let skippedUnclassified = 0;

  for (const item of items) {
    if (item.source_type !== 'email' && item.source_type !== 'sent_email') {
      kept.push(item); // Basecamp items have no Inbox COS classification concept
      continue;
    }
    const email = await InboxEmail.findOne({ where: { provider: item.provider, provider_message_id: item.source_id } });
    if (!email) {
      skippedUnclassified++;
      continue;
    }
    const classification = await InboxClassification.findOne({ where: { email_id: email.id } });
    if (!classification || !['INBOX', 'ASK_USER'].includes(classification.state)) {
      if (!classification) skippedUnclassified++;
      continue;
    }
    kept.push(item);
  }

  return { kept, skippedUnclassified };
}

async function dropAlreadyLinkedGlobally(items: RawCandidateItem[]): Promise<RawCandidateItem[]> {
  if (items.length === 0) return [];
  const hashByItem = items.map((item) => ({ item, hash: computeSourceHash(item.provider, item.source_id) }));
  const hashes = hashByItem.map((h) => h.hash);
  const existing = await InboxCaseItem.findAll({ where: { source_hash: { [Op.in]: hashes } } });
  const existingHashes = new Set(existing.map((e) => e.source_hash));
  return hashByItem.filter((h) => !existingHashes.has(h.hash)).map((h) => h.item);
}

function toScoredCandidate(item: RawCandidateItem): ScoredCandidate {
  return {
    ...item,
    score: 1,
    reasons: [{ kind: 'auto_synced_from_inbox', detail: 'Pulled in by the hourly inbox sync', weight: 1 }],
    sourceHash: computeSourceHash(item.provider, item.source_id),
    inclusionStatus: 'INCLUDED',
  };
}

export async function runAutoSync(triggeredBy: 'cron' | 'admin', requestedBy: string): Promise<AutoSyncResult> {
  const cursor = await readCursor();
  const runStartedAt = new Date();
  const correlationId = randomUUID();

  const [emailCandidatesRaw, basecampCandidates] = await Promise.all([
    fetchRecentEmailCandidates(cursor),
    fetchRecentBasecampCandidates(cursor),
  ]);

  const { kept: emailCandidates, skippedUnclassified } = await filterToInScopeEmails(emailCandidatesRaw);
  const surviving = await dropAlreadyLinkedGlobally([...emailCandidates, ...basecampCandidates]);

  const scored = surviving.map(toScoredCandidate);
  const clusters = groupCandidates(scored);

  let newCasesCreated = 0;
  let itemsAdded = 0;

  for (const cluster of clusters) {
    const summary: DiscoveredCaseSummary = await persistClusterAsCase(
      cluster,
      'TOPIC',
      cluster[0]?.title || 'Auto-synced from inbox',
      requestedBy,
      { auto_synced: true, triggered_by: triggeredBy },
      correlationId
    );
    newCasesCreated++;
    itemsAdded += summary.itemCount;
  }

  await writeCursor(runStartedAt);

  return { newCasesCreated, itemsAdded, emailsSkippedUnclassified: skippedUnclassified };
}
