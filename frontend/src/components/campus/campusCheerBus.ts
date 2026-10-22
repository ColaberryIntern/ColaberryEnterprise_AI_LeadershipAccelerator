/**
 * The campus cheer (WP-2; the prototype's cheer / nextCheer): a dark toast at the top center that celebrates what just happened
 * ("+10 pts · Watch the agents lesson", "Next: Knowledge check · Cert Prep Center [Go]"). Cheers queue and play one at a time.
 *
 * A tiny window-event bus, like services/pointsFx: any campus surface calls cheer(), the one <CampusCheer/> on screen shows it. No
 * listener mounted = nothing shown, nothing thrown.
 */
export const CHEER_EVENT = 'cm-cheer';

export interface Cheer {
  /** A big emoji on the left (the prototype's .ch-big), optional. */
  big?: string;
  title: string;
  detail?: string;
  /** One action button (the prototype's yellow pill), e.g. Go to the next stop. */
  action?: { label: string; run: () => void };
  /** How long it stays, in ms (the prototype: 2.6 s for points, 4.6 s for Next). */
  ms?: number;
}

export function cheer(c: Cheer): void {
  try { window.dispatchEvent(new CustomEvent<Cheer>(CHEER_EVENT, { detail: c })); } catch { /* non-DOM environment */ }
}

export function onCheer(cb: (c: Cheer) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<Cheer>).detail);
  window.addEventListener(CHEER_EVENT, h);
  return () => window.removeEventListener(CHEER_EVENT, h);
}
