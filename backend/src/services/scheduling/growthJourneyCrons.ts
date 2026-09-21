import cron from 'node-cron';
import { HANDOFF_DIGEST_AGENT, HANDOFF_DIGEST_SCHEDULE, sendHandoffDigests } from '../briefings/handoffDigestSender';
import { instrumentCronJob } from '../cronInstrumentation';
import { runExecutor } from '../growthJourney/execution/runExecutor';
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
 * What registers here decides and records (the nightly), plans, enrols
 * through the one adapter and reconciles (the executor), and mails each human
 * assignee their open handoffs once a day through the existing guarded mailer
 * (the digest, T517 - the one job here whose runner sends, and it sends to
 * staff, never to a lead). Every job is wrapped in `instrumentCronJob`, so a
 * registry row that is `enabled: false` (every Growth Journey row is,
 * shipped) is a logged skip, and each runner itself returns skipped unless
 * its flags are on.
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

  // Growth Journey OS - the executor (Phase 5 T513).
  //
  // Every 15 minutes, 14:00-22:59 UTC, Monday to Friday - business hours Central,
  // when a human is there to read the review queue it fills. One run is three
  // bounded passes: plan live decisions into receipts (T508), enrol approved
  // receipts through the adapter (T510) with T504's hold asked before every claim,
  // reconcile (T512). Its schedule and agent name are the constants the batch
  // exports (EXECUTOR_SCHEDULE, EXECUTOR_AGENT) and the registry seed carries;
  // the guard test pins all three together.
  //
  // SHIPPED PAUSED, three times over, like the nightly: the registry row is
  // enabled:false, and runExecutor returns skipped unless the master flag and
  // GROWTH_JOURNEY_EXECUTION_ENABLED - Ali's alone to set - are both on.
  cron.schedule('*/15 14-22 * * 1-5', () => {
    instrumentCronJob('GrowthJourneyExecutor', async () => {
      await runExecutor();
    }).catch((err) => {
      console.error('[Scheduler] GrowthJourneyExecutor failed:', err);
    });
  });

  // Growth Journey OS - the handoff digest (Phase 5 T517, 5A).
  //
  // 12:30 UTC, Monday to Friday - 7:30 AM Central in summer, before the desk
  // day starts. One mail per human assignee with something open, once per
  // mailbox per Central date (the briefing's slot claim), through the guarded
  // mailer (the kill switch, the dev sink). It is mail to STAFF about their
  // queue; it never reaches a lead, and carries no lead name, address or
  // message. The schedule and agent name are the sender's exports and the
  // registry seed carries them; the guard test pins all three together.
  //
  // SHIPPED PAUSED, three times over, like the other two: the registry row is
  // enabled:false, and sendHandoffDigests returns skipped unless the master
  // flag and GROWTH_JOURNEY_HANDOFFS_ENABLED are both on.
  cron.schedule(HANDOFF_DIGEST_SCHEDULE, () => {
    instrumentCronJob(HANDOFF_DIGEST_AGENT, async () => {
      await sendHandoffDigests();
    }).catch((err) => {
      console.error(`[Scheduler] ${HANDOFF_DIGEST_AGENT} failed:`, err);
    });
  });
}
