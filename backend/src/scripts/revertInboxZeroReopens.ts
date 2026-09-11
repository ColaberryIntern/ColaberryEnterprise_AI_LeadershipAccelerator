/**
 * Revert cases that the /inbox-zero reopen-on-reply step reopened.
 *
 * Compensating action for caseReopenService (T7 of CC-20260910-3q7x). A
 * redeploy stops FURTHER reopens but does not undo ones already applied:
 * reopenCase() writes state, reopen_count and closed_at and opens a fresh
 * ticket. This script finds every `case_reopened` event carrying
 * `details.reopened_by = 'inbox_zero_reopen'` after --since, and per case:
 * restores state RESOLVED (or the recorded previous state), restores
 * closed_at from `details.previous_closed_at`, decrements reopen_count, and
 * dispositions the attached reply items NO_ACTION with a reason so the
 * closure guard is not left blocked by them. The ticket opened at reopen is
 * left for the ticket board's own archive flow (it carries the case id).
 *
 * DRY-RUN BY DEFAULT. Nothing is written unless --apply is passed.
 *
 * Run: `npx ts-node backend/src/scripts/revertInboxZeroReopens.ts --since 2026-09-12T00:00:00Z [--apply]`
 */
import { Op } from 'sequelize';
import InboxCase from '../models/InboxCase';
import InboxCaseEvent from '../models/InboxCaseEvent';
import InboxCaseItem from '../models/InboxCaseItem';
import { logCaseEvent } from '../services/inboxCase/caseEventLog';
import { REOPEN_ACTOR } from '../services/inboxCase/caseReopenService';

interface Args { since: Date; apply: boolean }

function parseArgs(argv: string[]): Args {
  const sinceIdx = argv.indexOf('--since');
  const since = sinceIdx >= 0 ? new Date(argv[sinceIdx + 1]) : new Date(NaN);
  if (Number.isNaN(since.getTime())) {
    console.error('FATAL: --since <ISO timestamp> is required (the deploy time of the reopen step).');
    process.exit(1);
  }
  return { since, apply: argv.includes('--apply') };
}

export interface RevertPlanEntry {
  case_id: string;
  event_id: string;
  previous_state: string;
  previous_closed_at: string | null;
  previous_waiting_since: string | null;
  previous_sla_due_at: string | null;
  reply_item_ids: string[];
}

/** Pure planning step: what WOULD be reverted. Exported for tests. */
export async function planRevert(since: Date): Promise<RevertPlanEntry[]> {
  const events = await InboxCaseEvent.findAll({
    where: { event_type: 'case_reopened', actor_id: REOPEN_ACTOR, created_at: { [Op.gte]: since } } as any, // `as any`: Op-keyed where
  });
  const out: RevertPlanEntry[] = [];
  for (const ev of events) {
    const details = (ev.details ?? {}) as Record<string, unknown>;
    if (details.reopened_by !== REOPEN_ACTOR) continue;
    const replies = await InboxCaseItem.findAll({ where: { case_id: ev.case_id, disposition: null } as any }); // `as any`: null-valued where is not expressible in this model's WhereOptions typing (same as caseRepository)
    const replyIds = replies
      // match_reasons is JSONB typed as unknown[]; the planner's MatchReason shape carries `kind`.
      .filter((i) => Array.isArray(i.match_reasons) && (i.match_reasons as Array<{ kind?: string }>).some((r) => r?.kind === 'reply_on_reopened_thread'))
      .map((i) => i.id);
    const iso = (v: unknown) => (typeof v === 'string' ? v : null);
    out.push({
      case_id: ev.case_id,
      event_id: ev.id,
      previous_state: String(ev.previous_state ?? 'RESOLVED'),
      previous_closed_at: iso(details.previous_closed_at),
      previous_waiting_since: iso(details.previous_waiting_since),
      previous_sla_due_at: iso(details.previous_sla_due_at),
      reply_item_ids: replyIds,
    });
  }
  return out;
}

export async function applyRevert(entries: RevertPlanEntry[]): Promise<number> {
  let reverted = 0;
  for (const e of entries) {
    const row = await InboxCase.findByPk(e.case_id);
    if (!row) continue;
    // Only revert a case that is still where the reopen left it (ASSESSING);
    // if Ali has since moved it, his decision stands.
    if (row.state !== 'ASSESSING') continue;
    // `as any`: `state` is typed CaseState on the model but arrives here as the
    // string recorded in the event; it was a valid CaseState when written.
    await row.update({
      state: e.previous_state,
      closed_at: e.previous_closed_at ? new Date(e.previous_closed_at) : null,
      waiting_since: e.previous_waiting_since ? new Date(e.previous_waiting_since) : null,
      sla_due_at: e.previous_sla_due_at ? new Date(e.previous_sla_due_at) : null,
      reopen_count: Math.max(0, row.reopen_count - 1),
      updated_at: new Date(),
    } as any);
    for (const itemId of e.reply_item_ids) {
      const item = await InboxCaseItem.findByPk(itemId);
      if (item && !item.disposition) {
        await item.update({ disposition: 'NO_ACTION', disposition_reason: 'Reopen reverted by revertInboxZeroReopens', updated_at: new Date() });
      }
    }
    await logCaseEvent({
      case_id: e.case_id,
      event_type: 'case_reopen_reverted',
      actor_type: 'system',
      actor_id: 'revertInboxZeroReopens',
      previous_state: 'ASSESSING',
      new_state: e.previous_state,
      details: { reverted_event_id: e.event_id, previous_closed_at: e.previous_closed_at, reply_items_dispositioned: e.reply_item_ids.length },
      correlation_id: row.correlation_id,
    });
    reverted++;
  }
  return reverted;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const plan = await planRevert(args.since);
  console.log(JSON.stringify({ level: 'info', service: 'revertInboxZeroReopens', event: 'revert_planned', outcome: 'success', context: { since: args.since.toISOString(), cases: plan.length, apply: args.apply } }));
  for (const e of plan) console.log(`  ${e.case_id}  ${e.previous_state}  closed_at=${e.previous_closed_at ?? 'null'}  replies=${e.reply_item_ids.length}`);
  if (!args.apply) {
    console.log('DRY RUN — nothing written. Re-run with --apply to revert.');
    return;
  }
  const n = await applyRevert(plan);
  console.log(JSON.stringify({ level: 'info', service: 'revertInboxZeroReopens', event: 'revert_applied', outcome: 'success', context: { reverted: n } }));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
