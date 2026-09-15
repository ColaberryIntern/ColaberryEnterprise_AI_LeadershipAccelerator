import * as vm from 'vm';
import { deckScript } from '../kitDeckScript';

/**
 * The Class Kit deck's pace clock is plain browser JS embedded in a <script>
 * tag (see kitDeckScript.ts), so it's executed here in a vm sandbox with a
 * minimal fake DOM/localStorage/Date — close enough to a real browser for the
 * clock's start/stop/auto-cap state machine, without pulling in jsdom.
 *
 * Covers the regression: instructors had no way to stop the clock (only a
 * destructive "Reset" that wiped it), and nothing capped a forgotten tab —
 * one was seen at 186 minutes elapsed / 181 minutes "behind".
 */

function makeClassList() {
  const set = new Set<string>();
  return {
    add: (...cls: string[]) => cls.forEach((c) => set.add(c)),
    remove: (...cls: string[]) => cls.forEach((c) => set.delete(c)),
    toggle: (c: string, on?: boolean) => {
      const shouldAdd = on === undefined ? !set.has(c) : on;
      shouldAdd ? set.add(c) : set.delete(c);
    },
    contains: (c: string) => set.has(c),
  };
}

function makeEl(overrides: Record<string, unknown> = {}) {
  const listeners: Record<string, Function[]> = {};
  return {
    textContent: '',
    innerHTML: '',
    style: {} as Record<string, unknown>,
    className: '',
    classList: makeClassList(),
    addEventListener: (type: string, fn: Function) => {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    _listeners: listeners,
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    scrollTop: 0,
    ...overrides,
  };
}

function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
}

/** Boots one deckScript() instance in a fresh sandbox and returns test hooks. */
function bootDeck(opts: {
  slideCount?: number;
  live?: { enabled: boolean; broadcastEndpoint?: string; token?: string };
  slideAttrs?: Array<Record<string, string>>;
  /** Extra fields merged onto each slide's __KIT__ model (prompt_brief, etc). */
  slideMeta?: Array<Record<string, unknown>>;
  fetch?: (...args: unknown[]) => Promise<unknown>;
  /** Extra globals for the sandbox (e.g. a fake AbortController). */
  extraGlobals?: Record<string, unknown>;
} = {}) {
  const elementIds = [
    'kprogress', 'kcounter', 'knotes', 'kstart', 'kpaceclock', 'kpaceseg',
    'kpacestatus', 'kpacenow', 'kqr-overlay', 'kraillive', 'ktoast',
    'kprev', 'knext', 'klateqr',
  ];
  const elements: Record<string, ReturnType<typeof makeEl>> = {};
  elementIds.forEach((id) => {
    elements[id] = makeEl();
  });
  const body = makeEl();

  const slideCount = opts.slideCount ?? 1;
  const slideEls = Array.from({ length: slideCount }, (_, n) => makeEl({
    getAttribute: (name: string) => {
      const base: Record<string, string> = { 'data-segstart': '0', 'data-segend': '200', 'data-seglabel': 'Test segment' };
      const custom = opts.slideAttrs?.[n] || {};
      return { ...base, ...custom }[name] ?? null;
    },
  }));

  const document = {
    body,
    getElementById: (id: string) => elements[id] || null,
    querySelectorAll: (sel: string) => (sel === '.kslide' ? slideEls : []),
    querySelector: () => null,
    addEventListener: () => {},
  };

  const intervalFns: Function[] = [];
  const confirmState = { value: true };

  const sandbox: any = {
    window: {
      __KIT__: {
        segments: [],
        totalMinutes: 120,
        slides: Array.from({ length: slideCount }, (_, n) => ({
          id: 's' + n, title: 'Slide ' + n, segment_label: 'Test', phase: 'x',
          ...(opts.slideMeta?.[n] || {}),
        })),
        live: opts.live || { enabled: false },
        meta: { sessionId: 'test-session' },
      },
    },
    document,
    localStorage: makeLocalStorage(),
    confirm: () => confirmState.value,
    fetch: opts.fetch || (() => Promise.reject(new Error('not used in this test'))),
    setInterval: (fn: Function) => {
      intervalFns.push(fn);
      return intervalFns.length;
    },
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
    __mockNow__: 1_700_000_000_000,
    ...(opts.extraGlobals || {}),
  };

  const context = vm.createContext(sandbox);
  vm.runInContext('Date.now = function(){ return __mockNow__; };', context);
  vm.runInContext(deckScript(), context);

  return {
    elements,
    intervalFns,
    confirmState,
    advanceMs: (ms: number) => {
      sandbox.__mockNow__ += ms;
    },
    tick: () => intervalFns[0](),
    clickStart: () => elements.kstart._listeners.click[0](),
    clickNext: () => elements.knext._listeners.click[0]({ stopPropagation: () => {} }),
    clickPrev: () => elements.kprev._listeners.click[0]({ stopPropagation: () => {} }),
  };
}

