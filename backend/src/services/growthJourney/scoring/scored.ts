import type { ScoreFactor } from '../governor/types';

/**
 * What one scorer answers for one dimension, and the one clamp every scorer
 * uses. Shared by `scoreVector.ts` and `countedScorers.ts` (T407 close-out:
 * the vector crossed the 500-line ceiling and its counted scorers moved out).
 */
export type Scored = {
  value: number | null;
  factors: ScoreFactor[];
  /** Why the value is null, when "the caller read nothing" is not the reason. */
  nullReason?: string;
};

export const clamp = (n: number, cap: number): number => Math.max(0, Math.min(cap, Math.round(n)));
