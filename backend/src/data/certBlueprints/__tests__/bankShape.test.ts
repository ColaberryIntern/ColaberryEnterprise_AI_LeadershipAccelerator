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
