// Lightweight client-side visitor tracking — zero external dependencies
const API = process.env.REACT_APP_API_URL || '';
const FP_KEY = 'cb_visitor_fp';
const LEAD_KEY = 'cb_lead_id';
let initialized = false;
let buffer: Record<string, unknown>[] = [];
let visibleStart = Date.now();
let totalVisibleMs = 0;
let firedThresholds = new Set<number>();
let lastScrollTime = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

// --- helpers ----------------------------------------------------------------
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function fingerprint(): string {
  const raw = navigator.userAgent + screen.width + screen.height
    + Intl.DateTimeFormat().resolvedOptions().timeZone + navigator.language;
  // Hash in 4 overlapping windows for more entropy
  const a = djb2(raw), b = djb2(raw + 'x'), c = djb2(raw + 'y'), d = djb2(raw + 'z');
  return (a + b + c + d).slice(0, 64);
}

function ensureFingerprint(): string {
  let fp = localStorage.getItem(FP_KEY);
  if (!fp) { fp = fingerprint(); localStorage.setItem(FP_KEY, fp); }
  return fp;
}

function deviceType(): string {
  const w = screen.width;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Chrome/i.test(ua)) return 'Chrome';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'Other';
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'Windows';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Android/i.test(ua)) return 'Android';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Other';
}

function browserInfo() {
  return { user_agent: navigator.userAgent, device_type: deviceType(), browser: detectBrowser(), os: detectOS() };
}

/**
 * The referrer for this page load, captured once.
 *
 * The ingest has always read `referrer_url` off the request body and derived
 * `visitor_sessions.referrer_domain` from it (backend trackingController
 * `extractReferrerDomain`) — and this file has never sent the field. `grep
 * referrer frontend/src/utils/tracker.ts` returned zero hits. So the column was
 * NULL for every session the React app ever created, and the admin "Traffic
 * Sources" panel, which COALESCEs it to 'direct', reported a single row:
 * direct, 1,018 visitors, 40,954 sessions. 100% direct is not a finding about
 * the audience, it is the shape of a field nobody was filling in.
 *
 * Captured lazily rather than at module load so importing this file never
 * touches `document`, and cached because `document.referrer` describes the
 * original page load and does not change as the SPA navigates — reading it per
 * flush would return the same value with more opportunities to throw.
 *
 * Same-origin referrers are dropped. An internal link is not a traffic source,
 * and counting one would file every visitor under our own hostname and bury the
 * external sources this panel exists to show.
 */
let referrerResolved = false;
let cachedReferrer: string | undefined;

function pageReferrer(): string | undefined {
  if (referrerResolved) return cachedReferrer;
  referrerResolved = true;
  try {
    const raw = document.referrer;
    if (!raw) return (cachedReferrer = undefined);
    if (new URL(raw).hostname === location.hostname) return (cachedReferrer = undefined);
    cachedReferrer = raw;
  } catch {
    cachedReferrer = undefined;
  }
  return cachedReferrer;
}

