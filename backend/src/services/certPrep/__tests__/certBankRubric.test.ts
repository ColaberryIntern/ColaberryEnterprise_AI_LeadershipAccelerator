import { auditBank, bestOneLetterMockScore, mocksSupported, BANK_THRESHOLDS, BankItem } from '../certBankRubric';
import { CCAR_F_ALL_ITEMS, MOCK_DEMAND } from '../../../data/certBlueprints/items';

/**
 * The whole-bank rubric, proven against the bank that motivated it.
 *
 * Every per-question gate passed 150 generated questions, and 144 had the key
 * at A. These tests hold the bank-level checks to that case: a fixture with the
 * production bias must FAIL, and the authored bank — which the same checks
 * already guard in bankShape.test.ts — must PASS. If either stops being true,
 * the audit has stopped measuring the thing it exists to measure.
 */

const opts = (correctAt: string, texts = ['one', 'two', 'three', 'four']) => ({
  options: ['A', 'B', 'C', 'D'].map((k, i) => ({ key: k, text: texts[i] })),
  correct_keys: [correctAt],
});

/** A well-formed item whose only variable is where the key sits. */
const item = (key: string, domain: string, correctAt: string, over: Partial<BankItem> = {}): BankItem => ({
  question_key: key,
  domain_id: domain,
  objective_id: `${domain}.1`,
  scenario_family: 'S1',
  stem: `Monitoring shows that in ${key} about one run in six fails to reach the step it was meant to. Engineers report the failure is intermittent and cannot be reproduced on a developer machine. What is the most likely cause?`,
  ...opts(correctAt, [
    'Retry the failed step with exponential backoff and a capped number of attempts',
    'Increase the timeout on the step so slow runs have time to finish',
    'Move the step to run before the checkout so it cannot depend on it',
    'Disable the step and rely on the downstream check to catch what it missed',
  ]),
  rationale: 'Intermittent and unreproducible locally points at a race, and a bounded retry is the standard response.',
  distractor_rationales: { B: 'Slowness would reproduce.', C: 'Changes the dependency rather than the race.', D: 'Removes the check.' },
  review_status: 'approved',
  ...over,
});

/** The authored bank, as the audit would see it. */
const authored: BankItem[] = CCAR_F_ALL_ITEMS.map((i) => ({
  question_key: i.question_key,
  domain_id: i.domain_id,
  objective_id: i.objective_id ?? '',
  scenario_family: i.scenario_family ?? null,
  stem: i.stem,
  options: i.options,
  correct_keys: i.correct_keys,
  rationale: i.rationale ?? null,
  distractor_rationales: i.distractor_rationales ?? null,
  review_status: 'approved',
}));

/**
 * The production bias, reproduced: 150 items, 144 keyed to A, spread across the
 * five domains in mock proportion so the mock-score check is meaningful.
 */
function biasedBank(): BankItem[] {
  const out: BankItem[] = [];
  let n = 0;
  for (const [domain, demand] of Object.entries(MOCK_DEMAND)) {
    const count = Math.round((demand / 60) * 150);
    for (let i = 0; i < count; i += 1) {
      n += 1;
      // 144 of 150 at A; the remaining six scattered.
      const at = n <= 144 ? 'A' : ['B', 'C', 'D', 'C', 'C', 'B'][n - 145] ?? 'B';
      out.push(item(`CCARF-${domain}-${String(30 + i).padStart(2, '0')}`, domain, at));
    }
  }
  return out.slice(0, 150);
}

describe('the authored bank passes the whole-bank audit', () => {
  it('has no hard failures', () => {
    const a = auditBank(authored);
    const hard = a.checks.filter((c) => c.severity === 'hard' && !c.pass).map((c) => `${c.id}: ${c.note}`);
    expect(hard).toEqual([]);
    expect(a.pass).toBe(true);
  });
});

describe('the production bias FAILS the whole-bank audit', () => {
  const a = auditBank(biasedBank());

  it('is a hard failure overall', () => {
    expect(a.pass).toBe(false);
    expect(a.hardFailures).toBeGreaterThan(0);
  });

  it('names position share as the problem, with the number', () => {
    const c = a.checks.find((x) => x.id === 'position_max_share')!;
    expect(c.pass).toBe(false);
    expect(c.measured).toBeGreaterThan(0.9);
    expect(c.note).toMatch(/A holds 9\d%/);
  });

  it('shows that always-A passes a mock — the thing that makes the bank unusable', () => {
    const c = a.checks.find((x) => x.id === 'one_letter_mock')!;
    expect(c.pass).toBe(false);
    expect(c.measured).toBeGreaterThan(0.9);
    expect(c.note).toMatch(/Always-A scores 9\d%/);
  });

  it('tells the reader what to run', () => {
    const c = a.checks.find((x) => x.id === 'position_max_share')!;
    expect(c.note).toContain('rebalanceCertAnswerPositions');
  });
});

