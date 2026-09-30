/**
 * Backfills Basecamp-reference decomposition onto cases created before the fix.
 *
 * Ali reported the same "Colaberry Inc You Have 5 To Dos Due Soon" bug on a
 * case that predated loop-architect run
 * 20260802-053423-digest-basecamp-action-decomposition. Those items' snapshots
 * have no `basecamp_refs` key, so they can never self-correct — the new
 * pipeline only fires at discovery/fetch time. This re-fetches each affected
 * item's live Gmail body, extracts Basecamp references, resolves them, adds
 * the resolved to-dos onto the SAME case, and clears any stale wrong
 * EMAIL_SEND action so a fresh Plan run proposes the right per-to-do actions.
 * Dry-run by default (zero writes; resolution is a read-only Basecamp GET
 * regardless of mode). Idempotent — a second run finds nothing left to do.
 *
 * Run: `npx ts-node src/scripts/backfillBasecampDigestReferences.ts` (dry run)
 * Run: `npx ts-node src/scripts/backfillBasecampDigestReferences.ts --execute` (apply)
 */

import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { gmail_v1 } from 'googleapis';
import InboxCase from '../models/InboxCase';
import InboxCaseItem from '../models/InboxCaseItem';
import InboxCaseAction from '../models/InboxCaseAction';
import { getColaberryGmailClient, extractBodyText } from '../services/inbox/inboxSyncService';
import { fetchExactReference, resolveDigestTodoByTitle } from '../services/inboxCase/sources/basecampCaseSource';
import { extractBasecampReferences, computeSourceHash, parseDigestTodoLines, DIGEST_SENDER } from '../services/inboxCase/textNormalization';
import { logCaseEvent } from '../services/inboxCase/caseEventLog';
import { rejectAction } from '../services/inboxCase/caseApprovalService';

export { DIGEST_SENDER };
const ACTOR_ID = 'backfillBasecampDigestReferences';

export interface CandidateRow {
  case_id: string;
  case_title: string;
  case_state: string;
  item_id: string;
  source_id: string;
}

export interface BackfillResult {
  referencesFound: number;
  itemsResolved: number;
  actionsCleared: number;
  snapshotUpdated: boolean;
}

export async function findCandidates(): Promise<CandidateRow[]> {
  const rows = (await InboxCase.sequelize!.query(
    `SELECT ic.id as case_id, ic.title as case_title, ic.state as case_state,
            ici.id as item_id, ici.source_id
     FROM inbox_cases ic
     JOIN inbox_case_items ici ON ici.case_id = ic.id
     WHERE ici.snapshot->>'from_address' = :sender
       AND (
         (ici.snapshot ? 'basecamp_refs') = false
         OR jsonb_array_length(ici.snapshot->'basecamp_refs') = 0
       )
       AND ic.state != 'RESOLVED'
     ORDER BY ic.opened_at DESC`,
    { replacements: { sender: DIGEST_SENDER }, type: 'SELECT' as any }
  )) as unknown as CandidateRow[];
  return rows;
}

