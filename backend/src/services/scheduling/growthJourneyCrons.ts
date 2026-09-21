import cron from 'node-cron';
import { instrumentCronJob } from '../cronInstrumentation';
import { runScheduledShadowDecisions } from '../growthJourney/runShadowDecisionsNightly';

/**
 * The Growth Journey crons, out of `schedulerService.ts` (Phase 5 T513).
 *
 * `schedulerService.ts` is over the ceiling (3,668 lines), so the next change
 * to it splits before it adds: the Phase 4 T408 shadow-decisions block below
 * is that file's block moved VERBATIM - the comment, the schedule, the
 * wrapping, the error line, byte for byte - and `startScheduler()` calls this
 * function at the position the block held. The import direction is unchanged:
 * the scheduler imports the journey tree, never the other way (the journey
 * scanners forbid `schedulerService`, `cronInstrumentation` and `node-cron`
 * inside `services/growthJourney/`).
 *
 * What registers here decides and records; nothing here sends. Every job is
 * wrapped in `instrumentCronJob`, so a registry row that is `enabled: false`
 * (every Growth Journey row is, shipped) is a logged skip, and the runner
 * itself returns skipped unless its flags are on.
 */
export function registerGrowthJourneyCrons(): void {
  // Growth Journey OS - the nightly shadow decisions (Phase 4 T408).
  //
  // 04:20 UTC, AFTER the three Explorer jobs above (02:50 content sync, 03:20
  // recompute, 03:50 Governor) and not inside any of them: the learner brands
  // decide on scores recomputed the same night, and the business brands run
  // once the shared Postgres is quiet again.
  //
  // DECIDES AND RECORDS ONLY. Every brand's classified subjects get a shadow
  // decision (executed:false), each decision materialises its handoff rows
  // through the T404 writer when journeyHandoffs is on, and the queue's
  // assignment pass runs once per brand. Nothing is sent, enqueued or
  // notified; a handoff is a row a human reads.
  //
  // SHIPPED PAUSED, three times over: the agentRegistrySeed row is
  // enabled:false (instrumentCronJob skips it with a warning), and
  // runScheduledShadowDecisions itself returns skipped unless the master flag
  // and GROWTH_JOURNEY_DECISIONS_ENABLED are both on. Turning it on is the
  // registry toggle in Admin > Agents plus the flags - never a redeploy.
  cron.schedule('20 4 * * *', () => {
    instrumentCronJob('GrowthJourneyShadowDecisions', async () => {
      await runScheduledShadowDecisions();
    }).catch((err) => {
      console.error('[Scheduler] GrowthJourneyShadowDecisions failed:', err);
    });
  });
}
