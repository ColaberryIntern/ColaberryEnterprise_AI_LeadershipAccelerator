import cron from 'node-cron';
import { instrumentCronJob } from '../cronInstrumentation';
import { closeIdleConversations } from '../chat/closeIdleConversations';

/**
 * The chat conversation crons (R4).
 *
 * Registered here rather than inside `schedulerService.ts`, which is 3,871 lines and far past
 * this repo's 500-line ceiling, so the next change to it splits before it adds. This follows
 * the same shape as `growthJourneyCrons.ts` and `adSpendCrons.ts`, and `startScheduler()`
 * calls it alongside those.
 *
 * WHAT THIS FIXES. Nothing in the frontend ever calls `POST /api/chat/close`, so
 * `closeConversation()` has never run in production: 145 conversations, all 'active', none
 * ended, no summaries, across eight months. Because `closeConversation()` is the only path to
 * `saveConversationToMemory()`, `admissions_memory.conversation_count` is 0 on every row.
 * Maya cannot remember a person because nothing ever tells her a conversation finished.
 */
export const CLOSE_IDLE_AGENT = 'ChatCloseIdleConversations';

/**
 * Every 10 minutes. The job is cheap (one indexed lookup, usually zero rows) and the
 * threshold is 30 minutes, so a visitor who stops talking has their conversation closed, and
 * their memory written, within 40 minutes rather than never.
 */
export const CLOSE_IDLE_SCHEDULE = '*/10 * * * *';

export function registerChatConversationCrons(): void {
  // Close idle chat conversations (R4).
  //
  // NOT shipped paused. Every other effect of closing - the summary, the behavioral signal,
  // the CRM tag, the memory write - is already written and already guarded; what was missing
  // was anything to trigger them. Shipping this disabled would leave the defect exactly where
  // it is. There is no registry row for this agent, and `instrumentCronJob` runs a job with no
  // row untracked, so it runs on deploy. Seeding a row later adds tracking and the ability to
  // pause it from Admin > Agents without a redeploy.
  //
  // This job SENDS NOTHING to a lead. Closing a conversation writes a summary, a memory row,
  // a behavioral signal and a CRM tag. The one outbound-looking call, `addMayaInteractionTag`,
  // tags the CRM record; it does not message the person.
  // The agent name is passed as a STRING LITERAL, not as CLOSE_IDLE_AGENT, deliberately.
  // cronRegistryReconciliation's parser resolves a literal statically; an identifier is a
  // `dynamicArg` that resolves to no name, which would make this registration invisible to the
  // invariant that every scheduled job has a seed row. The constant stays exported for the seed
  // row and the tests, and a test pins the two together so they cannot drift apart.
  cron.schedule(CLOSE_IDLE_SCHEDULE, () => {
    instrumentCronJob('ChatCloseIdleConversations', async () => {
      await closeIdleConversations();
    }).catch((err) => {
      console.error(`[Scheduler] ${CLOSE_IDLE_AGENT} failed:`, err);
    });
  });
}
