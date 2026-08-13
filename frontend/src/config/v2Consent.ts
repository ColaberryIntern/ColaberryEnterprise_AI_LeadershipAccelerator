/**
 * v2Consent.ts -- consent state for the V2 public site.
 *
 * WHY THIS EXISTS
 * `PublicLayoutV2` called `initTracker()` unconditionally, which meant every V2
 * page fingerprinted the visitor on arrival: `utils/tracker.ts` hashes
 * userAgent + screen dimensions + timezone + language into a 64-character id,
 * persists it to localStorage and posts it to the backend. No consent was asked
 * for and no mechanism to ask existed anywhere in the codebase. Device
 * fingerprinting is not exempt from consent for being cookie-free.
 *
 * WHAT "DENIED" HAS TO MEAN
 * A banner whose "decline" only hides the banner is worse than no banner, since
 * it manufactures a consent record that was never given. Declining here stops
 * tracking from starting AND purges anything a previous grant left behind.
 *
 * SCOPE, STATED PLAINLY
 * This governs the V2 route tree only. The live public site runs the same
 * tracker through `PublicLayout` and is NOT covered by this; that is a
 * pre-existing exposure which the cutover has to resolve, not something this
 * task quietly fixed.
 */

export type ConsentState = 'granted' | 'denied' | 'unset';

export const CONSENT_KEY = 'cbv2_consent';

/**
 * Every storage key written by the three attribution services the layout starts.
 * Enumerated from source rather than guessed -- a purge that misses a key leaves
 * the identifier it was meant to remove.
 */
export const TRACKING_KEYS: readonly string[] = [
  'cb_visitor_fp', // utils/tracker.ts -- the device fingerprint itself
  'cb_lead_id', // utils/tracker.ts
  'cb_utm_params', // services/utmService.ts
  'cb_lid', // services/utmService.ts
  'cb_campaign_id', // services/campaignAttributionService.ts
];

/** Storage can throw (Safari private mode, disabled storage). Never let it break the page. */
function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getConsent(): ConsentState {
  const ls = safeLocalStorage();
  if (!ls) return 'unset';
  try {
    const v = ls.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : 'unset';
  } catch {
    return 'unset';
  }
}

/**
 * Remove every identifier the attribution services may have written.
 * Exported so a future "withdraw consent" control can reuse it.
 */
export function purgeTrackingData(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  TRACKING_KEYS.forEach((k) => {
    try {
      ls.removeItem(k);
    } catch {
      /* one failed key must not prevent the rest being cleared */
    }
  });
}

export function setConsent(state: Exclude<ConsentState, 'unset'>): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(CONSENT_KEY, state);
  } catch {
    return;
  }
  if (state === 'denied') purgeTrackingData();
}

/** The single question the layout asks before starting anything. */
export function trackingAllowed(): boolean {
  return getConsent() === 'granted';
}