function push(event_type: string, props: Record<string, unknown> = {}) {
  // Snapshot the caller's payload BEFORE the campaign block below mutates
  // `props`, so `event_data` is exactly what the call site passed and nothing
  // the tracker bolted on for attribution.
  const eventData: Record<string, unknown> = { ...props };

  try {
    const raw = localStorage.getItem('cb_campaign_id');
    if (raw) {
      const stored = JSON.parse(raw);
      const age = Date.now() - new Date(stored.storedAt).getTime();
      if (age <= 30 * 24 * 60 * 60 * 1000 && stored.campaignId) {
        props.campaign_id = stored.campaignId;
      }
    }
  } catch { /* silent */ }
  // Backend API requires `page_url` and `page_path` on every event. Always include
  // them automatically so individual event sites don't have to.
  //
  // `event_data` closes a bug that has been live for the lifetime of this file.
  // Every property a caller passed was spread at the TOP LEVEL of the request
  // body, but the ingest reads `req.body.event_data` for a single event and
  // `event.event_data` inside a batch (backend trackingController.ts). Nothing
  // ever assembled that key - `grep event_data frontend/src` returned zero hits -
  // so `page_events.event_data` was written null for every client event ever
  // recorded, and every consumer of it silently took its fallback branch. The
  // symptom that proves it was never working: behavioralSignalService reads
  // `event_data.depth_percent` while this file emitted `depth`, a mismatch that
  // could not have survived one working observation.
  //
  // The top-level spread is KEPT. The ingest destructures several of those keys
  // from the body root (campaign_id, email, lid, timestamp, site_slug, and the
  // browser fields), so removing it would trade one silent data loss for
  // another. Sending both is additive: the body gains a key the server was
  // already looking for, and loses nothing it was already reading.
  const event: Record<string, unknown> = {
    event_type,
    timestamp: new Date().toISOString(),
    page_url: location.href,
    page_path: location.pathname,
    ...props,
  };
  // Omit the key entirely for a payload-free event rather than sending `{}`.
  // `recordPageEvent` stores `event_data || null`, so an empty object would
  // write `{}` where every historical row holds NULL, and turn a
  // "no payload" read into a truthy value for consumers that test the column.
  if (Object.keys(eventData).length > 0) event.event_data = eventData;
  buffer.push(event);
}

// --- flush ------------------------------------------------------------------
function flush(useBeacon = false) {
  if (!buffer.length) return;
  const fp = getVisitorFingerprint();
  const info = browserInfo();
  const events = buffer.splice(0);

  // Attach campaign_id and email as top-level fields for visitor attribution
  let campaign_id: string | undefined;
  let email: string | undefined;
  let lead_id: string | undefined;
  try {
    const sp = new URLSearchParams(location.search);
    const e = sp.get('email');
    if (e && e.includes('@')) email = e;
  } catch { /* silent */ }
  try {
    const storedLead = localStorage.getItem(LEAD_KEY) || localStorage.getItem('cb_lid');
    if (storedLead) lead_id = storedLead;
  } catch { /* silent */ }
  try {
    const raw = localStorage.getItem('cb_campaign_id');
    if (raw) {
      const stored = JSON.parse(raw);
      const age = Date.now() - new Date(stored.storedAt).getTime();
      if (age <= 30 * 24 * 60 * 60 * 1000 && stored.campaignId) {
        campaign_id = stored.campaignId;
      }
    }
  } catch { /* silent */ }

  if (useBeacon) {

    const payload = JSON.stringify({ fingerprint: fp, ...info, referrer_url: pageReferrer(), campaign_id, email, lead_id, events });
    // SEND IT AS A TYPED BLOB, NOT A BARE STRING.
    //
    // `navigator.sendBeacon(url, someString)` transmits with
    // `Content-Type: text/plain;charset=UTF-8`. Express's `express.json()` only parses
    // `application/json`, so every beacon body arrived unparsed and the payload inside
    // it was lost. Silently: the request still returned 2xx, rows were still written,
    // and only the `event_data` went missing.
    //
    // The measured consequence, before this fix: of 1,745 `time_on_page` rows in
    // production, ZERO carried `event_data.seconds` — including the 141 written after
    // `event_data` began landing correctly for `scroll`. `time_on_page` is emitted on
    // `visibilitychange`, which is the one place this file uses a beacon, so it was the
    // only event type wholly dependent on this path. `extended_time_on_page` (strength
    // 15) has therefore never fired for any visitor on any surface, since the database
    // began.
    //
    // A Blob carries its own Content-Type, which is what `sendBeacon` reads. This is
    // safe here specifically because the request is SAME-ORIGIN: `API` is
    // `REACT_APP_API_URL || ''`, the production image sets that variable empty
    // (nginx/Dockerfile), and the deployed bundle calls `/api/t/batch` relative. A
    // cross-origin `application/json` beacon would need a CORS preflight, which
    // `sendBeacon` cannot perform — the usual reason people settle for `text/plain`.
    // If `API` is ever pointed at another origin, this line has to be revisited, and
    // switching to `fetch(..., keepalive: true)` is the answer rather than reverting to
    // an untyped body that loses the payload again.
    const blob = new Blob([payload], { type: 'application/json' });
    try { navigator.sendBeacon(`${API}/api/t/batch`, blob); } catch { /* silent */ }

    return;
  }

  const url = events.length === 1 ? `${API}/api/t/event` : `${API}/api/t/batch`;
  const body = events.length === 1
    ? { fingerprint: fp, ...info, referrer_url: pageReferrer(), campaign_id, email, lead_id, ...events[0] }
    : { fingerprint: fp, ...info, referrer_url: pageReferrer(), campaign_id, email, lead_id, events };

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => { /* silent */ });
}

