/**
 * cognitiveStabilityProtection — prevents websocket storms, rerank
 * thrashing, and cognition feedback loops by wrapping event publication
 * with debouncers, throttlers, and a rate-limited emitter.
 *
 * Pure where possible; the rate limiter is stateful but module-local.
 *
 * Phase 8 §16.
 */

interface RateLimitState {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateLimitState>();
const debounceTimers = new Map<string, NodeJS.Timeout>();

export interface RateLimitConfig {
  readonly key: string;
  readonly window_ms: number;
  readonly max_per_window: number;
}

/**
 * Returns true when the call is allowed; false when it should be dropped.
 * Use to gate cognitive event publication so a stuck loop can't flood the bus.
 */
export function allowByRateLimit(cfg: RateLimitConfig): boolean {
  const now = Date.now();
  let state = rateLimits.get(cfg.key);
  if (!state || now - state.windowStart > cfg.window_ms) {
    state = { count: 0, windowStart: now };
    rateLimits.set(cfg.key, state);
  }
  if (state.count >= cfg.max_per_window) return false;
  state.count++;
  return true;
}

/**
 * Debounce: collapse rapid calls within `ms` into one trailing invocation.
 * Caller-keyed so different actions debounce independently.
 */
export function debounce(key: string, ms: number, fn: () => void): void {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    debounceTimers.delete(key);
    try { fn(); } catch (err: any) { console.warn('[stability] debounced fn error:', err?.message); }
  }, ms);
  debounceTimers.set(key, t);
}

/**
 * Hysteresis: returns true when `value` has crossed the upper threshold AND
 * we weren't already "tripped"; tracks state per key so we don't oscillate.
 */
const hysteresisState = new Map<string, boolean>();
export function withHysteresis(key: string, value: number, opts: { upper: number; lower: number }): boolean {
  const tripped = hysteresisState.get(key) ?? false;
  if (!tripped && value >= opts.upper) {
    hysteresisState.set(key, true);
    return true;
  }
  if (tripped && value <= opts.lower) {
    hysteresisState.set(key, false);
  }
  return false;
}

/**
 * Cooldown: returns true when at least `ms` has passed since this key last
 * returned true. Used to suppress repeated escalations within a short window.
 */
const cooldownTimestamps = new Map<string, number>();
export function withCooldown(key: string, ms: number): boolean {
  const last = cooldownTimestamps.get(key) ?? 0;
  if (Date.now() - last < ms) return false;
  cooldownTimestamps.set(key, Date.now());
  return true;
}

export function _resetStabilityForTests(): void {
  for (const t of debounceTimers.values()) clearTimeout(t);
  rateLimits.clear();
  debounceTimers.clear();
  hysteresisState.clear();
  cooldownTimestamps.clear();
}
