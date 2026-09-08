/**
 * The CCAR-F item rubric — what a real exam question looks like, measured.
 *
 * WHERE THESE NUMBERS COME FROM. Anthropic's own exam guide for this credential
 * carries 12 sample questions, published so that candidates and trainers know
 * the format. Every target below is a measurement taken from those 12. Nothing
 * here is a preference, a house style, or anybody's opinion about good question
 * writing.
 *
 * WHY A RUBRIC RATHER THAN A REVIEWER. We also built an adversarial model pass
 * over this bank, and it works, but it answers "is this item defensible?" by
 * asking a model — and on a provider that is not deterministic at temperature 0,
 * so the same question moves between runs. This rubric answers a different and
 * more useful question, "does this item look like a real exam item?", and it
 * answers it identically every time. When you can measure a thing, measuring it
 * beats asking about it.
 *
 * WHAT IS NOT IN THIS FILE, DELIBERATELY. No sample question, no stem, no option,
 * no rationale, no phrasing from Anthropic's guide. Only counts taken from them.
 * Measuring the characteristics of a published reference is calibration and is
 * permitted; reproducing its content is not, and a rubric that quoted their
 * items would have smuggled their content into our repository forever.
 *
 * ── THE HEADLINE GAP ─────────────────────────────────────────────────────────
 * Their stems are 2.5x longer than ours and their options 2.4x longer, because
 * theirs open with a production symptom and offer four fully articulated
 * approaches. Ours are definitional. A student drilled on ours meets a
 * differently shaped exam. That is the finding this rubric exists to quantify
 * per question, rather than as one number about the bank.
 */

export interface RubricBand {
  /** Below this is too short to resemble the reference. */
  min: number;
  /** Above this is longer than anything in the reference. */
  max: number;
  /** The reference median — the shape to aim at, not a threshold to pass. */
  target: number;
}

/** Word counts measured across Anthropic's 12 published CCAR-F sample questions. */
export const REFERENCE = {
  /** min 32, median 46, max 88 */
  stemWords: { min: 32, max: 88, target: 46 } as RubricBand,
  /** min 7, median 17, max 35 — per option, across all 48 options */
  optionWords: { min: 7, max: 35, target: 17 } as RubricBand,
  /** 12 of 12 are four-option single-select */
  optionCount: 4,
  /** 12 of 12 open with an observed production situation */
  scenarioFramingRate: 1.0,
  /** 10 of 12 rationales name at least two specific distractors */
  namesDistractorsRate: 10 / 12,
} as const;

/**
 * Markers of an OBSERVED SITUATION, which is what "scenario framing" means here.
 *
 * This is the one dimension that needs a proxy rather than a count, so the proxy
 * is written down and narrow. Every one of the 12 reference stems opens by
 * reporting something that HAPPENED — a measured rate, a log line, a user
 * complaint, an intermittent failure — before it asks anything. A definitional
 * stem ("An agent loop runs until...") asks about a concept; a scenario stem
 * ("Production logs show the agent calls X when users ask about Y...") asks
 * about a situation.
 *
 * Kept to unambiguous evidence of observation. It will miss a scenario written
 * in words not on this list, which is a false negative, and false negatives here
 * cost a review of a question that was fine. The alternative — a loose pattern —
 * would mark definitional stems as scenarios and hide the gap this rubric was
 * built to measure.
 */
export const SCENARIO_MARKERS: readonly string[] = [
  'production', 'in production', 'logs show', 'logs indicate', 'log shows',
  'users report', 'users complain', 'a user reports', 'customers report',
  'you observe', 'you notice', 'the team notices', 'the team reports',
  'occasionally', 'intermittently', 'sometimes fails', 'started failing',
  'after deploying', 'since deploying', 'in testing', 'during a run',
  'monitoring shows', 'metrics show', 'telemetry shows', 'traces show',
  'a run ends', 'runs end', 'the agent skips', 'the agent calls',
  'has begun', 'began returning', 'now returns', 'stopped working',
];

/** A measured percentage in the stem is strong evidence of an observed situation. */
export const OBSERVED_QUANTITY = /\b\d+(\.\d+)?\s?%|\bin \d+ of \d+\b|\b\d+ of the \d+\b/i;

export type RubricDimension =
  | 'scenario_framing'
  | 'stem_length'
  | 'option_length'
  | 'options_are_approaches'
  | 'option_count'
  | 'rationale_names_distractors';

export interface DimensionSpec {
  id: RubricDimension;
  label: string;
  /** What the reference does, in one line, for a report a human reads. */
  reference: string;
  /** Why it matters — never "because the reference does it". */
  why: string;
}

export const RUBRIC: readonly DimensionSpec[] = [
  {
    id: 'scenario_framing',
    label: 'Opens with an observed situation',
    reference: 'All 12 reference items open with a production symptom.',
    why: 'The exam tests judgement about situations, not recall of definitions. A '
      + 'student drilled on definitional items has practised a different skill.',
  },
  {
    id: 'stem_length',
    label: 'Stem length',
    reference: '32 to 88 words, median 46.',
    why: 'A situation cannot be described in twelve words. Short stems are the '
      + 'symptom of a definitional question, not a style choice.',
  },
  {
    id: 'option_length',
    label: 'Option length',
    reference: '7 to 35 words per option, median 17.',
    why: 'The exam asks which APPROACH is best. A three-word option is a label, '
      + 'and choosing between labels is a different task from choosing between plans.',
  },
  {
    id: 'options_are_approaches',
    label: 'Options are articulated approaches',
    reference: 'Reference options state a complete course of action.',
    why: 'Distractors that are phrases are easy to eliminate on shape alone, which '
      + 'is how a question becomes easier than the exam it prepares you for.',
  },
  {
    id: 'option_count',
    label: 'Four options, single select',
    reference: '12 of 12 are four-option single-select.',
    why: 'Matching the real form matters for pacing and for scoring.',
  },
  {
    id: 'rationale_names_distractors',
    label: 'Explains each wrong option',
    reference: '10 of 12 reference rationales name specific distractors.',
    why: 'A student who picked a distractor needs to know why it lost, not only '
      + 'that it did.',
  },
];
