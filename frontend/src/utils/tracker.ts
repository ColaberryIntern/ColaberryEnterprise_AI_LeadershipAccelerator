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
    const payload = JSON.stringify({ fingerprint: fp, ...info, campaign_id, email, lead_id, events });
    try { navigator.sendBeacon(`${API}/api/t/batch`, payload); } catch { /* silent */ }
    return;
  }

  const url = events.length === 1 ? `${API}/api/t/event` : `${API}/api/t/batch`;
  const body = events.length === 1
    ? { fingerprint: fp, ...info, campaign_id, email, lead_id, ...events[0] }
    : { fingerprint: fp, ...info, campaign_id, email, lead_id, events };

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
