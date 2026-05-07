/**
 * awarenessHeartbeatManager — periodic engine pulse that:
 *   - publishes a cognitive 'awareness.heartbeat' event
 *   - lets clients confirm the awareness layer is live
 *   - powers the autonomous regression detector + continuous route observer
 *
 * Module-level singleton; idempotent start/stop. Default interval 60s.
 *
 * Phase 8 §1, §16.
 */
import { publishCognitiveEvent } from './cognitiveEventBus';

let timer: NodeJS.Timeout | null = null;
let projectIds: string[] = [];
let intervalMs = 60000;
let tickCount = 0;
let lastTickAt: string | null = null;
const handlers: Array<(projectId: string, tickNumber: number) => Promise<void> | void> = [];

export function configureHeartbeat(opts: { interval_ms?: number; project_ids?: ReadonlyArray<string> }): void {
  if (typeof opts.interval_ms === 'number' && opts.interval_ms >= 5000) intervalMs = opts.interval_ms;
  if (opts.project_ids) projectIds = [...opts.project_ids];
}

/** Register a periodic per-project hook. Returns an unregister function. */
export function registerHeartbeatHandler(handler: (projectId: string, tickNumber: number) => Promise<void> | void): () => void {
  handlers.push(handler);
  return () => {
    const i = handlers.indexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export function startHeartbeat(): void {
  if (timer) return;
  timer = setInterval(() => {
    tickCount++;
    lastTickAt = new Date().toISOString();
    for (const projectId of projectIds) {
      publishCognitiveEvent({
        kind: 'awareness.heartbeat',
        project_id: projectId,
        payload: { tick: tickCount, at: lastTickAt },
      });
      for (const h of handlers) {
        try {
          const result = h(projectId, tickCount);
          if (result instanceof Promise) result.catch(err => console.warn('[awareness] handler error:', err?.message));
        } catch (err: any) {
          console.warn('[awareness] handler error:', err?.message);
        }
      }
    }
  }, intervalMs);
}

export function stopHeartbeat(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function heartbeatStatus() {
  return {
    running: timer !== null,
    interval_ms: intervalMs,
    project_count: projectIds.length,
    handler_count: handlers.length,
    tick_count: tickCount,
    last_tick_at: lastTickAt,
  };
}

/** Test helper. */
export function _resetHeartbeatForTests(): void {
  stopHeartbeat();
  projectIds = [];
  handlers.length = 0;
  tickCount = 0;
  lastTickAt = null;
  intervalMs = 60000;
}
