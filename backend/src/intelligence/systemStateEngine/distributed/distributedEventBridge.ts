/**
 * distributedEventBridge — wires the local cognitive event bus to a Redis
 * adapter for cross-process awareness.
 *
 * Bidirectional:
 *   - local publish → Redis broadcast (other processes hear it)
 *   - Redis incoming → local re-publish (this process sees it)
 *
 * Loop prevention: every envelope carries the publishing process_id. The
 * outgoing listener skips events that originated from another process
 * (we only forward locally-published events to Redis). Incoming events
 * are re-published locally and tagged in a short-lived seen set so the
 * outgoing listener can drop them.
 *
 * Phase 9 §1.
 */
import { cognitiveEventBus, type CognitiveEvent } from '../realtime/cognitiveEventBus';
import { getRedisAdapter, channelFor, broadcastChannel } from './redisCognitiveBus';
import { randomUUID } from 'crypto';

let started = false;
let unsubscribeLocal: (() => void) | null = null;
const PROCESS_ID = randomUUID();

// Short-lived dedupe set: event IDs that arrived FROM Redis recently. The
// outgoing listener checks this set and refuses to re-publish those.
// Capped at 1000; entries auto-expire after 30s.
const incomingEventIds = new Map<string, number>();
const INCOMING_TTL_MS = 30_000;
const INCOMING_MAX_ENTRIES = 1000;

interface DistributedEnvelope {
  readonly _origin: string;
  readonly event: CognitiveEvent;
}

function rememberIncoming(id: string): void {
  if (incomingEventIds.size >= INCOMING_MAX_ENTRIES) {
    // Drop the oldest 25%
    const drop = Array.from(incomingEventIds.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, Math.floor(INCOMING_MAX_ENTRIES / 4));
    for (const [k] of drop) incomingEventIds.delete(k);
  }
  incomingEventIds.set(id, Date.now());
}
function isIncomingEcho(id: string): boolean {
  const ts = incomingEventIds.get(id);
  if (!ts) return false;
  if (Date.now() - ts > INCOMING_TTL_MS) {
    incomingEventIds.delete(id);
    return false;
  }
  return true;
}

export async function startDistributedBridge(): Promise<boolean> {
  if (started) return true;
  const adapter = getRedisAdapter();
  if (!adapter) {
    console.log('[distributedEventBridge] no Redis adapter — bridge inactive');
    return false;
  }

  // Outgoing: forward local publishes to Redis, skipping events that came
  // FROM Redis in the last 30s.
  unsubscribeLocal = cognitiveEventBus.subscribe(async (event: CognitiveEvent) => {
    if (isIncomingEcho(event.id)) return;
    const envelope: DistributedEnvelope = { _origin: PROCESS_ID, event };
    try {
      const channel = channelFor(event.project_id);
      await adapter.publish(channel, JSON.stringify(envelope));
      await adapter.publish(broadcastChannel(), JSON.stringify(envelope));
    } catch (err: any) {
      console.warn('[distributedEventBridge] outgoing publish failed:', err?.message);
    }
  });

  // Incoming: subscribe to the broadcast channel, republish locally.
  await adapter.subscribe(broadcastChannel(), (message: string) => {
    try {
      const envelope = JSON.parse(message) as DistributedEnvelope;
      if (envelope._origin === PROCESS_ID) return;            // own echo
      rememberIncoming(envelope.event.id);
      cognitiveEventBus.publish(envelope.event);
    } catch (err: any) {
      console.warn('[distributedEventBridge] incoming parse failed:', err?.message);
    }
  });

  started = true;
  console.log(`[distributedEventBridge] active (process ${PROCESS_ID})`);
  return true;
}

export async function stopDistributedBridge(): Promise<void> {
  if (unsubscribeLocal) unsubscribeLocal();
  unsubscribeLocal = null;
  started = false;
  incomingEventIds.clear();
}

export function bridgeStatus() {
  return {
    started,
    process_id: PROCESS_ID,
    incoming_dedupe_size: incomingEventIds.size,
  };
}

/** Test helper: clear bridge state. */
export function _resetBridgeForTests(): void {
  void stopDistributedBridge();
  incomingEventIds.clear();
}
