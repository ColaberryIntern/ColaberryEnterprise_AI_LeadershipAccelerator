/**
 * pointsFx — the cross-component "points earned" signal + effects layer.
 *
 * When any surface awards engagement points (card / survey / knowledge-check /
 * lesson complete, daily streak, RSVP), it calls emitPointsEarned(delta). The
 * top-bar PortalShell HUD listens and animates its total; the completing surface
 * can also show a local "+N" burst. A short, soft chime plays (default on,
 * user-mutable in Settings ▸ Preferences, and suppressed under OS reduced-motion).
 *
 * There is no shared points store; a window CustomEvent is the lightest bridge
 * from the deep completion UIs up to the HUD — it mirrors the existing
 * `te-avatar-changed` pattern already used by PortalShell.
 */

export const POINTS_EVENT = 'te-points-changed';

export interface PointsEarnedDetail {
  delta: number;              // points just awarded (drives the "+N" burst)
  total: number | null;       // new authoritative total if known, else HUD refetches
}

/** Fire the "points earned" signal + play the chime. No-op when delta <= 0
 *  (an idempotent re-completion awards 0 and must stay silent). */
export function emitPointsEarned(delta: number, total: number | null = null): void {
  if (!delta || delta <= 0) return;
  try {
    window.dispatchEvent(new CustomEvent<PointsEarnedDetail>(POINTS_EVENT, { detail: { delta, total } }));
  } catch { /* non-DOM environment — ignore */ }
  playEarnSound();
}

/** Subscribe to points-earned events; returns an unsubscribe function. */
export function onPointsEarned(cb: (detail: PointsEarnedDetail) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<PointsEarnedDetail>).detail);
  window.addEventListener(POINTS_EVENT, handler);
  return () => window.removeEventListener(POINTS_EVENT, handler);
}

// ── card-collected signal ──────────────────────────────────────────────────
// A completed card should drop off the Today feed. Collect can happen on the tile
// OR in the drawer; both fire this one signal (with the card's id) so the feed can
// remove the row from whichever surface triggered it — no prop threading.
export const CARD_COLLECTED_EVENT = 'te-card-collected';

/** Signal that a card was collected/completed (its feed row should disappear). */
export function emitCardCollected(cardId: string): void {
  if (!cardId) return;
  try {
    window.dispatchEvent(new CustomEvent<{ cardId: string }>(CARD_COLLECTED_EVENT, { detail: { cardId } }));
  } catch { /* non-DOM environment — ignore */ }
}

/** Subscribe to card-collected events; returns an unsubscribe function. */
export function onCardCollected(cb: (cardId: string) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<{ cardId: string }>).detail.cardId);
  window.addEventListener(CARD_COLLECTED_EVENT, handler);
  return () => window.removeEventListener(CARD_COLLECTED_EVENT, handler);
}

// ── sound preference (default ON; a mute toggle lives in Settings ▸ Preferences) ──
const SOUND_KEY = 'te-sound';

export function soundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}
export function setSoundEnabled(on: boolean): void {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}

function prefersReducedMotion(): boolean {
  try { return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/**
 * A short, soft two-note rising chime synthesized with WebAudio (no asset to
 * bundle). Gated by the sound preference and OS reduced-motion, and fully
 * best-effort — if WebAudio is unavailable or blocked before a user gesture it
 * simply stays silent.
 */
export function playEarnSound(): void {
  if (!soundEnabled() || prefersReducedMotion()) return;
  try {
    const AC: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const start = ctx.currentTime;
    const notes = [659.25, 880]; // E5 → A5: a gentle, calm rise (enterprise-tasteful)
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = start + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.28);
    });
    window.setTimeout(() => { try { void ctx.close(); } catch { /* ignore */ } }, 600);
  } catch { /* WebAudio unavailable — silent, never throws */ }
}
