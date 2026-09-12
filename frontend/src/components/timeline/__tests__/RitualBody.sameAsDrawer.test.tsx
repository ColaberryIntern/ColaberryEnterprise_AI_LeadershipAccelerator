/**
 * The timeline tile and the thread drawer show a community post the SAME way.
 *
 * Ali, 2026-09-11, on a "Steal This Prompt" post: *"Make sure these text are
 * formatted in the timeline the same way they are formatted when you click on
 * it."* They were not. The drawer split the stored body into its guided
 * sections and rendered each with `white-space: pre-wrap`, keeping the labels,
 * the bullet list and the line breaks. The tile put the same string inside one
 * `<p>`, where the default `white-space` collapses every newline — a 40-line
 * wall of prose with the ritual heading repeated at the front of it.
 *
 * These tests pin the property that fixes it for good: BOTH surfaces render
 * through `RitualBody`, so the same body produces the same sections, in the
 * same order, with the same text — and neither can drift from the other.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
jest.mock('../../../pages/portal/runtime/runtimeApi', () => ({
  runtimeApi: { mediaVerdict: jest.fn().mockResolvedValue({ watched_pct: 0, required_pct: 75, met: false }), mediaWatch: jest.fn() },
}));

import RitualBody from '../RitualBody';
import TimelineCard, { type TimelineFeedCard } from '../TimelineCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };

/** A real ritual post: heading, a labelled field, and a bullet list inside it. */
const POST = [
  '🧩 Steal This Prompt · Week 4',
  '',
  'My best prompt: You are the log-analysis agent in a data-engineering incident investigation system.',
  '',
  'Choose exactly one `error_category` from this fixed list:',
  '- `timeout` — job or query exceeded its time limit',
  '- `permission_denied` — auth/access/credential failure',
  '- `schema_mismatch` — column, type, or structure mismatch',
].join('\n');

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); act(() => { root = createRoot(container); }); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const card = (over: Partial<TimelineFeedCard> = {}): TimelineFeedCard => ({
  id: 'community:p1', type: 'community_discussion', student_label: 'Steal This Prompt', render_band: 'peer_wins',
  title: 'A post', subtitle: null, description: POST, week: null, bucket: 'learn', order: 0,
  difficulty: 'core', estimated_time: null, points: {}, competencies: [], status: 'available',
  quiz_score: null, completed_at: null, video: null, image: null, content: null, blog: null,
  type_thumbnail: null, capabilities: [], author: { name: 'Regina Asafor', avatar_url: null, level: 1 },
  community_post_id: 'p1', ...over,
});

/** What the DRAWER renders — the same component, with the drawer's class names. */
function drawerSections(body: string): { label: string | null; value: string }[] {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  act(() => { r.render(<RitualBody body={body} classes={{ sec: 'ct-sec', label: 'ct-seclab', value: 'ct-secval' }} />); });
  const out = Array.from(host.querySelectorAll('.ct-sec')).map((s) => ({
    label: (s.querySelector('.ct-seclab') || {}).textContent ?? null,
    value: (s.querySelector('.ct-secval') as HTMLElement).textContent || '',
  }));
  act(() => r.unmount()); host.remove();
  return out;
}

/** What the TILE renders — same component, the tile's class names. */
function tileSections(): { label: string | null; value: string }[] {
  return Array.from(container.querySelectorAll('.fc-rb')).map((s) => ({
    label: (s.querySelector('.fc-rb-lab') || {}).textContent ?? null,
    value: (s.querySelector('.fc-rb-val') as HTMLElement).textContent || '',
  }));
}

const render = async (c: TimelineFeedCard) => { await act(async () => { root.render(<TimelineCard card={c} onOpen={() => {}} />); }); };

