/**
 * Which Cloudflare live input a new occurrence should be bound to.
 *
 * L7.1 made a broadcast creatable by ticking a box, and the occurrence it created had no
 * `provider_session_id` — so nothing told playback which input to sign, and the occurrence was
 * real, correctly private, correctly roomed, correctly timed, and unplayable. During Test 2 the
 * field had to be set by hand before anyone could watch.
 *
 * THE STRATEGY IS A DECISION, SO IT IS NAMED AND SWAPPABLE rather than hardcoded.
 *
 *   shared          one durable input reused by every class. One stream key configured in Zoom
 *                   once. Two classes can never air simultaneously.
 *   per_occurrence  an input per class: clean isolation and per-class keys, at the cost of
 *                   reconfiguring Zoom's destination every time — the manual work L7.1 removed.
 *   per_series      a weekly show keeps its key; different shows stay isolated.
 *
 * ONLY `shared` IS IMPLEMENTED. Ali was asked three times for the strategy and the answer did
 * not come, so this proceeds on the recommendation rather than blocking the critical path:
 * `shared` is the simplest, the most deterministic, has the smallest blast radius, and is what
 * both airings already used. The other two are named here and rejected at runtime with a clear
 * reason, so choosing one later is a change of configuration plus one function, not a redesign.
 *
 * REFUSING IS A FEATURE. If no input resolves, creation must fail rather than produce an
 * occurrence that looks fine and cannot play. That is worse than no occurrence, because it is
 * discovered by an audience rather than by an admin.
 */

/** Cloudflare's own uid shape. Anything else is a URL-shaped injection, not a typo. */
const UID_PATTERN = /^[0-9a-f]{32}$/;

export const BINDING_STRATEGIES = ['shared', 'per_occurrence', 'per_series'] as const;
export type BindingStrategy = (typeof BINDING_STRATEGIES)[number];

export const DEFAULT_STRATEGY: BindingStrategy = 'shared';

export type BindingRefusal =
  | 'unknown_strategy'
  | 'strategy_not_implemented'
  | 'no_input_configured'
  | 'malformed_input_uid';

export type BindingResult =
  | { bound: true; provider: 'cloudflare'; providerSessionId: string; strategy: BindingStrategy }
  | { bound: false; reason: BindingRefusal; detail?: string };

/**
 * Resolve the live input for a new occurrence.
 *
 * Pure: reads an environment map and returns a decision. No network, no database — the caller
 * decides what to do with a refusal, and a test can exercise every branch without either.
 */
export function resolveLiveInput(env: NodeJS.ProcessEnv = process.env): BindingResult {
  const raw = (env.BROADCAST_INPUT_STRATEGY || DEFAULT_STRATEGY).trim() as BindingStrategy;

  if (!(BINDING_STRATEGIES as readonly string[]).includes(raw)) {
    return { bound: false, reason: 'unknown_strategy', detail: raw };
  }
  if (raw !== 'shared') {
    // Named but not built. Saying so is better than silently falling back to shared, which
    // would quietly ignore an operator's explicit choice.
    return { bound: false, reason: 'strategy_not_implemented', detail: raw };
  }

  const uid = (env.CLOUDFLARE_STREAM_LIVE_INPUT_UID || '').trim();
  if (!uid) return { bound: false, reason: 'no_input_configured' };
  if (!UID_PATTERN.test(uid)) {
    // Deliberately does NOT echo the value: it is read from the environment and an error
    // string becomes a log line.
    return { bound: false, reason: 'malformed_input_uid' };
  }

  return { bound: true, provider: 'cloudflare', providerSessionId: uid, strategy: 'shared' };
}