describe('Class Kit deck pace clock', () => {
  it('caps the clock at 3 hours no matter what, and freezes it there', () => {
    const deck = bootDeck();

    expect(deck.elements.kstart.textContent).toBe('Start class');
    deck.clickStart();
    expect(deck.elements.kstart.textContent).toBe('Stop class');
    expect(deck.elements.kpacestatus.textContent).toBe('ON TIME');

    deck.advanceMs(3.5 * 60 * 60 * 1000);
    deck.tick();
    expect(deck.elements.kpaceclock.textContent).toBe('180:00');
    expect(deck.elements.kpacestatus.textContent).toBe('CLASS ENDED');
    expect(deck.elements.kstart.textContent).toBe('Reset');

    // more wall-clock time passes — the frozen clock must not keep climbing
    deck.advanceMs(10 * 60 * 1000);
    deck.tick();
    expect(deck.elements.kpaceclock.textContent).toBe('180:00');
  });

  it('gives the instructor a real Stop that freezes the clock without wiping it', () => {
    const deck = bootDeck();

    deck.clickStart();
    deck.advanceMs(45 * 60 * 1000);
    deck.tick();
    expect(deck.elements.kpaceclock.textContent).toBe('45:00');

    deck.clickStart(); // running -> stop; no confirm prompt for this action
    expect(deck.elements.kstart.textContent).toBe('Reset');
    expect(deck.elements.kpacestatus.textContent).toBe('CLASS ENDED');

    deck.advanceMs(30 * 60 * 1000);
    deck.tick();
    expect(deck.elements.kpaceclock.textContent).toBe('45:00'); // frozen, not 75:00
  });

  it('only clears a stopped clock back to zero when Reset is confirmed', () => {
    const deck = bootDeck();

    deck.clickStart();
    deck.advanceMs(20 * 60 * 1000);
    deck.tick();
    deck.clickStart(); // stop

    deck.confirmState.value = false;
    deck.clickStart(); // declined reset -> stays as-is
    expect(deck.elements.kstart.textContent).toBe('Reset');
    expect(deck.elements.kpaceclock.textContent).toBe('20:00');

    deck.confirmState.value = true;
    deck.clickStart(); // confirmed reset -> back to not-started
    expect(deck.elements.kstart.textContent).toBe('Start class');
    expect(deck.elements.kpaceclock.textContent).toBe('00:00');
  });
});

