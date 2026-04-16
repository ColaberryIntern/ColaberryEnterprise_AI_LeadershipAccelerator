/**
 * Inbox COS Scheduler — Timer management for all inbox processing intervals.
 * Registers and manages setInterval timers for sync, classification, digest, and learning.
 */
import { syncAllMailboxes } from './inboxSyncService';
import { processNewEmails } from './inboxStateManager';

const LOG_PREFIX = '[InboxCOS][Scheduler]';

// Timer intervals in milliseconds
const SYNC_INTERVAL = 60_000;         // 1 minute
const PROCESS_INTERVAL = 65_000;      // 1 min 5 sec (offset from sync)
const DIGEST_INTERVAL = 14_400_000;   // 4 hours
const LEARNING_INTERVAL = 86_400_000; // 24 hours

// Active interval handles for cleanup
let intervalIds: ReturnType<typeof setInterval>[] = [];
let isRunning = false;

/**
 * Starts all inbox COS timers. Idempotent — will not double-register if already running.
 */
export function startInboxScheduler(): void {
  if (isRunning) {
    console.warn(`${LOG_PREFIX} Already running — ignoring duplicate start`);
    return;
  }

  // Timer 1: Mailbox sync (every 1 minute)
  intervalIds.push(
    setInterval(async () => {
      try {
        await syncAllMailboxes();
      } catch (error: any) {
        console.error(`${LOG_PREFIX} syncAllMailboxes error: ${error.message}`);
      }
    }, SYNC_INTERVAL)
  );

  // Timer 2: Email classification pipeline (every 65 seconds, offset from sync)
  intervalIds.push(
    setInterval(async () => {
      try {
        await processNewEmails();
      } catch (error: any) {
        console.error(`${LOG_PREFIX} processNewEmails error: ${error.message}`);
      }
    }, PROCESS_INTERVAL)
  );

  // Timer 3: ASK_USER digest (every 4 hours)
  intervalIds.push(
    setInterval(async () => {
      try {
        const { sendPendingDigests } = await import('./askUserDigestService');
        await sendPendingDigests();
      } catch (error: any) {
        console.error(`${LOG_PREFIX} sendPendingDigests error: ${error.message}`);
      }
    }, DIGEST_INTERVAL)
  );

  // Timer 4: Style learning extraction (every 24 hours)
  intervalIds.push(
    setInterval(async () => {
      try {
        const { runLearningExtraction } = await import('./styleLearningService');
        await runLearningExtraction();
      } catch (error: any) {
        console.error(`${LOG_PREFIX} runLearningExtraction error: ${error.message}`);
      }
    }, LEARNING_INTERVAL)
  );

  isRunning = true;
  console.log(`${LOG_PREFIX} Started with 4 timers (sync=${SYNC_INTERVAL}ms, process=${PROCESS_INTERVAL}ms, digest=${DIGEST_INTERVAL}ms, learning=${LEARNING_INTERVAL}ms)`);
}

/**
 * Stops all inbox COS timers and cleans up.
 */
export function stopInboxScheduler(): void {
  if (!isRunning) {
    console.warn(`${LOG_PREFIX} Not running — ignoring stop`);
    return;
  }

  for (const id of intervalIds) {
    clearInterval(id);
  }

  intervalIds = [];
  isRunning = false;
  console.log(`${LOG_PREFIX} Stopped all timers`);
}