describe('the tile renders a community post exactly as the drawer does', () => {
  it('produces the same sections, in the same order, with the same text', async () => {
    await render(card());
    expect(tileSections()).toEqual(drawerSections(POST));
  });

  it('keeps the line breaks that make a bullet list a list', async () => {
    await render(card());
    const listSection = tileSections().find((s) => s.value.includes('timeout'))!;
    expect(listSection.value).toContain('\n- `permission_denied`');
    // The value element must carry pre-wrap, or those newlines render as spaces.
    const el = Array.from(container.querySelectorAll('.fc-rb-val')).find((n) => (n.textContent || '').includes('timeout'))!;
    expect(el.className).toBe('fc-rb-val');
  });

  it('lifts the ritual heading out of the body — the card already names the ritual', async () => {
    await render(card());
    const values = tileSections().map((s) => s.value).join('\n');
    expect(values).not.toContain('🧩 Steal This Prompt · Week 4');
    // A post's header is its author byline, so the ritual name rides on the
    // media chip — the same place the drawer puts it in its eyebrow. Either
    // way it is on the card once, not twice.
    expect(container.querySelector('.mt-chip')?.textContent).toContain('Steal This Prompt');
    expect(container.textContent).not.toContain('· Week 4');
  });

  it('labels a guided field instead of running the label into the prose', async () => {
    await render(card());
    expect(tileSections().some((s) => s.label === 'My best prompt')).toBe(true);
  });

  it('no longer renders the body as one collapsed paragraph', async () => {
    await render(card());
    expect(container.querySelector('.fc-body > p')).toBeNull();
  });
});

/**
 * Ali, 2026-09-12: "I would rather have 3 lines max with the ability for the
 * user to expand the text." So the tile opens clamped to three lines and the
 * student expands it IN PLACE — the drawer is no longer the only way to read a
 * long post. Whether "Show more" appears at all is a question about layout, so
 * the component measures it; jsdom reports 0 for both heights, and these tests
 * drive that measurement explicitly rather than pretending it happened.
 */
describe('three lines, then expand in place', () => {
  /** Make the clamped body report that it overflows (or does not). */
  const stubOverflow = (overflows: boolean) => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return overflows && (this as HTMLElement).className.includes('clamped') ? 400 : 60; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 60; } });
  };
  afterEach(() => {
    // @ts-expect-error — restore jsdom's own zero-height getters
    delete HTMLElement.prototype.scrollHeight;
    // @ts-expect-error
    delete HTMLElement.prototype.clientHeight;
  });

  it('opens clamped to three lines and offers "Show more"', async () => {
    stubOverflow(true);
    await render(card());
    const wrap = container.querySelector('.fc-rbwrap') as HTMLElement;
    expect(wrap.className).toContain('clamped');
    // Three LINES, against the body's own line-height — not a pixel guess.
    // `.fc-rbwrap` is pinned to the body's font metrics in timeline.css so this
    // em resolves to 3 × 1.55 × 14.5px; before that it inherited the card's
    // 18px and rendered 3.7 lines on production.
    expect(wrap.style.maxHeight).toBe('4.65em');
    const more = container.querySelector('.fc-rbmore') as HTMLButtonElement;
    expect(more.textContent).toBe('Show more');
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands IN PLACE — no drawer, no navigation — and collapses again', async () => {
    stubOverflow(true);
    const opened: string[] = [];
    await act(async () => { root.render(<TimelineCard card={card()} onOpen={(c) => opened.push(c.id)} />); });
    const more = () => container.querySelector('.fc-rbmore') as HTMLButtonElement;

    await act(async () => { more().dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const wrap = container.querySelector('.fc-rbwrap') as HTMLElement;
    expect(wrap.className).not.toContain('clamped');
    expect(wrap.style.maxHeight).toBe('');
    expect(more().textContent).toBe('Show less');
    expect(more().getAttribute('aria-expanded')).toBe('true');
    expect(opened).toEqual([]);   // expanding is not opening the post

    await act(async () => { more().dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect((container.querySelector('.fc-rbwrap') as HTMLElement).className).toContain('clamped');
    expect(more().textContent).toBe('Show more');
  });

  it('keeps every section in the DOM while clamped — the clamp is presentation only', async () => {
    stubOverflow(true);
    await render(card());
    expect(tileSections()).toEqual(drawerSections(POST));
  });

  it('offers no "Show more" when the post already fits', async () => {
    stubOverflow(false);
    await render(card({ description: '🧩 Skill Drop · Week 2\n\nMy 3 skills: invoice-parser, tone-checker' }));
    expect(container.querySelector('.fc-rbmore')).toBeNull();
  });
});

describe('everything that is not a community post is untouched', () => {
  it('a curriculum card still renders its description as a plain paragraph', async () => {
    await render(card({ community_post_id: null, author: null, description: 'A normal card description.' }));
    expect(container.querySelector('.fc-body > p')?.textContent).toBe('A normal card description.');
    expect(container.querySelector('.fc-rb')).toBeNull();
  });
});
