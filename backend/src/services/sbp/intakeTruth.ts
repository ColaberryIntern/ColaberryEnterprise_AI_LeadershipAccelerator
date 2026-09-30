import {
  NEVER_FACT_DIMENSIONS,
  type UnderstandingDimension,
  type UnderstandingItem,
} from '../delivery/projectUnderstanding';

/**
 * intakeTruth — a student's intake, as project truth. PURE.
 *
 * ## What this closes
 *
 * The Enterprise intake asks good questions and then throws the answers away.
 * They are POSTed to `startBuild` as `[{id, question, answer}]`, consumed by
 * plan generation, and never persisted as anything a later story could read.
 * A student answers "Priya signs off anything over 5k" once, and by the third
 * story nothing in the system knows it.
 *
 * `ProjectUnderstanding` already solves this for AI Flotation: dimensions, a
 * classification, a provenance, and the rule that only a human-sourced
 * statement can be a FACT. This maps the Enterprise intake onto that same
 * contract rather than inventing a second one.
 *
 * ## Two rules that shape every line here
 *
 * **A student's typed answer is `source_message`.** That provenance is
 * fact-bearing because it traces to something a person wrote. Nothing in this
 * module ever emits `ai_inferred`, and nothing here upgrades a guess: if we
 * cannot quote the student, we do not write an item.
 *
 * **The angle decides the dimension.** The alternative is reading the question
 * text and guessing, and a misfiled answer is worse than an unfiled one - it
 * puts a student's words under a heading they did not mean, where a later story
 * will read them as evidence of something else. An answer whose angle we do not
 * recognise is returned as unmapped, not filed somewhere plausible.
 */

/** One answer, as the wizard sends it back. */
export interface IntakeAnswer {
  id: string;
  question: string;
  answer: string;
  /** The angle the question came from. Absent on plans generated before angles. */
  angle?: string;
}

/** An angle the description already answered, with the phrase that answered it. */
export interface IntakeCovered {
  angle: string;
  evidence: string;
}

export interface IntakeTruthInput {
  /** The student's own description, verbatim. */
  idea: string;
  answers?: readonly IntakeAnswer[];
  covered?: readonly IntakeCovered[];
}

export interface IntakeTruthResult {
  items: UnderstandingItem[];
  /** Answers whose angle we do not recognise. Reported, never guessed at. */
  unmapped: IntakeAnswer[];
}

/**
 * The ten angles, and where each one's answer belongs.
 *
 * Fixed rather than computed. Each mapping is the dimension the answer is
 * ABOUT, not the dimension it might influence: "what would you check before it
 * goes out" is an approval point, even though it also tells you something about
 * the workflow. One answer, one home.
 */
export const ANGLE_TO_DIMENSION: Readonly<Record<string, UnderstandingDimension>> = {
  'THE GUARDRAIL': 'approval_points',
  'THE TOOLS': 'systems',
  'WHEN IT IS NOT SURE': 'human_only_decisions',
  'THE MEASURE': 'success_definition',
  'EARNING AUTONOMY': 'approval_points',
  'THE JUDGEMENT': 'human_only_decisions',
  'THE OPERATOR': 'actors',
  'TRIGGER AND RHYTHM': 'current_workflow',
  'THE STANDOUT AND THE CUT': 'desired_outcome',
  'THE JOB': 'problem',
};

/** Longest quote we keep. A whole pasted document is not a quote. */
const MAX_QUOTE = 600;

const clean = (s: unknown): string => (typeof s === 'string' ? s.trim() : '');
const quote = (s: string): string => (s.length <= MAX_QUOTE ? s : `${s.slice(0, MAX_QUOTE - 3)}...`);

/** The angle name, normalised. Models vary on case and surrounding punctuation. */
export function normaliseAngle(raw: unknown): string {
  return clean(raw).toUpperCase().replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function fact(
  dimension: UnderstandingDimension,
  value: string,
  sourceQuote: string,
): UnderstandingItem {
  return {
    dimension,
    value,
    // FACT, because a person wrote it. `source_message` is in
    // FACT_BEARING_PROVENANCES for exactly this reason.
    classification: 'FACT',
    provenance: 'source_message',
    source_quote: quote(sourceQuote),
  };
}

/**
 * Turn one intake into truth items.
 *
 * Deliberately conservative. An empty answer produces nothing, an unrecognised
 * angle produces nothing but is reported, and a dimension that can never hold a
 * fact is refused outright even if a mapping tried to send one there.
 */
export function itemsFromIntake(input: IntakeTruthInput): IntakeTruthResult {
  const items: UnderstandingItem[] = [];
  const unmapped: IntakeAnswer[] = [];

  const idea = clean(input.idea);
  if (idea) {
    // The description is the one thing every intake has, and it is the
    // student's own words about what they are building.
    items.push(fact('problem', idea.length <= MAX_QUOTE ? idea : quote(idea), idea));
  }

  for (const answer of input.answers ?? []) {
    const text = clean(answer.answer);
    if (!text) continue; // a skipped question is not a fact about anything

    const dimension = ANGLE_TO_DIMENSION[normaliseAngle(answer.angle)];
    if (!dimension) { unmapped.push(answer); continue; }
    if (NEVER_FACT_DIMENSIONS.includes(dimension)) continue;

    items.push(fact(dimension, text, text));
  }

  for (const c of input.covered ?? []) {
    const evidence = clean(c.evidence);
    const dimension = ANGLE_TO_DIMENSION[normaliseAngle(c.angle)];
    // A covered angle with no quotable evidence is not evidence. The intake
    // service already drops these; this is the second gate, because this module
    // is also reachable from a stored plan written before that gate existed.
    if (!evidence || !dimension) continue;
    if (NEVER_FACT_DIMENSIONS.includes(dimension)) continue;

    items.push(fact(dimension, evidence, evidence));
  }

  return { items, unmapped };
}
