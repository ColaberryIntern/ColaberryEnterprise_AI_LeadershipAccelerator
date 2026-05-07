/**
 * redisCognitiveBus — Redis pub/sub adapter for the cognitive event bus.
 *
 * In a multi-process deployment, the in-process `cognitiveEventBus`
 * (Phase 8) only fans out to subscribers in the same Node process. This
 * adapter publishes locally-emitted events to a Redis channel and
 * republishes Redis-received events to the local bus, so every process
 * sees every event.
 *
 * Optional dep: `ioredis`. The adapter dynamic-imports it; if missing,
 * the adapter degrades to a no-op (single-process behavior preserved).
 *
 * Phase 9 §1.
 */

const CHANNEL_PREFIX = 'cognitive_events';

export interface RedisAdapter {
  readonly id: 'ioredis' | 'stub';
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, handler: (message: string) => void): Promise<void>;
  disconnect(): Promise<void>;
}

let activeAdapter: RedisAdapter | null = null;
let adapterAttempted = false;
let publishedCount = 0;
let receivedCount = 0;
let dropCount = 0;

export interface RedisInitOptions {
  readonly url?: string;
  readonly channel_namespace?: string;
}

export async function initRedisCognitiveBus(opts: RedisInitOptions = {}): Promise<RedisAdapter | null> {
  if (adapterAttempted) return activeAdapter;
  adapterAttempted = true;

  const url = opts.url ?? process.env.REDIS_URL ?? null;
  if (!url) {
    console.log('[redisCognitiveBus] no REDIS_URL — distributed mode disabled');
    return null;
  }

  try {
    // Optional dep: escape TS module resolution so absence doesn't fail the build.
    // eslint-disable-next-line
    const mod: any = await (Function('m', 'return import(m)') as any)('ioredis');
    const Redis = mod.default ?? mod;
    const pub = new Redis(url);
    const sub = new Redis(url);

    activeAdapter = {
      id: 'ioredis',
      async publish(channel, message) {
        try {
          publishedCount++;
          return await pub.publish(channel, message);
        } catch (err: any) {
          dropCount++;
          console.warn('[redisCognitiveBus] publish failed:', err?.message);
          return 0;
        }
      },
      async subscribe(channel, handler) {
        await sub.subscribe(channel);
        sub.on('message', (incomingChannel: string, message: string) => {
          if (incomingChannel === channel) {
            receivedCount++;
            try { handler(message); } catch (err: any) {
              console.warn('[redisCognitiveBus] handler error:', err?.message);
            }
          }
        });
      },
      async disconnect() {
        try { await pub.quit(); } catch { /* ignore */ }
        try { await sub.quit(); } catch { /* ignore */ }
      },
    };
    return activeAdapter;
  } catch (err: any) {
    console.warn('[redisCognitiveBus] ioredis unavailable:', err?.message);
    return null;
  }
}

export function getRedisAdapter(): RedisAdapter | null {
  return activeAdapter;
}

export function channelFor(projectId: string, namespace?: string): string {
  const ns = namespace ?? CHANNEL_PREFIX;
  return `${ns}:${projectId}`;
}

export function broadcastChannel(namespace?: string): string {
  const ns = namespace ?? CHANNEL_PREFIX;
  return `${ns}:_broadcast`;
}

export function redisBusStats() {
  return {
    enabled: activeAdapter !== null,
    adapter_id: activeAdapter?.id ?? null,
    published: publishedCount,
    received: receivedCount,
    dropped: dropCount,
  };
}

/** Test helper. */
export function _resetRedisAdapterForTests(): void {
  if (activeAdapter) {
    void activeAdapter.disconnect();
  }
  activeAdapter = null;
  adapterAttempted = false;
  publishedCount = 0;
  receivedCount = 0;
  dropCount = 0;
}
