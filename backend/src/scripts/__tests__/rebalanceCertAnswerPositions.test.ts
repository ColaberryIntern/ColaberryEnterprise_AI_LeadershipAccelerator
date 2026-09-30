import { placement } from '../rebalanceCertAnswerPositions';
import { assignAnswerPosition } from '../../data/certBlueprints/items/itemFactory';

/**
 * The one decision in the rebalance: does this key need to move?
 *
 * The first 150 generated items shipped with the correct answer at A in 144 of
 * them - a student answering A throughout scored 96% on that half. The fix is
 * mechanical, but the decision of whether to mint a new revision must agree
 * exactly with the factory, or the two halves of the bank obey different rules.
 */
const opts = [
  { key: 'A', text: 'the right one' },
  { key: 'B', text: 'wrong' },
  { key: 'C', text: 'wrong' },
  { key: 'D', text: 'wrong' },
];

describe('placement', () => {
  it('agrees with the factory about where the key belongs', () => {
    const key = 'CCARF-D1-32';
    const factory = assignAnswerPosition(key, opts.map((o) => [o.key, o.text] as [string, string]), ['A']);
    const p = placement({ question_key: key, options: opts, correct_keys: ['A'] });
    expect(p.target).toBe(factory.correct[0]);
  });

  it('reports no move when the key is already where the factory puts it', () => {
    // Find a key whose hash lands on A, and confirm an A-keyed item stays put.
    // Idempotency depends on this: a second run must find nothing to do.
    let key = 'CCARF-D9-01';
    for (let i = 1; i < 200; i += 1) {
      const k = `CCARF-D9-${String(i).padStart(2, '0')}`;
      if (assignAnswerPosition(k, opts.map((o) => [o.key, o.text] as [string, string]), ['A']).correct[0] === 'A') { key = k; break; }
    }
    expect(placement({ question_key: key, options: opts, correct_keys: ['A'] }).moves).toBe(false);
  });

  it('leaves a multi-select item alone, as the factory does', () => {
    const p = placement({ question_key: 'CCARF-A2', options: opts, correct_keys: ['A', 'B'] });
    expect(p.moves).toBe(false);
    expect(p.target).toBeNull();
  });

  it('is deterministic: the same key always resolves to the same target', () => {
    const a = placement({ question_key: 'CCARF-D2-40', options: opts, correct_keys: ['A'] });
    const b = placement({ question_key: 'CCARF-D2-40', options: opts, correct_keys: ['A'] });
    expect(a.target).toBe(b.target);
  });

  it('spreads 150 generated keys across all four positions, not one', () => {
    // The whole point. If the hash bunched on A, the fix would be no fix.
    const counts: Record<string, number> = {};
    for (const d of ['D1', 'D2', 'D3', 'D4', 'D5']) {
      for (let i = 30; i < 60; i += 1) {
        const k = `CCARF-${d}-${String(i).padStart(2, '0')}`;
        const t = placement({ question_key: k, options: opts, correct_keys: ['A'] }).target!;
        counts[t] = (counts[t] ?? 0) + 1;
      }
    }
    const max = Math.max(...Object.values(counts));
    expect(Object.keys(counts).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(max / 150).toBeLessThan(0.4);
  });
});
