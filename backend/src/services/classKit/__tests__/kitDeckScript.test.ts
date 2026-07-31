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
function bootDeck() {
  const elementIds = [
    'kprogress', 'kcounter', 'knotes', 'kstart', 'kpaceclock', 'kpaceseg',
    'kpacestatus', 'kpacenow', 'kqr-overlay', 'kraillive', 'ktoast',
  ];
  const elements: Record<string, ReturnType<typeof makeEl>> = {};
  elementIds.forEach((id) => {
    elements[id] = makeEl();
  });
  const body = makeEl();

  const slideEl = makeEl({
    getAttribute: (name: string) =>
      ({ 'data-segstart': '0', 'data-segend': '200', 'data-seglabel': 'Test segment' } as Record<string, string>)[name] ?? null,
  });

  const document = {
    body,
    getElementById: (id: string) => elements[id] || null,
    querySelectorAll: (sel: string) => (sel === '.kslide' ? [slideEl] : []),
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
        slides: [{ id: 's0', title: 'Slide 0', segment_label: 'Test', phase: 'x' }],
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
