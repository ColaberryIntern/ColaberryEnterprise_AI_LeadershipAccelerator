import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import InboxCase from '../../models/InboxCase';
import InboxCaseAction from '../../models/InboxCaseAction';
import InboxCaseItem from '../../models/InboxCaseItem';
import OpsBcTodo from '../../models/OpsBcTodo';
import { SourceGoneReason } from '../../types/inboxCase';
import { getColaberryGmailClient, getPersonalGmailClient } from '../inbox/inboxSyncService';
import { isConfigured as isHotmailConfigured, isMessageInInbox as isHotmailMessageInInbox } from '../inbox/graphMailService';
import { shouldSkip as providerInBackoff } from '../inbox/inboxSyncBackoff';
import { classifyError } from '../../utils/errorClassifier';
import { DEFAULT_PROVIDER_TIMEOUT_MS, withTimeout } from './sources/caseSourceAdapter';
import { rejectAction } from './caseApprovalService';
import { closeCase, evaluateClosureGuard } from './caseClosureService';
import { logCaseEvent } from './caseEventLog';

// /inbox-zero T16 — inbox liveness.
//
// Ali: "This process should only be looking in my current inboxes. If I
// delete something from my inbox, then it should not show up on this report."
//
// The case engine builds a case from what was in the inbox at discovery time
// and, before this file, never asked again (discovery-07). An archive or a
// delete is a decision Ali already made; re-asking is the opposite of
// clearing his inbox. This service asks the provider — never the stale
// snapshot, never the COS classification row — whether each source is still
// in the inbox, materialises the answer on inbox_case_items, and dispositions
// what is gone through the engine's own item → closure-guard → close path.
//
// Three outcomes, and the distinction is load-bearing (same contract as
// externalVerifiers): live / gone / unverifiable. "Could not check" is never
// written as gone. A provider in backoff is skipped, not guessed.
//
// Failure-first: every provider call is bounded by withTimeout; a throw on
// one item never aborts the pass; the pass is bounded (`limit`) and rotates
// stalest-first so a large backlog is swept in a few cycles rather than one
// unbounded burst; a second pass over the same rows is a no-op.

export const LIVENESS_ACTOR = 'inbox_liveness';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * inbox_case_events.correlation_id is `UUID NOT NULL` (ensureInboxCaseSchema).
 * A human-readable run label ("liveness_cron:…") is fine for logs but would
 * make every item audit event fail its INSERT — and logCaseEvent swallows
 * that by design. Found live on 2026-09-12: 65 items dispositioned, 0
 * `item_removed_at_source` rows. So the audit id is always a UUID; the
 * label travels in the structured log instead.
 */
export function auditCorrelationId(given: string | undefined): string {
  return given && UUID_RE.test(given) ? given : randomUUID();
}
export const DEFAULT_RECONCILE_LIMIT = 150;
export const DEFAULT_STALE_MINUTES = 30;
const CHECK_TIMEOUT_MS = DEFAULT_PROVIDER_TIMEOUT_MS;

/** Source types whose liveness can be asked of a provider. Others stay null. */
export const CHECKABLE_SOURCE_TYPES = ['email', 'basecamp_todo'] as const;

export type LivenessOutcome =
  | { kind: 'live' }
  | { kind: 'gone'; reason: SourceGoneReason; detail: string }
  | { kind: 'unverifiable'; error_class: string; detail: string }
  | { kind: 'not_checkable' };

const live = (): LivenessOutcome => ({ kind: 'live' });
const gone = (reason: SourceGoneReason, detail: string): LivenessOutcome => ({ kind: 'gone', reason, detail });
const unverifiable = (err: unknown, detail: string): LivenessOutcome => ({
  kind: 'unverifiable',
  error_class: (err as { error_class?: string })?.error_class || classifyError(err),
  detail: `${detail}: ${(err as Error)?.message ?? String(err)}`,
});

function isGoogle404(err: unknown): boolean {
  const e = err as { code?: number; status?: number; response?: { status?: number } };
  return e?.code === 404 || e?.status === 404 || e?.response?.status === 404;
}