describe('Class Kit deck slide navigation', () => {
  // Regression: a whole-page click used to fire next()/prev() (a 28%-of-
  // screen-width left/right split bound to a document click listener), so an
  // ordinary click on the slide body turned the page. Dedicated buttons
  // replace that entirely — clicking the slide body must do nothing now.
  it('advances and retreats only via the dedicated kprev/knext buttons', () => {
    const deck = bootDeck({ slideCount: 3 });
    expect(deck.elements.kcounter.textContent).toBe('1 / 3');

    deck.clickNext();
    expect(deck.elements.kcounter.textContent).toBe('2 / 3');

    deck.clickNext();
    expect(deck.elements.kcounter.textContent).toBe('3 / 3');

    deck.clickPrev();
    expect(deck.elements.kcounter.textContent).toBe('2 / 3');
  });

  it('disables kprev on the first slide and knext on the last slide', () => {
    const deck = bootDeck({ slideCount: 3 });
    expect(deck.elements.kprev.disabled).toBe(true);
    expect(deck.elements.knext.disabled).toBe(false);

    deck.clickNext();
    expect(deck.elements.kprev.disabled).toBe(false);
    expect(deck.elements.knext.disabled).toBe(false);

    deck.clickNext();
    expect(deck.elements.kprev.disabled).toBe(false);
    expect(deck.elements.knext.disabled).toBe(true);
  });

  it('does not overshoot past the first or last slide', () => {
    const deck = bootDeck({ slideCount: 2 });
    deck.clickPrev(); // already on slide 1 — must clamp, not go negative
    expect(deck.elements.kcounter.textContent).toBe('1 / 2');

    deck.clickNext();
    deck.clickNext(); // already on the last slide — must clamp
    expect(deck.elements.kcounter.textContent).toBe('2 / 2');
  });
});

describe('Class Kit deck — Live Decision Theater correct-responders reveal (classkit-live-polish)', () => {
  // No browser-execution harness exists for `renderTheater()`/`renderPoll()`
  // in this repo (both are only reachable via `pollLive()`'s fetch + DOM
  // querySelector chain, which `bootDeck()`'s minimal mock DOM doesn't
  // support — a disclosed, pre-existing limitation, not new to this change).
  // Verified instead via string-content assertions on the real compiled
  // script, matching this file's own established convention.
  const script = deckScript();

  it('renderTheater reads pulse.poll.correctResponders and only shows it once revealed', () => {
    expect(script).toContain('correctList');
    expect(script).toContain('correctResponders');
    expect(script).toContain("st === 'revealed' && names && names.length");
  });

  it('renderPoll (sidebar rail) also renders the correct-responders line, gated on revealedNow', () => {
    expect(script).toContain('kpoll-correct');
    expect(script).toContain('Got it right');
  });
});

describe('Class Kit deck — reveal control is a toggle, not one-way (classkit-deck-polish T003)', () => {
  // Same disclosed limitation as above: `.kreveal-btn`'s click handler is
  // reached via a delegated `document.addEventListener('click', ...)` +
  // `e.target.closest(...)` chain that `bootDeck()`'s minimal mock DOM
  // doesn't support. Verified via string-content assertions on the real
  // compiled script.
  const script = deckScript();

  it('toggles revealed[sm.id] both ways instead of only ever setting it true', () => {
    expect(script).toContain('var nowRevealed = !(sm && revealed[sm.id]);');
    expect(script).toContain('revealed[sm.id] = nowRevealed;');
  });

  it('toggles the .correct highlight and .kreveal-line visibility both ways via classList.toggle, not .add', () => {
    expect(script).toContain("line.classList.toggle('show', nowRevealed)");
    expect(script).toContain("correct.classList.toggle('correct', nowRevealed)");
  });

  it('restores the reveal button\'s original label on hide instead of leaving it permanently hidden', () => {
    expect(script).toContain("rb.textContent = nowRevealed ? 'Hide answer' : rb.getAttribute('data-label')");
    // Regression: the old version permanently hid the button (`rb.style.display = 'none'`).
    expect(script).not.toContain("rb.style.display = 'none';");
  });

  it('the R keyboard shortcut still just clicks the same toggling button (works both directions)', () => {
    expect(script).toContain("e.key === 'r' || e.key === 'R'");
  });
});

/**
 * The two halves are broadcast SEPARATELY (Ali, 2026-08-27, testing Session 11
 * a couple of hours before teaching it). The instructor's phone needs the
 * set-up direction the moment they land on a slide — including whether there
 * is a prompt to run and what it does — and the read-aloud paragraph only once
 * the diagram is full-screened, which is exactly when the projected screen has
 * stopped showing that paragraph to the room. Before this they were
 * concatenated into one blob that appeared only on full-screen.
 */
