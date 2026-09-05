/**
 * The bank's shape, asserted rather than described.
 *
 * The twenty-item sample looked finished and could not fill a sitting: D4 had no
 * items at all, D2 had one, and half the published objectives had no question
 * against them. Nothing failed, because nothing checked. These tests are that
 * check, and they are deliberately about COVERAGE rather than content — whether
 * an item is any good is a human's judgement, but whether an objective has one
 * is arithmetic and should never have been left to inspection.
 */
import { CCAR_F_ALL_ITEMS, MOCK_DEMAND, assertBankShape } from '../items';
import { assignAnswerPosition } from '../items/itemFactory';
import { CCAR_FOUNDATIONS_BLUEPRINT } from '../ccarFoundations';
import { validateRevision } from '../../../services/certPrep/certQuestionBankService';

const objectivesByDomain: Record<string, string[]> = Object.fromEntries(
  CCAR_FOUNDATIONS_BLUEPRINT.domains.map((d) => [d.domain_id, d.objectives.map((o) => o.objective_id)]),
);

const byDomain = (domain: string) => CCAR_F_ALL_ITEMS.filter((i) => i.domain_id === domain);

describe('bank coverage', () => {
  it('is large enough that three mock sittings need not repeat the same items', () => {
    // 60 fills exactly one mock; REPEAT_LOOKBACK_SESSIONS looks back three.
    expect(CCAR_F_ALL_ITEMS.length).toBeGreaterThanOrEqual(120);
  });

  it('every domain can fill its share of a full-length mock', () => {
    const short = Object.entries(MOCK_DEMAND)
      .map(([domain, need]) => ({ domain, need, have: byDomain(domain).length }))
      .filter((r) => r.have < r.need);
    expect(short).toEqual([]);
  });

  it('every published objective has at least one item — this is what D4 failed', () => {
    const covered = new Set(CCAR_F_ALL_ITEMS.map((i) => i.objective_id).filter(Boolean));
    const uncovered = Object.values(objectivesByDomain).flat().filter((o) => !covered.has(o));
    expect(uncovered).toEqual([]);
  });

  it('is weighted toward the domains the exam weights, not split evenly', () => {
    // D1 is 27% and must be the largest; D5 is 15% and must be the smallest.
    const counts = Object.keys(MOCK_DEMAND).map((d) => ({ d, n: byDomain(d).length }));
    const largest = counts.reduce((a, b) => (b.n > a.n ? b : a));
    const smallest = counts.reduce((a, b) => (b.n < a.n ? b : a));
    expect(largest.d).toBe('D1');
    expect(smallest.d).toBe('D5');
  });

  it('reports no structural problems at all', () => {
    expect(assertBankShape(CCAR_F_ALL_ITEMS, objectivesByDomain)).toEqual([]);
  });
});