// --- scroll tracking --------------------------------------------------------
function onScroll() {
  const now = Date.now();
  if (now - lastScrollTime < 500) return;
  lastScrollTime = now;
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - doc.clientHeight;
  if (scrollable <= 0) return;
  const pct = Math.round((window.scrollY / scrollable) * 100);
  for (const t of [25, 50, 75, 90, 100]) {
    if (pct >= t && !firedThresholds.has(t)) {
      firedThresholds.add(t);
      // Two keys for one number, on purpose. Two server consumers read this
      // payload under different names and neither can be changed without
      // breaking the other's historical rows:
      //   journeyTimelineService reads `event_data.depth`      (timeline label)
      //   behavioralSignalService reads `event_data.depth_percent`
      //     (the >= 75 test behind deep_scroll_program / _pricing /
      //      _case_study - the last of which is a strength-20 lead signal)
      // Until `event_data` was actually sent, both read undefined and the
      // mismatch was invisible. Sending `depth` alone would have revived the
      // timeline label and left the lead signal dead.
      push('scroll', { depth: t, depth_percent: t, url: location.href });
    }
  }
}

// --- Click tracking (all interactive elements) ------------------------------
function onCtaClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  // CTA buttons and marked elements (high priority)
  const ctaSelectors = '.btn-primary, .btn-secondary, .btn-outline-primary, .cta, [data-track-cta], [data-track]';
  // All interactive elements (lower priority)
  const interactiveSelectors = 'a[href], button, [role="button"]';

  let el: HTMLElement | null = target;
  for (let i = 0; i < 4 && el; i++) {
    // Video/audio play detection
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO' || el.closest('video, audio, [data-track="media"]')) {
      push('media_play', {
        element_tag: el.tagName.toLowerCase(),
        element_text: el.getAttribute('title') || el.getAttribute('aria-label') || el.closest('[data-track-label]')?.getAttribute('data-track-label') || 'media',
        url: (el as HTMLMediaElement).src || (el as HTMLMediaElement).currentSrc || location.href,
      });
      return;
    }
    // Iframe embeds (podcast players, embedded videos)
    if (el.tagName === 'IFRAME' || el.closest('iframe')) {
      push('embed_click', {
        element_text: el.getAttribute('title') || 'embedded content',
        src: (el as HTMLIFrameElement).src || '',
      });
      return;
    }
    // CTA buttons
    if (el.matches(ctaSelectors)) {
      push('cta_click', {
        element_text: (el.textContent || '').trim().slice(0, 120),
        href: (el as HTMLAnchorElement).href || el.closest('a')?.href || null,
        data_track: el.getAttribute('data-track') || el.getAttribute('data-track-cta') || null,
        is_cta: true,
      });
      return;
    }
    // Regular links and buttons
    if (el.matches(interactiveSelectors)) {
      push('click', {
        element_text: (el.textContent || '').trim().slice(0, 120),
        element_tag: el.tagName.toLowerCase(),
        href: (el as HTMLAnchorElement).href || null,
        data_track: el.getAttribute('data-track') || null,
      });
      return;
    }
    el = el.parentElement;
  }
}

