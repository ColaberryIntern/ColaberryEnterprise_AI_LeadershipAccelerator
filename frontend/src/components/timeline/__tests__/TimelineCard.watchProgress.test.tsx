/**
 * What a tile says about a video the student has already part-watched.
 *
 * Two things the QA tester reported on 2026-11-24, on the same tile:
 *
 *  - It showed NO progress until the card was reopened and played again. The
 *    tile started every render at "nothing recorded" and learned a percentage
 *    only from its own playback heartbeat, so yesterday's watching was invisible.
 *  - It said "Not started" directly beside "Watched 50%". `status` has four
 *    values and the pip rendered three of them, so `in_progress` fell through to
 *    the label for a card nobody had touched.
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
(globalThis as any).IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };

import portalApi from '../../../utils/portalApi';
import TimelineCard, { type TimelineFeedCard } from '../TimelineCard';

function card(overrides: Partial<TimelineFeedCard> = {}): TimelineFeedCard {
  return {
    id: 'c1', type: 'video', student_label: 'Lesson', render_band: 'video',
    title: 'Week 4 class', subtitle: null, description: null, week: 4, bucket: 'learn', order: 0,
    difficulty: 'core', estimated_time: 20, points: { learning: 10 }, competencies: [],
    status: 'in_progress', quiz_score: null, completed_at: null,
    video: { url: 'https://www.youtube.com/watch?v=abc', presenter: null, poster: null, duration_seconds: 1200 },
    image: null, content: null, blog: null, type_thumbnail: null, capabilities: [], author: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent || '';

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = async (c: TimelineFeedCard) => {
  await act(async () => { root.render(<TimelineCard card={c} onOpen={() => {}} onComplete={async () => {}} />); });
};

describe('a part-watched video tile', () => {
  it('shows the progress the feed already knows, without being played first', async () => {
    await render(card({ watch: { watched_pct: 50, required_pct: 75, met: false, position_s: 612, duration_s: 1200 } }));
    expect(text()).toContain('Watched 50%');
    expect(text()).toContain('reach 75%');
  });

  it('asks the server for nothing: the feed already carried it', async () => {
    // The alternative fix - a fetch per tile - would be one request per video
    // card on screen, which is a worse bug than the one being fixed.
    await render(card({ watch: { watched_pct: 50, required_pct: 75, met: false, position_s: 612, duration_s: 1200 } }));
    expect((portalApi as any).get).not.toHaveBeenCalled();
  });

  it('says "In progress", not "Not started", when the server says in_progress', async () => {
    await render(card({ status: 'in_progress', watch: { watched_pct: 50, required_pct: 75, met: false } }));
    expect(text()).toContain('In progress');
    expect(text()).not.toContain('Not started');
  });

  it('still says "Not started" for a card nobody has opened', async () => {
    await render(card({ status: 'available', watch: null }));
    expect(text()).toContain('Not started');
    expect(text()).not.toContain('In progress');
  });

  it('keeps saying "Completed" once it is finished', async () => {
    await render(card({ status: 'completed' }));
    expect(text()).toContain('Completed');
    expect(text()).not.toContain('In progress');
  });

  it('shows the unlocked state when the bar was already cleared', async () => {
    await render(card({ watch: { watched_pct: 85, required_pct: 75, met: true, position_s: 1020, duration_s: 1200 } }));
    expect(text()).toContain('points unlocked');
  });

  it('shows no watch strip for a video nobody has played', async () => {
    await render(card({ watch: null }));
    expect(text()).not.toContain('Watched');
  });
});
