/**
 * persistentCognitionMemory — bridges the cognitive event bus to durable
 * storage (`cognition_events` table).
 *
 * Subscribes to the bus on bootstrap; every event is mirrored to the DB
 * (best-effort, non-blocking). Replay queries read from the table.
 *
 * Phase 8 §3.
 */
import { cognitiveEventBus, type CognitiveEvent } from './cognitiveEventBus';

let active = false;
let unsub: (() => void) | null = null;
let writes = 0;
let writeFailures = 0;

export function startPersistentMemory(): void {
  if (active) return;
  active = true;
  unsub = cognitiveEventBus.subscribe((event: CognitiveEvent) => {
    setImmediate(async () => {
      try {
        const { default: CognitionEvent } = await import('../../../models/CognitionEvent');
        await CognitionEvent.create({
          event_id: event.id,
          project_id: event.project_id,
          kind: event.kind,
          severity: event.severity ?? null,
          payload: event.payload as any,
          emitted_at: new Date(event.emitted_at),
        } as any);
        writes++;
      } catch (err: any) {
        writeFailures++;
        // Table may not exist (e.g., tests). Don't spam logs.
        if (writes < 3) console.warn('[persistentCognitionMemory] write failed:', err?.message);
      }
    });
  });
}

export function stopPersistentMemory(): void {
  if (unsub) unsub();
  unsub = null;
  active = false;
}

export function persistentMemoryStats() {
  return { active, writes, writeFailures };
}