// --- visibility & heartbeat -------------------------------------------------
function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    totalVisibleMs += Date.now() - visibleStart;
    push('time_on_page', { seconds: Math.round(totalVisibleMs / 1000), url: location.href });
    flush(true);
  } else {
    visibleStart = Date.now();
  }
}

function heartbeat() {
  if (document.visibilityState === 'visible') push('heartbeat', { url: location.href });
}

// --- guards -----------------------------------------------------------------
function shouldTrack(): boolean {
  if (typeof window === 'undefined') return false;
  if (navigator.doNotTrack === '1') return false;
  if (window.location.pathname.startsWith('/admin')) return false;
  return true;
}

// --- public API -------------------------------------------------------------
export function getVisitorFingerprint(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(FP_KEY);
}

export function trackEvent(eventType: string, props: Record<string, unknown> = {}): void {
  if (!shouldTrack()) return;
  push(eventType, props);
}

export function initTracker(): void {
  if (initialized || !shouldTrack()) return;
  initialized = true;
  ensureFingerprint();

  // Page view
  push('pageview', { url: location.href, path: location.pathname, title: document.title });

  // Listeners
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('click', onCtaClick, true);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('beforeunload', () => flush(true));

  // Timers
  flushTimer = setInterval(() => flush(), 5000);
  heartbeatTimer = setInterval(heartbeat, 60000);
}

/**
 * Link the anonymous fingerprint on this browser to a real person.
 *
 * WHY THIS EXISTS. `POST /api/t/identify` has been built, routed and working on
 * the backend for the lifetime of this system, and `grep "t/identify"
 * frontend/src` returned ZERO hits — nothing has ever called it. The measured
 * consequence: of 1,791 visitors in production, 54 are linked to a person. 3.0%.
 * Every other name arrived only because a campaign link happened to carry
 * `?email=` or `?lid=`.
 *
 * The endpoint does more than store a name. `resolveIdentity` BACKFILLS: it
 * stamps the lead onto the visitor's existing sessions and page events, so the
 * moment someone fills in a form, everything they read beforehand — anonymously,
 * possibly over weeks — becomes attributable to them. That history is already in
 * the database. This call is the only thing standing between it and being
 * readable.
 *
 * CONSENT IS RESPECTED BY CONSTRUCTION, not by a second check that could drift
 * out of step with the first. The fingerprint only exists if `initTracker()` ran,
 * and `initTracker()` runs only where tracking is permitted — on the V2 tree that
 * means after an explicit grant (`config/v2Consent`). No fingerprint means no
 * call, so a visitor who declined tracking and then submits a form is recorded as
 * a lead by the form's own endpoint and is never joined to a browsing history
 * that was never collected.
 *
 * FIRE AND FORGET. Identity resolution must never delay or fail a form
 * submission: the form's own work is what the visitor came to do, and this is
 * bookkeeping attached to it. Every failure path is swallowed deliberately.
 */
export function identifyVisitor(
  email: string,
  details: { name?: string; company?: string; phone?: string; metadata?: Record<string, unknown> } = {},
): void {
  if (typeof window === 'undefined') return;
  if (!email || !email.includes('@')) return;

  const fingerprint = getVisitorFingerprint();
  // No fingerprint means tracking never started here. Minting one now would
  // create the identifier that consent was meant to gate, at the exact moment
  // someone handed over their name - which is the worst possible time to do it.
  if (!fingerprint) return;

  try {
    fetch(`${API}/api/t/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fingerprint,
        email: email.trim().toLowerCase(),
        name: details.name,
        company: details.company,
        phone: details.phone,
        metadata: details.metadata,
      }),
      keepalive: true,
    })
      .then((res) => res.json())
      .then((data) => {
        // Remember the lead id so subsequent flushes carry it even before the
        // server has finished joining things up.
        if (data && data.lead_id) {
          try { localStorage.setItem(LEAD_KEY, String(data.lead_id)); } catch { /* silent */ }
        }
      })
      .catch(() => { /* silent - never let bookkeeping break a form */ });
  } catch { /* silent */ }
}
