/**
 * Fire-once-per-session guard for behavioural signals.
 *
 * Explorer Growth OS §6.2 treats `form_start` as a tier-3 intent signal — real
 * evidence someone began committing. That only holds if it fires when a learner
 * actually starts filling the form. Firing on mount would emit for every page
 * view, which turns a tier-3 commitment signal into a tier-1 view signal wearing
 * the wrong label, and quietly corrupts the HIGH_INTENT gate that decides who
 * gets contacted.
 *
 * sessionStorage (not localStorage) so a genuinely new visit can signal again:
 * the same person returning next week HAS started the form again, and that is
 * information, not noise.
 *
 * Pure and injectable so the once-only property is unit-tested rather than
 * eyeballed in a browser.
 */

/** The storage-key prefix. Unique to this feature — also the string the deploy check greps for in the built bundle. */
export const ONCE_PER_SESSION_PREFIX = 'cbx-once-';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    // Safari private mode and some embedded webviews throw on access, and a
    // tracking guard must never take down the page it is instrumenting.
    return typeof window !== 'undefined' && window.sessionStorage
      ? window.sessionStorage
      : null;
  } catch {
    return null;
  }
}

/**
 * True the FIRST time it is called for `key` in this session, false after.
 *
 * Fails OPEN (returns true) when storage is unavailable: a missing signal is a
 * worse outcome than an occasional duplicate, and the reader caps each signal's
 * total contribution anyway.
 */
export function markOncePerSession(
  key: string,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  const storageKey = ONCE_PER_SESSION_PREFIX + key;
  if (!storage) return true;
  try {
    if (storage.getItem(storageKey)) return false;
    storage.setItem(storageKey, '1');
    return true;
  } catch {
    return true;
  }
}
