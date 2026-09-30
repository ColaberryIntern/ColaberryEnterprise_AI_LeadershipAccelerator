import { minutesToHours, planMinutes } from '../blueprintRollup';
import type { CurriculumPlan } from '../types';

describe('blueprintRollup pure helpers', () => {
  describe('minutesToHours', () => {
    it('rounds minutes to one decimal hour', () => {
      expect(minutesToHours(60)).toBe(1);
      expect(minutesToHours(90)).toBe(1.5);
      expect(minutesToHours(486)).toBe(8.1); // Building with the Claude API
      expect(minutesToHours(0)).toBe(0);
      expect(minutesToHours(66)).toBe(1.1);
    });
  });

  describe('planMinutes', () => {
    const plan = (mins: Array<number | null | undefined>): CurriculumPlan =>
      ({ cards: mins.map((m, i) => ({ estimated_time: m, type: 't', title: `c${i}` })) } as unknown as CurriculumPlan);

    it('sums the estimated_time of every card', () => {
      expect(planMinutes(plan([15, 45, 120, 60]))).toBe(240);
    });

    it('treats missing/invalid minutes as zero', () => {
      expect(planMinutes(plan([15, null, undefined, 30]))).toBe(45);
    });

    it('is zero for an empty or absent plan', () => {
      expect(planMinutes(plan([]))).toBe(0);
      expect(planMinutes(null)).toBe(0);
      expect(planMinutes(undefined)).toBe(0);
    });

    it('rolls a realistic week up to hours (incl. a live session)', () => {
      // announcement 2 + warmup 8 + skilljar course 90 + video 12 + quiz 10 + live 120
      const minutes = planMinutes(plan([2, 8, 90, 12, 10, 120]));
      expect(minutes).toBe(242);
      expect(minutesToHours(minutes)).toBe(4);
    });
  });
});
