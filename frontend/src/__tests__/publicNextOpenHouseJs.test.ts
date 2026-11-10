import fs from 'fs';
import path from 'path';

/**
 * `public/v1/next-open-house.js` (OH-3): the filler that puts the REAL next Open House into a
 * hosted landing page's copy. A browser IIFE, so it is run the way a browser runs it - evaluate
 * the source against the page - exactly as `publicWelcomeBackJs.test.ts` does for its sibling.
 *
 * What is being pinned here is mostly the FAILURE path, because that is where the damage is.
 * A page that shows the wrong date, or shows `{{open_house_when}}` to a stranger who clicked an
 * ad, is worse than a page with no date on it at all. So: no event means no text, every time,
 * whatever the reason - and nothing this script writes can become markup.
 */
const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'public', 'v1', 'next-open-house.js'),
  'utf8',
);

/**
 * The source with its comments removed.
 *
 * The "it never does X" assertions below are claims about the CODE, and scanning the whole file
 * for a word does not make that claim - it makes a weaker one about the prose as well. This file
 * says "Nothing is written with innerHTML" in its header, so the first version of the markup
 * assertion failed on the very sentence that explains why it passes.
 *
 * Crude on purpose: no `//` or block-comment sequence appears inside a string or regex literal
 * in that file. That is checked, not assumed - the positive control below fails if this strips
 * too much or too little, so a stripper that quietly returned '' could not make every
 * `not.toMatch` vacuously true.
 */
const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** The real shape of GET /api/v1/open-house/event, measured against production on 2026-11-10. */
const EVENT = {
  announced: true,
  event_id: '2004289439668',
  name: 'Colaberry AI Systems Architect Accelerator Open House',
  starts_at: '2026-11-20T00:30:00.000Z',
  ends_at: '2026-11-20T01:30:00.000Z',
  timezone: 'America/Chicago',
  date_label: 'Thu, Nov 19, 2026',
  // The label as it reads AFTER OH-1. Before that fix this endpoint said 12:30 PM CT for the
  // same instant, which is the defect that made a dynamic date worth building at all.
  time_label: '6:30 PM CT',
  format_label: 'Live online event',
  price_label: 'No card needed',
  is_online: true,
  capacity: 400,
  registered: 6,
  seats_remaining: 394,
  rsvp_url: 'https://www.eventbrite.com/e/x-tickets-2004289439668',
};

function stubFetch(body: unknown, opts: { ok?: boolean; reject?: boolean } = {}) {
  const spy = jest.fn(() => {
    if (opts.reject) return Promise.reject(new Error('offline'));
    return Promise.resolve({ ok: opts.ok !== false, json: () => Promise.resolve(body) });
  });
  (window as any).fetch = spy;
  (global as any).fetch = spy;
  return spy;
}