/** Plain-English disposition reason for a gone item, shown in the console and the audit trail. */
export function goneReasonText(reason: SourceGoneReason): string {
  switch (reason) {
    case 'archived': return 'Message is no longer in your inbox (archived) — removed automatically';
    case 'trashed': return 'Message is no longer in your inbox (in Trash) — removed automatically';
    case 'spam': return 'Message is no longer in your inbox (in Spam) — removed automatically';
    case 'missing': return 'Message no longer exists in the mailbox — removed automatically';
    case 'not_in_inbox': return 'Message is no longer in your inbox — removed automatically';
    case 'completed': return 'Basecamp to-do is completed — removed automatically';
  }
}

async function checkGmail(item: InboxCaseItem): Promise<LivenessOutcome> {
  const gmail = item.provider === 'gmail_personal' ? getPersonalGmailClient() : getColaberryGmailClient();
  if (!gmail) return unverifiable({ error_class: 'ProviderNotConfiguredError', message: `Gmail client not configured for ${item.provider}` }, 'gmail');
  let labelIds: string[];
  try {
    const res = await withTimeout(gmail.users.messages.get({ userId: 'me', id: item.source_id, format: 'minimal' }), item.provider, CHECK_TIMEOUT_MS);
    labelIds = (res.data.labelIds as string[] | undefined) ?? [];
  } catch (err) {
    if (isGoogle404(err)) return gone('missing', `message ${item.source_id} not found`);
    return unverifiable(err, `gmail ${item.provider}`);
  }
  if (labelIds.includes('TRASH')) return gone('trashed', `message ${item.source_id} carries TRASH`);
  if (labelIds.includes('SPAM')) return gone('spam', `message ${item.source_id} carries SPAM`);
  if (!labelIds.includes('INBOX')) return gone('archived', `message ${item.source_id} lacks INBOX (labels: ${labelIds.join(',') || 'none'})`);
  return live();
}

async function checkHotmail(item: InboxCaseItem): Promise<LivenessOutcome> {
  if (!isHotmailConfigured()) return unverifiable({ error_class: 'ProviderNotConfiguredError', message: 'Hotmail/Graph not configured' }, 'hotmail');
  try {
    const inInbox = await withTimeout(isHotmailMessageInInbox(item.source_id), 'hotmail', CHECK_TIMEOUT_MS);
    return inInbox ? live() : gone('not_in_inbox', `message ${item.source_id} is not in the Hotmail inbox`);
  } catch (err) {
    return unverifiable(err, 'hotmail');
  }
}

// The Basecamp mirror (ops_bc_todos) is refreshed every 2 minutes and
// self-heals completions/404s (bcSyncService.reconcileCompletions), so it is
// the cheap, rate-limit-free source of truth here — no live API call.
async function checkBasecampTodo(item: InboxCaseItem): Promise<LivenessOutcome> {
  let row: OpsBcTodo | null;
  try {
    row = await OpsBcTodo.findByPk(item.source_id);
  } catch (err) {
    return unverifiable(err, 'basecamp mirror');
  }
  if (!row) return unverifiable({ error_class: 'MirrorMiss', message: `todo ${item.source_id} not in ops_bc_todos` }, 'basecamp mirror');
  if (row.status === 'completed') return gone('completed', `todo ${item.source_id} is completed`);
  if (row.status === 'trashed') return gone('trashed', `todo ${item.source_id} is trashed`);
  return live();
}

/** Ask the provider whether one item's source is still in the inbox right now. */
export async function checkItemLiveness(item: InboxCaseItem): Promise<LivenessOutcome> {
  if (item.source_type === 'email') {
    if (item.provider === 'hotmail') return checkHotmail(item);
    if (item.provider === 'gmail_colaberry' || item.provider === 'gmail_personal') return checkGmail(item);
    return { kind: 'not_checkable' };
  }
  if (item.source_type === 'basecamp_todo') return checkBasecampTodo(item);
  return { kind: 'not_checkable' };
}

export interface ReconcileResult {
  checked: number;
  live: number;
  gone: number;
  unverifiable: number;
  skipped_backoff: number;
  cases_closed: string[];
  close_blocked: string[];
}

/**
 * Writes one liveness verdict to the item. `gone` also dispositions it and
 * logs the audit event. `unverifiable` stamps only `source_checked_at` so
 * rotation moves on without ever asserting false. Returns the affected case
 * id when the item was dispositioned, else null.
 */
