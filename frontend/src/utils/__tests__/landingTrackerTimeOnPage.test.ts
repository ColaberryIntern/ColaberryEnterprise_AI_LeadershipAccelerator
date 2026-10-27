import fs from 'fs';
import path from 'path';

/**
 * The landing-page tracker must report time-on-page for a visitor who leaves by NAVIGATING.
 *
 * ── THE BUG THIS PINS ───────────────────────────────────────────────────────────────────
 *
 * `public/v1/track.js` pushed `time_on_page` only from `visibilitychange`. On a landing page
 * almost nobody leaves by hiding the tab - they press the hero button and navigate away, which
 * on mobile Safari fires neither `visibilitychange` nor `beforeunload`. Measured on production
 * over thirty days: 607 visitors reached /lp/ pages and 7 of them produced a `time_on_page`
 * row. 1.2%.
 *
 * It broke a number nobody was watching. The acquisition funnel's "Read it" stage counts
 * `scroll` OR `time_on_page`, so it reported scroll alone while its note claimed both, and sat
 * implausibly below "Pressed a button" (174 against 349) in a way that read as a tracking fault
 * on the page rather than a dead event in the tracker.
 *
 * ── WHY THIS TEST EXECUTES THE SCRIPT INSTEAD OF READING IT ─────────────────────────────
 *
 * The defect was a missing LISTENER, and `grep pagehide track.js` would have caught that much.
 * It would not have caught the half that is easy to get wrong: a hide-then-unload sequence
 * reporting the same page twice, which inflates the row count rather than leaving it empty and
 * is correspondingly harder to notice. So the script is run in jsdom and the assertions are made
 * on what reaches `navigator.sendBeacon` - the boundary the bug actually lived at.
 *
 * The script is read as TEXT and executed, rather than imported. `frontend/tsconfig.json` runs
 * without `allowJs`, so importing a plain `.js` file here would fail the test typecheck in CI
 * even while passing locally.
 */

const TRACKER = path.join(__dirname, '..', '..', '..', 'public', 'v1', 'track.js');
const SITE_SLUG = 'colaberry-training';

const beacon = jest.fn();

/** `sendBeacon` is called with (url, Blob); the signature is asserted, not assumed. */
function beaconCalls(): Array<[string, Blob]> {
  return beacon.mock.calls as unknown as Array<[string, Blob]>;
}

/** jsdom's Blob has no `.text()`, so read it through FileReader instead. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

interface SentEvent {
  event_type: string;
  seconds?: number;
}

/** Every event across every beacon, in order. The tracker batches, so one beacon holds several. */
async function sentEvents(): Promise<SentEvent[]> {
  const out: SentEvent[] = [];
  for (const [, blob] of beaconCalls()) {
    const body = JSON.parse(await readBlob(blob)) as { events?: SentEvent[] } & SentEvent;
    if (Array.isArray(body.events)) out.push(...body.events);
    else if (body.event_type) out.push(body);
  }
  return out;
}

/**
 * ── LISTENER ISOLATION, WHICH THIS SUITE DOES NOT WORK WITHOUT ──────────────────────────
 *
 * Every test evaluates a fresh copy of the tracker, but jsdom's `window` and `document` are
 * shared across a test FILE. Each previously-loaded copy therefore stays subscribed, and one
 * `pagehide` fires every tracker ever loaded: the first run of this suite reported 4 and then 10
 * time-on-page events where 1 and 2 were expected - once per leaked instance.
 *
 * That is a harness fault that looks exactly like the double-reporting bug these tests exist to
 * catch, which is the reason it is fixed here rather than worked around by loosening the
 * assertions. Registrations are recorded as they happen and removed afterwards, `capture`
 * included - `click` is registered with capture `true`, and `removeEventListener` will not match
 * it without the same flag.
 */
interface Registration {
  target: EventTarget;
  type: string;
  handler: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}

let registrations: Registration[] = [];
const realAdd = EventTarget.prototype.addEventListener;

