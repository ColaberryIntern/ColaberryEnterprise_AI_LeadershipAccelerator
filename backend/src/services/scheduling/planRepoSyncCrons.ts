import cron from 'node-cron';
import { instrumentCronJob } from '../cronInstrumentation';
import { runPlanRepoSync } from '../agentDomain/planRepoSyncSweep';

/**
 * The agent-domain plan-to-repo sweep, registered out of `schedulerService.ts`.
 *
 * `schedulerService.ts` is over the file ceiling, so a new job is added as its own module
 * and called from `startScheduler()`, the same way the Growth Journey, ad spend, chat and
 * visitor-geo blocks were extracted.
 *
 * WHAT IT FIXES. Until this existed, a republished build plan reached a builder's GitHub
 * repo only when that builder pressed Sync in their workspace, because
 * `POST /api/portal/workspace/repo/sync` was the single caller of `refreshRepoDocuments`.
 * On 2026-11-24 five of seven builder repos were eleven days behind their published plan
 * and one builder was missing credit she had already earned. The full measurement is in
 * `docs/sessions/CC-20261124-w8nz-plan-repo-sync.md`.
 *
 * WHY IT IS REGISTERED RATHER THAN SELF-STARTED. `repoTreeRefreshService` starts its own
 * cron and never calls `instrumentCronJob`, so it has no `ai_agents` row, no run count and
 * no off switch short of a redeploy. That is exactly the class of finding the platform
 * domain builder is cataloguing under `scheduler_liveness_watch`, and it would be a poor
 * joke to add another one while fixing this. This job reports as
 * `AgentDomainPlanRepoSync`, carries a registry row in
 * `agentRegistry/agentDomainPlanSyncAgents.ts` whose `schedule` matches the expression
 * below literally, and can be paused from Admin > Agents with no deploy.
 *
 * WHY :41 AND SIX-HOURLY. Six hours matches `repoTreeRefreshService`, which is the cadence
 * a builder's view of their own repo already moves at, and :41 keeps it clear of that
 * job's :17 so the two do not contend for the same GitHub budget.
 *
 * SHIPPED ON. Unlike the Growth Journey rows this is not paused, because a switch that is
 * off does not close the loop it was written to close. Every write still goes through
 * `refreshRepoDocuments`, which renders only from the published plan, commits only files
 * whose content hash differs, and merges `progress.json` field by field. The steady state
 * of this job is that it writes nothing at all.
 */
export const PLAN_REPO_SYNC_AGENT = 'AgentDomainPlanRepoSync';
export const PLAN_REPO_SYNC_SCHEDULE = '41 */6 * * *';

export function registerPlanRepoSyncCrons(): void {
  cron.schedule('41 */6 * * *', () => {
    instrumentCronJob('AgentDomainPlanRepoSync', async () => {
      await runPlanRepoSync();
    }).catch((err) => {
      console.error('[Scheduler] AgentDomainPlanRepoSync failed:', err);
    });
  });
}