describe('the length cue', () => {
  it('fails a bank where the longest option is usually the answer, and names the fix', () => {
    // Balanced positions, so only the length check trips: the key text is the
    // long one in every item, wherever it sits.
    const bank: BankItem[] = [];
    let n = 0;
    for (const [domain, demand] of Object.entries(MOCK_DEMAND)) {
      for (let i = 0; i < demand; i += 1) {
        const at = ['A', 'B', 'C', 'D'][n % 4]; n += 1;
        const texts = ['short one', 'short two', 'short three', 'short four'];
        texts[['A', 'B', 'C', 'D'].indexOf(at)] = 'the correct option, written with a great deal more care and detail';
        bank.push(item(`CCARF-${domain}-${String(30 + i).padStart(2, '0')}`, domain, at, opts(at, texts)));
      }
    }
    const a = auditBank(bank);
    const c = a.checks.find((x) => x.id === 'length_cue')!;
    expect(c.pass).toBe(false);
    expect(c.measured).toBe(1);
    expect(c.note).toContain('balanceCertOptionLengths');
    expect(a.checks.find((x) => x.id === 'position_max_share')!.pass).toBe(true);
  });
});

describe('option labels', () => {
  it('is a hard failure that names the items and the script', () => {
    const bank = authored.map((i, idx) => (idx !== 3 ? i : {
      ...i,
      options: i.options.map((o, j) => (j === 1 ? { ...o, text: `${o.key}. ${o.text}` } : o)),
    }));
    const a = auditBank(bank);
    const c = a.checks.find((x) => x.id === 'option_labels')!;
    expect(c.severity).toBe('hard');
    expect(c.pass).toBe(false);
    expect(c.measured).toBe(1);
    expect(c.note).toContain(authored[3].question_key);
    expect(c.note).toContain('balanceCertOptionLengths');
    expect(a.pass).toBe(false);
  });
});

describe('bestOneLetterMockScore', () => {
  it('weights by mock demand rather than counting items evenly', () => {
    // D1 keyed to A (16 of 60 items), everything else keyed to B (44 of 60).
    // Even counting by items would put A near 27%; mock weighting must put B at
    // 44/60 = 73% — a pass mark — because that is what a student would score.
    const bank: BankItem[] = [
      ...Array.from({ length: 10 }, (_, i) => item(`CCARF-D1-${i}`, 'D1', 'A')),
      ...['D2', 'D3', 'D4', 'D5'].flatMap((d) => Array.from({ length: 10 }, (_, i) => item(`CCARF-${d}-${i}`, d, 'B'))),
    ];
    const best = bestOneLetterMockScore(bank);
    expect(best.letter).toBe('B');
    expect(best.score).toBeCloseTo(44 / 60, 2);
  });

  it('is ~25% on a balanced bank', () => {
    const best = bestOneLetterMockScore(authored);
    expect(best.score).toBeLessThan(BANK_THRESHOLDS.ONE_LETTER_MOCK_MAX);
    expect(best.score).toBeLessThan(0.35);
  });
});

describe('mocksSupported', () => {
  it('is the smallest domain division, never the average', () => {
    // Deep everywhere except D5 at 8: cannot fill even one mock.
    const bank: BankItem[] = [
      ...['D1', 'D2', 'D3', 'D4'].flatMap((d) => Array.from({ length: 100 }, (_, i) => item(`CCARF-${d}-${i}`, d, 'A'))),
      ...Array.from({ length: 8 }, (_, i) => item(`CCARF-D5-${i}`, 'D5', 'A')),
    ];
    expect(mocksSupported(bank)).toBe(0);
  });
});

describe('the audit separates hard from advisory', () => {
  it('a thin objective is advisory, not a hard failure', () => {
    // The authored bank has two objectives at three items. That is thin, not
    // broken, and must not turn the whole scorecard red.
    const a = auditBank(authored);
    const obj = a.checks.find((x) => x.id === 'objective_floor')!;
    expect(obj.severity).toBe('advisory');
    expect(a.pass).toBe(true);
  });

  it('an unapproved item is advisory — a student cannot be served it, which is the safe direction', () => {
    const bank = authored.map((i, idx) => (idx === 0 ? { ...i, review_status: 'draft' } : i));
    const a = auditBank(bank);
    const c = a.checks.find((x) => x.id === 'all_approved')!;
    expect(c.pass).toBe(false);
    expect(c.severity).toBe('advisory');
    expect(a.pass).toBe(true);
  });
});

describe('every check carries its measurement and its threshold', () => {
  it('so a failure says what was found, not just that something was', () => {
    for (const c of auditBank(authored).checks) {
      expect(typeof c.measured).toBe('number');
      expect(typeof c.threshold).toBe('number');
      expect(c.note.length).toBeGreaterThan(10);
    }
  });
});
