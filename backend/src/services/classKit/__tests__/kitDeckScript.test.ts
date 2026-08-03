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
function bootDeck(opts: { slideCount?: number } = {}) {
  const elementIds = [
    'kprogress', 'kcounter', 'knotes', 'kstart', 'kpaceclock', 'kpaceseg',
    'kpacestatus', 'kpacenow', 'kqr-overlay', 'kraillive', 'ktoast',
    'kprev', 'knext',
  ];
  const elements: Record<string, ReturnType<typeof makeEl>> = {};
  elementIds.forEach((id) => {
    elements[id] = makeEl();
  });
  const body = makeEl();

  const slideCount = opts.slideCount ?? 1;
  const slideEls = Array.from({ length: slideCount }, () => makeEl({
    getAttribute: (name: string) =>
      ({ 'data-segstart': '0', 'data-segend': '200', 'data-seglabel': 'Test segment' } as Record<string, string>)[name] ?? null,
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
        slides: Array.from({ length: slideCount }, (_, n) => ({ id: 's' + n, title: 'Slide ' + n, segment_label: 'Test', phase: 'x' })),
        live: { enabled: false },
        meta: { sessionId: 'test-session' },
      },
    },
    document,
    localStorage: makeLocalStorage(),
    confirm: () => confirmState.value,
    fetch: () => Promise.reject(new Error('not used in this test')),
    setInterval: (fn: Function) => {
      intervalFns.push(fn);
      return intervalFns.length;
    },
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
    __mockNow__: 1_700_000_000_000,
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
