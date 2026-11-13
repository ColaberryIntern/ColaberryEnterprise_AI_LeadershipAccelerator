/**
 * Colaberry TV's play order, the pure part (Campus v20 N2/N3, Basecamp C132 / C134). The TV loops: after the last short it starts
 * again from the first. When staff change the playlist while someone is watching, the open TV FOLLOWS: the short playing stays
 * playing if it is still on air; if it was removed or taken off air, the TV moves to the next one that still is.
 */
export interface TvShort { id: string; youtube_id: string; title: string; duration_s: number | null; created_at: string }

export const nextIndex = (i: number, n: number): number => (n > 0 ? (i + 1) % n : 0);
export const prevIndex = (i: number, n: number): number => (n > 0 ? (i - 1 + n) % n : 0);

/**
 * Where the TV should be after the list changed from `prev` to `next`, given the short that was playing.
 * `moved` is true when the playing short is gone and a different one must start.
 */
export function follow(prev: TvShort[], next: TvShort[], currentId: string | null): { index: number; moved: boolean } {
  if (!next.length) return { index: 0, moved: currentId !== null };
  if (currentId === null) return { index: 0, moved: false };
  const still = next.findIndex((s) => s.id === currentId);
  if (still >= 0) return { index: still, moved: false };
  const was = prev.findIndex((s) => s.id === currentId);
  const live = new Set(next.map((s) => s.id));
  for (let k = 1; was >= 0 && k <= prev.length; k++) {
    const cand = prev[(was + k) % prev.length];
    if (live.has(cand.id)) return { index: next.findIndex((s) => s.id === cand.id), moved: true };
  }
  return { index: 0, moved: true };
}

/** 0:42 from 42 seconds; empty for an unknown length (never a made-up one). */
export function mmss(s: number | null | undefined): string {
  if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) return '';
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * C136 (Ali, 11 Nov 2026: "every time someone goes there, they don't get the same exact video playing first... it should show a
 * totally different video"): each opening plays the shorts in a fresh random order, and the first short is never the one that
 * started last time. Fisher-Yates with an injectable random (tests); with 2+ shorts the last opening's first is moved off the front.
 */
export function shuffleOrder(ids: readonly string[], lastFirst: string | null, rand: () => number = Math.random): string[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && lastFirst && out[0] === lastFirst) {
    const k = 1 + Math.floor(rand() * (out.length - 1));
    [out[0], out[k]] = [out[k], out[0]];
  }
  return out;
}

/** The playlist in this opening's order; a short added since (not in the order yet) goes at the end, in staff order. */
export function applyOrder<T extends { id: string }>(videos: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const known = videos.filter((v) => rank.has(v.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...known, ...videos.filter((v) => !rank.has(v.id))];
}

/** The short the last opening started on (localStorage, across visits; a private window just starts anywhere). */
const FIRST_KEY = 'cm-tv-last-first';
export function readLastFirst(): string | null {
  try { return window.localStorage.getItem(FIRST_KEY); } catch { return null; }
}
export function saveLastFirst(id: string): void {
  try { window.localStorage.setItem(FIRST_KEY, id); } catch { /* not stored; the next opening is still random */ }
}

export const thumbOf =(youtubeId: string): string => `https://img.youtube.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`;

/** The mute choice for this visit (sessionStorage: a per-visit convenience; a private window just starts with sound). */
const MUTE_KEY = 'cm-tv-muted';
export function readMuted(): boolean {
  try { return window.sessionStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function saveMuted(m: boolean): void {
  try { window.sessionStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* nothing stored; still works this session */ }
}
