/**
 * InboxCaseEngine Source-Completion Reconciliation — I/O recheck + resolve service
 *
 * See `inboxCaseSourceCompletionRules.ts` for the full design rationale. This file is
 * the I/O orchestration layer only: fetch every undispositioned `basecamp_todo` case
 * item, resolve each to its live `ops_bc_todos` mirror row, classify via the pure
 * rules module, and — for `reCheckAndCloseInboxCasesOnSourceCompletion()` only —
 * write. Every write reuses `services/inboxCase/caseClosureService.ts`'s real,
 * unmodified `evaluateClosureGuard()`/`closeCase()` rather than re-implementing any
 * part of the 10-condition closure authority.
 *
 * This module never decides whether a CASE is closeable beyond re-checking the real
 * guard; it only supplies ONE new evidence signal (live Basecamp to-do completion) the
 * guard did not previously have a way to see, and runs the guard across every
 * non-terminal case (not just ones this module's own signal touches) so any case
 * already closeable for ANY reason — a prior Quick Resolve, a prior Verify pass, a
 * manual admin disposition — that nothing has ever autonomously invoked `closeCase()`
 * on also gets picked up. That general sweep is what closes the 1 case in production
 * (as of DISCOVER) that already has zero undispositioned items today.
 *
 * Deterministic (no LLM), no human-approval step (propagating an already-established
 * fact, or invoking an already-existing authority function, is a mechanical sync, not
 * a judgment call) — mirrors `coryEngineTicketAutoResolver.ts` (PR #1531) /
 * `corybrainInitiativeTicketAutoResolver.ts`'s proven shape for this class of problem:
 * a `MAX_*_PER_RUN` safety ceiling, per-item and per-case try/catch so one bad row
 * never aborts the batch, and idempotent by construction (an already-dispositioned
 * item, or an already-`RESOLVED` case, is never a re-candidate on a later pass).
 */
import InboxCase from '../../models/InboxCase';
import InboxCaseItem from '../../models/InboxCaseItem';
import OpsBcTodo from '../../models/OpsBcTodo';
import { classifyBasecampTodoCompletion, SourceCompletionOutcome } from './inboxCaseSourceCompletionRules';
import { logCaseEvent } from '../../services/inboxCase/caseEventLog';
import { evaluateClosureGuard, closeCase, ClosureGuardOverrides } from '../../services/inboxCase/caseClosureService';

/** Safety ceilings only, not business rules — real backlog today is 393 undispositioned
 * `basecamp_todo` items across 625 non-terminal cases (see execution-contract.md). If
 * ever hit, the remainder is picked up automatically on the next scheduled pass. */
export const MAX_ITEMS_PER_RUN = 5000;
export const MAX_CASES_PER_RUN = 5000;

const CLOSED_BY = 'system'; // matches disposeItemsDeletedAtSource()'s existing convention in this exact subsystem

export interface ItemClassificationResult {
  item_id: string;
  case_id: string;
  bc_id: string;
  outcome: SourceCompletionOutcome;
  disposition: 'RESOLVED' | 'NO_ACTION' | null;
  reason: string;
}

export interface ItemApplyResult extends ItemClassificationResult {
  applied: boolean;
  write_error?: string;
}

export interface CaseCloseResult {
  case_id: string;
  closable: boolean;
  closed: boolean;
  blockers_count: number;
  write_error?: string;
}

export interface SourceCompletionReport {
  items_checked: number;
  items_breakdown: Record<SourceCompletionOutcome, number>;
  items_disposed: number;
  cases_checked: number;
  cases_closed: number;
  duration_ms: number;
  item_results: ItemApplyResult[];
  case_results: CaseCloseResult[];
}

function emptyItemBreakdown(): Record<SourceCompletionOutcome, number> {
  return { completed_at_source: 0, trashed_at_source: 0, still_active: 0, no_live_signal: 0 };
}

/**
 * Read-only. Fetches every `InboxCaseItem` with `disposition IS NULL`,
 * `inclusion_status != 'EXCLUDED'`, `source_type = 'basecamp_todo'`, batch-resolves
 * each to its live `ops_bc_todos` row (one query for all of them, never one query per
 * item), and classifies every one via the pure rules module. Zero writes.
 */
