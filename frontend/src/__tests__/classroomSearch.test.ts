/**
 * Tests for the Classroom feed search (utils/classroomSearch). Pins the
 * behaviour the search box relies on: live token-AND matching over a card's
 * name-ish fields, case-insensitive, with body copy deliberately excluded so a
 * search like "Prompt Lab" lands the card by name instead of surfacing every
 * card that merely mentions the words.
 */

import type { TimelineFeedCard } from '../components/timeline/TimelineCard';
import {
  cardHaystack,
  tokenizeQuery,
  cardMatchesTokens,
  filterCardsByQuery,
} from '../utils/classroomSearch';

function makeCard(overrides: Partial<TimelineFeedCard> = {}): TimelineFeedCard {
  return {
    id: 'c1',
    type: 'overview',
    student_label: 'Overview',
    render_band: 'overview',
    title: 'Overview — Week 3',
    subtitle: null,
    description: null,
    week: 3,
    bucket: 'learn',
    order: 0,
    difficulty: 'easy',
    estimated_time: 10,
    points: { learning: 25 },
    competencies: null,
    status: 'available',
    quiz_score: null,
    completed_at: null,
    ...overrides,
  };
}

describe('tokenizeQuery', () => {
  test('splits on whitespace, lowercases, drops empties', () => {
    expect(tokenizeQuery('  Prompt   Lab ')).toEqual(['prompt', 'lab']);
  });
  test('empty / whitespace-only query yields no tokens', () => {
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery('   ')).toEqual([]);
  });
});

describe('cardHaystack', () => {
  test('includes name-ish fields and normalizes the type', () => {
    const hay = cardHaystack(
      makeCard({ type: 'prompt_catalog', student_label: 'Prompt Lab', title: 'Practice Prompts' })
    );
    expect(hay).toContain('prompt lab');       // student_label
    expect(hay).toContain('practice prompts');  // title
    expect(hay).toContain('prompt catalog');    // type underscores -> spaces
  });
  test('excludes body description so results stay name-tight', () => {
    const hay = cardHaystack(makeCard({ description: 'This lesson mentions kubernetes heavily.' }));
    expect(hay).not.toContain('kubernetes');
  });
});

describe('cardMatchesTokens', () => {
  const card = makeCard({ student_label: 'Prompt Lab', title: 'Claude Code practice prompts' });

  test('empty token list matches every card', () => {
    expect(cardMatchesTokens(card, [])).toBe(true);
  });
  test('matches case-insensitively by a single token', () => {
    expect(cardMatchesTokens(card, ['prompt'])).toBe(true);
  });
  test('requires ALL tokens (AND), even across separate fields', () => {
    // "claude" is in the title, "lab" is in the student_label — both present.
    expect(cardMatchesTokens(card, ['claude', 'lab'])).toBe(true);
    expect(cardMatchesTokens(card, ['prompt', 'nonexistent'])).toBe(false);
  });
});

describe('filterCardsByQuery', () => {
  const cards = [
    makeCard({ id: 'a', student_label: 'Prompt Lab', title: 'Practice prompts' }),
    makeCard({ id: 'b', student_label: 'Warm-up quiz', title: 'Five questions' }),
    makeCard({ id: 'c', student_label: 'Build it on your project', title: 'Lab: your capstone' }),
  ];

  test('empty query returns the list unchanged (same reference)', () => {
    expect(filterCardsByQuery(cards, '')).toBe(cards);
    expect(filterCardsByQuery(cards, '   ')).toBe(cards);
  });
  test('finds a far-down card by name', () => {
    const res = filterCardsByQuery(cards, 'prompt lab');
    expect(res.map((c) => c.id)).toEqual(['a']);
  });
  test('token matches across cards (both "Lab" cards)', () => {
    const res = filterCardsByQuery(cards, 'lab');
    expect(res.map((c) => c.id).sort()).toEqual(['a', 'c']);
  });
  test('no match returns an empty list', () => {
    expect(filterCardsByQuery(cards, 'zzz')).toEqual([]);
  });
});
