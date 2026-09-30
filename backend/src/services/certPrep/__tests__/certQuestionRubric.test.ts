/**
 * The rubric scorer.
 *
 * The property that matters most here is the boring one: it is PURE. Same
 * question, same score, every time, with no model, no network and no clock. The
 * adversarial triage next door gives a different answer on a different day — I
 * watched two questions move between runs minutes apart — and that is exactly
 * why this exists alongside it.
 *
 * So the first test is determinism, and the rest are about not lying: a rubric
 * that marks a definitional stem as a scenario would hide the single gap it was
 * built to measure.
 */
import {
  scoreItem,
  summariseBank,
  hasScenarioFraming,
  countWords,
  median,
  RubricItem,
} from '../certQuestionRubric';
import { REFERENCE } from '../../../data/certBlueprints/ccarRubric';

/** Short and definitional — the shape most of our bank actually is. */
const definitional = (over: Partial<RubricItem> = {}): RubricItem => ({
  question_key: 'CCARF-D1-01',
  domain_id: 'D1',
  objective_id: 'D1.1',
  stem: 'An agent loop runs until the model stops requesting tools. What is missing?',
  options: [
    { key: 'A', text: 'A lower temperature' },
    { key: 'B', text: 'A maximum turn count' },
    { key: 'C', text: 'More tools' },
    { key: 'D', text: 'A larger context window' },
  ],
  correct_keys: ['B'],
  rationale: 'A loop with no upper bound has no failure mode short of exhaustion.',
  distractor_rationales: { A: 'Changes variety.', C: 'More ways to keep going.', D: 'Extends the runway.' },
  ...over,
});

/** The shape the reference items have. */
const scenario = (): RubricItem => ({
  question_key: 'CCARF-D1-99',
  domain_id: 'D1',
  objective_id: 'D1.1',
  stem: 'Production data shows that in 12% of cases your agent skips the verification step '
    + 'entirely and proceeds using only the name the customer stated, occasionally leading to '
    + 'misidentified accounts and incorrect refunds being issued. What change would most '
    + 'effectively address this reliability issue?',
  options: [
    { key: 'A', text: 'Add a programmatic prerequisite that blocks the refund path until verification has returned a confirmed identifier' },
    { key: 'B', text: 'Enhance the system prompt to state that verification is mandatory before any refund operation is attempted' },
    { key: 'C', text: 'Add few-shot examples showing the agent verifying first even when the customer volunteers details' },
    { key: 'D', text: 'Implement a routing classifier that enables only the subset of tools appropriate to each request type' },
  ],
  correct_keys: ['A'],
  rationale: 'Programmatic enforcement gives deterministic guarantees that prompt-based approaches cannot.',
  distractor_rationales: {
    B: 'Relies on probabilistic compliance, insufficient where errors have financial consequences.',
    C: 'Same reliance on the model choosing correctly.',
    D: 'Addresses tool availability rather than tool ordering.',
  },
});

