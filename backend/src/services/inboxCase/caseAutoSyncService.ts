import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import SystemSetting from '../../models/SystemSetting';
import InboxEmail from '../../models/InboxEmail';
import InboxClassification from '../../models/InboxClassification';
import InboxDeletedEmail from '../../models/InboxDeletedEmail';
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
import { logCaseEvent } from './caseEventLog';
import { evaluateClosureGuard, closeCase } from './caseClosureService';

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

// Reads InboxDeletedEmail (already kept current by the already-scheduled,
// unrelated syncDeletedAndSpam() cron — never written to here) and, for any
// still-open email/sent_email item whose source message now shows up
// there, dispositions it NO_ACTION with a clear reason. If that was the
// last thing blocking a case, the case closes opportunistically through
// the real evaluateClosureGuard()/closeCase() gate — never forced. Per
// Ali's request: "When something is deleted from regular inbox and the
// system is sync'd then it should remove from the list."
async function disposeItemsDeletedAtSource(correlationId: string): Promise<number> {
  const openItems = await InboxCaseItem.findAll({
    where: {
      disposition: null,
      inclusion_status: { [Op.ne]: 'EXCLUDED' },
      source_type: { [Op.in]: ['email', 'sent_email'] },
    },
  });
  if (openItems.length === 0) return 0;

  let disposed = 0;
  const affectedCaseIds = new Set<string>();

  for (const item of openItems) {
    const deletedMatch = await InboxDeletedEmail.findOne({ where: { provider: item.provider, provider_message_id: item.source_id } });
    if (!deletedMatch) continue;

    await item.update({
      disposition: 'NO_ACTION',
      disposition_reason: 'Source message was deleted or moved to trash/spam in your inbox (detected automatically)',
      updated_at: new Date(),
    });
    await logCaseEvent({
      case_id: item.case_id,
      item_id: item.id,
      event_type: 'item_removed_at_source',
      actor_type: 'system',
      actor_id: 'case_auto_sync_service',
      details: { provider: item.provider, source_id: item.source_id },
      correlation_id: correlationId,
    });
    disposed++;
    affectedCaseIds.add(item.case_id);
  }

  for (const caseId of affectedCaseIds) {
    const guard = await evaluateClosureGuard(caseId);
    if (guard.canClose) await closeCase(caseId, 'system');
  }

  return disposed;
}

export type SyncStage = 'fetching_email' | 'fetching_basecamp' | 'classifying' | 'clustering_and_removing_stale' | null;

export interface SyncStatus {
  inProgress: boolean;
  stage: SyncStage;
  startedAt: string | null;
  lastCompletedAt: string | null;
  lastResult: AutoSyncResult | null;
}

// Single-instance in-memory tracker (this backend runs as one container per
// the documented deploy model — no replicas — so this is safe and needs no
// shared-state infra). Doubles as a concurrency guard: a call arriving
// while a run is already in progress returns immediately without starting
// a second overlapping run, per Idempotency & Replayability.
let syncStatus: SyncStatus = { inProgress: false, stage: null, startedAt: null, lastCompletedAt: null, lastResult: null };

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
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
  if (syncStatus.inProgress) {
    // Concurrency guard: never run two syncs at once (the cron firing while
    // a manual sync is still in flight, or two admins loading the page at
    // the same moment). The caller's own toast/result is a minor UX
    // trade-off in this rare case — the frontend's progress bar polls
    // getSyncStatus() separately for the real, in-flight picture.
    return { newCasesCreated: 0, itemsAdded: 0, emailsSkippedUnclassified: 0 };
  }

  syncStatus = { inProgress: true, stage: 'fetching_email', startedAt: new Date().toISOString(), lastCompletedAt: syncStatus.lastCompletedAt, lastResult: syncStatus.lastResult };

  try {
    const cursor = await readCursor();
    const runStartedAt = new Date();
    const correlationId = randomUUID();

    syncStatus = { ...syncStatus, stage: 'fetching_email' };
    const emailCandidatesRaw = await fetchRecentEmailCandidates(cursor);

    syncStatus = { ...syncStatus, stage: 'fetching_basecamp' };
    const basecampCandidates = await fetchRecentBasecampCandidates(cursor);

    syncStatus = { ...syncStatus, stage: 'classifying' };
    const { kept: emailCandidates, skippedUnclassified } = await filterToInScopeEmails(emailCandidatesRaw);
    const surviving = await dropAlreadyLinkedGlobally([...emailCandidates, ...basecampCandidates]);

    syncStatus = { ...syncStatus, stage: 'clustering_and_removing_stale' };
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

    await disposeItemsDeletedAtSource(correlationId);
    await writeCursor(runStartedAt);

    const result: AutoSyncResult = { newCasesCreated, itemsAdded, emailsSkippedUnclassified: skippedUnclassified };
    syncStatus = { inProgress: false, stage: null, startedAt: syncStatus.startedAt, lastCompletedAt: new Date().toISOString(), lastResult: result };
    return result;
  } finally {
    // Always clear inProgress even on an unexpected throw — a stuck tracker
    // would permanently block every future sync (cron and manual alike).
    if (syncStatus.inProgress) {
      syncStatus = { ...syncStatus, inProgress: false, stage: null };
    }
  }
}
