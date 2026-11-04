import cron from 'node-cron';
import { instrumentCronJob } from '../cronInstrumentation';
import { runScheduledRecompute } from '../explorerGrowth/explorerProfileService';
import { runScheduledGovernor } from '../explorerGrowth/governor/runGovernor';
import { runScheduledDraftRender } from '../explorerGrowth/drafts/runDraftRender';

/**
 * Explorer Growth OS - the nightly recompute, Governor and draft render as ONE
 * sequence (C108), out of `schedulerService.ts`, which is over the size ceiling.
 *
 * WHY NOT THREE CLOCK TIMES. They used to start at 03:20, 03:50 and 04:10 UTC.
 * The 30-minute gap assumed a 4-second recompute for 153 learners. With 833
 * profiles it took 34 minutes on 3 Nov 2026 and is still growing, so the
 * Governor would have started before the recompute finished. Each step now
 * starts when the one before it ends, however long that takes.
 *
 * WHAT EACH STEP DOES, AND WHAT STAYS SEPARATE:
 *   - Recompute scores and classifies. It decides nothing and sends nothing.
 *   - Governor decides and records. It enqueues nothing and sends nothing; every
 *     row is executed:false. Execution is EPIC 6, behind its own flag.
 *   - Draft render writes copy to statuses the sender never claims (it claims
 *     only status = 'pending'), so nothing here can be sent. It is the one step
 *     that costs money per run.
 *
 * Each step has its own `instrumentCronJob`, so Admin > Agents can pause any one
 * of them, and each runner checks its own flag and returns immediately when off.
 * Sharing a schedule turned nothing on.
 *
 * FAILURE MODES:
 *   - A step throws, or is paused: it is logged and the next step still runs.
 *     The Governor refuses any profile not scored since `startedAt` and records
 *     that as a WAIT row, so a failed recompute produces explained silence rather
 *     than decisions on the previous night's states.
 *   - One learner fails: each batch collects it and carries on.
 *   - The process restarts mid-sequence (a deploy): the remaining steps do not
 *     run that night and there is no automatic retry. The next night is complete,
 *     and every step is safe to rerun by hand through its operator script.
 *   - NOT handled: a sequence that outlasts 24 hours would overlap the next one.
 */
export async function runExplorerNightlySequence(startedAt: Date = new Date()): Promise<void> {
  await instrumentCronJob('ExplorerProfileRecompute', async () => {
    // Wrapped so the callback resolves to void: the BatchResult is of no use here.
    await runScheduledRecompute();
  }).catch((err) => {
    console.error('[Scheduler] ExplorerProfileRecompute failed:', err);
  });

  await instrumentCronJob('ExplorerGovernorDecide', async () => {
    await runScheduledGovernor({ scoredSince: startedAt });
  }).catch((err) => {
    console.error('[Scheduler] ExplorerGovernorDecide failed:', err);
  });

  await instrumentCronJob('ExplorerDraftRender', async () => {
    await runScheduledDraftRender();
  }).catch((err) => {
    console.error('[Scheduler] ExplorerDraftRender failed:', err);
  });
}

/**
 * 03:20 UTC (9:20 PM CST): deliberately offset from the :00 and every-5-minute
 * jobs so the batch does not contend with them on the shared Postgres.
 */
export function registerExplorerNightlySequence(): void {
  cron.schedule('20 3 * * *', () => {
    void runExplorerNightlySequence();
  });
}
