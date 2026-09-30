/**
 * The Today feed must not show a like count nobody produced.
 *
 * THE DEFECT: `TodayFeedV2` passed `likes={6 + ((i * 7) % 13)}` to every
 * TimelineCard, where `i` is the array index. Production rendered the sequence
 * 6, 13, 7, 14, 8, 15, 9, 16, 10, 17 down the page. Nobody had liked anything —
 * the button has been wired to nothing since 2026-07-08, with no like endpoint
 * and no like table behind it — and because the value is keyed on array position
 * rather than on the card, the numbers RESHUFFLE when a card is removed.
 *
 * This is precisely the trust criterion the platform holds students to: no tab
 * shows a number, a connection or a result the project has not actually
 * produced. Invented engagement shown to paying students is the same defect we
 * spent the week correcting them for.
 *
 * SCOPE: this removes the fabricated NUMBER. Whether a working Like feature gets
 * built, or the button is hidden, is a separate product decision and is
 * deliberately left open — see the `likes` prop docstring on TimelineCard. The
 * final test below is the positive control that keeps the "build it" path
 * honest: a REAL count, when one is supplied, must still render.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import './testEnv/intersectionObserverMock';
import { todayFeedApi, type TodayFeedItem } from '../todayFeedApi';

jest.mock('../todayFeedApi', () => ({
  todayFeedApi: { list: jest.fn(), interact: jest.fn().mockResolvedValue({ ok: true }) },
}));

import TodayFeedV2 from '../TodayFeedV2';
import TimelineCard from '../../../../components/timeline/TimelineCard';

const mockList = todayFeedApi.list as unknown as jest.Mock;

function item(overrides: Partial<TodayFeedItem>): TodayFeedItem {
  return {
    position: 0, kind: 'ambient', ref: 'x', surface: 'today', type: 'blog', render_band: 'reading',
    card_id: null, title: 't', subtitle: null, description: null, image: null, video: null, blog: null,
    content: null, week: null, estimated_time: 10, status: null, interacted: false,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

/** The text inside every like button on the page. */
function likeButtonTexts(): string[] {
  return Array.from(container.querySelectorAll('button.like')).map((b) => (b.textContent || '').trim());
}

/**
 * A COMPLETE TimelineFeedCard. `points` is not optional on the interface and
 * `totalPoints()` dereferences it unguarded, so a partial fixture makes the
 * component throw before it renders — which would make the assertions below
 * fail for a reason that has nothing to do with like counts.
 */
function mkCard(id: string, title: string) {
  return {
    id, type: 'blog', student_label: 'Reading', render_band: 'reading',
    title, subtitle: null, description: null, week: 1, bucket: 'learn',
    order: 1, difficulty: 'easy', estimated_time: 5,
    points: { learning: 0, builder: 0, community: 0 },
    competencies: [], status: 'available', quiz_score: null, completed_at: null,
  } as any;
}

describe('TodayFeedV2 renders no fabricated like count', () => {
  it('renders ten cards with NO digits in any like button (the exact 6,13,7,14,8,15,9,16,10,17 sequence is gone)', async () => {
    const items = Array.from({ length: 10 }, (_, i) => item({ ref: `r${i}`, title: `Card ${i}` }));
    mockList.mockResolvedValue({ items, nextCursor: 10, exhausted: true });

    await act(async () => {
      root = createRoot(container);
      root.render(<TodayFeedV2 fallbackCards={[]} onOpen={() => {}} onWorkspace={() => {}} filter="all" />);
    });

    const buttons = likeButtonTexts();
    expect(buttons).toHaveLength(10);          // the buttons are still there; only the invented number is gone
    expect(buttons.join('|')).toBe('|||||||||');  // all empty

    // And explicitly: not one of the fabricated values the formula produced.
    const fabricated = [6, 13, 7, 14, 8, 15, 9, 16, 10, 17];
    for (const n of fabricated) {
      expect(buttons).not.toContain(String(n));
    }
  });

  it('the fallback branch is clean too — it carried a second copy of the same formula', async () => {
    mockList.mockRejectedValue(new Error('feed unavailable'));
    const fallbackCards = Array.from({ length: 4 }, (_, i) => mkCard(`c${i}`, `Fallback ${i}`)) as any[];

    await act(async () => {
      root = createRoot(container);
      root.render(<TodayFeedV2 fallbackCards={fallbackCards} onOpen={() => {}} onWorkspace={() => {}} filter="all" />);
    });

    for (const text of likeButtonTexts()) {
      expect(text).not.toMatch(/\d/);
    }
  });
});

describe('TimelineCard likes prop — the seam for the still-open Like decision', () => {
  const card = mkCard('c1', 'A card');

  it('renders NO number when no count is supplied — an absent count is shown as absent, never as 0', async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(<TimelineCard card={card} />);
    });
    // Before the fix the prop defaulted to `likes = 0`, so a caller that passed
    // nothing still asserted a counted zero. There is nothing to count at all.
    expect(likeButtonTexts()).toEqual(['']);
  });

  it('POSITIVE CONTROL: a REAL count still renders, so this test would catch a number if one were shown', async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(<TimelineCard card={card} likes={42} />);
    });
    // This is what makes the two negative assertions above trustworthy: the same
    // instrument, on the same component, does report a number when one exists.
    // It is also the "build it" path staying open — pass a real count and it shows.
    expect(likeButtonTexts()).toEqual(['42']);
  });
});