export async function classifyOpenBasecampTodoItems(): Promise<ItemClassificationResult[]> {
  const { Op } = await import('sequelize');

  const items = await (InboxCaseItem as any).findAll({
    where: {
      disposition: null,
      inclusion_status: { [Op.ne]: 'EXCLUDED' },
      source_type: 'basecamp_todo',
    },
    limit: MAX_ITEMS_PER_RUN,
  });

  if (items.length === MAX_ITEMS_PER_RUN) {
    console.warn(
      `[InboxCase SourceCompletionSync] Hit the ${MAX_ITEMS_PER_RUN}-item safety ceiling; remainder will be picked up on the next scheduled pass.`,
    );
  }

  const bcIds = Array.from(new Set(items.map((i: any) => i.source_id)));
  const todosByBcId = new Map<string, any>();
  if (bcIds.length > 0) {
    const todos = await (OpsBcTodo as any).findAll({ where: { bc_id: { [Op.in]: bcIds } } });
    for (const todo of todos) todosByBcId.set(todo.bc_id, todo);
  }

  return items.map((item: any) => {
    const todo = todosByBcId.get(item.source_id);
    const classification = classifyBasecampTodoCompletion(todo?.status ?? null);
    return {
      item_id: item.id,
      case_id: item.case_id,
      bc_id: item.source_id,
      outcome: classification.outcome,
      disposition: classification.disposition,
      reason: classification.reason,
    };
  });
}

/** Read-only. Every `InboxCase` not already in a terminal state (`RESOLVED`), up to
 * the safety ceiling. `FAILED`/`WAITING`/`DELEGATED`/etc. are all legally reachable
 * paths to `RESOLVED` per `types/inboxCase.ts`'s `CASE_STATE_TRANSITIONS` — every
 * active state lists `RESOLVED` as a legal target — so this sweep is safe across all
 * of them; `evaluateClosureGuard()`/`closeCase()` remain the real authority on whether
 * any specific one actually can. */
export async function fetchNonTerminalCaseIds(): Promise<string[]> {
  const { Op } = await import('sequelize');
  const cases = await (InboxCase as any).findAll({
    where: { state: { [Op.ne]: 'RESOLVED' } },
    attributes: ['id'],
    limit: MAX_CASES_PER_RUN,
  });
  if (cases.length === MAX_CASES_PER_RUN) {
    console.warn(
      `[InboxCase SourceCompletionSync] Hit the ${MAX_CASES_PER_RUN}-case safety ceiling; remainder will be picked up on the next scheduled pass.`,
    );
  }
  return cases.map((c: any) => c.id);
}

/**
 * Writes every classified item that has a real signal (`disposition !== null`):
 * `.update()` the item, log a case event. Per-item try/catch — one bad row is logged
 * and skipped, never aborts the batch. Idempotent: a row whose `disposition` is no
 * longer `null` by the time this runs (already applied, or changed by something else)
 * is simply not in `classifyOpenBasecampTodoItems()`'s candidate set on a later pass.
 */
export async function applyItemDispositions(classifications: ItemClassificationResult[]): Promise<ItemApplyResult[]> {
  const results: ItemApplyResult[] = [];

  for (const c of classifications) {
    if (c.disposition === null) {
      results.push({ ...c, applied: false });
      continue;
    }

    try {
      const item = await (InboxCaseItem as any).findByPk(c.item_id);
      if (!item || item.disposition !== null) {
        // Not found, or already dispositioned since classification ran (another writer
        // got there first, or this is a re-run) — safe no-op, not an error.
        results.push({ ...c, applied: false });
        continue;
      }

      await item.update({ disposition: c.disposition, disposition_reason: c.reason, updated_at: new Date() });
      await logCaseEvent({
        case_id: c.case_id,
        item_id: c.item_id,
        event_type: 'item_completed_at_source',
        actor_type: 'system',
        actor_id: 'InboxCaseSourceCompletionResolver',
        details: { outcome: c.outcome, bc_id: c.bc_id, disposition: c.disposition },
        correlation_id: (await (InboxCase as any).findByPk(c.case_id, { attributes: ['correlation_id'] }))?.correlation_id ?? c.case_id,
      });
      results.push({ ...c, applied: true });
    } catch (err: any) {
      console.error(`[InboxCase SourceCompletionSync] Failed to disposition item ${c.item_id} (case ${c.case_id}): ${err?.message || err}`);
      results.push({ ...c, applied: false, write_error: err?.message || String(err) });
    }
  }

  return results;
}

/**
 * Re-checks the real, unmodified `evaluateClosureGuard()` for every id in `caseIds`
 * and calls the real `closeCase(caseId, 'system')` wherever it passes. Per-case
 * try/catch. Idempotent: an already-`RESOLVED` case's guard call is harmless (its
 * items are already all dispositioned by definition) and `closeCase()` itself already
 * no-ops correctly on an already-resolved case (see `caseClosureService.ts`).
 */
