import fs from 'fs';
import path from 'path';

/**
 * `public/v1/track.js` — the standalone tracker every hosted landing page loads.
 *
 * WHY THIS FILE EXISTS NOW. It had no tests at all, and two defects had been live in it for the
 * lifetime of the file. Both were found by driving the real production page with a browser and
 * then querying `page_events`, which is a slow way to learn something a test can hold:
 *
 *   1. Every property a caller passed was spread at the TOP LEVEL only, while the ingest reads a
 *      nested `event_data`. `page_events.event_data` was NULL for every event this file ever
 *      sent, so a CTA click recorded that *a* button was pressed but never WHICH one.
 *   2. A click was buffered and left to the `beforeunload` beacon. A landing-page CTA always
 *      navigates, and the beacon does not survive it — production had zero `cta_click` rows for
 *      a landing page, while the same click with navigation suppressed recorded one instantly.
 *
 * The file is a browser IIFE rather than a module, so it is loaded the way a browser loads it:
 * a <script> tag carrying `data-site`, then evaluate the source. That also means the test
 * exercises the real bootstrap, including the `data-site` lookup.
 */

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'public', 'v1', 'track.js'),
  'utf8',
);

type Sent = { url: string; body: any };

function loadTracker(): { sent: Sent[]; flushCount: () => number } {
  const sent: Sent[] = [];

  document.head.innerHTML = '';
  document.body.innerHTML = '';
  const tag = document.createElement('script');
  tag.setAttribute('src', 'https://enterprise.colaberry.ai/v1/track.js');
  tag.setAttribute('data-site', 'training');
  document.head.appendChild(tag);

  (window as any).fetch = jest.fn((url: string, opts: any) => {
    sent.push({ url, body: JSON.parse(opts.body) });
    return Promise.resolve({ ok: true });
  });
  // Force the fetch path rather than the beacon, so the assertions describe the transport that
  // actually carries a navigating click.
  delete (navigator as any).sendBeacon;

  // eslint-disable-next-line no-eval
  eval(SOURCE);
  return { sent, flushCount: () => sent.length };
}

/** Every event across every flush so far, in order. */
function allEvents(sent: Sent[]): any[] {
  return sent.flatMap((s) => (s.body.events ? s.body.events : [s.body]));
}

function anchor(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  a.textContent = 'Start Learning AI for $0';
  Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v));
  document.body.appendChild(a);
  return a;
}

beforeEach(() => {
  jest.useFakeTimers();
  try { localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => { jest.useRealTimers(); });

describe('an event carries its payload where the ingest actually reads it', () => {
  it('nests the CTA label under event_data, which is the key the server reads', () => {
    const { sent } = loadTracker();
    anchor('/portal/signup', { 'data-track-cta': 'Start Learning AI for $0' }).click();

    const cta = allEvents(sent).find((e) => e.event_type === 'cta_click');
    expect(cta).toBeDefined();
    // The bug: this was undefined, so the column was written NULL.
    expect(cta.event_data).toEqual(
      expect.objectContaining({
        data_track: 'Start Learning AI for $0',
        is_cta: true,
        element_text: 'Start Learning AI for $0',
      }),
    );
  });

  it('keeps the flat copy too, because the ingest destructures some keys from the body root', () => {
    const { sent } = loadTracker();
    anchor('/portal/signup', { 'data-track-cta': 'Buy' }).click();

    const cta = allEvents(sent).find((e) => e.event_type === 'cta_click');
    // Removing the top-level spread would trade one silent data loss for another.
    expect(cta.data_track).toBe('Buy');
    expect(cta.page_path).toBe(location.pathname);
    expect(cta.event_type).toBe('cta_click');
  });

  it('omits event_data entirely for a payload-free event rather than sending {}', () => {
    const { sent } = loadTracker();
    (window as any).ColaberryTrack.trackEvent('custom_thing');
    (window as any).ColaberryTrack.flush();

    const custom = allEvents(sent).find((e) => e.event_type === 'custom_thing');
    expect(custom).toBeDefined();
    // `{}` would read as truthy to every consumer that tests the column, where every historical
    // row holds NULL.
    expect('event_data' in custom).toBe(false);
  });

  it('a pageview carries its own payload nested as well', () => {
    const { sent } = loadTracker();
    (window as any).ColaberryTrack.flush();
    const pv = allEvents(sent).find((e) => e.event_type === 'pageview');
    expect(pv.event_data).toEqual(expect.objectContaining({ path: location.pathname }));
  });
});

describe('a click that navigates away is sent before the page goes', () => {
  it('flushes immediately on a CTA click, without waiting for unload', () => {
    const { sent } = loadTracker();
    expect(sent).toHaveLength(0); // nothing sent yet - the pageview is still buffered

    anchor('/portal/signup', { 'data-track-cta': 'Start' }).click();

    // The assertion that matters: the request is already gone, with no timer run and no
    // unload fired. Buffering here is what lost every landing-page CTA click in production.
    expect(sent.length).toBeGreaterThan(0);
    expect(allEvents(sent).some((e) => e.event_type === 'cta_click')).toBe(true);
  });

  it('flushes on an ordinary link too, since it also unloads the document', () => {
    const { sent } = loadTracker();
    anchor('/pricing').click();
    expect(allEvents(sent).some((e) => e.event_type === 'click')).toBe(true);
  });

  it('does NOT flush for a same-page anchor, which never unloads anything', () => {
    const { sent } = loadTracker();
    anchor('#section-two').click();
    // Still buffered; the normal 5s flush will carry it.
    expect(sent).toHaveLength(0);
  });

  it('does NOT flush for a link opening in a new tab, where this document survives', () => {
    const { sent } = loadTracker();
    anchor('https://example.com/elsewhere', { target: '_blank' }).click();
    expect(sent).toHaveLength(0);
  });

  it('a button that is not a link does not trigger an early flush', () => {
    const { sent } = loadTracker();
    const b = document.createElement('button');
    b.className = 'btn-primary';
    b.textContent = 'Save';
    document.body.appendChild(b);
    b.click();
    expect(sent).toHaveLength(0);
  });

  it('still sends the buffered click on the normal interval, so nothing is dropped', () => {
    const { sent } = loadTracker();
    anchor('#top').click();
    expect(sent).toHaveLength(0);
    jest.advanceTimersByTime(5000);
    expect(allEvents(sent).some((e) => e.event_type === 'cta_click' || e.event_type === 'click')).toBe(true);
  });
});

describe('the bootstrap still behaves', () => {
  it('reads data-site off its own script tag and sends it with the batch', () => {
    const { sent } = loadTracker();
    (window as any).ColaberryTrack.flush();
    expect(sent[0].body.site_slug).toBe('training');
  });

  it('refuses to run without data-site rather than guessing a site', () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    const tag = document.createElement('script');
    tag.setAttribute('src', 'https://enterprise.colaberry.ai/v1/track.js');
    document.head.appendChild(tag); // no data-site
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    (window as any).ColaberryTrack = undefined;

    // eslint-disable-next-line no-eval
    eval(SOURCE);

    expect(err).toHaveBeenCalledWith(expect.stringContaining('missing data-site'));
    expect((window as any).ColaberryTrack).toBeUndefined();
    err.mockRestore();
  });
});
