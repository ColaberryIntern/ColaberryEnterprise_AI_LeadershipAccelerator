import {
  REFERENCE,
  RUBRIC,
  RubricDimension,
  SCENARIO_MARKERS,
  OBSERVED_QUANTITY,
  SCENARIO_FALSE_NEGATIVES,
} from '../../data/certBlueprints/ccarRubric';

/**
 * Score one CCAR-F item against the published reference.
 *
 * PURE, AND THAT IS THE WHOLE POINT. No model, no network, no clock, no random.
 * The same question scores identically on every run, forever. The adversarial
 * triage we built alongside this asks a model whether an item is defensible and
 * returns a different answer on a different day; this counts words and matches
 * documented patterns, and cannot.
 *
 * WHAT A LOW SCORE MEANS, AND WHAT IT DOES NOT. It means the item does not look
 * like the reference items. It does NOT mean the item is wrong: a question can
 * be short, definitional, and perfectly true. The rubric measures resemblance to
 * the exam a student is being prepared for, which is a different property from
 * correctness and is the one nobody had measured.
 *
 * IT CANNOT APPROVE ANYTHING, like everything else in this feature. It returns
 * numbers. What to do about them is a person's decision.
 */

export interface RubricItem {
  question_key: string;
  domain_id: string;
  objective_id: string;
  stem: string;
  options: { key: string; text: string }[];
  correct_keys: string[];
  rationale: string | null;
  distractor_rationales: Record<string, string> | null;
}

export type DimensionVerdict = 'meets' | 'short' | 'long' | 'absent';

export interface DimensionScore {
  id: RubricDimension;
  verdict: DimensionVerdict;
  /** The measurement itself, so a report can show its working. */
  measured: number | null;
  /** What the reference does, as a number, where one applies. */
  reference: number | null;
  /** One line a human can act on. Null when the dimension meets. */
  note: string | null;
}

export interface RubricScore {
  question_key: string;
  domain_id: string;
  /** Dimensions met, out of the six. */
  met: number;
  of: number;
  dimensions: DimensionScore[];
  /** The single most useful thing to change first, or null when nothing. */
  firstFix: string | null;
}