export async function closeEligibleCases(caseIds: string[]): Promise<CaseCloseResult[]> {
  const results: CaseCloseResult[] = [];

  for (const caseId of caseIds) {
    try {
      const guard = await evaluateClosureGuard(caseId);
      if (!guard.canClose) {
        results.push({ case_id: caseId, closable: false, closed: false, blockers_count: guard.blockers.length });
        continue;
      }
      const closeResult = await closeCase(caseId, CLOSED_BY);
      results.push({ case_id: caseId, closable: true, closed: closeResult.closed, blockers_count: closeResult.blockers.length });
    } catch (err: any) {
      console.error(`[InboxCase SourceCompletionSync] Failed to evaluate/close case ${caseId}: ${err?.message || err}`);
      results.push({ case_id: caseId, closable: false, closed: false, blockers_count: -1, write_error: err?.message || String(err) });
    }
  }

  return results;
}

function summarize(itemResults: ItemApplyResult[], caseResults: CaseCloseResult[], start: number): SourceCompletionReport {
  const breakdown = emptyItemBreakdown();
  for (const r of itemResults) breakdown[r.outcome]++;
  return {
    items_checked: itemResults.length,
    items_breakdown: breakdown,
    items_disposed: itemResults.filter((r) => r.applied).length,
    cases_checked: caseResults.length,
    cases_closed: caseResults.filter((r) => r.closed).length,
    duration_ms: Date.now() - start,
    item_results: itemResults,
    case_results: caseResults,
  };
}

/**
 * The cron entrypoint (real writes). Classifies every open `basecamp_todo` item,
 * dispositions the ones with a live signal, then re-checks the real closure guard
 * across every non-terminal case (not just ones this pass touched) and closes every
 * one that genuinely passes.
 */
export async function reCheckAndCloseInboxCasesOnSourceCompletion(): Promise<SourceCompletionReport> {
  const start = Date.now();
  const classifications = await classifyOpenBasecampTodoItems();
  const itemResults = await applyItemDispositions(classifications);
  const caseIds = await fetchNonTerminalCaseIds();
  const caseResults = await closeEligibleCases(caseIds);
  return summarize(itemResults, caseResults, start);
}

/**
 * Read-only preview (for `--plan` and for any caller that wants "what would happen"
 * without writing). Classifies items exactly as the real run would, but instead of
 * writing, builds a hypothetical post-disposition item list per affected case and asks
 * the REAL `evaluateClosureGuard()` — via its additive override parameter — whether
 * that case would close, so the preview and the real apply can never silently drift
 * apart (one rule implementation, two callers). Every OTHER non-terminal case (not
 * touched by this pass's item signal) is also previewed, with no override, against its
 * real current DB state — this is what surfaces the "already passes today, nobody
 * ever called closeCase()" case.
 */
export async function previewInboxCaseSourceCompletionResolution(): Promise<SourceCompletionReport> {
  const start = Date.now();
  const classifications = await classifyOpenBasecampTodoItems();
  const itemResults: ItemApplyResult[] = classifications.map((c) => ({ ...c, applied: c.disposition !== null }));

  const allCaseIds = await fetchNonTerminalCaseIds();
  const touchedCaseIds = new Set(classifications.filter((c) => c.disposition !== null).map((c) => c.case_id));
  const hypotheticalDispositionByItemId = new Map(
    classifications.filter((c) => c.disposition !== null).map((c) => [c.item_id, c]),
  );

  const caseResults: CaseCloseResult[] = [];
  for (const caseId of allCaseIds) {
    try {
      let overrides: ClosureGuardOverrides | undefined;

      if (touchedCaseIds.has(caseId)) {
        const realItems = await (InboxCaseItem as any).findAll({ where: { case_id: caseId } });
        const hypotheticalItems = realItems.map((item: any) => {
          const change = hypotheticalDispositionByItemId.get(item.id);
          if (!change) return item;
          const plain = item.get ? item.get({ plain: true }) : item;
          return { ...plain, disposition: change.disposition, disposition_reason: change.reason };
        });
        overrides = { items: hypotheticalItems };
      }

      const guard = await evaluateClosureGuard(caseId, overrides);
      caseResults.push({ case_id: caseId, closable: guard.canClose, closed: false, blockers_count: guard.blockers.length });
    } catch (err: any) {
      console.error(`[InboxCase SourceCompletionSync] Preview failed for case ${caseId}: ${err?.message || err}`);
      caseResults.push({ case_id: caseId, closable: false, closed: false, blockers_count: -1, write_error: err?.message || String(err) });
    }
  }

  return summarize(itemResults, caseResults, start);
}
