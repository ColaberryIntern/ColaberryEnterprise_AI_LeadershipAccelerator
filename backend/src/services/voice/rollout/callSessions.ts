/**
 * Per-call sessions (VS4.5): what a live call is, fixed at dial time. A call that started on version 3
 * ends on version 3, whatever is published meanwhile.
 *
 * Held in this process only, bounded and short-lived, because the rendered prompt can carry a person's
 * details: it is never written to the database or a log. If it is gone (restart between dial and answer,
 * or expired) the call is hung up; it never falls back to another agent's words.
 *
 * Test calls have no pinned session: they always speak the frozen test profile.
 */
import type { RegisteredTool } from '../engines/toolBroker';
import { liveProfile, type VoiceProfile } from '../engines/voiceProfiles';

export interface CallSessionSpec { profile: VoiceProfile; tools: readonly RegisteredTool[]; agentKey: string; held: readonly string[] }

const TTL_MS = 10 * 60 * 1000;
const MAX = 200;
const pinned = new Map<string, { spec: CallSessionSpec; at: number }>();

export function pinSession(callId: string, spec: CallSessionSpec, now = Date.now()): void {
  for (const [k, v] of pinned) if (now - v.at > TTL_MS) pinned.delete(k);
  if (!pinned.has(callId) && pinned.size >= MAX) throw Object.assign(new Error('too many pinned calls'), { name: 'SessionStoreFull' });
  pinned.set(callId, { spec, at: now });
}

export function unpinSession(callId: string): void { pinned.delete(callId); }
export function pinnedSession(callId: string, now = Date.now()): CallSessionSpec | null {
  const p = pinned.get(callId);
  return p && now - p.at <= TTL_MS ? p.spec : null;
}

/** What this call may say. null = refuse it. */
export function resolveSession(call: { id: string; testMode: boolean } | null, testTools: () => readonly RegisteredTool[], now = Date.now()): CallSessionSpec | null {
  if (!call) return null;
  if (call.testMode) return { profile: liveProfile(), tools: testTools(), agentKey: 'edu-cory-outbound', held: [] };
  return pinnedSession(call.id, now);
}
