/**
 * fixWeek0ProgramVideoFirst — C112 (Ali, 2026-11-05): make the Week 0 program video a new Explorer's first assignment
 * and the rewritten Quick check the second.
 *
 * Today the first point-bearing Week 0 card is the Quick check, so a new Explorer's first task is a quiz before they
 * have learned anything. This moves the program video into pre_class right after the welcome, rewrites the Quick
 * check from that video (see data/week0ProgramVideoFirst.ts), and locks it so generation cannot overwrite it.
 *
 * Dry run by default: prints the plan and writes nothing. One transaction; a re-run with nothing to do changes nothing.
 * The values it replaces are saved on each card (metadata.c112_prior), so --rollback restores them exactly.
 * Sends no communications.
 *
 * Run inside the backend container:
 *   node dist/scripts/fixWeek0ProgramVideoFirst.js              # dry run
 *   node dist/scripts/fixWeek0ProgramVideoFirst.js --apply
 *   node dist/scripts/fixWeek0ProgramVideoFirst.js --rollback --apply
 */
import { sequelize } from '../config/database';
import TimelineCard from '../models/TimelineCard';
import {
  PROGRAM_VIDEO_ID, QUICK_CHECK_ID, SELF_STUDY_ID,
  planProgramVideoFirst, planRollback, type CardState, type CardUpdate,
} from '../data/week0ProgramVideoFirst';

const toState = (c: TimelineCard): CardState => ({
  id: c.id, title: c.title, bucket: c.bucket, order: c.order,
  metadata: c.metadata && typeof c.metadata === 'object' ? { ...(c.metadata as Record<string, unknown>) } : {},
});

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const rollback = process.argv.includes('--rollback');
  const ids = [PROGRAM_VIDEO_ID, QUICK_CHECK_ID, SELF_STUDY_ID];

  await sequelize.transaction(async (transaction) => {
    const rows = await TimelineCard.findAll({ where: { id: ids }, transaction, lock: transaction.LOCK.UPDATE });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const states = rows.map(toState);
    const find = (id: string) => states.find((s) => s.id === id);
    const plan: CardUpdate[] = rollback
      ? planRollback(states)
      : planProgramVideoFirst(find(PROGRAM_VIDEO_ID), find(QUICK_CHECK_ID), find(SELF_STUDY_ID));

    console.log(JSON.stringify({
      event: 'c112_week0_plan', mode: rollback ? 'rollback' : 'forward', apply,
      changes: plan.map((u) => ({ id: u.id, title: u.set.title, bucket: u.set.bucket, order: u.set.order })),
    }));
    if (!plan.length) { console.log('Nothing to change.'); return; }
    if (!apply) { console.log('DRY RUN: nothing written. Re-run with --apply to write.'); return; }

    for (const u of plan) {
      const row = byId.get(u.id);
      if (!row) throw new Error(`C112: card ${u.id} vanished mid-run`);
      row.changed('metadata', true);
      // hooks: false — the CAPE afterUpdate hook writes skill_mapping on its own connection, outside this transaction,
      // and waits on the row lock this transaction holds: a deadlock (prod, 2026-11-05). The stamp reads only type,
      // week and visibility, none of which this script changes, so skipping it loses nothing.
      await row.update(u.set as Partial<TimelineCard>, { transaction, hooks: false });
    }
    console.log(`APPLIED: ${plan.length} card(s) updated.`);
  });
}

main()
  .then(() => sequelize.close())
  .catch(async (err: unknown) => {
    console.error(JSON.stringify({ event: 'c112_week0_failed', error_class: err instanceof Error ? err.name : 'Unknown', message: err instanceof Error ? err.message : String(err) }));
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
