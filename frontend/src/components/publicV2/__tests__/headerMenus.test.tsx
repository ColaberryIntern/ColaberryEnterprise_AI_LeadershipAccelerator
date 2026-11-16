/**
 * headerMenus.test.tsx -- the 2026-11-16 header: the Colaberry Enterprise
 * lockup, seven items on one bar, Proof and Government opening menus.
 *
 * Interaction is driven on plain react-dom (as HeroV8.test does):
 * `@testing-library/react` is not a dependency of this app.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PublicHeaderV2, { V2_NAV } from '../PublicHeaderV2';
import PublicFooterV2 from '../PublicFooterV2';

const at = (path: string, el: React.ReactElement): string =>
  renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>);

/* The menus fetch on mount; jsdom has no network. A rejected fetch is the
   real failure path, so it doubles as the "feed failed" case. */
beforeAll(() => {
  (global as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.reject(new Error('offline')));
});

describe('the logo is the Colaberry Enterprise lockup, not the Colaberry Training wordmark', () => {
  it('header draws the enterprise mark, the word and the ENTERPRISE tag', () => {
    const html = at('/', <PublicHeaderV2 />);
    expect(html).toContain('data-enterprise-mark');
    expect(html).toContain('cbv2-lockup__word">Colaberry<');
    expect(html).toContain('cbv2-lockup__tag">Enterprise<');
  });

  it('header and footer no longer reference the training logo image', () => {
    [at('/', <PublicHeaderV2 />), at('/', <PublicFooterV2 />)].forEach((html) => {
      expect(html).not.toMatch(/colaberry-logo[^"]*\.png/);
    });
  });

  it('footer uses the on-dark form of the lockup', () => {
    const html = at('/', <PublicFooterV2 />);
    expect(html).toContain('cbv2-lockup--dark');
    expect(html).toContain('data-enterprise-mark');
  });
});

describe('the bar', () => {
  it('carries exactly the seven items, in order', () => {
    expect(V2_NAV.map((i) => i.label)).toEqual([
      'Services', 'How it works', 'Platform', 'Proof', 'Government', 'Pricing', 'The book',
    ]);
  });

  /* INVERTED, not deleted: the old header comment said "Start Free stays".
     Ali approved the v5 deltas (S1), which take it off the bar; it was one of
     the labels that wrapped. The free workspace is still linked from Platform
     and every page's closing band. */
  it('no longer carries Start Free', () => {
    expect(V2_NAV.some((i) => i.label === 'Start Free' || i.to === '/try')).toBe(false);
  });

  it('makes Proof and Government menu buttons, each wired to a panel that exists', () => {
    const html = at('/', <PublicHeaderV2 />);
    ['proof', 'government'].forEach((k) => {
      expect(html).toMatch(new RegExp(`<button[^>]*aria-controls="cbv2-menu-${k}"`));
      expect(html).toContain(`id="cbv2-menu-${k}"`);
    });
  });

  /* Caught by mutation: the menu MODEL test proves pending departments carry
     no links, but nothing checked what the panel DRAWS. A pending department
     rendered as a link would filter /proof to zero results - a dead end. */
  it('draws pending departments as plain text, never as links', () => {
    const html = at('/', <PublicHeaderV2 />);
    const start = html.indexOf('cbv2-menu__grp is-pending');
    expect(start).toBeGreaterThan(-1);
    const group = html.slice(start, html.indexOf('</div>', start));
    expect(group).toContain('Finance');
    expect(group).not.toContain('<a ');
  });

  it('renders the panels closed but present, so their links exist without JavaScript', () => {
    const html = at('/', <PublicHeaderV2 />);
    expect(html).toMatch(/id="cbv2-menu-proof"[^>]*data-open="false"/);
    expect(html).toContain('href="/proof"');
    expect(html).toContain('href="/government/"');
    expect(html).toContain('href="/government/#gv-naics"');
  });
});

describe('the menus, driven', () => {
  let host: HTMLDivElement;
  let root: Root;

  const mount = (): void => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <PublicHeaderV2 />
        </MemoryRouter>,
      );
    });
  };
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const btn = (k: string): HTMLButtonElement =>
    host.querySelector(`button[aria-controls="cbv2-menu-${k}"]`) as HTMLButtonElement;
  const panel = (k: string): HTMLElement => host.querySelector(`#cbv2-menu-${k}`) as HTMLElement;

  it('opens a menu on click, and only one at a time', () => {
    mount();
    act(() => btn('proof').click());
    expect(btn('proof').getAttribute('aria-expanded')).toBe('true');
    expect(panel('proof').getAttribute('data-open')).toBe('true');
    act(() => btn('government').click());
    expect(panel('proof').getAttribute('data-open')).toBe('false');
    expect(panel('government').getAttribute('data-open')).toBe('true');
  });

  it('closes on Escape and returns focus to the button that opened it', () => {
    mount();
    act(() => btn('government').click());
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(panel('government').getAttribute('data-open')).toBe('false');
    expect(document.activeElement).toBe(btn('government'));
  });

  it('closes when the visitor clicks outside the header', () => {
    mount();
    act(() => btn('proof').click());
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(panel('proof').getAttribute('data-open')).toBe('false');
  });

  it('still offers the browse-all destinations when the data feeds fail', () => {
    mount();
    act(() => btn('proof').click());
    expect(panel('proof').querySelector('a[href="/proof"]')).not.toBeNull();
    expect(panel('government').querySelector('a[href="/government/"]')).not.toBeNull();
  });
});