/** Evaluate the script against `html` and let its promise chain settle. */
async function run(html: string): Promise<void> {
  document.body.innerHTML = html;
  // eslint-disable-next-line no-eval
  eval(SOURCE);
  // fetch -> res.json -> announced check -> clearTimeout -> fill. Two macrotask hops is
  // comfortably more than that chain needs and does not depend on counting the hops.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const WHEN = '<main><p id="when">{{open_house_when}}</p><p id="keep">Save your seat</p></main>';

afterEach(() => {
  delete (window as any).fetch;
  delete (global as any).fetch;
});

describe('next-open-house.js: when the event is known', () => {
  it('fills {{open_house_when}} with the date and time the server composed', async () => {
    stubFetch(EVENT);
    await run(WHEN);
    expect(document.getElementById('when')!.textContent).toBe('Thu, Nov 19, 2026 · 6:30 PM CT');
    // And nothing else on the page moved.
    expect(document.getElementById('keep')!.textContent).toBe('Save your seat');
  });

  it('fills each token from the server string, doing no date maths of its own', async () => {
    stubFetch(EVENT);
    await run(
      '<main><p id="d">{{open_house_date}}</p><p id="t">{{open_house_time}}</p>'
      + '<p id="f">{{open_house_format}}</p><p id="s">{{open_house_seats}}</p></main>',
    );
    expect(document.getElementById('d')!.textContent).toBe('Thu, Nov 19, 2026');
    expect(document.getElementById('t')!.textContent).toBe('6:30 PM CT');
    expect(document.getElementById('f')!.textContent).toBe('Live online event');
    expect(document.getElementById('s')!.textContent).toBe('394 seats left');
    // The ISO instant never reaches the page: the backend owns Central, not this script.
    expect(document.body.textContent).not.toContain('2026-11-20');
    expect(CODE).not.toMatch(/toLocaleString|getTimezoneOffset|America\/Chicago/);
  });

  it('fills tokens mid-sentence and several in one line', async () => {
    stubFetch(EVENT);
    await run('<main><p id="x">Join us {{open_house_date}} at {{open_house_time}} - {{open_house_seats}}.</p></main>');
    expect(document.getElementById('x')!.textContent)
      .toBe('Join us Thu, Nov 19, 2026 at 6:30 PM CT - 394 seats left.');
  });

  it('says "1 seat left", not "1 seats left"', async () => {
    stubFetch({ ...EVENT, seats_remaining: 1 });
    await run('<main><p id="s">{{open_house_seats}}</p></main>');
    expect(document.getElementById('s')!.textContent).toBe('1 seat left');
  });

  const SEAT_CASES: Array<[string, number | null | string]> = [
    ['a full event', 0],
    ['an event with no capacity', null],
    ['a nonsense count', 'lots'],
  ];
  it.each(SEAT_CASES)('%s claims no number at all', async (_label, seats) => {
    stubFetch({ ...EVENT, seats_remaining: seats });
    await run('<main><p id="s">Only {{open_house_seats}}</p><p id="keep">k</p></main>');
    // "Only 0 seats left" invites a signup for a seat that does not exist, and "Only null"
    // is worse. The phrase goes, the page stays.
    // The trailing space is deliberate and is the same decision as the double space left by a
    // removed token below: HTML collapses runs of whitespace when it renders, so the visitor
    // reads "Only", and a script that rewrote spacing inside operator copy would be doing more
    // to the page than it was asked to.
    expect(document.getElementById('s')!.textContent).toBe('Only ');
    expect(document.getElementById('keep')).not.toBeNull();
  });

  it('writes text, never markup: a hostile label cannot become an element', async () => {
    stubFetch({ ...EVENT, date_label: '<img src=x onerror="alert(1)">', time_label: '6:30 PM CT' });
    await run(WHEN);
    expect(document.querySelector('img')).toBeNull();
    expect(document.getElementById('when')!.textContent).toContain('<img src=x onerror="alert(1)">');
    // The argument in one line: this script has no way to write markup.
    expect(CODE).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });

  it('ignores an absurdly long label rather than pasting it onto the page', async () => {
    stubFetch({ ...EVENT, date_label: 'x'.repeat(500), time_label: '6:30 PM CT' });
    await run(WHEN);
    // Falls back to the half it can trust rather than to nothing, and never to 500 characters.
    expect(document.getElementById('when')!.textContent).toBe('6:30 PM CT');
  });
});

describe('next-open-house.js: when it is not', () => {
  const NO_EVENT_CASES: Array<[string, unknown, { ok?: boolean; reject?: boolean }]> = [
    ['nothing announced', { announced: false }, {}],
    ['an error body', { error: 'nope' }, {}],
    ['a non-200', EVENT, { ok: false }],
    ['a null body', null, {}],
    ['the network failing', null, { reject: true }],
  ];
  it.each(NO_EVENT_CASES)('%s: the token goes, and so does the line it emptied', async (_label, body, opts) => {
    stubFetch(body, opts);
    await run(WHEN);
    // A visitor must never see the token, and must never see an invented date.
    expect(document.body.textContent).not.toContain('{{');
    expect(document.body.textContent).not.toContain('Nov');
    expect(document.getElementById('when')).toBeNull();
    // The rest of the page is untouched - no date is not no page.
    expect(document.getElementById('keep')!.textContent).toBe('Save your seat');
    expect(document.querySelector('main')).not.toBeNull();
  });

  it('removes the wrappers it emptied, but stops at anything still showing something', async () => {
    stubFetch({ announced: false });
    await run(
      '<main><div id="wrap"><p id="when">{{open_house_when}}</p></div>'
      + '<div id="mixed"><p id="tok">{{open_house_date}}</p><p id="text">and this stays</p></div></main>',
    );
    // An empty <p> inside an otherwise empty <div> takes the <div> with it.
    expect(document.getElementById('when')).toBeNull();
    expect(document.getElementById('wrap')).toBeNull();
    // But a wrapper that still holds copy keeps it.
    expect(document.getElementById('tok')).toBeNull();
    expect(document.getElementById('mixed')).not.toBeNull();
    expect(document.getElementById('text')!.textContent).toBe('and this stays');
  });

  it('never climbs past <main>, so the page cannot delete its own body', async () => {
    stubFetch({ announced: false });
    await run('<main id="only">{{open_house_when}}</main>');
    expect(document.getElementById('only')).not.toBeNull();
    expect(document.body.textContent).toBe('');
  });

  it('keeps a wrapper that holds an image or a link, which was never ours to remove', async () => {
    stubFetch({ announced: false });
    await run('<main><p id="p"><img id="i" src="/x.png" alt="">{{open_house_when}}</p></main>');
    expect(document.getElementById('i')).not.toBeNull();
    expect(document.getElementById('p')).not.toBeNull();
  });
});

describe('next-open-house.js: what it does not do', () => {
  it('issues NO request on a page whose copy carries no token', async () => {
    // The renderer emits this tag on every hosted page, so this is what keeps it free for the
    // pages that have nothing to do with the Open House.
    const spy = stubFetch(EVENT);
    await run('<main><p id="x">Ship an AI project in six weeks</p></main>');
    expect(spy).not.toHaveBeenCalled();
    expect(document.getElementById('x')!.textContent).toBe('Ship an AI project in six weeks');
  });

  it('leaves a double-brace that is not one of its tokens completely alone', async () => {
    const spy = stubFetch(EVENT);
    await run('<main><p id="x">Use {{name}} and {{OPEN_HOUSE_WHEN}} here</p></main>');
    expect(spy).not.toHaveBeenCalled();
    expect(document.getElementById('x')!.textContent).toBe('Use {{name}} and {{OPEN_HOUSE_WHEN}} here');
  });

  it('removes an unknown open_house_* token: a typo in the copy is never shown', async () => {
    stubFetch(EVENT);
    await run('<main><p id="x">Next {{open_house_wheen}} today</p></main>');
    // Two spaces, deliberately not collapsed. HTML collapses runs of whitespace when it
    // renders, so the visitor reads "Next today" either way, and a script that rewrote spacing
    // in operator copy would be doing more to the page than it was asked to. The renderer's
    // head-metadata strip DOES collapse, because an attribute value is not collapsed by the
    // browser and a link preview would show the gap.
    expect(document.getElementById('x')!.textContent).toBe('Next  today');
  });

  it('asks the public endpoint, with no credentials attached', async () => {
    const spy = stubFetch(EVENT);
    await run(WHEN);
    expect(spy).toHaveBeenCalledTimes(1);
    // `stubFetch` declares a zero-argument mock (the script, being eval'd, calls it through an
    // `any`), so the recorded arguments are read back through an explicit shape rather than
    // off a tuple type TypeScript believes is empty.
    const calls = spy.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe('/api/v1/open-house/event');
    expect(calls[0][1].credentials).toBe('omit');
  });

  it('POSITIVE CONTROL: the comment stripper removes the prose and keeps the code', () => {
    // Without this, a stripper that returned '' would make every `not.toMatch` above pass by
    // having nothing to match against - a clean result reported over code nobody read, which
    // is the failure mode `frontendCopyLint.test.ts` guards itself against by asserting a file
    // count floor before believing anything else.
    expect(CODE.length).toBeLessThan(SOURCE.length);
    expect(CODE.length).toBeGreaterThan(1000);
    // The code survived...
    expect(CODE).toContain('node.nodeValue = after');
    expect(CODE).toContain("fetch(ENDPOINT, options)");
    // ...and the prose that was tripping the scans did not.
    expect(SOURCE).toContain('Nothing\n * is written with innerHTML');
    expect(CODE).not.toContain('WHY A FILE AND NOT INLINE');
  });

  it('is a read: it never writes anything anywhere', async () => {
    stubFetch(EVENT);
    await run(WHEN);
    expect(CODE).not.toMatch(/localStorage|sessionStorage|document\.cookie|sendBeacon/);
    expect(CODE).not.toMatch(/method:\s*['"]POST/);
  });

  it('is idempotent: running it twice changes nothing the second time', async () => {
    stubFetch(EVENT);
    await run(WHEN);
    const once = document.body.innerHTML;
    // eslint-disable-next-line no-eval
    eval(SOURCE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The tokens are gone after the first pass, so the second finds nothing to do.
    expect(document.body.innerHTML).toBe(once);
  });
});
