import cron from 'node-cron';
import { WORKER_ACTOR } from '../activityLog';
import { syncLiveEvents } from '../live/livePanel';
import { ensurePlansForUpcoming } from '../messages/promotionPlan';
import { deliveryRepo } from './deliveryRepo';
import { defaultConnector, runDeliveryTick, type WorkerDeps } from './deliveryWorker';

/**
 * The Communications Hub worker's wiring (CH7.2): every minute, on the house scheduler (node-cron, as
 * server.ts registers the other minute jobs). One tick at a time: a tick still running when the next
 * minute fires is skipped, not stacked. Each tick:
 *  - repairs events left "live" by a stream that ended outside the panel (CH5.2 carry-forward);
 *  - drafts promotion-plan messages for occurrences entering the window, and Recording and thanks
 *    after one ends (CH6.4 carry-forward);
 *  - sends what is due (deliveryWorker.ts).
 * Each part's failure is logged and does not stop the others. Nothing is sent while the hub's global
 * pause is on; nothing is ever sent that a person did not approve.
 */
export const COMMS_HUB_WORKER_CRON = '* * * * *';

function log(level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown>): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'comms-hub-worker', event, ...ctx });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

export const workerDeps: WorkerDeps = { repo: deliveryRepo, connector: defaultConnector, log };

let running = false;

export async function runCommsHubTick(deps: WorkerDeps = workerDeps, now: Date = new Date()): Promise<'ran' | 'skipped_overlap'> {
  if (running) {
    deps.log('warn', 'comms_hub_tick_overlap', { outcome: 'partial' });
    return 'skipped_overlap';
  }
  running = true;
  try {
    const step = async (event: string, fn: () => Promise<unknown>): Promise<void> => {
      try { await fn(); } catch (err) {
        deps.log('error', event, { outcome: 'failure', error_class: (err as Error)?.name ?? 'UnexpectedError', error: (err as Error)?.message });
      }
    };
    await step('comms_hub_live_sync_failed', () => syncLiveEvents(now.getTime()));
    await step('comms_hub_plan_sync_failed', () => ensurePlansForUpcoming(WORKER_ACTOR, now));
    await step('comms_hub_send_tick_failed', () => runDeliveryTick(deps, now));
    return 'ran';
  } finally {
    running = false;
  }
}

let task: ReturnType<typeof cron.schedule> | null = null;

/** Start the minute schedule. Idempotent: a second call does not add a second schedule. */
export function startCommsHubWorker(): boolean {
  if (task) return false;
  task = cron.schedule(COMMS_HUB_WORKER_CRON, () => {
    runCommsHubTick().catch((err) => log('error', 'comms_hub_tick_unhandled', { outcome: 'failure', error_class: (err as Error)?.name ?? 'UnexpectedError' }));
  });
  log('info', 'comms_hub_worker_started', { cron: COMMS_HUB_WORKER_CRON, outcome: 'success' });
  return true;
}

/** Test-only. */
export function __stopCommsHubWorker(): void { task?.stop(); task = null; running = false; }