/** Words, counting the way a reader would rather than by character class. */
export function countWords(text: string | null | undefined): number {
  const t = String(text ?? '').trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

/**
 * Does the stem report something OBSERVED, rather than define something?
 *
 * Two independent signals, either sufficient: a documented marker phrase, or a
 * measured quantity ("in 12% of cases"). A stem carrying a real percentage is
 * describing a situation somebody looked at, whatever words surround it.
 */
export function hasScenarioFraming(stem: string): boolean {
  const lower = String(stem ?? '').toLowerCase();
  if (OBSERVED_QUANTITY.test(lower)) return true;
  return SCENARIO_MARKERS.some((m) => lower.includes(m));
}

function band(
  id: RubricDimension,
  measured: number,
  min: number,
  max: number,
  target: number,
  shortNote: string,
  longNote: string,
): DimensionScore {
  if (measured < min) {
    return { id, verdict: 'short', measured, reference: target, note: shortNote };
  }
  if (measured > max) {
    return { id, verdict: 'long', measured, reference: target, note: longNote };
  }
  return { id, verdict: 'meets', measured, reference: target, note: null };
}

export function scoreItem(item: RubricItem): RubricScore {
  const stemWords = countWords(item.stem);
  const optionWordCounts = (item.options ?? []).map((o) => countWords(o.text));
  const optionMedian = median(optionWordCounts);
  const correct = new Set(item.correct_keys ?? []);
  const wrong = (item.options ?? []).filter((o) => !correct.has(o.key));
  const explained = wrong.filter(
    (o) => ((item.distractor_rationales ?? {})[o.key] ?? '').trim().length > 0,
  ).length;

  const dimensions: DimensionScore[] = [
    hasScenarioFraming(item.stem)
      ? { id: 'scenario_framing', verdict: 'meets', measured: 1, reference: 1, note: null }
      : {
        id: 'scenario_framing',
        verdict: 'absent',
        measured: 0,
        reference: 1,
        note: 'Opens with a definition rather than something observed. Give it a symptom: '
          + 'what went wrong, how often, and where it was seen.',
      },

    band(
      'stem_length', stemWords,
      REFERENCE.stemWords.min, REFERENCE.stemWords.max, REFERENCE.stemWords.target,
      `Stem is ${stemWords} words; the reference runs ${REFERENCE.stemWords.min}-${REFERENCE.stemWords.max}, median ${REFERENCE.stemWords.target}.`,
      `Stem is ${stemWords} words, longer than anything in the reference (max ${REFERENCE.stemWords.max}).`,
    ),

    band(
      'option_length', optionMedian,
      REFERENCE.optionWords.min, REFERENCE.optionWords.max, REFERENCE.optionWords.target,
      `Options average ${optionMedian} words; the reference runs ${REFERENCE.optionWords.min}-${REFERENCE.optionWords.max}, median ${REFERENCE.optionWords.target}. They read as labels rather than approaches.`,
      `Options average ${optionMedian} words, longer than anything in the reference.`,
    ),

    // An approach is distinguishable from a label by whether the SHORTEST option
    // still says something. One long option among three labels is a length cue,
    // not a set of approaches.
    Math.min(...(optionWordCounts.length ? optionWordCounts : [0])) >= REFERENCE.optionWords.min
      ? { id: 'options_are_approaches', verdict: 'meets', measured: Math.min(...optionWordCounts), reference: REFERENCE.optionWords.min, note: null }
      : {
        id: 'options_are_approaches',
        verdict: 'short',
        measured: optionWordCounts.length ? Math.min(...optionWordCounts) : 0,
        reference: REFERENCE.optionWords.min,
        note: `Shortest option is ${optionWordCounts.length ? Math.min(...optionWordCounts) : 0} words. Every option should state a course of action, or the short ones are eliminated on shape.`,
      },

    (item.options ?? []).length === REFERENCE.optionCount && correct.size === 1
      ? { id: 'option_count', verdict: 'meets', measured: (item.options ?? []).length, reference: REFERENCE.optionCount, note: null }
      : {
        id: 'option_count',
        verdict: 'absent',
        measured: (item.options ?? []).length,
        reference: REFERENCE.optionCount,
        note: `${(item.options ?? []).length} options, ${correct.size} correct. The reference is four options, single select.`,
      },

    wrong.length > 0 && explained === wrong.length
      ? { id: 'rationale_names_distractors', verdict: 'meets', measured: explained, reference: wrong.length, note: null }
      : {
        id: 'rationale_names_distractors',
        verdict: 'absent',
        measured: explained,
        reference: wrong.length,
        note: `${explained} of ${wrong.length} wrong options are explained.`,
      },
  ];

  const met = dimensions.filter((d) => d.verdict === 'meets').length;

  // The first fix is the one that moves the others. A definitional stem is why
  // the options are labels; lengthening options on a definitional stem produces
  // a padded question rather than a scenario one.
  const order: RubricDimension[] = [
    'scenario_framing', 'stem_length', 'options_are_approaches',
    'option_length', 'option_count', 'rationale_names_distractors',
  ];
  const firstFail = order
    .map((id) => dimensions.find((d) => d.id === id)!)
    .find((d) => d.verdict !== 'meets');

  return {
    question_key: item.question_key,
    domain_id: item.domain_id,
    met,
    of: dimensions.length,
    dimensions,
    firstFix: firstFail?.note ?? null,
  };
}

export interface BankSummary {
  scored: number;
  /** Items meeting every dimension. */
  fullyMeets: number;
  /** Per dimension, how many items meet it. */
  byDimension: Record<string, number>;
  medianStemWords: number;
  medianOptionWords: number;
  scenarioFramingRate: number;
}

export function summariseBank(scores: RubricScore[], items: RubricItem[]): BankSummary {
  const byDimension: Record<string, number> = {};
  for (const spec of RUBRIC) {
    byDimension[spec.id] = scores.filter(
      (s) => s.dimensions.find((d) => d.id === spec.id)?.verdict === 'meets',
    ).length;
  }
  return {
    scored: scores.length,
    fullyMeets: scores.filter((s) => s.met === s.of).length,
    byDimension,
    medianStemWords: median(items.map((i) => countWords(i.stem))),
    medianOptionWords: median(items.flatMap((i) => (i.options ?? []).map((o) => countWords(o.text)))),
    scenarioFramingRate: items.length
      ? scores.filter((s) => s.dimensions.find((d) => d.id === 'scenario_framing')?.verdict === 'meets').length / items.length
      : 0,
  };
}

/**
 * Dimensions this item can NEVER meet, given what a rewrite is allowed to change.
 *
 * WHY THIS EXISTS. The first live sweep spent a model call on `CCARF-A2` and
 * reported it stalled at 5/6. A2 is multi-select by design: `option_count` is
 * defined as four options AND single select, and `checkInvariants` forbids
 * changing how many answers are correct. So the improver is structurally
 * incapable of fixing that dimension, and a sweep aiming at a flat 6/6 would
 * re-spend on it on every run, for ever, and call the result a failure.
 *
 * A target an item cannot reach is not a standard, it is a bug in the check.
 * The ceiling is what this item could achieve if every fixable dimension were
 * fixed, and that is what the sweep aims at.
 */
export function unachievableDimensions(item: Pick<RubricItem, 'question_key' | 'correct_keys'>): RubricDimension[] {
  const out: RubricDimension[] = [];
  // `option_count` requires exactly one correct answer, and the number of
  // correct answers is an invariant. See the multi-select note in
  // `ccarFoundationsItems.ts` for why those three items stay as they are.
  if (item.correct_keys.length !== 1) out.push('option_count');
  // These eighteen stems DO open with an observation, in words the detector's
  // marker list does not enumerate. They were hand-checked one by one and are
  // recorded in `ccarRubric.ts`. Their only missing dimension is scenario
  // framing, so the sole way a rewrite could score higher is by inserting a
  // marker phrase — changing text that is already right to satisfy a proxy. The
  // detector is the thing that is wrong here, and a sweep must not "fix" a
  // question to make a known-imperfect measurement happy.
  if (SCENARIO_FALSE_NEGATIVES.includes(item.question_key)) out.push('scenario_framing');
  return out;
}

/** The highest score this item can reach without violating an invariant. */
export function achievableScore(item: Pick<RubricItem, 'question_key' | 'correct_keys'>, of: number): number {
  return of - unachievableDimensions(item).length;
}