// Processes one candidate item: re-fetch its live body, extract + resolve
// references, add resolved items to the same case, clear the stale action.
// Exported and self-contained (takes the Gmail client as a parameter) so it
// can be unit-tested without a live Gmail connection.
export async function backfillDigestItem(
  row: CandidateRow,
  gmail: gmail_v1.Gmail,
  execute: boolean
): Promise<BackfillResult> {
  const correlationId = randomUUID();
  const result: BackfillResult = { referencesFound: 0, itemsResolved: 0, actionsCleared: 0, snapshotUpdated: false };

  const full = await gmail.users.messages.get({ userId: 'me', id: row.source_id, format: 'full' });
  const bodyText = extractBodyText(full.data.payload) || '';
  const refs = extractBasecampReferences(bodyText);
  result.referencesFound = refs.length;

  if (execute) {
    const item = await InboxCaseItem.findByPk(row.item_id);
    if (item) {
      await item.update({ snapshot: { ...item.snapshot, basecamp_refs: refs }, updated_at: new Date() });
      result.snapshotUpdated = true;
    }
  }

  for (const ref of refs) {
    const hash = computeSourceHash('basecamp', ref.recordingId);
    const alreadyLinked = await InboxCaseItem.findOne({ where: { source_hash: hash } });
    if (alreadyLinked) continue;

    const resolved = await fetchExactReference(ref);
    if (!resolved) continue;
    result.itemsResolved++;

    if (execute) {
      const created = await InboxCaseItem.create({
        case_id: row.case_id,
        source_type: resolved.source_type,
        source_id: resolved.source_id,
        provider: resolved.provider,
        source_url: resolved.source_url,
        title: resolved.title,
        occurred_at: resolved.occurred_at,
        match_score: 1,
        match_reasons: [{ kind: 'exact_basecamp_recording_id', detail: 'Backfilled from a digest email reference', weight: 1 }],
        inclusion_status: 'INCLUDED',
        disposition: null,
        disposition_reason: null,
        snapshot: resolved.snapshot,
        source_hash: hash,
      } as any);

      await logCaseEvent({
        case_id: row.case_id,
        item_id: created.id,
        event_type: 'item_added_via_backfill',
        actor_type: 'system',
        actor_id: ACTOR_ID,
        details: { source: 'backfillBasecampDigestReferences', reference: ref },
        correlation_id: correlationId,
      });
    }
  }

  // The periodic "N to-dos due soon" rollup digest embeds zero per-to-do
  // URLs (confirmed against real production samples) — extractBasecampReferences
  // always returns [] for it. Fall back to text-parsing the SAME already-fetched
  // bodyText and resolving each parsed to-do by exact title match, per run
  // 20260802-093200-digest-text-todo-parsing.
  if (refs.length === 0) {
    const parsedTodos = parseDigestTodoLines(bodyText);
    result.referencesFound = parsedTodos.length;

    for (const todo of parsedTodos) {
      const candidate = await resolveDigestTodoByTitle(todo.title);
      if (!candidate) continue;

      const hash = computeSourceHash(candidate.provider, candidate.source_id);
      const alreadyLinked = await InboxCaseItem.findOne({ where: { source_hash: hash } });
      if (alreadyLinked) continue;

      result.itemsResolved++;

      if (execute) {
        const created = await InboxCaseItem.create({
          case_id: row.case_id,
          source_type: candidate.source_type,
          source_id: candidate.source_id,
          provider: candidate.provider,
          source_url: candidate.source_url,
          title: candidate.title,
          occurred_at: candidate.occurred_at,
          match_score: 1,
          match_reasons: [{ kind: 'exact_title_match_from_digest_text', detail: 'Backfilled from a digest email\'s plain-text to-do listing', weight: 1 }],
          inclusion_status: 'INCLUDED',
          disposition: null,
          disposition_reason: null,
          snapshot: candidate.snapshot,
          source_hash: hash,
        } as any);

        await logCaseEvent({
          case_id: row.case_id,
          item_id: created.id,
          event_type: 'item_added_via_backfill',
          actor_type: 'system',
          actor_id: ACTOR_ID,
          details: { source: 'backfillBasecampDigestReferences', parsedTodo: todo },
          correlation_id: correlationId,
        });
      }
    }
  }

  const staleActions = await InboxCaseAction.findAll({
    where: { case_id: row.case_id, item_id: row.item_id, action_type: 'EMAIL_SEND', status: { [Op.in]: ['PROPOSED', 'FAILED'] } },
  });
  for (const action of staleActions) {
    result.actionsCleared++;
    if (!execute) continue;

    if (action.status === 'PROPOSED') {
      await rejectAction(row.case_id, action.id, ACTOR_ID, 'Superseded by Basecamp reference decomposition backfill');
    } else {
      await action.update({ status: 'SKIPPED', updated_at: new Date() });
      await logCaseEvent({
        case_id: row.case_id,
        action_id: action.id,
        event_type: 'action_execution_skipped_dependency_failed',
        actor_type: 'system',
        actor_id: ACTOR_ID,
        details: { reason: 'Superseded by Basecamp reference decomposition backfill' },
        correlation_id: correlationId,
      });
    }
  }

  return result;
}

async function main() {
  const execute = process.argv.includes('--execute');
  console.log(`[backfill] Mode: ${execute ? 'EXECUTE (will write)' : 'DRY RUN (no writes)'}`);

  const candidates = await findCandidates();
  console.log(`[backfill] Found ${candidates.length} un-backfilled digest item(s) across ${new Set(candidates.map((c) => c.case_id)).size} open case(s).`);

  const gmail = getColaberryGmailClient();
  if (!gmail) {
    console.error('[backfill] Colaberry Gmail client not configured — aborting.');
    process.exit(1);
  }

  const totals = { referencesFound: 0, itemsResolved: 0, actionsCleared: 0, snapshotsUpdated: 0 };

  for (const row of candidates) {
    console.log(`\n[backfill] Case "${row.case_title}" (${row.case_state}), item ${row.item_id}`);
    try {
      const result = await backfillDigestItem(row, gmail, execute);
      totals.referencesFound += result.referencesFound;
      totals.itemsResolved += result.itemsResolved;
      totals.actionsCleared += result.actionsCleared;
      if (result.snapshotUpdated) totals.snapshotsUpdated++;
      console.log(`  ${result.referencesFound} reference(s) found, ${result.itemsResolved} resolved, ${result.actionsCleared} stale action(s) ${execute ? 'cleared' : 'would be cleared'}.`);
    } catch (err: any) {
      console.error(`  Failed to process item ${row.item_id}: ${err?.message} — skipping.`);
    }
  }

  console.log(`\n[backfill] Summary: ${candidates.length} digest item(s) scanned, ${totals.referencesFound} reference(s) found, ${totals.itemsResolved} resolved, ${totals.actionsCleared} stale action(s) ${execute ? 'cleared' : 'would be cleared'}.`);
  console.log(execute ? `[backfill] ${totals.snapshotsUpdated} digest item snapshot(s) updated.` : '[backfill] Dry run only — re-run with --execute to apply. Nothing was written.');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill] Fatal error:', err);
      process.exit(1);
    });
}
