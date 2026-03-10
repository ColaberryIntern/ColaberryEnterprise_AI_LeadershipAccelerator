// Lightweight client-side visitor tracking — zero external dependencies
const API = process.env.REACT_APP_API_URL || '';
const FP_KEY = 'cb_visitor_fp';
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
  buffer.push({ event_type, timestamp: new Date().toISOString(), ...props });
}

// --- flush ------------------------------------------------------------------
function flush(useBeacon = false) {
  if (!buffer.length) return;
  const fp = getVisitorFingerprint();
  const info = browserInfo();
  const events = buffer.splice(0);

  if (useBeacon) {
    const payload = JSON.stringify({ fingerprint: fp, ...info, events });
    try { navigator.sendBeacon(`${API}/api/t/batch`, payload); } catch { /* silent */ }
    return;
  }

  const url = events.length === 1 ? `${API}/api/t/event` : `${API}/api/t/batch`;
  const body = events.length === 1
    ? { fingerprint: fp, ...info, ...events[0] }
    : { fingerprint: fp, ...info, events };

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
      push('scroll', { depth: t, url: location.href });
    }
  }
}

// --- CTA click tracking -----------------------------------------------------
function onCtaClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const selectors = '.btn-primary, .cta, [data-track-cta]';
  // Check clicked element and up to 3 parent levels
  let el: HTMLElement | null = target;
  for (let i = 0; i < 4 && el; i++) {
    if (el.matches(selectors)) {
      push('cta_click', {
        element_text: (el.textContent || '').trim().slice(0, 120),
        href: (el as HTMLAnchorElement).href || el.closest('a')?.href || null,
        is_cta: true,
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
