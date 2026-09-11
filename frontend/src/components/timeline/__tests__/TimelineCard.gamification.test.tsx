/**
 * Gamification on the Today tile (Ali, 2026-09-11): "I want them to be able to
 * get points from everything on their timeline."
 *
 *  - A community post's button says what it pays ("Reply · +2 pts"), not "Open".
 *  - An ambient podcast with server-stamped points shows "Collect +35 pts",
 *    hydrates its listened-% on mount, and routes beats to the MEDIA gate —
 *    never to a card endpoint with `podcast:<id>` in the path (#2394's bug).
 *  - A testimonial pays 10, a podcast 35; the numbers come from the item.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../pages/portal/runtime/runtimeApi', () => ({
  ...jest.requireActual('../../../pages/portal/runtime/runtimeApi'),
  runtimeApi: {
    ...jest.requireActual('../../../pages/portal/runtime/runtimeApi').runtimeApi,
    mediaVerdict: jest.fn(),
    mediaWatch: jest.fn(),
  },
}));
jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
// The tile observes viewport visibility to autoplay; jsdom has no IntersectionObserver.
(globalThis as any).IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };

import { runtimeApi } from '../../../pages/portal/runtime/runtimeApi';
import TimelineCard, { type TimelineFeedCard } from '../TimelineCard';

const mVerdict = runtimeApi.mediaVerdict as jest.Mock;

function card(overrides: Partial<TimelineFeedCard> = {}): TimelineFeedCard {
  return {
    id: 'c1', type: 'warmup', student_label: 'Self Study', render_band: 'warmup',
    title: 'A card', subtitle: null, description: null, week: 1, bucket: 'learn', order: 0,
    difficulty: 'core', estimated_time: 5, points: {}, competencies: [], status: 'available',
    quiz_score: null, completed_at: null, video: null, image: null, content: null, blog: null,
    type_thumbnail: null, capabilities: [], author: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent || '';
const cta = () => Array.from(container.querySelectorAll('button.fc-cta'))[0] as HTMLButtonElement | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mVerdict.mockResolvedValue({ watched_pct: 0, required_pct: 75, met: false });
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = async (c: TimelineFeedCard) => {
  await act(async () => { root.render(<TimelineCard card={c} onOpen={() => {}} onComplete={async () => {}} />); });
};

describe('community post tile', () => {
  it('advertises the reply reward instead of a bare "Open"', async () => {
    await render(card({
      id: 'community:p1', type: 'community_discussion', student_label: 'Skill Drop', render_band: 'peer_wins',
      community_post_id: 'p1', author: { name: 'Hellen', avatar_url: null, level: 1 },
    }));
    expect(cta()?.textContent).toContain('Reply');
    expect(cta()?.textContent).toContain('+2 pts');
    expect(cta()?.textContent).not.toMatch(/\bOpen\b/);
    expect(cta()?.className).toContain('cherry');
  });
});

describe('ambient podcast tile', () => {
  const podcast = () => card({
    id: 'podcast:ep-42', type: 'podcast', student_label: 'Podcast', render_band: 'media',
    points: { learning: 35 },   // stamped by the server at serve time
    video: { url: 'https://cdn.example.com/ep-42.mp3', presenter: null, poster: null, title: 'Episode 42' },
  });

  it('shows the stamped reward on the collect button', async () => {
    await render(podcast());
    expect(cta()?.textContent).toContain('Collect +35 pts');
  });

  it('hydrates listened-% from the MEDIA gate on mount, keyed on the provider id', async () => {
    mVerdict.mockResolvedValue({ watched_pct: 40, required_pct: 75, met: false });
    await render(podcast());
    expect(mVerdict).toHaveBeenCalledWith('podcast', 'ep-42');
    expect(text()).toContain('Listened 40%');
    expect(text()).toContain('reach 75%');
  });

  it('says points are unlocked once the bar is crossed', async () => {
    mVerdict.mockResolvedValue({ watched_pct: 80, required_pct: 75, met: true });
    await render(podcast());
    expect(text()).toContain('Listened — points unlocked');
  });

  it('never asks the CARD gate about an ambient item', async () => {
    const portalApi = require('../../../utils/portalApi').default;
    await render(podcast());
    const cardCalls = (portalApi.post as jest.Mock).mock.calls.filter((c) => /runtime\/cards\/podcast:/.test(c[0]));
    expect(cardCalls).toHaveLength(0);
  });

  it('does not track a completed item', async () => {
    await render({ ...podcast(), status: 'completed' });
    expect(mVerdict).not.toHaveBeenCalled();
  });
});

describe('ambient testimonial tile', () => {
  it('pays 10, and says Watched rather than Listened', async () => {
    mVerdict.mockResolvedValue({ watched_pct: 20, required_pct: 75, met: false });
    await render(card({
      id: 'testimonial:t-7', type: 'testimonial', student_label: 'Testimonial', render_band: 'media',
      points: { learning: 10 },
      video: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', presenter: 'Dana', poster: null, title: 'Dana on Week 6' },
    }));
    expect(cta()?.textContent).toContain('Collect +10 pts');
    expect(mVerdict).toHaveBeenCalledWith('testimonial', 't-7');
    expect(text()).toContain('Watched 20%');
  });
});
