/**
 * C91, the Explorer's first win: who still needs one (only an explicit server "false"), and which lesson they start with.
 */
import { needsFirstWin, findFirstLessonCard, FIRST_LESSON_HREF } from '../explorerFirstWin';
import type { TimelineFeedCard } from '../../../../components/timeline/TimelineCard';

const card = (id: string, over: Partial<TimelineFeedCard>): TimelineFeedCard =>
  ({ id, title: id, status: 'available', week: 0, order: 1, bucket: 'learn', ...over } as unknown as TimelineFeedCard);
const BUCKETS = ['pre_class', 'learn', 'apply', 'reflect'];

describe('needsFirstWin', () => {
  it('is true only for an Explorer the server says has no first win yet', () => {
    expect(needsFirstWin({ is_explorer: true, first_win: false })).toBe(true);
  });
  it('unknown (older server, failed read) keeps the old page: no field, or null, is never "needs one"', () => {
    expect(needsFirstWin({ is_explorer: true })).toBe(false);
    expect(needsFirstWin({ is_explorer: true, first_win: null })).toBe(false);
  });
  it('members never get the first-win page, and a learner with a win is done', () => {
    expect(needsFirstWin({ is_explorer: false, first_win: false })).toBe(false);
    expect(needsFirstWin({ is_explorer: true, first_win: true })).toBe(false);
    expect(needsFirstWin(null)).toBe(false);
    expect(needsFirstWin(undefined)).toBe(false);
  });
});

describe('findFirstLessonCard', () => {
  it('picks the earliest week, then Classroom section order', () => {
    const cards = [
      card('w1-learn', { week: 1, bucket: 'learn', order: 1 }),
      card('w0-apply', { week: 0, bucket: 'apply', order: 1 }),
      card('w0-learn-2', { week: 0, bucket: 'learn', order: 2 }),
      card('w0-learn-1', { week: 0, bucket: 'learn', order: 1 }),
    ];
    expect(findFirstLessonCard(cards, BUCKETS)!.id).toBe('w0-learn-1');
  });
  it('a lesson already started comes first (pick up where you left off)', () => {
    const cards = [card('a', {}), card('started', { week: 3, status: 'in_progress' })];
    expect(findFirstLessonCard(cards, BUCKETS)!.id).toBe('started');
  });
  it('never offers a locked or completed card; nothing open means no lesson', () => {
    expect(findFirstLessonCard([card('done', { status: 'completed' }), card('locked', { status: 'locked' }), card('ok', { week: 2 })], BUCKETS)!.id).toBe('ok');
    expect(findFirstLessonCard([card('done', { status: 'completed' }), card('locked', { status: 'locked' })], BUCKETS)).toBeNull();
    expect(findFirstLessonCard([], BUCKETS)).toBeNull();
  });
  it('a card with no week sorts after the weeks; it does not jump the queue', () => {
    const cards = [card('nowk', { week: undefined }), card('w4', { week: 4 })];
    expect(findFirstLessonCard(cards, BUCKETS)!.id).toBe('w4');
  });
  it('is pure: the same feed gives the same lesson twice and the input is not reordered', () => {
    const cards = [card('b', { order: 2 }), card('a', { order: 1 })];
    const before = cards.map((c) => c.id);
    expect(findFirstLessonCard(cards, BUCKETS)!.id).toBe(findFirstLessonCard(cards, BUCKETS)!.id);
    expect(cards.map((c) => c.id)).toEqual(before);
  });
});

it('the campus gate sends the learner to Today, kept there (stay=1), with the open-the-lesson flag', () => {
  expect(FIRST_LESSON_HREF).toBe('/portal/today?stay=1&first=1');
});