describe('broadcastCurrent splits the preface from the read-aloud text', () => {
  it('sends only the spoken lines as presenter_tip and only the direction as presenter_preface', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    bootDeck({
      slideCount: 2,
      live: { enabled: true, broadcastEndpoint: 'https://example.test/broadcast', token: 'tok' },
      slideAttrs: [
        { 'data-say': 'The words for slide 0.', 'data-setup': 'DO: Put it on screen.', 'data-slidetitle': 'Slide 0' },
        { 'data-say': 'The words for slide 1.', 'data-setup': 'DO: Run it.', 'data-slidetitle': 'Slide 1' },
      ],
      fetch: (url: unknown, init: unknown) => {
        calls.push({ url: url as string, body: JSON.parse((init as { body: string }).body) });
        return Promise.resolve({ ok: true });
      },
    });
    // show(0) fires on boot, which is where broadcastCurrent's first call happens.
    expect(calls.length).toBe(1);
    expect(calls[0].body.presenter_tip).toBe('The words for slide 0.');
    expect(calls[0].body.presenter_preface).toBe('DO: Put it on screen.');
    expect(calls[0].body.next_title).toBe('Slide 1');
  });

  it('leads the preface with the step\'s prompt brief, then the direction', () => {
    const calls: Array<{ body: any }> = [];
    bootDeck({
      slideCount: 1,
      live: { enabled: true, broadcastEndpoint: 'https://example.test/broadcast', token: 'tok' },
      slideMeta: [{ prompt_brief: '▶ PROMPT ON THIS STEP — runs in Claude Code' }],
      slideAttrs: [{ 'data-say': 'Spoken.', 'data-setup': 'DO: Run it live.' }],
      fetch: (_url: unknown, init: unknown) => {
        calls.push({ body: JSON.parse((init as { body: string }).body) });
        return Promise.resolve({ ok: true });
      },
    });
    expect(calls[0].body.presenter_preface)
      .toBe('▶ PROMPT ON THIS STEP — runs in Claude Code\nDO: Run it live.');
  });

  it('never leaks a spoken line into the preface, or direction into the read screen', () => {
    const calls: Array<{ body: any }> = [];
    bootDeck({
      slideCount: 1,
      live: { enabled: true, broadcastEndpoint: 'https://example.test/broadcast', token: 'tok' },
      slideAttrs: [{ 'data-say': 'Say this out loud.', 'data-setup': 'NOTE: Watch the clock.' }],
      fetch: (_url: unknown, init: unknown) => {
        calls.push({ body: JSON.parse((init as { body: string }).body) });
        return Promise.resolve({ ok: true });
      },
    });
    // The whole point: glancing at either screen must never require deciding
    // which half of it is yours to speak.
    expect(calls[0].body.presenter_tip).not.toMatch(/NOTE:|DO:/);
    expect(calls[0].body.presenter_preface).not.toContain('Say this out loud.');
  });

  it('never broadcasts when live is disabled (rehearse / standalone mode)', () => {
    let fetchCalled = false;
    bootDeck({
      slideCount: 1,
      live: { enabled: false },
      fetch: () => { fetchCalled = true; return Promise.resolve({ ok: true }); },
    });
    expect(fetchCalled).toBe(false);
  });
});

/**
 * Regression: students (Million, Farhat, Marione, Ram — Jul 2026 cohort)
 * reported they could not find the check-in barcode "in any of the classes",
 * while the instructor's deck looked fine. The latecomer QR badge used to
 * require BOTH "past the cover slide" AND classStart(). "Start class" only
 * drives the pace tracker, so it is easy to never press — and when it is not
 * pressed the QR lives on slide 1 alone for a 2-hour session. Anyone who
 * joined late, looked away, or needed to re-scan had no barcode at all.
 */
