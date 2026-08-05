import { nextIncompleteCard, bySectionOrder, findActiveNextCard, sumCardPoints } from './classroomNextStep';
import { TimelineFeedCard } from '../../components/timeline/TimelineCard';

const card = (
  id: string,
  status: TimelineFeedCard['status'],
  extra: Partial<TimelineFeedCard> = {},
): TimelineFeedCard => ({
  id,
  type: 'reading',
  student_label: 'Reading',
  render_band: 'reading',
  title: `Card ${id}`,
  subtitle: null,
  description: null,
  week: 1,
  bucket: 'learn',
  order: 0,
  difficulty: 'core',
  estimated_time: null,
  points: {},
  competencies: null,
  status,
  quiz_score: null,
  completed_at: null,
  ...extra,
});

describe('nextIncompleteCard', () => {
  it('returns the first non-completed card in array order', () => {
    const cards = [card('a', 'completed'), card('b', 'available'), card('c', 'available')];
    expect(nextIncompleteCard(cards)?.id).toBe('b');
  });

  it('returns null when every card is completed', () => {
    const cards = [card('a', 'completed'), card('b', 'completed')];
    expect(nextIncompleteCard(cards)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(nextIncompleteCard([])).toBeNull();
  });
});

describe('bySectionOrder', () => {
  it('sorts by bucket rank first, then order within a bucket', () => {
    const buckets = ['pre_class', 'learn', 'reflect'];
    const cards = [
      card('reflect-0', 'available', { bucket: 'reflect', order: 0 }),
      card('learn-1', 'available', { bucket: 'learn', order: 1 }),
      card('learn-0', 'available', { bucket: 'learn', order: 0 }),
    ];
    expect(cards.sort(bySectionOrder(buckets)).map((c) => c.id)).toEqual(['learn-0', 'learn-1', 'reflect-0']);
  });
});

describe('findActiveNextCard', () => {
  const buckets = ['learn', 'reflect'];

  it('picks the first week with an incomplete card, in section order', () => {
    const cards = [
      card('w1-learn', 'completed', { week: 1, bucket: 'learn', order: 0 }),
      card('w1-reflect', 'completed', { week: 1, bucket: 'reflect', order: 0 }),
      card('w2-reflect', 'available', { week: 2, bucket: 'reflect', order: 0 }),
      card('w2-learn', 'available', { week: 2, bucket: 'learn', order: 0 }),
    ];
    expect(findActiveNextCard(cards, buckets)?.id).toBe('w2-learn');
  });

  it('returns null when every week is complete', () => {
    const cards = [card('w1', 'completed', { week: 1 })];
    expect(findActiveNextCard(cards, buckets)).toBeNull();
  });
});

describe('sumCardPoints', () => {
  it('sums learning/builder/community', () => {
    expect(sumCardPoints({ learning: 5, builder: 3, community: 2 })).toBe(10);
  });
  it('treats missing fields as 0', () => {
    expect(sumCardPoints({ learning: 5 })).toBe(5);
  });
  it('returns 0 for null/undefined', () => {
    expect(sumCardPoints(null)).toBe(0);
    expect(sumCardPoints(undefined)).toBe(0);
  });
});
