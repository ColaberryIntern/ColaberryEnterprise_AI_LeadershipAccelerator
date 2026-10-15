import api from '../utils/api';

/**
 * The Meta Pixel for the React portal.
 *
 * WHY THE PORTAL NEEDS ONE AT ALL. Sohail asked for `fbq('track','Lead')` on /portal/today,
 * guarded by `if (typeof fbq === 'function')`. The app loaded no pixel anywhere, so that guard
 * was false on every visit: nothing errored, nothing fired, and the ads would have reported zero
 * conversions as though nobody who clicked them ever signed up. The guard is why it would have
 * stayed invisible - a missing pixel and a working one look identical in the console.
 *
 * ── LEAD FIRES ONCE PER PERSON, NOT ONCE PER VISIT ──
 *
 * This is the part worth reading. The snippet as written runs on every load of /portal/today,
 * and /portal/today is the page a student opens every day of the programme. Meta would have been
 * told "new lead" each time: a single person who logs in for twelve weeks reports as ~60 leads.
 * Cost-per-lead would look superb and mean nothing, and worse, the optimiser trains on that
 * signal and starts buying the audience that opens a portal often rather than the audience that
 * signs up.
 *
 * So Lead is keyed and remembered. One person, one Lead, regardless of how many times they come
 * back or how many tabs they open.
 *
 * WHY localStorage AND NOT A COOKIE OR THE SERVER. A cookie would be sent on every request to
 * our own API for no reason. The server could record it, but then a conversion event depends on
 * our write succeeding before the browser event fires, which couples an ad signal to our
 * database's availability. The browser is the right place: the fact we need to remember is
 * "this browser has already reported this person", which is a browser-local fact.
 *
 * FAILS SILENT, ALWAYS. Every entry point swallows its own errors. A tracking pixel must never
 * be able to break the page it is loaded by - a student's dashboard failing because an ad script
 * misbehaved is a far worse outcome than a missed conversion.
 */

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string };
    _fbq?: unknown;
  }
}

const SCRIPT_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
const PIXEL_ID = /^[0-9]{8,20}$/;
const LEAD_KEY_PREFIX = 'cb.meta.lead.';

let loading: Promise<string | null> | null = null;

/** Where the landing page leaves the pixel that saw this visitor. Same origin, so readable. */
const CARRIED_PIXEL_KEY = 'cb.meta.pixel';

/**
 * Which pixel this person should be reported against.
 *
 * THE CARRIED VALUE WINS, and that ordering is the whole fix. The portal used to ask only
 * "which pixel belongs to my hostname", and on 2026-10-15 that returned null while the pixel
 * was correctly installed on the landing page: /lp/colaberry-training/... is served on
 * www.refactored.ai, whose brand_domains row points at the `refactored` brand, which has no
 * pixel. The ad click, the PageView and the signup were all one person, and the Lead was
 * reported against nobody.
 *
 * The pixel that saw the PageView is the one that must see the Lead - any other answer
 * attributes the conversion to the wrong advertiser, or to none. The hostname lookup stays as
 * the fallback for someone who reaches the portal without passing a landing page.
 */
async function resolvePixelId(): Promise<string | null> {
  try {
    const carried = window.localStorage.getItem(CARRIED_PIXEL_KEY);
    if (typeof carried === 'string' && PIXEL_ID.test(carried)) return carried;
  } catch {
    // Storage disabled. Fall through to the host lookup rather than giving up.
  }

  try {
    const res = await api.get('/api/public/tracking-config');
    const id = res?.data?.meta_pixel_id;
    return typeof id === 'string' && PIXEL_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Inject Meta's bootstrap once, init with this host's pixel, and send one PageView.
 *
 * Returns the pixel ID so a caller can tell "tracking is on" from "no pixel configured" without
 * reaching into `window`. Safe to call repeatedly: the work happens once per page load.
 */
export function loadMetaPixel(): Promise<string | null> {
  if (loading) return loading;

  loading = (async () => {
    try {
      const id = await resolvePixelId();
      // No pixel for this host is the normal case for most brands. Load nothing: a third-party
      // script on a page nobody is advertising is a request to an outside host for no return.
      if (!id) return null;
      if (typeof window === 'undefined' || typeof document === 'undefined') return null;

      if (!window.fbq) {
        // Meta's own bootstrap, as a function rather than a pasted blob so it can be read.
        const n: Window['fbq'] = function (...args: unknown[]) {
          const self = n as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] };
          if (self.callMethod) self.callMethod(...args);
          else self.queue.push(args);
        } as Window['fbq'];
        if (n) {
          n.queue = [];
          n.loaded = true;
          n.version = '2.0';
        }
        window.fbq = n;
        if (!window._fbq) window._fbq = n;

        const script = document.createElement('script');
        script.async = true;
        script.src = SCRIPT_SRC;
        document.head.appendChild(script);
      }

      window.fbq?.('init', id);
      window.fbq?.('track', 'PageView');
      return id;
    } catch {
      return null;
    }
  })();

  return loading;
}

/**
 * Report a Lead for this person, at most once ever in this browser.
 *
 * `key` identifies the person - a participant or user id. Passing something that changes per
 * visit (a session id, a timestamp) would defeat the whole point and report a lead per visit,
 * which is the bug this function exists to prevent.
 */
export async function trackLeadOnce(key: string | null | undefined): Promise<boolean> {
  try {
    if (!key) return false;
    const storageKey = `${LEAD_KEY_PREFIX}${key}`;

    // Checked BEFORE the pixel loads: if it is already reported there is nothing to do and no
    // reason to fetch config or pull in a third-party script.
    try {
      if (window.localStorage.getItem(storageKey)) return false;
    } catch {
      // Private mode, blocked storage. Without somewhere to remember, the honest choice is to
      // NOT fire: an unbounded repeat is worse for the advertiser than a missed conversion.
      return false;
    }

    const id = await loadMetaPixel();
    if (!id) return false;

    window.fbq?.('track', 'Lead');
    try { window.localStorage.setItem(storageKey, new Date().toISOString()); } catch { /* fired once regardless */ }
    return true;
  } catch {
    return false;
  }
}
