/**
 * What a bug report carries, gathered before anyone thinks to report anything.
 *
 * WHY A RING BUFFER. The useful evidence — the console error, the request that 500'd — happens
 * at the moment things break, which is minutes before somebody clicks "Report a problem". If we
 * only looked at the world when the form opened we would capture an application that has
 * recovered and a console that has scrolled. So the recorders install when the Marketing section
 * mounts and keep the last N of each.
 *
 * WHY IT IS CAPPED AND TRIMMED. This ends up in an email. An unbounded buffer would turn one bad
 * render loop into a megabyte of duplicated text, and the useful part is always the first few
 * distinct errors rather than the thousandth repeat.
 *
 * NOTHING HERE IS A SECRET. Request BODIES are never recorded, only method, path and status; a
 * body is where the tokens and the personal data are. Query strings are kept because a landing
 * page id in the URL is usually the whole story, but `token`, `key`, `secret` and `password`
 * parameters are redacted by name.
 */

export interface CapturedError {
  at: string;
  kind: 'console.error' | 'window.onerror' | 'unhandledrejection';
  message: string;
  stack?: string;
}

export interface CapturedRequest {
  at: string;
  method: string;
  url: string;
  status: number | 'network-failure';
  ms: number;
}

const MAX_ERRORS = 15;
const MAX_REQUESTS = 15;
const MAX_MESSAGE = 1500;

const errors: CapturedError[] = [];
const requests: CapturedRequest[] = [];
let installed = false;

function now(): string {
  return new Date().toISOString();
}

/** Keep the newest, drop the oldest, and never record the same message twice in a row. */
function pushCapped<T extends { message?: string }>(list: T[], item: T, cap: number): void {
  const previous = list[list.length - 1];
  if (previous && item.message && previous.message === item.message) return;
  list.push(item);
  while (list.length > cap) list.shift();
}

/** `?token=abc` is the one thing in a URL that must never reach an inbox. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    const SECRETISH = /^(token|key|secret|password|pass|auth|jwt|api_?key|signature|sig)$/i;
    url.searchParams.forEach((_v, k) => {
      if (SECRETISH.test(k)) url.searchParams.set(k, '[redacted]');
    });
    return url.pathname + url.search;
  } catch {
    return String(raw).slice(0, 300);
  }
}

function recordError(kind: CapturedError['kind'], message: unknown, stack?: string): void {
  const text = typeof message === 'string' ? message : safeStringify(message);
  pushCapped(errors, { at: now(), kind, message: text.slice(0, MAX_MESSAGE), stack: stack?.slice(0, MAX_MESSAGE) }, MAX_ERRORS);
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  } catch {
    return String(value);
  }
}

/**
 * Start recording. Idempotent, because the Marketing layout can remount on navigation and a
 * second set of wrappers would record every error twice and nest the fetch patches.
 */
export function installRecorders(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalConsoleError = window.console.error.bind(window.console);
  window.console.error = (...args: unknown[]) => {
    recordError('console.error', args.map(safeStringify).join(' '));
    originalConsoleError(...args);
  };

  window.addEventListener('error', (e) => {
    recordError('window.onerror', e.message, e.error && (e.error as Error).stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = (e as PromiseRejectionEvent).reason;
    recordError('unhandledrejection', safeStringify(r), r instanceof Error ? r.stack : undefined);
  });

  // Only FAILED requests are kept. A successful call is noise; the one that returned 500 is the
  // report. `fetch` is wrapped rather than axios so a direct fetch is caught too, and the
  // original is always called so a recorder bug can never break the app's networking.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = Date.now();
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    try {
      const res = await originalFetch(input as RequestInfo, init);
      if (!res.ok) {
        requests.push({ at: now(), method, url: redactUrl(url), status: res.status, ms: Date.now() - started });
        while (requests.length > MAX_REQUESTS) requests.shift();
      }
      return res;
    } catch (err) {
      requests.push({ at: now(), method, url: redactUrl(url), status: 'network-failure', ms: Date.now() - started });
      while (requests.length > MAX_REQUESTS) requests.shift();
      throw err;
    }
  };
}

export interface ReportContext {
  pageUrl: string;
  routePath: string;
  brandLabel: string | null;
  reportedAtCentral: string;
  browser: string;
  viewport: string;
  errors: CapturedError[];
  failedRequests: CapturedRequest[];
}

/** Central time, because every other time in this project is stated that way. */
function centralNow(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(new Date());
}

export function collectContext(brandLabel: string | null): ReportContext {
  return {
    pageUrl: redactUrl(window.location.href),
    routePath: window.location.pathname,
    brandLabel,
    reportedAtCentral: centralNow(),
    browser: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight} @ ${window.devicePixelRatio}x`,
    errors: errors.slice(),
    failedRequests: requests.slice(),
  };
}

/** Test seam: the recorders are global, so a suite needs a way back to a clean slate. */
export function __resetForTests(): void {
  errors.length = 0;
  requests.length = 0;
  installed = false;
}
