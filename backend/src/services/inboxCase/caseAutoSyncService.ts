import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import SystemSetting from '../../models/SystemSetting';
import InboxEmail from '../../models/InboxEmail';
import InboxClassification from '../../models/InboxClassification';
import InboxDeletedEmail from '../../models/InboxDeletedEmail';
import InboxCaseItem from '../../models/InboxCaseItem';
import OpsBcTodo from '../../models/OpsBcTodo';
import { getColaberryGmailClient, getPersonalGmailClient, extractBodyText } from '../inbox/inboxSyncService';
import { isConfigured as isHotmailConfigured, fetchFolderMessages } from '../inbox/graphMailService';
import { searchAndNormalize } from './sources/gmailCaseSource';
import { toCandidate as hotmailToCandidate } from './sources/hotmailCaseSource';
import { todoToCandidate, fetchExactReference, resolveDigestTodoByTitle } from './sources/basecampCaseSource';
import { RawCandidateItem } from './sources/caseSourceAdapter';
import { ScoredCandidate, groupCandidates } from './caseGroupingService';
import { computeSourceHash, BasecampReference, parseDigestTodoLines, isBasecampDigestSender } from './textNormalization';
import { persistClusterAsCase, DiscoveredCaseSummary, MAX_CANDIDATES_PER_CASE } from './caseDiscoveryService';
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

// Resolves live Basecamp references embedded in already-in-scope email
// bodies (e.g. Basecamp's own "N to-dos due soon" digest, which links one
// URL per to-do) into real candidate items, so the existing planner's
// buildBasecampCommentActions() can propose a real per-to-do action instead
// of a generic reply against the digest itself. MUST be called with the
// already-filtered (filterToInScopeEmails) kept list, never the raw
// pre-filter candidates — an AUTOMATION/SILENT_HOLD-classified email's
// Basecamp references must not resurrect it into a new case.
async function expandBasecampReferencedItems(inScopeEmailItems: RawCandidateItem[]): Promise<RawCandidateItem[]> {
  const refsByRecordingId = new Map<string, BasecampReference>();
  for (const item of inScopeEmailItems) {
    for (const ref of item.basecamp_refs) refsByRecordingId.set(ref.recordingId, ref);
  }
  if (refsByRecordingId.size === 0) return [];

  const bounded = [...refsByRecordingId.values()].slice(0, MAX_CANDIDATES_PER_CASE);
  const resolved = await Promise.all(bounded.map((ref) => fetchExactReference(ref)));
  return resolved.filter((item): item is RawCandidateItem => item !== null);
}

// Resolves Basecamp's OTHER digest format — the periodic "N to-dos due soon"
// rollup, which embeds ZERO per-to-do URLs (confirmed against 3 real
// production samples; only expandBasecampReferencedItems's URL-based path
// above handles individual notification emails that DO embed a link). Each
// to-do is plain text, parsed by parseDigestTodoLines and resolved by exact
// title match against the local Basecamp mirror. Scoped to gmail_colaberry
// only (every real observed digest is on that provider — the business
// Basecamp account is tied to the business mailbox); any digest-sender item
// on a different provider is skipped with a log, never attempted against the
// wrong client.
async function expandDigestTextTodos(inScopeEmailItems: RawCandidateItem[], gmail: ReturnType<typeof getColaberryGmailClient>): Promise<RawCandidateItem[]> {
  if (!gmail) return [];
  // Pre-filter dedup within this expansion pass alone (avoids redundant
  // Gmail/mirror lookups when two digests in the same run mention the same
  // title) — dedupeBySourceHash() below is the real cross-source safety net,
  // this is a performance nicety on top of it, not a substitute.
  const resolvedByHash = new Map<string, RawCandidateItem>();

  for (const item of inScopeEmailItems) {
    if (item.basecamp_refs.length > 0) continue; // already handled by the URL path
    if (!isBasecampDigestSender((item.snapshot as any)?.from_address)) continue;
    if (item.provider !== 'gmail_colaberry') {
      console.error(`[InboxCase][AutoSync] Digest-sender item on unsupported provider ${item.provider} — skipping text-parse expansion (only gmail_colaberry is wired).`);
      continue;
    }

    let bodyText = '';
    try {
      const full = await gmail.users.messages.get({ userId: 'me', id: item.source_id, format: 'full' });
      bodyText = extractBodyText(full.data.payload) || '';
    } catch (err: any) {
      console.error(`[InboxCase][AutoSync] Digest re-fetch failed for ${item.source_id}: ${err?.message}`);
      continue;
    }

    for (const todo of parseDigestTodoLines(bodyText)) {
      const candidate = await resolveDigestTodoByTitle(todo.title);
      if (!candidate) continue;
      candidate.thread_id = item.thread_id; // borrow the digest's own thread_id so shareThreadOrReplyChain clusters them together
      const hash = computeSourceHash(candidate.provider, candidate.source_id);
      if (!resolvedByHash.has(hash)) resolvedByHash.set(hash, candidate);
    }
  }

  return [...resolvedByHash.values()];
}

// Cross-source dedup before clustering — a to-do can legitimately surface
// from more than one source in the same run (e.g. fresh via the
// bc_updated_at cursor AND resolved-by-title from a digest mentioning it).
// Without this, groupCandidates() would see two distinct object instances
// for the same underlying record and could persist it twice, across two
// different cases. On a collision, keeps whichever instance carries a real
// thread_id (the clustering-relevant one) rather than first-seen-wins, so
// this is safe regardless of which order the pools are merged in.
function dedupeBySourceHash(items: RawCandidateItem[]): RawCandidateItem[] {
  const byHash = new Map<string, RawCandidateItem>();
  for (const item of items) {
    const hash = computeSourceHash(item.provider, item.source_id);
    const existing = byHash.get(hash);
    if (!existing) {
      byHash.set(hash, item);
    } else if (!existing.thread_id && item.thread_id) {
      byHash.set(hash, item);
    }
  }
  return [...byHash.values()];
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

    // Must run on the already-filtered, in-scope list — never the raw
    // pre-filter candidates — so an AUTOMATION/SILENT_HOLD email's Basecamp
    // references can't resurrect it into a new case.
    syncStatus = { ...syncStatus, stage: 'fetching_basecamp' };
    const expandedBasecampItems = await expandBasecampReferencedItems(emailCandidates);
    const textResolvedItems = await expandDigestTextTodos(emailCandidates, getColaberryGmailClient());

    syncStatus = { ...syncStatus, stage: 'classifying' };
    const merged = dedupeBySourceHash([...emailCandidates, ...basecampCandidates, ...expandedBasecampItems, ...textResolvedItems]);
    const surviving = await dropAlreadyLinkedGlobally(merged);

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