export async function applyLiveness(item: InboxCaseItem, outcome: LivenessOutcome, now: Date, correlationId: string): Promise<string | null> {
  if (outcome.kind === 'not_checkable') return null;
  if (outcome.kind === 'live') {
    await item.update({ source_live: true, source_checked_at: now, source_gone_reason: null, updated_at: now });
    return null;
  }
  if (outcome.kind === 'unverifiable') {
    await item.update({ source_checked_at: now, updated_at: now });
    return null;
  }
  await item.update({
    source_live: false,
    source_checked_at: now,
    source_gone_reason: outcome.reason,
    disposition: 'NO_ACTION',
    disposition_reason: goneReasonText(outcome.reason),
    updated_at: now,
  });
  await logCaseEvent({
    case_id: item.case_id,
    item_id: item.id,
    event_type: 'item_removed_at_source',
    actor_type: 'system',
    actor_id: LIVENESS_ACTOR,
    details: { provider: item.provider, source_id: item.source_id, reason: outcome.reason, detail: outcome.detail },
    correlation_id: correlationId,
  });
  return item.case_id;
}

/**
 * After items were dispositioned: if the case has no open evidence left,
 * withdraw its PROPOSED actions (they were proposals about mail Ali has
 * already cleared — an internal state change, no external effect) and close
 * it through the real closure guard. Never forced: a blocked close is logged
 * and the console still hides the case via the liveness filter.
 */
export async function settleCaseIfNoLiveItems(caseId: string, correlationId: string): Promise<'closed' | 'blocked' | 'still_open'> {
  const remaining = await InboxCaseItem.count({
    where: { case_id: caseId, disposition: null, inclusion_status: { [Op.ne]: 'EXCLUDED' } } as any, // `as any`: Op-keyed where
  });
  if (remaining > 0) return 'still_open';

  const proposed = await InboxCaseAction.findAll({ where: { case_id: caseId, status: 'PROPOSED' } });
  for (const a of proposed) {
    await rejectAction(caseId, a.id, LIVENESS_ACTOR, 'source_gone: every source item left the inbox before this action was approved');
  }

  const guard = await evaluateClosureGuard(caseId);
  if (!guard.canClose) {
    const caseRow = await InboxCase.findByPk(caseId);
    await logCaseEvent({
      case_id: caseId,
      event_type: 'case_liveness_close_blocked',
      actor_type: 'system',
      actor_id: LIVENESS_ACTOR,
      details: { blockers: guard.blockers },
      correlation_id: caseRow?.correlation_id ?? correlationId,
    });
    return 'blocked';
  }
  const res = await closeCase(caseId, LIVENESS_ACTOR);
  return res.closed ? 'closed' : 'blocked';
}

/**
 * Bounded, rotating sweep: the `limit` stalest open, checkable items (never
 * checked first), skipping rows checked within `staleMinutes` and providers
 * in backoff. Safe to run every 5 minutes and from the operator's `start`.
 */
export async function reconcileLiveness(opts: { limit?: number; staleMinutes?: number; correlationId: string; now?: Date }): Promise<ReconcileResult> {
  const now = opts.now ?? new Date();
  const runLabel = opts.correlationId;
  const correlationId = auditCorrelationId(opts.correlationId);
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_RECONCILE_LIMIT, 1000));
  const staleBefore = new Date(now.getTime() - (opts.staleMinutes ?? DEFAULT_STALE_MINUTES) * 60_000);

  const items = await InboxCaseItem.findAll({
    where: {
      disposition: null,
      inclusion_status: { [Op.ne]: 'EXCLUDED' },
      source_type: { [Op.in]: [...CHECKABLE_SOURCE_TYPES] },
      [Op.or]: [{ source_checked_at: { [Op.is]: null } }, { source_checked_at: { [Op.lt]: staleBefore } }],
    } as any, // `as any`: Op-keyed where
    order: [['source_checked_at', 'ASC NULLS FIRST'], ['occurred_at', 'ASC']],
    limit,
  });

  const result: ReconcileResult = { checked: 0, live: 0, gone: 0, unverifiable: 0, skipped_backoff: 0, cases_closed: [], close_blocked: [] };
  const affected = new Set<string>();

  for (const item of items) {
    if (item.provider !== 'basecamp' && providerInBackoff(item.provider, now)) { result.skipped_backoff++; continue; }
    let outcome: LivenessOutcome;
    try {
      outcome = await checkItemLiveness(item);
    } catch (err) {
      outcome = unverifiable(err, `check ${item.provider}`); // belt and braces: a checker must never abort the pass
    }
    if (outcome.kind === 'not_checkable') continue;
    result.checked++;
    if (outcome.kind === 'live') result.live++;
    else if (outcome.kind === 'gone') result.gone++;
    else result.unverifiable++;
    try {
      const caseId = await applyLiveness(item, outcome, now, correlationId);
      if (caseId) affected.add(caseId);
    } catch (err: any) {
      console.error(JSON.stringify({
        timestamp: now.toISOString(), level: 'error', service: 'inboxLivenessService', event: 'liveness_apply_failed',
        outcome: 'failure', error_class: err?.error_class || classifyError(err),
        correlation_id: correlationId, context: { run_label: runLabel, item_id: item.id, kind: outcome.kind, message: String(err?.message ?? err).slice(0, 200) },
      }));
    }
  }

  for (const caseId of affected) {
    try {
      const settled = await settleCaseIfNoLiveItems(caseId, correlationId);
      if (settled === 'closed') result.cases_closed.push(caseId);
      else if (settled === 'blocked') result.close_blocked.push(caseId);
    } catch (err: any) {
      result.close_blocked.push(caseId);
      console.error(JSON.stringify({
        timestamp: now.toISOString(), level: 'error', service: 'inboxLivenessService', event: 'liveness_settle_failed',
        outcome: 'failure', error_class: err?.error_class || classifyError(err),
        correlation_id: correlationId, context: { run_label: runLabel, case_id: caseId, message: String(err?.message ?? err).slice(0, 200) },
      }));
    }
  }

  console.log(JSON.stringify({
    timestamp: now.toISOString(), level: 'info', service: 'inboxLivenessService', event: 'liveness_reconcile',
    outcome: 'success', correlation_id: correlationId,
    context: { run_label: runLabel, ...result, cases_closed: result.cases_closed.length, close_blocked: result.close_blocked.length, limit },
  }));
  return result;
}

