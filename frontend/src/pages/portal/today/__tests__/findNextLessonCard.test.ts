/**
 * C117: the lesson the drawer's watch-bar celebration offers next. Same rule as the first lesson, never the card that is open.
 */
import { findNextLessonCard } from '../explorerFirstWin';
import type { TimelineFeedCard } from '../../../../components/timeline/TimelineCard';

const card = (id: string, over: Partial<TimelineFeedCard> = {}): TimelineFeedCard =>
  ({ id, title: id, status: 'available', week: 0, order: 1, bucket: 'learn', points: { learning: 10, builder: 0, community: 0 }, ...over } as unknown as TimelineFeedCard);
const BUCKETS = ['pre_class', 'learn', 'apply', 'reflect'];

describe('findNextLessonCard', () => {
  it('offers the Quick check after the program video, even before the video row reads completed', () => {
    const cards = [card('program-video', { bucket: 'pre_class', order: 0 }), card('quick-check', { bucket: 'pre_class', order: 1 })];
    expect(findNextLessonCard(cards, BUCKETS, 'program-video')!.id).toBe('quick-check');
  });
  it('never offers the open card, even when it is the one in progress', () => {
    const cards = [card('program-video', { status: 'in_progress' }), card('self-study', { week: 1 })];
    expect(findNextLessonCard(cards, BUCKETS, 'program-video')!.id).toBe('self-study');
  });
  it('is null when nothing else is open (completed and locked cards are not offered)', () => {
    const cards = [card('program-video'), card('done', { status: 'completed' }), card('locked', { status: 'locked' as never })];
    expect(findNextLessonCard(cards, BUCKETS, 'program-video')).toBeNull();
  });
});
