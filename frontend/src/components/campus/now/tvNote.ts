import type { TvShort } from './tvPlaylist';

/**
 * The left panel's "📺 New on Colaberry TV" note, the pure part (Campus v20 N4, Basecamp C135). It shows only when shorts were added
 * after the viewer last opened Colaberry Now, and at most once a Central day: dismissing it hides it until tomorrow. Both marks are
 * per-viewer browser conveniences (localStorage); a private window simply shows the note again, which is harmless.
 */
const SEEN_KEY = 'cm-tv-seen';
const DISMISSED_KEY = 'cm-tv-note-day';

export const centralDay = (t: number): string => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

function read(k: string): string | null { try { return window.localStorage.getItem(k); } catch { return null; } }
function write(k: string, v: string): void { try { window.localStorage.setItem(k, v); } catch { /* not stored; harmless */ } }

/** The shorts added since the viewer's last look (all of them before the first look), newest first. */
export function newShorts(list: TvShort[], seenAt: string | null): TvShort[] {
  return list.filter((s) => !seenAt || s.created_at > seenAt).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function tvNoteFor(list: TvShort[], now = Date.now()): { show: boolean; fresh: TvShort[] } {
  const fresh = newShorts(list, read(SEEN_KEY));
  const dismissed = read(DISMISSED_KEY) === centralDay(now);
  return { show: fresh.length > 0 && !dismissed, fresh };
}

/** Opening Colaberry Now counts as having looked at the TV. */
export function markTvSeen(now = Date.now()): void { write(SEEN_KEY, new Date(now).toISOString()); }
/** ✕ on the note: not again today (Central). */
export function dismissTvNote(now = Date.now()): void { write(DISMISSED_KEY, centralDay(now)); }