describe('bank integrity', () => {
  it('has no duplicate question keys', () => {
    const keys = CCAR_F_ALL_ITEMS.map((i) => i.question_key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('has no duplicated stems — a repeated question measures nothing twice', () => {
    const stems = CCAR_F_ALL_ITEMS.map((i) => i.stem.trim().toLowerCase());
    const dupes = stems.filter((s, idx) => stems.indexOf(s) !== idx);
    expect(dupes).toEqual([]);
  });

  it('every item passes the same validation the loader applies', () => {
    const problems = CCAR_F_ALL_ITEMS.flatMap((i) =>
      validateRevision(i).map((p) => `${i.question_key}: ${p}`));
    expect(problems).toEqual([]);
  });

  it('every item points at an objective that exists in the blueprint', () => {
    const valid = new Set(Object.values(objectivesByDomain).flat());
    const wrong = CCAR_F_ALL_ITEMS
      .filter((i) => i.objective_id && !valid.has(i.objective_id))
      .map((i) => `${i.question_key} → ${i.objective_id}`);
    expect(wrong).toEqual([]);
  });

  it('every item belongs to the domain its objective belongs to', () => {
    // A D4 item tagged D2 would silently distort both domains' readiness.
    const mismatched = CCAR_F_ALL_ITEMS
      .filter((i) => i.objective_id && !objectivesByDomain[i.domain_id]?.includes(i.objective_id))
      .map((i) => `${i.question_key} is ${i.domain_id} but ${i.objective_id} is not`);
    expect(mismatched).toEqual([]);
  });
});

describe('the answer key cannot be guessed', () => {
  /**
   * Authored, this bank keyed 110 of 150 items to B - 83% in two domains. An
   * always-B candidate scored 43.9/60 = 73% on a full-length mock against a 72%
   * pass mark, so somebody who knew nothing passed. The bank already tested that
   * the correct option was not the longest; it never tested where the correct
   * option SAT. These are the tests that were missing.
   */
  const singles = CCAR_F_ALL_ITEMS.filter((i) => i.correct_keys.length === 1);

  const positionCounts = (): Record<string, number> => {
    const c: Record<string, number> = {};
    for (const i of singles) c[i.correct_keys[0]] = (c[i.correct_keys[0]] ?? 0) + 1;
    return c;
  };

  it('no single answer position holds more than 35% of the bank', () => {
    const counts = positionCounts();
    const worst = Math.max(...Object.values(counts));
    expect(worst / singles.length).toBeLessThan(0.35);
  });

  it('every position is actually used - C and D had one item between them', () => {
    const counts = positionCounts();
    for (const key of ['A', 'B', 'C', 'D']) {
      expect(counts[key] ?? 0).toBeGreaterThan(singles.length * 0.15);
    }
  });

  it('answering the same letter throughout fails a full-length mock', () => {
    // The assertion that matters, stated as the thing it protects: guessing one
    // letter must not reach the 72% pass mark on a mock drawn to blueprint demand.
    for (const letter of ['A', 'B', 'C', 'D']) {
      let expected = 0;
      let total = 0;
      for (const [domain, demanded] of Object.entries(MOCK_DEMAND)) {
        const inDomain = singles.filter((i) => i.domain_id === domain);
        const hit = inDomain.filter((i) => i.correct_keys[0] === letter).length;
        expected += demanded * (hit / inDomain.length);
        total += demanded;
      }
      expect(expected / total).toBeLessThan(0.5);
    }
  });

  it('no domain is skewed to one position either, so a per-domain guess fails too', () => {
    const domains = [...new Set(singles.map((i) => i.domain_id))];
    for (const domain of domains) {
      const inDomain = singles.filter((i) => i.domain_id === domain);
      const counts: Record<string, number> = {};
      for (const i of inDomain) counts[i.correct_keys[0]] = (counts[i.correct_keys[0]] ?? 0) + 1;
      expect(Math.max(...Object.values(counts)) / inDomain.length).toBeLessThan(0.45);
    }
  });
});

describe('the rebalance did not corrupt anything it moved', () => {
  it('every distractor rationale still names an option that exists and is wrong', () => {
    // Rationales are keyed by option letter, so they have to move with the
    // options. If they do not, an explanation ends up attached to a different
    // wrong answer -- and it would still read plausibly, which is the danger.
    const broken: string[] = [];
    for (const i of CCAR_F_ALL_ITEMS) {
      const keys = new Set(i.options.map((o) => o.key));
      for (const k of Object.keys(i.distractor_rationales ?? {})) {
        if (!keys.has(k)) broken.push(`${i.question_key}: rationale for missing option ${k}`);
        if (i.correct_keys.includes(k)) broken.push(`${i.question_key}: ${k} is correct but has a distractor rationale`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('every wrong option still has its explanation after being moved', () => {
    const missing: string[] = [];
    for (const i of CCAR_F_ALL_ITEMS) {
      for (const o of i.options) {
        if (i.correct_keys.includes(o.key)) continue;
        if (!(i.distractor_rationales ?? {})[o.key]?.trim()) missing.push(`${i.question_key}.${o.key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('placement is stable - the same key always lands in the same position', () => {
    // The database holds a seeded copy, so a re-seed has to be a no-op.
    const a = assignAnswerPosition('CCARF-D1-01', [['A', 'x'], ['B', 'y'], ['C', 'z'], ['D', 'w']], ['A']);
    const b = assignAnswerPosition('CCARF-D1-01', [['A', 'x'], ['B', 'y'], ['C', 'z'], ['D', 'w']], ['A']);
    expect(a.correct).toEqual(b.correct);
    expect(a.options).toEqual(b.options);
  });

  it('moving the answer does not change which TEXT is correct', () => {
    const placed = assignAnswerPosition('CCARF-D9-99', [['A', 'right'], ['B', 'wrong1'], ['C', 'wrong2'], ['D', 'wrong3']], ['A']);
    const correctText = placed.options.find(([k]) => k === placed.correct[0])![1];
    expect(correctText).toBe('right');
  });

  it('leaves multi-select items alone', () => {
    const placed = assignAnswerPosition('CCARF-D1-77', [['A', 'x'], ['B', 'y'], ['C', 'z'], ['D', 'w']], ['A', 'C']);
    expect(placed.correct).toEqual(['A', 'C']);
  });
});

describe('item quality floor', () => {
  it('every option that is not a correct answer explains why it is wrong', () => {
    // A distractor with no rationale teaches nothing when a student gets it
    // wrong, which is most of what a practice bank is for.
    const missing: string[] = [];
    for (const i of CCAR_F_ALL_ITEMS) {
      const wrongKeys = i.options.map((o) => o.key).filter((k) => !i.correct_keys.includes(k));
      for (const k of wrongKeys) {
        if (!i.distractor_rationales?.[k]?.trim()) missing.push(`${i.question_key}:${k}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every item offers at least three options', () => {
    const thin = CCAR_F_ALL_ITEMS.filter((i) => i.options.length < 3).map((i) => i.question_key);
    expect(thin).toEqual([]);
  });

  it('no item gives away its answer by length alone', () => {
    // If the correct option is always the longest, the bank is measuring
    // pattern-spotting. Allow it sometimes; refuse to let it be the rule.
    const longestIsCorrect = CCAR_F_ALL_ITEMS.filter((i) => {
      const longest = [...i.options].sort((a, b) => b.text.length - a.text.length)[0];
      return i.correct_keys.includes(longest.key);
    }).length;
    expect(longestIsCorrect / CCAR_F_ALL_ITEMS.length).toBeLessThan(0.6);
  });

  it('spreads difficulty rather than being all one level', () => {
    const byDifficulty: Record<string, number> = {};
    for (const i of CCAR_F_ALL_ITEMS) byDifficulty[i.difficulty ?? 'unset'] = (byDifficulty[i.difficulty ?? 'unset'] ?? 0) + 1;
    expect(Object.keys(byDifficulty).length).toBeGreaterThanOrEqual(3);
    for (const level of ['easy', 'medium', 'hard']) {
      expect(byDifficulty[level] ?? 0).toBeGreaterThan(0);
    }
  });
});
