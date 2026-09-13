/**
 * The Classroom's "From the community" rail renders WORDS, not a picture.
 *
 * Ali, 2026-09-13: *"I don't like the pictures/images. What can we replace this
 * with"*. Every member avatar on production is null (268 of 268), so the tile's
 * picture area could only ever be a grey speech-bubble glyph. He chose the
 * words over three picture options.
 *
 * The picture area is NOT RENDERED for this rail rather than styled away — an
 * empty 130px box is the same bug with better colours — while every other rail
 * keeps its picture untouched.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import ClassroomRails from '../ClassroomRails';
import type { Rail, RailTile } from '../../../pages/portal/classroomRailsApi';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); act(() => { root = createRoot(container); }); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const tile = (over: Partial<RailTile> = {}): RailTile => ({
  id: 'p1',
  title: 'Who I am: Farhat, eight years in supply chain. What I want to build: the agent I wish I had had.',
  detail: null,
  meta: '4 comments · 6 likes',
  image_url: null,
  glyph: null,
  stamp: null,
  eyebrow: '👋 Roll Call · Week 7',
  person: { name: 'Farhat Beig', level: 1, avatar_url: null },
  action: { label: 'Reply · +2 pts', href: '/portal/community?post=p1#reply', kind: 'primary' },
  ...over,
});

const rail = (over: Partial<Rail> = {}): Rail => ({
  surface: 'community', label: 'From the community', count_label: '6 recent',
  href: '/portal/community', tiles: [tile()], ...over,
});

const render = async (r: Rail) => { await act(async () => { root.render(<ClassroomRails rail={r} />); }); };

describe('a community tile', () => {
  it('renders NO picture element at all', async () => {
    await render(rail());
    expect(container.querySelector('.cr-pic')).toBeNull();
    expect(container.querySelector('.cr-glyph')).toBeNull();
    expect(container.querySelector('.cr-tile')!.className).toContain('cr-quotetile');
  });

  it('leads with the ritual pill and then the student\'s own words', async () => {
    await render(rail());
    expect(container.querySelector('.cr-eyebrow')!.textContent).toBe('👋 Roll Call · Week 7');
    const quote = container.querySelector('.cr-quote')!;
    expect(quote.textContent).toContain('eight years in supply chain');
    // A quote, not a heading: the words are the tile, and h5 styling would
    // shout them in bold across five lines.
    expect(container.querySelector('.cr-title')).toBeNull();
  });

  it('names who said it, with initials when they have no photo', async () => {
    await render(rail());
    const av = container.querySelector('.cr-pav')!;
    expect(av.textContent).toBe('FB');
    expect(av.tagName).toBe('SPAN');                                   // not an <img> with a null src
    expect(container.querySelector('.cr-pname')!.textContent).toBe('Farhat Beig');
    expect(container.querySelector('.cr-plvl')!.textContent).toBe('Level 1');
  });

  it('uses a real photo when a member ever has one', async () => {
    await render(rail({ tiles: [tile({ person: { name: 'Farhat Beig', level: 2, avatar_url: 'https://x/a.png' } })] }));
    const av = container.querySelector('.cr-pav')!;
    expect(av.tagName).toBe('IMG');
    expect(av.getAttribute('src')).toBe('https://x/a.png');
  });

  it('omits the level chip rather than printing "Level null"', async () => {
    await render(rail({ tiles: [tile({ person: { name: 'Someone in your cohort', level: null, avatar_url: null } })] }));
    expect(container.querySelector('.cr-plvl')).toBeNull();
    expect(container.querySelector('.cr-pname')!.textContent).toBe('Someone in your cohort');
  });

  it('shows a pinned post\'s stamp beside the words, since there is no picture to stamp', async () => {
    await render(rail({ tiles: [tile({ stamp: 'PINNED' })] }));
    expect(container.querySelector('.cr-pin')!.textContent).toBe('PINNED');
    expect(container.querySelector('.cr-stamp')).toBeNull();
  });

  it('carries the reply action, still pointing at the post itself', async () => {
    await render(rail());
    const a = container.querySelector('.cr-act') as HTMLAnchorElement;
    expect(a.textContent).toBe('Reply · +2 pts');
    expect(a.getAttribute('href')).toBe('/portal/community?post=p1#reply');
  });

  it('drops the pill for a free-text post instead of inventing a ritual', async () => {
    await render(rail({ tiles: [tile({ eyebrow: null })] }));
    expect(container.querySelector('.cr-eyebrow')).toBeNull();
    expect(container.querySelector('.cr-quote')).not.toBeNull();
  });
});

describe('every other rail is untouched', () => {
  it('an events tile still renders its picture, glyph fallback and stamp', async () => {
    await render({
      surface: 'events', label: 'Upcoming', count_label: null, href: '/portal/events',
      tiles: [{
        id: 'e1', title: 'AI Internship Presentation', detail: 'See the next generation', meta: null,
        image_url: null, glyph: '📅', stamp: 'TUE 10:00 AM',
        action: { label: 'Register', href: '/x', kind: 'primary' },
      }],
    });
    expect(container.querySelector('.cr-pic')).not.toBeNull();
    expect(container.querySelector('.cr-glyph')!.textContent).toBe('📅');
    expect(container.querySelector('.cr-stamp')!.textContent).toBe('TUE 10:00 AM');
    expect(container.querySelector('.cr-title')!.textContent).toBe('AI Internship Presentation');
    expect(container.querySelector('.cr-quote')).toBeNull();
  });
});