describe('it is pure — the whole reason it exists', () => {
  it('scores identically every time', () => {
    const item = definitional();
    const a = JSON.stringify(scoreItem(item));
    const b = JSON.stringify(scoreItem(item));
    const c = JSON.stringify(scoreItem({ ...item }));
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('does not mutate what it is given', () => {
    const item = definitional();
    const before = JSON.stringify(item);
    scoreItem(item);
    expect(JSON.stringify(item)).toBe(before);
  });
});

describe('scenario framing — the dimension that carries the finding', () => {
  it('recognises a measured quantity as an observed situation', () => {
    expect(hasScenarioFraming('Production data shows that in 12% of cases the agent skips it.')).toBe(true);
  });

  it('recognises a documented marker phrase', () => {
    expect(hasScenarioFraming('Logs show the agent calls get_customer when users ask about orders.')).toBe(true);
    expect(hasScenarioFraming('Occasionally a run ends with a half-written synthesis.')).toBe(true);
  });

  it('does NOT mark a definitional stem as a scenario', () => {
    // The failure that would matter: a loose matcher marks everything as a
    // scenario and the gap this rubric measures disappears from the report.
    expect(hasScenarioFraming('An agent loop runs until the model stops requesting tools.')).toBe(false);
    expect(hasScenarioFraming('What is the primary architectural reason subagents help?')).toBe(false);
    expect(hasScenarioFraming('Which of the following best describes a tool description?')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(hasScenarioFraming('PRODUCTION LOGS SHOW a failure.')).toBe(true);
  });
});

describe('scoring a definitional item — our bank\'s actual shape', () => {
  const score = scoreItem(definitional());

  it('flags the missing scenario', () => {
    expect(score.dimensions.find((d) => d.id === 'scenario_framing')?.verdict).toBe('absent');
  });

  it('flags the short stem, and shows its working', () => {
    const d = score.dimensions.find((x) => x.id === 'stem_length')!;
    expect(d.verdict).toBe('short');
    expect(d.measured).toBe(13);
    expect(d.note).toContain('13 words');
    expect(d.note).toContain(String(REFERENCE.stemWords.target));
  });

  it('flags options that read as labels', () => {
    expect(score.dimensions.find((d) => d.id === 'option_length')?.verdict).toBe('short');
    expect(score.dimensions.find((d) => d.id === 'options_are_approaches')?.verdict).toBe('short');
  });

  it('credits what it does right — four options and every distractor explained', () => {
    expect(score.dimensions.find((d) => d.id === 'option_count')?.verdict).toBe('meets');
    expect(score.dimensions.find((d) => d.id === 'rationale_names_distractors')?.verdict).toBe('meets');
  });

  it('names the scenario as the first fix, because it is what moves the others', () => {
    // Lengthening options on a definitional stem produces a padded question,
    // not a scenario one. Order matters and is asserted.
    expect(score.firstFix).toContain('observed');
  });
});

describe('scoring a reference-shaped item', () => {
  const score = scoreItem(scenario());

  it('meets every dimension', () => {
    const failing = score.dimensions.filter((d) => d.verdict !== 'meets').map((d) => d.id);
    expect(failing).toEqual([]);
    expect(score.met).toBe(score.of);
  });

  it('has no first fix', () => {
    expect(score.firstFix).toBeNull();
  });
});

describe('it measures resemblance, not correctness', () => {
  it('a factually wrong item with the right shape still scores well', () => {
    // Stated so nobody reads a high score as a claim about truth. The rubric
    // cannot tell whether the marked answer is right, and does not pretend to.
    const wrongButWellShaped = { ...scenario(), correct_keys: ['D'] };
    const score = scoreItem(wrongButWellShaped as RubricItem);
    expect(score.met).toBeGreaterThanOrEqual(5);
  });
});

describe('edge cases do not throw', () => {
  it('an empty stem scores short rather than crashing', () => {
    expect(() => scoreItem(definitional({ stem: '' }))).not.toThrow();
    expect(scoreItem(definitional({ stem: '' })).dimensions[1].measured).toBe(0);
  });

  it('no options at all is handled', () => {
    expect(() => scoreItem(definitional({ options: [] }))).not.toThrow();
  });

  it('missing distractor rationales are counted, not assumed', () => {
    const s = scoreItem(definitional({ distractor_rationales: null }));
    const d = s.dimensions.find((x) => x.id === 'rationale_names_distractors')!;
    expect(d.verdict).toBe('absent');
    expect(d.measured).toBe(0);
  });

  it('a multi-select item fails the single-select dimension', () => {
    const s = scoreItem(definitional({ correct_keys: ['A', 'B'] }));
    expect(s.dimensions.find((d) => d.id === 'option_count')?.verdict).toBe('absent');
  });
});

describe('helpers', () => {
  it('counts words the way a reader would', () => {
    expect(countWords('  two   words  ')).toBe(2);
    expect(countWords('')).toBe(0);
    expect(countWords(null)).toBe(0);
  });

  it('medians an even-length set', () => {
    expect(median([1, 2, 3, 4])).toBe(3);   // rounded
    expect(median([5])).toBe(5);
    expect(median([])).toBe(0);
  });
});

describe('the bank summary', () => {
  it('counts per dimension and reports the medians', () => {
    const items = [definitional(), definitional(), scenario()];
    const summary = summariseBank(items.map(scoreItem), items);
    expect(summary.scored).toBe(3);
    expect(summary.fullyMeets).toBe(1);
    expect(summary.byDimension.scenario_framing).toBe(1);
    expect(summary.scenarioFramingRate).toBeCloseTo(1 / 3);
    expect(summary.medianStemWords).toBeGreaterThan(0);
  });
});