describe('Class Kit deck latecomer QR', () => {
  it('stays hidden on the cover slide (slide 1 has its own big QR)', () => {
    const deck = bootDeck({ slideCount: 3 });
    expect(deck.elements.klateqr.classList.contains('show')).toBe(false);
  });

  it('appears past the cover even when the instructor never pressed Start class', () => {
    const deck = bootDeck({ slideCount: 3 });

    deck.clickNext(); // advance off the cover WITHOUT clicking Start
    expect(deck.elements.kstart.textContent).toBe('Start class'); // never started
    expect(deck.elements.klateqr.classList.contains('show')).toBe(true);
  });

  it('is still shown once class is actually started, and hides again on the cover', () => {
    const deck = bootDeck({ slideCount: 3 });

    deck.clickStart();
    deck.clickNext();
    expect(deck.elements.klateqr.classList.contains('show')).toBe(true);

    deck.clickPrev(); // back to the cover
    expect(deck.elements.klateqr.classList.contains('show')).toBe(false);
  });
});


/**
 * Session 16 (2026-09-14): the instructor's phone showed the PREVIOUS slide's
 * arrival notes on some slides, and corrected itself only when the diagram
 * was clicked. Two quick advances put two broadcast POSTs in flight; the
 * earlier one landed last and the stored position sat one slide behind. Every
 * broadcast now carries a per-tab deck_id and a rising seq (the server
 * refuses a lower seq from the same tab), the superseded request is aborted,
 * and a heartbeat re-sends the current view so a dropped POST heals itself.
 */
describe('broadcastCurrent ordering', () => {
  const live = { enabled: true, broadcastEndpoint: 'https://example.test/broadcast', token: 'tok' };

  it('stamps every broadcast with one deck_id per tab and a strictly rising seq', () => {
    const calls: Array<{ body: any }> = [];
    const deck = bootDeck({
      slideCount: 3, live,
      fetch: (_url: unknown, init: unknown) => {
        calls.push({ body: JSON.parse((init as { body: string }).body) });
        return Promise.resolve({ ok: true });
      },
    });
    deck.clickNext();
    deck.clickNext();
    expect(calls.map((c) => c.body.slide_index)).toEqual([0, 1, 2]);
    expect(calls.map((c) => c.body.seq)).toEqual([1, 2, 3]);
    const ids = new Set(calls.map((c) => c.body.deck_id));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^d[a-z0-9]+$/);
  });

  it('aborts the in-flight POST when a newer broadcast supersedes it', () => {
    const aborted: number[] = [];
    let created = 0;
    class FakeAbortController {
      signal: { n: number };
      constructor() { created += 1; this.signal = { n: created }; }
      abort() { aborted.push(this.signal.n); }
    }
    const signals: number[] = [];
    const deck = bootDeck({
      slideCount: 3, live,
      extraGlobals: { AbortController: FakeAbortController },
      fetch: (_url: unknown, init: unknown) => {
        signals.push((init as { signal: { n: number } }).signal.n);
        return new Promise(() => {}); // never resolves — stays in flight
      },
    });
    deck.clickNext();
    deck.clickNext();
    // Three requests were started; the first two were cancelled the moment the
    // next one fired, so only the latest can ever land.
    expect(signals).toEqual([1, 2, 3]);
    expect(aborted).toEqual([1, 2]);
  });

  it('re-sends the current view on a heartbeat with a higher seq, so a lost POST recovers', () => {
    const calls: Array<{ body: any }> = [];
    const deck = bootDeck({
      slideCount: 2, live,
      fetch: (_url: unknown, init: unknown) => {
        calls.push({ body: JSON.parse((init as { body: string }).body) });
        return Promise.resolve({ ok: true });
      },
    });
    deck.clickNext();
    const before = calls.length;
    // The heartbeat is the last interval registered (after the pace clock and
    // the pulse poll), so the pace-clock `tick()` helper is unaffected.
    deck.intervalFns[deck.intervalFns.length - 1]();
    expect(calls.length).toBe(before + 1);
    const last = calls[calls.length - 1].body;
    expect(last.slide_index).toBe(1);
    expect(last.seq).toBe(calls[before - 1].body.seq + 1);
    expect(last.deck_id).toBe(calls[before - 1].body.deck_id);
  });

  it('registers no heartbeat when live is disabled', () => {
    const deck = bootDeck({ slideCount: 1, live: { enabled: false } });
    // pace clock only
    expect(deck.intervalFns.length).toBe(1);
  });
});
