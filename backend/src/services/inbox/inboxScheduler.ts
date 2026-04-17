/**
 * Inbox COS Scheduler — Timer management for all inbox processing intervals.
 * Registers and manages setInterval timers for sync, classification, digest, and learning.
 */
import { syncAllMailboxes } from './inboxSyncService';
import { processNewEmails } from './inboxStateManager';

const LOG_PREFIX = '[InboxCOS][Scheduler]';

// Timer intervals in milliseconds
const SYNC_INTERVAL = 60_000;           // 1 minute
const PROCESS_INTERVAL = 65_000;        // 1 min 5 sec (offset from sync)
const DIGEST_INTERVAL = 14_400_000;     // 4 hours
const LEARNING_INTERVAL = 86_400_000;   // 24 hours
const DAILY_SUMMARY_INTERVAL = 3_600_000; // Check every hour (sends at 7 AM)

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

  // Timer 5: ASK_USER SMS alert (alongside digest, every 4 hours)
  intervalIds.push(
    setInterval(async () => {
      try {
        const { sequelize } = await import('../../config/database');
        const [pending] = await sequelize.query(
          "SELECT ie.from_name, ie.from_address, ie.subject FROM inbox_emails ie " +
          "JOIN inbox_classifications ic ON ie.id = ic.email_id " +
          "WHERE ic.state = 'ASK_USER' ORDER BY ie.received_at DESC LIMIT 5"
        ) as [any[], unknown];
        if (pending.length > 0) {
          const { alertAskUserPending } = await import('./smsAlertService');
          await alertAskUserPending(pending.length, pending.map((p: any) => ({
            from: p.from_name || p.from_address,
            subject: p.subject,
          })));
        }
      } catch (error: any) {
        console.error(`${LOG_PREFIX} ASK_USER SMS alert error: ${error.message}`);
      }
    }, DIGEST_INTERVAL)
  );

  // Timer 6: Daily morning summary (check hourly, send at 7 AM CDT)
  intervalIds.push(
    setInterval(async () => {
      try {
        const now = new Date();
        const cdtHour = (now.getUTCHours() - 5 + 24) % 24;
        if (cdtHour !== 7) return;

        const { sequelize } = await import('../../config/database');
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const [newCount] = await sequelize.query(
          "SELECT COUNT(*)::int as c FROM inbox_emails WHERE synced_at >= '" + since + "'"
        ) as [any[], unknown];
        const [states] = await sequelize.query(
          "SELECT state, COUNT(*)::int as c FROM inbox_classifications ic " +
          "JOIN inbox_emails ie ON ic.email_id = ie.id WHERE ie.synced_at >= '" + since + "' GROUP BY state"
        ) as [any[], unknown];
        const [draftCount] = await sequelize.query(
          "SELECT COUNT(*)::int as c FROM inbox_reply_drafts WHERE status = 'pending_approval'"
        ) as [any[], unknown];
        const [vipCount] = await sequelize.query(
          "SELECT COUNT(*)::int as c FROM inbox_emails ie JOIN inbox_vips iv ON LOWER(ie.from_address) = LOWER(iv.email_address) WHERE ie.synced_at >= '" + since + "'"
        ) as [any[], unknown];

        const stateMap: Record<string, number> = {};
        states.forEach((s: any) => { stateMap[s.state] = s.c; });

        const { sendDailySummary } = await import('./smsAlertService');
        await sendDailySummary({
          newEmails: newCount[0]?.c || 0,
          inbox: stateMap['INBOX'] || 0,
          automation: stateMap['AUTOMATION'] || 0,
          silentHold: stateMap['SILENT_HOLD'] || 0,
          pendingDrafts: draftCount[0]?.c || 0,
          vipEmails: vipCount[0]?.c || 0,
        });
      } catch (error: any) {
        console.error(`${LOG_PREFIX} Daily summary SMS error: ${error.message}`);
      }
    }, DAILY_SUMMARY_INTERVAL)
  );

  isRunning = true;
  console.log(`${LOG_PREFIX} Started with 6 timers (sync, process, digest, learning, sms-alerts, daily-summary)`);
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