/**
 * Just-in-time check for the console's `next`: asks the provider about the
 * candidate's open items right now (bounded to `maxItems`), applies the
 * verdicts, and reports whether anything live remains. The console never
 * hands Ali an item without this having said "still in your inbox".
 */
export async function verifyCaseLivenessNow(
  caseId: string,
  givenCorrelationId: string,
  now: Date = new Date(),
  maxItems = 5,
): Promise<{ all_gone: boolean; live: number; gone: Array<{ item_id: string; reason: SourceGoneReason }>; unverified: Array<{ item_id: string; error_class: string }>; unchecked: number }> {
  const correlationId = auditCorrelationId(givenCorrelationId);
  const items = await InboxCaseItem.findAll({
    where: { case_id: caseId, disposition: null, inclusion_status: { [Op.ne]: 'EXCLUDED' } } as any, // `as any`: Op-keyed where
    order: [['occurred_at', 'DESC']],
  });
  const out = { all_gone: false, live: 0, gone: [] as Array<{ item_id: string; reason: SourceGoneReason }>, unverified: [] as Array<{ item_id: string; error_class: string }>, unchecked: 0 };
  let dispositioned = false;
  for (const item of items.slice(0, maxItems)) {
    const outcome = await checkItemLiveness(item);
    if (outcome.kind === 'not_checkable') { out.unchecked++; continue; }
    if (outcome.kind === 'live') out.live++;
    else if (outcome.kind === 'gone') out.gone.push({ item_id: item.id, reason: outcome.reason });
    else out.unverified.push({ item_id: item.id, error_class: outcome.error_class });
    if ((await applyLiveness(item, outcome, now, correlationId)) !== null) dispositioned = true;
  }
  out.unchecked += Math.max(0, items.length - maxItems);
  // "All gone" is a claim about every open item, so it needs every open item
  // checked and none live, none unverified, none unchecked.
  out.all_gone = items.length > 0 && out.gone.length === items.length;
  if (dispositioned) {
    // Same guard as the cron path: a settle failure (e.g. the cron sweep
    // rejecting the same PROPOSED action a millisecond earlier) is logged,
    // never thrown into the request — the case is already hidden by the
    // visibility filter either way.
    try {
      await settleCaseIfNoLiveItems(caseId, correlationId);
    } catch (err: any) {
      console.error(JSON.stringify({
        timestamp: now.toISOString(), level: 'error', service: 'inboxLivenessService', event: 'liveness_settle_failed',
        outcome: 'failure', error_class: err?.error_class || classifyError(err),
        correlation_id: correlationId, context: { case_id: caseId, path: 'next', message: String(err?.message ?? err).slice(0, 200) },
      }));
    }
  }
  return out;
}