function recordListeners(): void {
  registrations = [];
  const wrap = (target: EventTarget) =>
    // A plain function cannot be assigned over an overloaded DOM signature without a cast; the
    // argument list below is the one both overloads accept.
    ((
      type: string,
      handler: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void => {
      registrations.push({ target, type, handler, options });
      realAdd.call(target, type, handler, options);
    }) as EventTarget['addEventListener'];

  window.addEventListener = wrap(window);
  document.addEventListener = wrap(document);
}

function releaseListeners(): void {
  window.addEventListener = realAdd;
  document.addEventListener = realAdd;
  for (const r of registrations) r.target.removeEventListener(r.type, r.handler, r.options);
  registrations = [];
}

/**
 * Run the tracker the way a landing page does: a script tag carrying `data-site`, which the
 * script finds by looking for its own `src`. Without the attribute it logs and returns, so
 * getting this wrong would produce a suite that tests nothing and passes.
 */
function loadTracker(): void {
  const tag = document.createElement('script');
  tag.setAttribute('src', '/v1/track.js');
  tag.setAttribute('data-site', SITE_SLUG);
  document.head.appendChild(tag);

  const source = fs.readFileSync(TRACKER, 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(source)();
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  // Modern fake timers also drive Date.now(), which is what the tracker measures dwell with -
  // so advancing the clock here is what makes `seconds` a real assertion rather than a key check.
  jest.useFakeTimers();
  // Create React App sets `resetMocks: true`, so the implementation is installed per test.
  beacon.mockReset();
  beacon.mockImplementation(() => true);
  (navigator as unknown as { sendBeacon: jest.Mock }).sendBeacon = beacon;
  document.head.innerHTML = '';
  localStorage.clear();
  setVisibility('visible');
  recordListeners();
});

afterEach(() => {
  releaseListeners();
  // Intervals belonging to this test's tracker, so a later test's clock cannot drive them.
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('landing tracker: time_on_page survives a navigation', () => {
  it('initialises at all - a green suite over a script that returned early proves nothing', () => {
    loadTracker();
    const api = (window as unknown as { ColaberryTrack?: { site?: string } }).ColaberryTrack;
    expect(api).toBeDefined();
    expect(api?.site).toBe(SITE_SLUG);
  });

  it('REPORTS time_on_page on pagehide, which is how a landing page visitor leaves', async () => {
    loadTracker();
    jest.advanceTimersByTime(4000);

    window.dispatchEvent(new Event('pagehide'));

    const events = await sentEvents();
    const timed = events.filter((e) => e.event_type === 'time_on_page');
    expect(timed).toHaveLength(1);
    // The dwell is measured, not merely present: 4s advanced, so this must not be 0.
    expect(timed[0].seconds).toBeGreaterThanOrEqual(4);
  });

  it('carries the key the signal detector reads, under that exact name', async () => {
    // `seconds` is what behavioralSignalService tests against >= 180 for extended_time_on_page.
    // Sending the number under any other name fails as silently as `depth` vs `depth_percent`.
    loadTracker();
    jest.advanceTimersByTime(1000);
    window.dispatchEvent(new Event('pagehide'));

    const timed = (await sentEvents()).find((e) => e.event_type === 'time_on_page');
    expect(timed).toBeDefined();
    expect(typeof timed?.seconds).toBe('number');
  });

  it('does NOT report twice when the page hides and then unloads', async () => {
    // Chrome fires visibilitychange AND pagehide on a same-tab navigation. Two rows for one
    // visit would overstate engagement - the opposite failure to the one being fixed, and the
    // easier one to ship by accident.
    loadTracker();
    jest.advanceTimersByTime(3000);

    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));

    const timed = (await sentEvents()).filter((e) => e.event_type === 'time_on_page');
    expect(timed).toHaveLength(1);
  });

  it('DOES report again for a reader who leaves, comes back, and then navigates away', async () => {
    // The guard is per hidden-state, not once per page. A visitor who switches tabs and returns
    // has accumulated more attention, and the later report supersedes the earlier one.
    loadTracker();
    jest.advanceTimersByTime(2000);

    setVisibility('hidden');
    setVisibility('visible');
    jest.advanceTimersByTime(2000);
    window.dispatchEvent(new Event('pagehide'));

    const timed = (await sentEvents()).filter((e) => e.event_type === 'time_on_page');
    expect(timed).toHaveLength(2);
  });
});
