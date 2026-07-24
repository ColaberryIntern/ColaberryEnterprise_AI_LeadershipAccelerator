import { computeStats, cardPoints, sortByPhase, humanize, ReviewActivity } from '../weekReviewService';

const act = (over: Partial<ReviewActivity>): ReviewActivity => ({
  card_id: 'c', type: 'video', label: 'Video', title: 'T', bucket: 'learn', phase: 'Learn',
  minutes: 10, completed: false, status: 'available', quiz_score: null, ...over,
});

describe('weekReviewService pure helpers', () => {
  describe('cardPoints', () => {
    it('sums learning + builder + community', () => {
      expect(cardPoints({ learning: 10, builder: 15, community: 5 })).toBe(30);
    });
    it('is 0 for null / non-object / missing buckets', () => {
      expect(cardPoints(null)).toBe(0);
      expect(cardPoints(undefined)).toBe(0);
      expect(cardPoints('x' as any)).toBe(0);
      expect(cardPoints({ learning: 5 })).toBe(5);
    });
  });

  describe('computeStats', () => {
    it('counts completed, sums only completed minutes, and growth = completion %', () => {
      const activities = [
        act({ completed: true, minutes: 20 }),
        act({ completed: true, minutes: 30 }),
        act({ completed: false, minutes: 45 }),
        act({ completed: false, minutes: 15 }),
      ];
      const s = computeStats(activities);
      expect(s.total).toBe(4);
      expect(s.completed).toBe(2);
      expect(s.time_invested_min).toBe(50);   // only the two completed (20+30), not the unfinished
      expect(s.growth_score).toBe(50);         // 2 of 4
    });
    it('is all-zero for an empty week (no divide-by-zero)', () => {
      const s = computeStats([]);
      expect(s).toEqual({ total: 0, completed: 0, time_invested_min: 0, points: 0, growth_score: 0 });
    });
    it('rounds the growth score', () => {
      const three = [act({ completed: true }), act({ completed: false }), act({ completed: false })];
      expect(computeStats(three).growth_score).toBe(33);   // 1/3 → 33
    });
  });

  describe('sortByPhase', () => {
    it('orders the journey Prep→Learn→Practice→Build→Reflect→Share', () => {
      const items = [
        act({ bucket: 'share' }), act({ bucket: 'pre_class' }), act({ bucket: 'build' }),
        act({ bucket: 'learn' }), act({ bucket: 'reflect' }), act({ bucket: 'practice' }),
      ];
      const order = [...items].sort(sortByPhase).map((a) => a.bucket);
      expect(order).toEqual(['pre_class', 'learn', 'practice', 'build', 'reflect', 'share']);
    });
    it('sinks unknown buckets to the end', () => {
      const items = [act({ bucket: 'mystery' }), act({ bucket: 'learn' })];
      expect([...items].sort(sortByPhase).map((a) => a.bucket)).toEqual(['learn', 'mystery']);
    });
  });

  describe('humanize', () => {
    it('title-cases and de-underscores a domain id', () => {
      expect(humanize('build_discipline')).toBe('Build Discipline');
      expect(humanize('claude_code')).toBe('Claude Code');
      expect(humanize(null)).toBe('');
    });
  });
});
