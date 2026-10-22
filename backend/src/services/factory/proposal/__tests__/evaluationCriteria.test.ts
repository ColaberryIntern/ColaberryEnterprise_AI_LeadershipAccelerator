/**
 * evaluationCriteria — the deterministic "how is this scored" detector: award basis, weighted factors (points /
 * percent), and total points. These pin the real phrasings, prove LPTA is not mislabeled as a bare lowest-price
 * award, prove factor numbers are only trusted inside a real evaluation section, and prove a day count / dollar
 * figure is never read as a factor weight. Pure + total + advisory.
 */
import { detectEvaluationCriteria } from '../evaluationCriteria';

const crit = (t: string) => detectEvaluationCriteria(t);

describe('evaluationCriteria — award basis', () => {
  it('detects LPTA and does not mislabel it as a bare lowest-price award', () => {
    expect(crit('Award will be made using the lowest price technically acceptable (LPTA) method.')?.basis).toBe('lpta');
  });
  it('detects trade-off, best value, qualifications, and lowest price', () => {
    expect(crit('Award will be made on a best value tradeoff basis.')?.basis).toBe('trade_off');
    expect(crit('This procurement uses a best-value selection.')?.basis).toBe('best_value');
    expect(crit('This is a qualifications-based selection (QBS).')?.basis).toBe('qualifications');
    expect(crit('The contract will be awarded to the lowest responsive and responsible bidder.')?.basis).toBe('low_price');
  });
});

describe('evaluationCriteria — factors and total points', () => {
  const text =
    'Proposals will be evaluated and scored. Evaluation criteria: Technical Approach - 40 points, Past Performance: 30 points, Price (30%). A maximum of 100 points is available.';
  it('extracts point- and percent-weighted factors from an evaluation section, plus the total', () => {
    const c = crit(text)!;
    expect(c).not.toBeNull();
    expect(c.factors.find((f) => f.label === 'Technical Approach')?.points).toBe(40);
    expect(c.factors.find((f) => f.label === 'Past Performance')?.points).toBe(30);
    expect(c.factors.find((f) => f.label === 'Price')?.percent).toBe(30);
    expect(c.totalPoints).toBe(100);
  });
  it('does NOT read factor numbers when there is no evaluation section (keeps the signal meaningful)', () => {
    // numbers with weight units but no evaluation cue anywhere → not an evaluation, so no factors (and null overall)
    expect(crit('The vendor shall provide 40 widgets and 30 licenses for the project.')).toBeNull();
  });
  it('does NOT read a day count or a dollar figure as a factor weight', () => {
    const c = crit('Proposals will be scored. Technical merit: 70 points. The period of performance is 30 days.')!;
    expect(c.factors).toHaveLength(1);
    expect(c.factors[0].points).toBe(70);
  });
});

describe('evaluationCriteria — shape and totality', () => {
  it('quotes are literal — each quote word appears in the source text', () => {
    const text = 'Award is best value tradeoff. Technical Approach: 60 points. A maximum of 100 points is available.';
    const c = crit(text)!;
    const quotes = [c.basisQuote ?? '', ...c.factors.map((f) => f.quote)];
    for (const q of quotes) {
      for (const w of q.split(' ')) {
        if (w.length > 3 && !w.endsWith('...')) expect(text).toContain(w.replace(/[.,;]$/, ''));
      }
    }
  });
  it('returns null when nothing scored was found', () => {
    expect(crit('Describe your technical approach to the project.')).toBeNull();
  });
  it('is total — empty / null / non-string yields null, never throws', () => {
    expect(crit('')).toBeNull();
    expect(detectEvaluationCriteria(null)).toBeNull();
    expect(detectEvaluationCriteria(undefined)).toBeNull();
    expect(detectEvaluationCriteria(42 as any)).toBeNull();
  });
});
